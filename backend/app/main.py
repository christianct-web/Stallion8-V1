from __future__ import annotations

import base64
import csv
import io
import json
import os
import re
import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from .models import DeclarationReq, ExportReq, TemplateIn, TemplateOut, WorksheetInput
from .services.declaration_service import export_xml, validate_decl
from .services.pack_service import generate_pack, resolve_generated_file
from .services.worksheet_service import calculate_worksheet
from .store import LOOKUPS, load_templates, save_templates, load_declarations, save_declarations

app = FastAPI(title="Stallion API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Valid broker review actions — FIX: added "submitted"
REVIEW_ACTIONS = {
    "approved", "needs_correction", "rejected",
    "pending_review", "submitted", "receipted",
}

# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "service": "stallion", "version": "0.2.0"}


# ─── Lookups ──────────────────────────────────────────────────────────────────
@app.get("/lookups/{kind}")
async def lookups(kind: str, date: str | None = Query(default=None)):
    # Route-level compatibility: allow /lookups/cbtt-rate?date=YYYY-MM-DD
    # to coexist with dynamic lookup kind path.
    if kind == "cbtt-rate":
      return await cbtt_rate(date)

    if kind not in LOOKUPS:
        raise HTTPException(status_code=404, detail=f"Lookup kind '{kind}' not found")
    return {"kind": kind, "items": LOOKUPS[kind]}


# ─── CBTT rate proxy ──────────────────────────────────────────────────────────
# Proxies the Central Bank of Trinidad and Tobago weighted average selling rate.
# The CBTT website publishes daily rates at:
#   https://www.central-bank.org.tt/our-work/statistics/exchange-rates
# We scrape the JSON endpoint used by their website; if unavailable we fall
# back to the last known rate persisted in our own store.
#
# Caches one entry per calendar date in memory (restarts clear cache).

_cbtt_cache: dict[str, dict] = {}

CBTT_ENDPOINT = "https://www.central-bank.org.tt/our-work/statistics/exchange-rates/json"
# Fallback rate last updated 2025-03-01
CBTT_FALLBACK_RATE = 6.7732


@app.get("/lookups/cbtt-rate")
async def cbtt_rate(date_str: str = Query(default=None, alias="date")):
    """
    Returns the USD/TTD weighted average selling rate for a given date.

    Query param:  ?date=YYYY-MM-DD   (defaults to today)
    Response:     { rate, date, source }
      source: "central_bank" | "cache" | "fallback"
    """
    target_date = date_str or date.today().isoformat()

    # Serve from in-process cache
    if target_date in _cbtt_cache:
        return {**_cbtt_cache[target_date], "source": "cache"}

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(CBTT_ENDPOINT, params={"date": target_date})
            resp.raise_for_status()
            payload = resp.json()

        # CBTT returns a list of currency rows; find USD selling rate
        # Shape varies by endpoint version — try both known shapes.
        rate = None

        if isinstance(payload, list):
            for row in payload:
                currency = (row.get("currency") or row.get("Currency") or "").upper()
                if "USD" in currency or "US DOLLAR" in currency:
                    rate = float(
                        row.get("selling") or row.get("Selling") or
                        row.get("weighted_avg") or row.get("WeightedAvg") or 0
                    )
                    break

        if rate and rate > 0:
            entry = {"rate": rate, "date": target_date, "source": "central_bank"}
            _cbtt_cache[target_date] = entry
            return entry

    except Exception:
        pass  # fall through to fallback

    # Fallback: return last known rate with "fallback" source flag so UI can warn
    return {"rate": CBTT_FALLBACK_RATE, "date": target_date, "source": "fallback"}


# ─── Templates ────────────────────────────────────────────────────────────────
@app.get("/templates", response_model=list[TemplateOut])
def templates_list():
    return load_templates()


@app.post("/templates", response_model=TemplateOut)
def templates_create(req: TemplateIn):
    items = load_templates()
    row = {"id": str(uuid.uuid4()), **req.model_dump()}
    items.append(row)
    save_templates(items)
    return row


# ─── Worksheet ────────────────────────────────────────────────────────────────
@app.post("/worksheet/calculate")
def worksheet_calculate(req: WorksheetInput):
    return calculate_worksheet(req)


# ─── Old-style validate / export endpoints (DeclarationEditor compat) ─────────
@app.post("/declarations/validate")
def declarations_validate(req: DeclarationReq):
    return validate_decl(req.declaration)


@app.post("/declarations/export-xml")
def declarations_export_xml(req: ExportReq):
    report = validate_decl(req.declaration)
    if report["status"] != "pass":
        return {"validation": report, "xml": None}
    return {"validation": report, "xml": export_xml(req.declaration)}


# ─── Register CSV export ──────────────────────────────────────────────────────
@app.get("/declarations/register-csv")
def declarations_register_csv(month: Optional[str] = None):
    """
    Export the declaration register as CSV.
    Optional ?month=YYYY-MM filter.
    """
    items = load_declarations()

    if month:
        def in_month(d: dict) -> bool:
            ts = d.get("updated_at") or d.get("created_at") or ""
            return ts.startswith(month)
        items = [x for x in items if in_month(x)]

    fieldnames = [
        "declaration_id", "reference_number",
        "consignee_name", "consignee_code",
        "hs_code", "cif_value_ttd",
        "invoice_date", "reviewed_by", "reviewed_at",
        "status", "receipt_number", "updated_at",
    ]

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()

    for d in items:
        h   = d.get("header") or {}
        ws  = d.get("worksheet") or {}
        itm = (d.get("items") or [{}])[0]
        writer.writerow({
            "declaration_id":  d.get("id", ""),
            "reference_number": d.get("reference_number") or h.get("declarationRef", ""),
            "consignee_name":  h.get("consigneeName") or h.get("consignee_name", ""),
            "consignee_code":  h.get("consigneeCode") or h.get("consignee_code", ""),
            "hs_code":         itm.get("hsCode") or itm.get("tarification_hscode_commodity_code", ""),
            "cif_value_ttd":   ws.get("cif_local", ""),
            "invoice_date":    h.get("invoiceDate") or h.get("invoice_date", ""),
            "reviewed_by":     d.get("reviewed_by", ""),
            "reviewed_at":     d.get("reviewed_at", ""),
            "status":          d.get("status", ""),
            "receipt_number":  d.get("receipt_number", ""),
            "updated_at":      d.get("updated_at", ""),
        })

    output.seek(0)
    filename = f"stallion-register-{month or 'all'}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Declarations CRUD ────────────────────────────────────────────────────────
@app.get("/declarations")
def declarations_list(status: Optional[str] = None):
    items = load_declarations()
    if status:
        items = [x for x in items if str(x.get("status", "")).lower() == status.lower()]
    return {"items": items}


@app.get("/declarations/{declaration_id}")
def declarations_get(declaration_id: str):
    items = load_declarations()
    row = next((r for r in items if str(r.get("id")) == declaration_id), None)
    if row is None:
        raise HTTPException(status_code=404, detail="Declaration not found")
    return row


@app.post("/declarations")
def declarations_upsert(req: Dict[str, Any]):
    items = load_declarations()
    row_id = str(req.get("id") or "").strip()
    if not row_id:
        raise HTTPException(status_code=400, detail="id is required")

    found = next((i for i, r in enumerate(items) if str(r.get("id")) == row_id), None)
    if found is None:
        items.append(req)
    else:
        items[found] = {**items[found], **req}
    save_declarations(items)
    return {"ok": True, "id": row_id}


@app.delete("/declarations/{declaration_id}")
def declarations_delete(declaration_id: str):
    items = load_declarations()
    new_items = [r for r in items if str(r.get("id")) != declaration_id]
    if len(new_items) == len(items):
        raise HTTPException(status_code=404, detail="Declaration not found")
    save_declarations(new_items)
    return {"ok": True, "id": declaration_id}


# ─── Document extraction — Claude API ────────────────────────────────────────

EXTRACTION_SYSTEM_PROMPT = """You are a customs declaration data extraction specialist for Trinidad and Tobago (ASYCUDA World).
Extract all available fields from the uploaded documents (commercial invoices, airway bills, packing lists).

Return ONLY a valid JSON object with these fields (use null for fields not found):
{
  "consigneeName": "string — the importer / ship-to party in Trinidad",
  "consigneeAddress": "string — consignee full address",
  "consignorName": "string — the exporter / shipper",
  "consignorAddress": "string — consignor full address",
  "hsCode": "string — HS tariff code in format XXXX.XX.XX.XX if available, else null",
  "description": "string — description of goods (be specific)",
  "countryOfOrigin": "string — 2-letter ISO country code of origin",
  "invoiceNumber": "string",
  "invoiceDate": "string — ISO date YYYY-MM-DD",
  "invoiceValueForeign": number — the EXW/FOB value (not CIF), numeric only,
  "currency": "string — 3-letter ISO currency code, default USD",
  "blAwbNumber": "string — air waybill or bill of lading number",
  "shippedOnBoardDate": "string — ISO date YYYY-MM-DD, look for 'Laden on Board', 'Shipped on Board', 'Flight Date'",
  "shippedOnBoardLabel": "string — exact label used in document for this date",
  "vesselOrFlight": "string — vessel name or flight number",
  "portOfLoading": "string",
  "portOfDischarge": "string — typically Port of Spain (TTPTS) or Piarco (TTPIA)",
  "packageCount": number or null,
  "packageType": "string — e.g. CTN, BOX, PKG",
  "grossWeightKg": number or null,
  "netWeightKg": number or null,
  "confidence": number — between 0.0 and 1.0 reflecting how complete and certain the extraction is,
  "notes": ["array of strings — flag any fields that are missing, ambiguous, or need broker attention"]
}

Rules:
- For invoiceValueForeign: use the EXW or FOB subtotal, NOT the grand total if freight/insurance are included.
  If only one total is shown, use that.
- For hsCode: only return if clearly printed on the document. Do not guess.
- For confidence: 0.90+ means all critical fields found clearly. 0.70-0.89 means some fields missing.
  Below 0.70 means significant gaps.
- Critical fields (required for TT customs): consigneeName, invoiceValueForeign, currency, invoiceNumber.
- Return ONLY the JSON object, no markdown, no explanation."""


def _read_file_bytes(upload: UploadFile) -> bytes:
    """Read uploaded file bytes, resetting the file pointer."""
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

    import anthropic

    client = anthropic.Anthropic(api_key=api_key)

    # Build message content — one content block per file
    content: List[Dict[str, Any]] = []

    for f in files:
        raw = _read_file_bytes(f)
        fname = f.filename or "document"

        if _is_pdf(f) and raw:
            # Send as base64-encoded PDF document
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
            # Non-PDF: extract text and send as text block
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

    return json.loads(raw_text)


def _fallback_extract(upload: UploadFile) -> Dict[str, Any]:
    """Regex-based fallback for when Claude API is unavailable."""
    raw = _read_file_bytes(upload)
    text = ""
    try:
        from pypdf import PdfReader  # type: ignore
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

    hits = sum(bool(x) for x in [hs, amount > 0, consignee, invoice_no])
    confidence = round(min(0.65, 0.35 + hits * 0.08), 2)

    return {
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
    }


def _build_declaration_record(ex: Dict[str, Any], mode: str, filenames: List[str], now: str) -> Dict[str, Any]:
    """Convert a Claude extraction dict into a full declaration record for storage."""
    dec_id = f"EXT-{uuid.uuid4().hex[:8].upper()}"
    val = ex.get("invoiceValueForeign") or 0
    try:
        val = float(val)
    except Exception:
        val = 0.0

    # Infer transport mode from document content
    transport = "AIR"
    awb = ex.get("blAwbNumber") or ""
    if any(c.isalpha() for c in awb[:2]):  # typical AWB prefix → air
        transport = "AIR"
    vessel = ex.get("vesselOrFlight") or ""
    if vessel and not any(ch.isdigit() for ch in vessel[:3]):
        transport = "SEA"

    return {
        "id": dec_id,
        "reference_number": dec_id,
        "status": "pending_review",
        "updated_at": now,
        "created_at": now,
        "source": {"type": "EXTRACT", "mode": mode, "files": filenames},
        "confidence": ex.get("confidence", 0.7),
        "extraction_notes": ex.get("notes") or [],
        "header": {
            "declarationRef": dec_id,
            "port": "TTPTS",
            "term": "CIF",
            "modeOfTransport": transport,
            "customsRegime": "IM4",
            "consignorName": ex.get("consignorName") or "",
            "consignorAddress": ex.get("consignorAddress") or "",
            "consigneeCode": "",
            "consigneeName": ex.get("consigneeName") or "",
            "consigneeAddress": ex.get("consigneeAddress") or "",
            "vesselName": vessel,
            "blAwbNumber": awb,
            "blAwbDate": ex.get("shippedOnBoardDate") or "",
            "invoiceNumber": ex.get("invoiceNumber") or "",
            "invoiceDate": ex.get("invoiceDate") or "",
            "currency": ex.get("currency") or "USD",
            "portOfLoading": ex.get("portOfLoading") or "",
            "countryOfOrigin": ex.get("countryOfOrigin") or "",
        },
        "worksheet": {
            "invoice_value_foreign": val,
            "fob_foreign": val,
            "exchange_rate": 6.77,
            "freight_foreign": 0,
            "insurance_foreign": 0,
            "other_foreign": 0,
            "deduction_foreign": 0,
            "duty_rate_pct": 0,
            "surcharge_rate_pct": 0,
            "vat_rate_pct": 0,
            "extra_fees_local": 40,
            "global_fee": 40,
        },
        "items": [{
            "id": f"ITEM-{uuid.uuid4().hex[:6].upper()}",
            "description": ex.get("description") or "Extracted item",
            "hsCode": ex.get("hsCode") or "",
            "qty": ex.get("packageCount") or 1,
            "packageType": ex.get("packageType") or "BOX",
            "grossKg": ex.get("grossWeightKg") or 0,
            "netKg": ex.get("netWeightKg") or 0,
            "itemValue": val,
            "unitCode": "NMB",
            "dutyTaxCode": "",
            "dutyTaxBase": "",
            "cpc": "4000",
            "countryOfOrigin": ex.get("countryOfOrigin") or "",
        }],
        "containers": [],
    }


@app.post("/extract/documents")
async def extract_documents(files: list[UploadFile] = File(...), mode: str = Form("batch")):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    now = datetime.utcnow().isoformat() + "Z"
    filenames = [f.filename or "document" for f in files]
    declarations_payload: List[Dict[str, Any]] = []

    if mode == "batch":
        # Send all files together — Claude merges them into one coherent declaration
        try:
            ex = await _extract_with_claude(files)
        except Exception as e:
            # Fallback: try each file with regex, merge manually
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
        # Separate mode: one declaration per file
        for f in files:
            try:
                ex = await _extract_with_claude([f])
            except Exception:
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
        } for d in declarations_payload],
    }


# ─── Review / status transition ───────────────────────────────────────────────
@app.patch("/declarations/{declaration_id}/review")
def declarations_review(declaration_id: str, req: Dict[str, Any]):
    items = load_declarations()
    idx = next((i for i, r in enumerate(items) if str(r.get("id")) == declaration_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Declaration not found")

    action = str(req.get("action") or "").lower()
    if action not in REVIEW_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid action '{action}'. Allowed: {sorted(REVIEW_ACTIONS)}",
        )

    patch: Dict[str, Any] = {
        "status":       action,
        "review_notes": req.get("review_notes", items[idx].get("review_notes", "")),
        "reviewed_by":  req.get("reviewed_by",  items[idx].get("reviewed_by")),
        "reviewed_at":  req.get("reviewed_at",  items[idx].get("reviewed_at")),
    }

    # FIX: persist receipt_number when action is "receipted"
    if action == "receipted" and req.get("receipt_number"):
        patch["receipt_number"] = req["receipt_number"]

    # Merge header / worksheet / items if provided
    if "header" in req:
        patch["header"] = req["header"]
    if "worksheet" in req:
        patch["worksheet"] = req["worksheet"]
    if "items" in req:
        patch["items"] = req["items"]

    items[idx] = {**items[idx], **patch}
    save_declarations(items)
    return {"ok": True, "id": declaration_id, "status": action}


# ─── Activity log ──────────────────────────────────────────────────────────────
@app.get("/log")
def activity_log(limit: int = 200):
    """
    Derives a time-sorted activity timeline from declarations.
    Returns events: created, pending_review, approved, needs_correction,
    rejected, submitted, receipted — with timestamps, actors, and notes.
    """
    items = load_declarations()
    events = []

    EVENT_ORDER = ["receipted", "submitted", "approved", "needs_correction", "rejected"]

    for d in items:
        ref = d.get("reference_number") or (d.get("id") or "")[:12] or "—"
        consignee = (d.get("header") or {}).get("consigneeName", "")
        src = (d.get("source") or {}).get("type", "MANUAL")
        dec_id = d.get("id", "")

        # Creation / extraction event
        created_at = d.get("created_at") or d.get("updated_at", "")
        if created_at:
            events.append({
                "event": "extracted" if src == "EXTRACT" else "created",
                "declaration_id": dec_id,
                "reference": ref,
                "consignee": consignee,
                "source": src,
                "confidence": d.get("confidence"),
                "timestamp": created_at,
                "actor": "AI extraction" if src == "EXTRACT" else "ops",
                "notes": "",
            })

        # Review / status events
        reviewed_at = d.get("reviewed_at") or ""
        status = d.get("status", "")
        if reviewed_at and status in EVENT_ORDER:
            notes = d.get("review_notes") or ""
            if status == "receipted" and d.get("receipt_number"):
                notes = f"Receipt #{d['receipt_number']}"
            events.append({
                "event": status,
                "declaration_id": dec_id,
                "reference": ref,
                "consignee": consignee,
                "source": src,
                "confidence": None,
                "timestamp": reviewed_at,
                "actor": d.get("reviewed_by") or "broker",
                "notes": notes,
            })

    events.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
    return {"events": events[:limit], "total": len(events)}


# ─── Pack generation ──────────────────────────────────────────────────────────
@app.post("/pack/generate")
def pack_generate(req: Dict[str, Any]):
    declaration_id = req.get("declaration_id")
    all_items = None
    row_idx: int | None = None

    if declaration_id:
        all_items = load_declarations()
        row_idx = next(
            (i for i, r in enumerate(all_items) if str(r.get("id")) == str(declaration_id)),
            None,
        )
        if row_idx is None:
            raise HTTPException(status_code=404, detail="Declaration not found")

        row = all_items[row_idx]
        row_status = str(row.get("status", "")).lower()
        if row_status not in {"approved", "pending_review"}:
            raise HTTPException(
                status_code=409,
                detail=f"Declaration must be approved or pending_review before export (current: {row_status})",
            )

    # If declaration_id is provided, use persisted declaration payload as defaults.
    # Allows broker/workbench to generate from saved records without resending full body.
    if declaration_id and all_items is not None and row_idx is not None:
        row = all_items[row_idx]
        req = {
            **req,
            "header": req.get("header") or row.get("header") or {},
            "worksheet": req.get("worksheet") or row.get("worksheet") or {},
            "items": req.get("items") or row.get("items") or [],
            "containers": req.get("containers") or row.get("containers") or [],
        }

    result = generate_pack(req)

    if declaration_id and all_items is not None and row_idx is not None:
        event = {
            "at":       result.get("generatedAt"),
            "status":   result.get("status"),
            "ref":      next(
                (d.get("ref") for d in (result.get("documents") or []) if d.get("ref")),
                None,
            ),
            "preflight": result.get("preflight", {}).get("counts", {}),
        }
        row    = all_items[row_idx]
        events = row.get("export_events") or []
        if not isinstance(events, list):
            events = []
        events.append(event)

        all_items[row_idx] = {
            **row,
            "export_events": events[-10:],
            "last_export":   event,
        }
        save_declarations(all_items)

    return result


@app.get("/pack/file/{doc_id}")
def pack_file(doc_id: str):
    path = resolve_generated_file(doc_id)
    if path is None:
        raise HTTPException(status_code=404, detail="File not found")
    media_type = "application/pdf" if path.suffix.lower() == ".pdf" else "application/xml"
    return FileResponse(path, media_type=media_type, filename=path.name)
