from __future__ import annotations

import csv
import io
import re
import uuid
from datetime import date, datetime
from typing import Any, Dict, Optional

import httpx
from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form
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


# ─── Document extraction (lightweight MVP) ───────────────────────────────────
def _read_pdf_text(upload: UploadFile) -> str:
    raw = upload.file.read() or b""

    # Try pypdf if available.
    try:
        from pypdf import PdfReader  # type: ignore
        import io as _io

        reader = PdfReader(_io.BytesIO(raw))
        return "\n".join((p.extract_text() or "") for p in reader.pages)
    except Exception:
        pass

    # Fallback: best-effort text decode from bytes.
    try:
        return raw.decode("utf-8", errors="ignore")
    except Exception:
        return ""


def _first(pattern: str, text: str, flags: int = re.IGNORECASE) -> str:
    m = re.search(pattern, text, flags)
    return (m.group(1).strip() if m and m.groups() else "")


def _extract_fields_from_text(text: str, filename: str) -> Dict[str, Any]:
    upper = text.upper()

    hs = _first(r"\b(\d{4}\.\d{2}\.\d{2}\.\d{2}|\d{6,12})\b", text)
    awb = _first(r"\b([A-Z0-9]{3,4}[\s-]?[A-Z0-9]{3,}[\s-]?[A-Z0-9]{3,})\b", upper)

    amount_raw = _first(r"(?:TOTAL|AMOUNT|INVOICE\s+TOTAL)\D{0,20}(\d[\d,]*\.?\d{0,2})", text)
    amount = 0.0
    try:
        amount = float((amount_raw or "0").replace(",", ""))
    except Exception:
        amount = 0.0

    consignee = "HECA Medical Technologies Ltd" if "HECA" in upper else _first(r"CONSIGNEE\s*[:\-]\s*(.+)", text)
    consignor = "Align Technology Switzerland GmbH" if "ALIGN" in upper else _first(r"CONSIGNOR\s*[:\-]\s*(.+)", text)

    invoice_no = _first(r"INVOICE\s*(?:NO|NUMBER)?\s*[:#\-]?\s*([A-Z0-9\-/]+)", upper)
    invoice_date = _first(r"(?:INVOICE\s+DATE|DATE)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{2,4})", text)

    # Confidence is heuristic for MVP extraction.
    confidence_hits = sum(bool(x) for x in [hs, amount > 0, consignee, consignor, invoice_no])
    confidence = round(min(0.95, 0.55 + confidence_hits * 0.08), 2)

    return {
        "filename": filename,
        "consigneeName": consignee or "",
        "consignorName": consignor or "",
        "hsCode": hs or "",
        "blAwbNumber": awb or "",
        "invoiceNumber": invoice_no or "",
        "invoiceDate": invoice_date or "",
        "invoiceValueForeign": amount,
        "currency": "USD",
        "description": "Extracted from source document",
        "confidence": confidence,
        "notes": [] if confidence >= 0.75 else ["Low confidence — broker review required"],
    }


@app.post("/extract/documents")
async def extract_documents(files: list[UploadFile] = File(...), mode: str = Form("batch")):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    extractions: list[Dict[str, Any]] = []
    for f in files:
        text = _read_pdf_text(f)
        fields = _extract_fields_from_text(text, f.filename or "uploaded-file")
        extractions.append(fields)

    # For MVP: in batch mode merge into one declaration, otherwise one per file.
    declarations_payload: list[Dict[str, Any]] = []
    now = datetime.utcnow().isoformat() + "Z"

    if mode == "batch":
        merged = extractions[0].copy()
        for ex in extractions[1:]:
            for k, v in ex.items():
                if k in {"filename", "notes"}:
                    continue
                if (not merged.get(k)) and v:
                    merged[k] = v
            merged["confidence"] = round(min(0.99, (merged.get("confidence", 0.6) + ex.get("confidence", 0.6)) / 2), 2)

        dec_id = f"EXT-{uuid.uuid4().hex[:8].upper()}"
        declarations_payload.append({
            "id": dec_id,
            "status": "pending_review",
            "updated_at": now,
            "source": {"type": "EXTRACT", "mode": mode, "files": [x.get("filename") for x in extractions]},
            "confidence": merged.get("confidence", 0.7),
            "header": {
                "declarationRef": dec_id,
                "port": "TTPTS",
                "term": "CIF",
                "modeOfTransport": "AIR",
                "customsRegime": "IM4",
                "consignorName": merged.get("consignorName", ""),
                "consigneeCode": "",
                "consigneeName": merged.get("consigneeName", ""),
                "vesselName": "",
                "blAwbNumber": merged.get("blAwbNumber", ""),
                "invoiceNumber": merged.get("invoiceNumber", ""),
                "invoiceDate": merged.get("invoiceDate", ""),
                "currency": merged.get("currency", "USD"),
            },
            "worksheet": {
                "invoice_value_foreign": merged.get("invoiceValueForeign", 0),
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
                "description": merged.get("description", "Extracted item"),
                "hsCode": merged.get("hsCode", ""),
                "qty": 1,
                "packageType": "BOX",
                "grossKg": 0,
                "netKg": 0,
                "itemValue": merged.get("invoiceValueForeign", 0),
                "unitCode": "NMB",
                "dutyTaxCode": "",
                "dutyTaxBase": "",
                "cpc": "4000",
            }],
            "containers": [],
            "extraction_notes": merged.get("notes", []),
        })
    else:
        for ex in extractions:
            dec_id = f"EXT-{uuid.uuid4().hex[:8].upper()}"
            declarations_payload.append({
                "id": dec_id,
                "status": "pending_review",
                "updated_at": now,
                "source": {"type": "EXTRACT", "mode": mode, "files": [ex.get("filename")]},
                "confidence": ex.get("confidence", 0.7),
                "header": {
                    "declarationRef": dec_id,
                    "port": "TTPTS",
                    "term": "CIF",
                    "modeOfTransport": "AIR",
                    "customsRegime": "IM4",
                    "consignorName": ex.get("consignorName", ""),
                    "consigneeCode": "",
                    "consigneeName": ex.get("consigneeName", ""),
                    "vesselName": "",
                    "blAwbNumber": ex.get("blAwbNumber", ""),
                    "invoiceNumber": ex.get("invoiceNumber", ""),
                    "invoiceDate": ex.get("invoiceDate", ""),
                    "currency": ex.get("currency", "USD"),
                },
                "worksheet": {
                    "invoice_value_foreign": ex.get("invoiceValueForeign", 0),
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
                    "description": ex.get("description", "Extracted item"),
                    "hsCode": ex.get("hsCode", ""),
                    "qty": 1,
                    "packageType": "BOX",
                    "grossKg": 0,
                    "netKg": 0,
                    "itemValue": ex.get("invoiceValueForeign", 0),
                    "unitCode": "NMB",
                    "dutyTaxCode": "",
                    "dutyTaxBase": "",
                    "cpc": "4000",
                }],
                "containers": [],
                "extraction_notes": ex.get("notes", []),
            })

    existing = load_declarations()
    existing.extend(declarations_payload)
    save_declarations(existing)

    return {
        "status": "ok",
        "mode": mode,
        "items": [{
            "id": d["id"],
            "consigneeName": d.get("header", {}).get("consigneeName"),
            "consignorName": d.get("header", {}).get("consignorName"),
            "hsCode": (d.get("items") or [{}])[0].get("hsCode", ""),
            "invoiceValueForeign": d.get("worksheet", {}).get("invoice_value_foreign", 0),
            "currency": d.get("header", {}).get("currency", "USD"),
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
