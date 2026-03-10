from __future__ import annotations

import csv
import io
import uuid
from datetime import date, datetime
from typing import Any, Dict, Optional

import httpx
from fastapi import FastAPI, HTTPException, Query
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
