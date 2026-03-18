"""
Stallion Document Extraction (Claude API), HS code search, and permit lookup.
"""
from __future__ import annotations

import base64
import io
import json
import logging
import os
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Tuple

import anthropic
from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from ..store import load_declarations, save_declarations
from ..store_clients import load_clients

router = APIRouter(tags=["extraction"])
logger = logging.getLogger("stallion.extract")


# ─── TTBizLink permit lookup ──────────────────────────────────────────────────

def _load_permit_lookup() -> List[Dict[str, Any]]:
    path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "permit_lookup.json")
    try:
        with open(path) as f:
            data = json.load(f)
        return data.get("entries", [])
    except Exception:
        return []

PERMIT_LOOKUP: List[Dict[str, Any]] = _load_permit_lookup()


def _check_permits(description: str) -> List[Dict[str, Any]]:
    if not description or not PERMIT_LOOKUP:
        return []
    desc_lower = description.lower()
    matches: List[Dict[str, Any]] = []
    seen_sequences: set = set()
    for entry in PERMIT_LOOKUP:
        if entry["sequence"] in seen_sequences:
            continue
        for kw in entry.get("keywords", []):
            if kw.lower() in desc_lower:
                matches.append({
                    "invoiceName": entry["invoiceName"],
                    "ttbizlinkName": entry["ttbizlinkName"],
                    "category": entry["category"],
                    "sequence": entry["sequence"],
                    "permitType": entry["permitType"],
                })
                seen_sequences.add(entry["sequence"])
                break
    return matches


# ─── Extraction system prompt ─────────────────────────────────────────────────

EXTRACTION_SYSTEM_PROMPT = """You are a customs declaration data extraction specialist for Trinidad and Tobago (ASYCUDA World).
Extract all available fields from the uploaded documents (commercial invoices, airway bills, packing lists, Caricom certificates, health certificates, free-sale certificates).

Return ONLY a valid JSON object with these fields (use null for fields not found):
{
  "consigneeName": "string — the importer / ship-to party in Trinidad",
  "consigneeAddress": "string — consignee full address",
  "consignorName": "string — the exporter / shipper",
  "consignorAddress": "string — consignor full address",
  "countryOfOrigin": "string — 2-letter ISO country code of origin",
  "invoiceNumber": "string",
  "invoiceDate": "string — ISO date YYYY-MM-DD",
  "invoiceValueForeign": number — the total EXW/FOB value of the entire invoice (not CIF), numeric only,
  "currency": "string — 3-letter ISO currency code, default USD",
  "blAwbNumber": "string — air waybill or bill of lading number",
  "shippedOnBoardDate": "string — ISO date YYYY-MM-DD, look for 'Laden on Board', 'Shipped on Board', 'Flight Date'",
  "shippedOnBoardLabel": "string — exact label used in document for this date",
  "vesselOrFlight": "string — vessel name or flight number",
  "rotationNumber": "string — Port Authority rotation number assigned when vessel arrives at port (e.g. R2024/001234). Look for 'Rotation No', 'Rot. No', 'Rotation Number'. Null if not found or if air freight.",
  "portOfLoading": "string",
  "portOfDischarge": "string — typically Port of Spain (TTPTS) or Piarco (TTPIA)",
  "packageCount": number or null,
  "packageType": "string — e.g. CTN, BOX, PKG",
  "grossWeightKg": number or null,
  "netWeightKg": number or null,
  "containerNumber": "string — shipping container number (e.g. MSCU1234567) from packing list or BL, else null",
  "sealNumber": "string — container seal number from packing list or BL, else null",
  "certificates": [
    {
      "type": "string — one of: CARICOM, HEALTH, FREE_SALE, PHYTO, COO, OTHER",
      "number": "string — certificate reference number",
      "issueDate": "string — ISO date YYYY-MM-DD if present, else null",
      "issuer": "string — issuing authority, ministry, or organisation name",
      "country": "string — country of issue (2-letter ISO code if possible)"
    }
  ],
  "declarationType": "string — 'import' if goods are being imported into T&T, 'export' if goods are being exported from T&T. Look for document type, shipper/consignee direction, or explicit labels. Default 'import' if unclear.",
  "lineItems": [
    {
      "description": "string — specific product description for this line item",
      "hsCode": "string — HS tariff code in format XXXX.XX.XX or XXXX.XX.XX.XX if printed on document, else null",
      "quantity": number or null,
      "unitPrice": number or null — price per unit in invoice currency,
      "lineTotal": number — total value for this line item in invoice currency,
      "countryOfOrigin": "string — 2-letter ISO code if different per item, else null"
    }
  ],
  "confidence": number — between 0.0 and 1.0 reflecting how complete and certain the extraction is,
  "notes": ["array of strings — flag any fields that are missing, ambiguous, or need broker attention"]
}

Rules:
- For invoiceValueForeign: use the EXW or FOB subtotal of the ENTIRE invoice, NOT the grand total if freight/insurance are included.
  If only one total is shown, use that.
- For lineItems: extract EVERY distinct product/line from the invoice. Each row in the invoice table is a separate line item.
  If the invoice has only one product, return an array with one item. If it has 15 products, return 15 items.
  The sum of all lineItem.lineTotal values should approximately equal invoiceValueForeign.
  If no line-item breakdown is visible, return a single item with the full description and invoiceValueForeign as lineTotal.
- For hsCode: only return if clearly printed on the document. Do not guess.
- For certificates: extract every certificate present. A Caricom certificate of origin has type CARICOM. A health or veterinary certificate has type HEALTH. A free-sale certificate has type FREE_SALE. A phytosanitary certificate has type PHYTO.
- For containerNumber: format is typically 4 uppercase letters + 7 digits (e.g. MSCU1234567, TGHU4591234). Look on packing list, BL, or delivery order. The check digit (last digit) is part of the number.
- For sealNumber: appears near containerNumber on packing list or BL as 'Seal No.', 'Seal #', or 'Seal'. Can be alphanumeric (e.g. TT12345, BOLT123456).
- For packageCount: look for total cartons, cases, packages, pieces — NOT individual item quantities. Usually labelled 'Total Packages', 'No. of Packages', or 'Total Cartons'.
- For grossWeightKg: total gross weight of shipment in kg. Convert from lbs if needed (1 lb = 0.4536 kg). Label: 'Gross Weight', 'Total Gross Weight'.
- For netWeightKg: total net weight in kg. Label: 'Net Weight', 'Total Net Weight'.
- For confidence: 0.90+ means all critical fields found clearly. 0.70-0.89 means some fields missing.
  Below 0.70 means significant gaps.
- Critical fields (required for TT customs): consigneeName, invoiceValueForeign, currency, invoiceNumber.
- Add a note if a packing list is present but containerNumber or sealNumber could not be found.
- Add a note if gross weight could not be determined from the document.
- For rotationNumber: only extract if explicitly stated on the document. Do not guess. This is assigned by the T&T Port Authority and appears on Port Authority documents, manifests, or agent instructions.
- For declarationType: 'export' if the T&T party is the shipper/exporter and foreign party is the consignee. 'import' if the T&T party is the consignee/importer.
- Return ONLY the JSON object, no markdown, no explanation."""


# ─── Claude extraction helpers ────────────────────────────────────────────────

def _read_file_bytes(upload: UploadFile) -> bytes:
    upload.file.seek(0)
    return upload.file.read() or b""


def _is_pdf(upload: UploadFile) -> bool:
    name = (upload.filename or "").lower()
    return name.endswith(".pdf")


async def _extract_with_claude(files: List[UploadFile]) -> Dict[str, Any]:
    """
    Send one or more documents to Claude API for extraction.
    Supports PDF (as base64 document) and plain text fallback.
    Returns a single merged extraction dict.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not configured")

    client = anthropic.Anthropic(api_key=api_key)

    content: List[Dict[str, Any]] = []

    for f in files:
        raw = _read_file_bytes(f)
        fname = f.filename or "document"

        if _is_pdf(f) and raw:
            b64 = base64.standard_b64encode(raw).decode("utf-8")
            content.append({
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": b64,
                },
                "title": fname,
            })
        else:
            try:
                text = raw.decode("utf-8", errors="ignore")
            except Exception:
                text = ""
            if text.strip():
                content.append({
                    "type": "text",
                    "text": f"[Document: {fname}]\n{text}",
                })

    if not content:
        raise ValueError("No readable content in uploaded files")

    content.append({
        "type": "text",
        "text": "Extract all customs declaration fields from the document(s) above. Return the JSON object as instructed.",
    })

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=EXTRACTION_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
    )

    raw_text = response.content[0].text.strip()

    # Strip markdown code fences if present
    if raw_text.startswith("```"):
        raw_text = re.sub(r"^```[a-z]*\n?", "", raw_text)
        raw_text = re.sub(r"\n?```$", "", raw_text)

    try:
        return json.loads(raw_text)
    except json.JSONDecodeError as exc:
        logger.error(
            "Claude returned unparseable JSON for extraction. "
            "raw_text=%s error=%s",
            raw_text[:500], str(exc),
        )
        raise


def _fallback_extract(upload: UploadFile) -> Dict[str, Any]:
    """Regex-based fallback for when Claude API is unavailable."""
    raw = _read_file_bytes(upload)
    text = ""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(raw))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
    except Exception:
        try:
            text = raw.decode("utf-8", errors="ignore")
        except Exception:
            text = ""

    upper = text.upper()

    def _first(pattern: str, src: str = text) -> str:
        m = re.search(pattern, src, re.IGNORECASE)
        return (m.group(1).strip() if m and m.groups() else "")

    hs = _first(r"\b(\d{4}\.\d{2}\.\d{2}\.\d{2})\b")
    awb = _first(r"\b([A-Z0-9]{3,4}[\s-]?\d{4}[\s-]?\d{4,})\b", upper)
    amount_raw = _first(r"(?:TOTAL|AMOUNT|INVOICE\s+TOTAL)\D{0,20}(\d[\d,]*\.?\d{0,2})")
    amount = 0.0
    try:
        amount = float((amount_raw or "0").replace(",", ""))
    except Exception:
        pass
    consignee = _first(r"CONSIGNEE\s*[:\-]\s*(.+)")
    consignor = _first(r"(?:CONSIGNOR|SHIPPER)\s*[:\-]\s*(.+)")
    invoice_no = _first(r"INVOICE\s*(?:NO\.?|NUMBER)?\s*[:#\-]?\s*([A-Z0-9\-/]+)", upper)
    invoice_date = _first(r"(?:INVOICE\s+DATE|DATE)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{2,4})")

    container_no = _first(r"\b([A-Z]{4}\d{7})\b", upper)
    seal_no = _first(r"(?:SEAL\s*(?:NO\.?|NUMBER|#))\s*[:\-]?\s*([A-Z0-9]{4,12})\b", upper)
    rotation_no = _first(r"(?:ROTATION\s*(?:NO\.?|NUMBER|#))\s*[:\-]?\s*([A-Z0-9/\-]{4,20})\b", upper)
    pkg_count_raw = _first(r"(\d+)\s*(?:CARTONS?|CTNS?|CASES?|PIECES?|PCS|PKGS?|BOXES?)\b", upper)
    pkg_count = int(pkg_count_raw) if pkg_count_raw and pkg_count_raw.isdigit() else None

    hits = sum(bool(x) for x in [hs, amount > 0, consignee, invoice_no])
    confidence = round(min(0.65, 0.35 + hits * 0.08), 2)

    result: Dict[str, Any] = {
        "consigneeName": consignee,
        "consignorName": consignor,
        "hsCode": hs,
        "blAwbNumber": awb,
        "invoiceNumber": invoice_no,
        "invoiceDate": invoice_date,
        "invoiceValueForeign": amount,
        "currency": "USD",
        "description": "",
        "confidence": confidence,
        "notes": ["Extracted via text fallback — Claude API unavailable"],
        "declarationType": "import",
    }
    if container_no:
        result["containerNumber"] = container_no
    if seal_no:
        result["sealNumber"] = seal_no
    if rotation_no:
        result["rotationNumber"] = rotation_no
    if pkg_count:
        result["packageCount"] = pkg_count
    return result


def _build_items_from_extraction(ex: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], Dict[str, float]]:
    """
    Build declaration commodity items from extraction results.
    Splits out non-commodity charge lines (freight/insurance/fees) so they do not
    become dutiable goods items.
    Returns: (items, charges)
    """
    line_items = ex.get("lineItems") or []
    origin = ex.get("countryOfOrigin") or ""
    pkg_type = ex.get("packageType") or "BOX"

    charges: Dict[str, float] = {
        "freight_foreign": 0.0,
        "insurance_foreign": 0.0,
        "other_foreign": 0.0,
        "deduction_foreign": 0.0,
    }

    def _classify_charge(desc: str) -> str | None:
        d = (desc or "").strip().lower()
        if not d:
            return None
        if any(k in d for k in ["freight", "shipping", "transport", "carriage", "courier"]):
            return "freight_foreign"
        if "insurance" in d:
            return "insurance_foreign"
        if any(k in d for k in ["discount", "rebate", "credit note", "allowance"]):
            return "deduction_foreign"
        if any(k in d for k in ["handling", "documentation", "admin fee", "service fee", "surcharge"]):
            return "other_foreign"
        return None

    # Fallback: no lineItems → single item from legacy fields
    if not line_items:
        val = 0.0
        try:
            val = float(ex.get("invoiceValueForeign") or 0)
        except Exception:
            pass
        return ([{
            "id": f"ITEM-{uuid.uuid4().hex[:6].upper()}",
            "description": ex.get("description") or "Extracted item",
            "hsCode": ex.get("hsCode") or "",
            "qty": ex.get("packageCount") or 1,
            "packageType": pkg_type,
            "grossKg": ex.get("grossWeightKg") or 0,
            "netKg": ex.get("netWeightKg") or 0,
            "itemValue": val,
            "unitCode": "NMB",
            "dutyTaxCode": "",
            "dutyTaxBase": "",
            "cpc": "4000",
            "countryOfOrigin": origin,
        }], charges)

    items: List[Dict[str, Any]] = []
    for i, li in enumerate(line_items):
        line_total = float(li.get("lineTotal") or li.get("unitPrice") or 0)
        qty = int(li.get("quantity") or 1)
        desc = str(li.get("description") or f"Line item {i+1}")

        charge_bucket = _classify_charge(desc)
        if charge_bucket:
            charges[charge_bucket] += line_total
            continue

        items.append({
            "id": f"ITEM-{uuid.uuid4().hex[:6].upper()}",
            "description": desc,
            "hsCode": str(li.get("hsCode") or ""),
            "qty": qty,
            "packageType": pkg_type,
            "grossKg": 0,
            "netKg": 0,
            "itemValue": line_total,
            "unitCode": "NMB",
            "dutyTaxCode": "",
            "dutyTaxBase": "",
            "cpc": "4000",
            "countryOfOrigin": li.get("countryOfOrigin") or origin,
        })

    # Guard: if everything was classified as charges, keep first line as commodity item
    if not items and line_items:
        li = line_items[0]
        line_total = float(li.get("lineTotal") or li.get("unitPrice") or 0)
        items.append({
            "id": f"ITEM-{uuid.uuid4().hex[:6].upper()}",
            "description": str(li.get("description") or "Extracted item"),
            "hsCode": str(li.get("hsCode") or ""),
            "qty": int(li.get("quantity") or 1),
            "packageType": pkg_type,
            "grossKg": 0,
            "netKg": 0,
            "itemValue": line_total,
            "unitCode": "NMB",
            "dutyTaxCode": "",
            "dutyTaxBase": "",
            "cpc": "4000",
            "countryOfOrigin": li.get("countryOfOrigin") or origin,
        })

    return items, charges


def _build_declaration_record(ex: Dict[str, Any], mode: str, filenames: List[str], now: str) -> Dict[str, Any]:
    """Convert a Claude extraction dict into a full declaration record for storage."""
    dec_id = f"EXT-{uuid.uuid4().hex[:8].upper()}"
    val = ex.get("invoiceValueForeign") or 0
    try:
        val = float(val)
    except Exception:
        val = 0.0

    items, charges = _build_items_from_extraction(ex)

    # If invoice total appears to include extracted freight/insurance/fees,
    # derive goods/FOB by removing those charge lines to avoid double counting.
    total_charges = float(charges.get("freight_foreign", 0) or 0) + float(charges.get("insurance_foreign", 0) or 0) + float(charges.get("other_foreign", 0) or 0)
    goods_sum = sum(float(i.get("itemValue") or 0) for i in items)
    invoice_value_foreign = val
    if total_charges > 0 and val > 0:
        if abs((goods_sum + total_charges) - val) <= 0.02 or abs(total_charges - (val - goods_sum)) <= 0.02:
            invoice_value_foreign = max(0.0, val - total_charges)

    transport = "AIR"
    awb = ex.get("blAwbNumber") or ""
    if any(c.isalpha() for c in awb[:2]):
        transport = "AIR"
    vessel = ex.get("vesselOrFlight") or ""
    if vessel and not any(ch.isdigit() for ch in vessel[:3]):
        transport = "SEA"

    dec_type = (ex.get("declarationType") or "import").lower()
    customs_regime = "E1" if dec_type == "export" else "IM4"

    client_id = ""
    consignee_name = ex.get("consigneeName") or ""
    if consignee_name:
        try:
            clients = load_clients()
            match = next(
                (c for c in clients if c.get("name", "").lower() in consignee_name.lower()
                 or consignee_name.lower() in c.get("name", "").lower()),
                None,
            )
            if match:
                client_id = match.get("id", "")
        except Exception:
            pass

    return {
        "id": dec_id,
        "reference_number": dec_id,
        "status": "pending_review",
        "declaration_type": dec_type,
        "updated_at": now,
        "created_at": now,
        "source": {"type": "EXTRACT", "mode": mode, "files": filenames},
        "confidence": ex.get("confidence", 0.7),
        "extraction_notes": ex.get("notes") or [],
        "client_id": client_id,
        "header": {
            "declarationRef": dec_id,
            "port": "TTPTS",
            "term": "CIF",
            "modeOfTransport": transport,
            "customsRegime": customs_regime,
            "consignorName": ex.get("consignorName") or "",
            "consignorAddress": ex.get("consignorAddress") or "",
            "consigneeCode": "",
            "consigneeName": consignee_name,
            "consigneeAddress": ex.get("consigneeAddress") or "",
            "vesselName": vessel,
            "rotationNumber": ex.get("rotationNumber") or "",
            "blAwbNumber": awb,
            "blAwbDate": ex.get("shippedOnBoardDate") or "",
            "invoiceNumber": ex.get("invoiceNumber") or "",
            "invoiceDate": ex.get("invoiceDate") or "",
            "currency": ex.get("currency") or "USD",
            "portOfLoading": ex.get("portOfLoading") or "",
            "countryOfOrigin": ex.get("countryOfOrigin") or "",
        },
        "worksheet": {
            "invoice_value_foreign": invoice_value_foreign,
            "fob_foreign": invoice_value_foreign,
            "exchange_rate": 6.77,
            "freight_foreign": float(charges.get("freight_foreign", 0) or 0),
            "insurance_foreign": float(charges.get("insurance_foreign", 0) or 0),
            "other_foreign": float(charges.get("other_foreign", 0) or 0),
            "deduction_foreign": float(charges.get("deduction_foreign", 0) or 0),
            "duty_rate_pct": 0,
            "surcharge_rate_pct": 0,
            "vat_rate_pct": 0,
            "extra_fees_local": 40,
            "global_fee": 40,
        },
        "items": items,
        "containers": (
            [{"containerNumber": ex["containerNumber"], "sealNumber": ex.get("sealNumber") or ""}]
            if ex.get("containerNumber") else []
        ),
        "certificates": ex.get("certificates") or [],
        "permit_flags": _check_permits(ex.get("description") or ""),
    }


@router.post("/extract/documents")
async def extract_documents(files: list[UploadFile] = File(...), mode: str = Form("batch")):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    now = datetime.utcnow().isoformat() + "Z"
    filenames = [f.filename or "document" for f in files]
    declarations_payload: List[Dict[str, Any]] = []

    if mode == "batch":
        try:
            ex = await _extract_with_claude(files)
        except Exception as e:
            logger.warning("Claude extraction failed, falling back to regex: %s", str(e))
            extractions = [_fallback_extract(f) for f in files]
            ex = extractions[0].copy()
            for other in extractions[1:]:
                for k, v in other.items():
                    if k == "notes":
                        continue
                    if not ex.get(k) and v:
                        ex[k] = v

        declarations_payload.append(_build_declaration_record(ex, mode, filenames, now))
    else:
        for f in files:
            try:
                ex = await _extract_with_claude([f])
            except Exception as e:
                logger.warning("Claude extraction failed for %s: %s", f.filename, str(e))
                ex = _fallback_extract(f)
            declarations_payload.append(
                _build_declaration_record(ex, mode, [f.filename or "document"], now)
            )

    existing = load_declarations()
    existing.extend(declarations_payload)
    save_declarations(existing)

    return {
        "status": "ok",
        "mode": mode,
        "items": [{
            "id": d["id"],
            "consigneeName": d["header"].get("consigneeName"),
            "consignorName": d["header"].get("consignorName"),
            "hsCode": (d.get("items") or [{}])[0].get("hsCode", ""),
            "invoiceValueForeign": d["worksheet"].get("invoice_value_foreign", 0),
            "currency": d["header"].get("currency", "USD"),
            "confidence": d.get("confidence", 0),
            "notes": d.get("extraction_notes", []),
            "status": d.get("status", "pending_review"),
            "certificates": d.get("certificates", []),
            "permitFlags": d.get("permit_flags", []),
            "containerNumber": (d.get("containers") or [{}])[0].get("containerNumber", ""),
        } for d in declarations_payload],
    }


# ─── HS code search (local-first, Claude fallback) ────────────────────────────

from ..services.tariff_service import search_hybrid


@router.post("/hs/search")
async def hs_search(req: Dict[str, Any]):
    query = (req.get("query") or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    try:
        results, source = search_hybrid(query, limit=5)
    except Exception as exc:
        logger.error("HS search failed: %s", str(exc))
        raise HTTPException(status_code=502, detail=f"HS search failed: {exc}")

    return {"query": query, "results": results, "source": source}
