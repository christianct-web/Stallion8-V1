from __future__ import annotations

import uuid
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .models import DeclarationReq, ExportReq, TemplateIn, TemplateOut, WorksheetInput
from .services.declaration_service import export_xml, validate_decl
from .services.pack_service import generate_pack, resolve_generated_file
from .services.worksheet_service import calculate_worksheet
from .store import LOOKUPS, load_templates, save_templates, load_declarations, save_declarations

app = FastAPI(title="Stallion API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "stallion"}


@app.get("/lookups/{kind}")
def lookups(kind: str):
    if kind not in LOOKUPS:
        raise HTTPException(status_code=404, detail="Lookup kind not found")
    return {"kind": kind, "items": LOOKUPS[kind]}


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


@app.post("/worksheet/calculate")
def worksheet_calculate(req: WorksheetInput):
    return calculate_worksheet(req)


@app.post("/declarations/validate")
def declarations_validate(req: DeclarationReq):
    return validate_decl(req.declaration)


@app.post("/declarations/export-xml")
def declarations_export_xml(req: ExportReq):
    report = validate_decl(req.declaration)
    if report["status"] != "pass":
        return {"validation": report, "xml": None}
    return {"validation": report, "xml": export_xml(req.declaration)}


@app.get("/declarations")
def declarations_list(status: str | None = None):
    items = load_declarations()
    if status:
        items = [x for x in items if str(x.get("status", "")).lower() == status.lower()]
    return {"items": items}


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


@app.patch("/declarations/{declaration_id}/review")
def declarations_review(declaration_id: str, req: Dict[str, Any]):
    items = load_declarations()
    idx = next((i for i, r in enumerate(items) if str(r.get("id")) == declaration_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Declaration not found")

    action = str(req.get("action") or "").lower()
    if action not in {"approved", "needs_correction", "rejected", "pending_review", "receipted"}:
        raise HTTPException(status_code=400, detail="Invalid action")

    patch = {
        "status": action,
        "review_notes": req.get("review_notes", items[idx].get("review_notes", "")),
        "reviewed_by": req.get("reviewed_by", items[idx].get("reviewed_by")),
        "reviewed_at": req.get("reviewed_at", items[idx].get("reviewed_at")),
    }
    if "header" in req:
        patch["header"] = req.get("header")
    if "worksheet" in req:
        patch["worksheet"] = req.get("worksheet")
    if "items" in req:
        patch["items"] = req.get("items")

    items[idx] = {**items[idx], **patch}
    save_declarations(items)
    return {"ok": True, "id": declaration_id, "status": action}


@app.post("/pack/generate")
def pack_generate(req: Dict[str, Any]):
    declaration_id = req.get("declaration_id")
    items: list[dict[str, Any]] | None = None
    row_idx: int | None = None

    if declaration_id:
        items = load_declarations()
        row_idx = next((i for i, r in enumerate(items) if str(r.get("id")) == str(declaration_id)), None)
        if row_idx is None:
            raise HTTPException(status_code=404, detail="Declaration not found")

        row = items[row_idx]
        if str(row.get("status", "")).lower() != "approved":
            raise HTTPException(status_code=409, detail="Declaration must be approved before export")

    result = generate_pack(req)

    if declaration_id and items is not None and row_idx is not None:
        event = {
            "at": result.get("generatedAt"),
            "status": result.get("status"),
            "ref": next((d.get("ref") for d in (result.get("documents") or []) if d.get("ref")), None),
            "preflight": result.get("preflight", {}).get("counts", {}),
        }
        row = items[row_idx]
        events = row.get("export_events") or []
        if not isinstance(events, list):
            events = []
        events.append(event)

        items[row_idx] = {
            **row,
            "export_events": events[-10:],
            "last_export": event,
        }
        save_declarations(items)

    return result


@app.get("/pack/file/{doc_id}")
def pack_file(doc_id: str):
    path = resolve_generated_file(doc_id)
    if path is None:
        raise HTTPException(status_code=404, detail="File not found")
    media_type = "application/pdf" if path.suffix.lower() == ".pdf" else "application/xml"
    return FileResponse(path, media_type=media_type, filename=path.name)
