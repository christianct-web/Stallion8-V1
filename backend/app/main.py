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
from .store import LOOKUPS, load_templates, save_templates

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


@app.post("/pack/generate")
def pack_generate(req: Dict[str, Any]):
    return generate_pack(req)


@app.get("/pack/file/{doc_id}")
def pack_file(doc_id: str):
    path = resolve_generated_file(doc_id)
    if path is None:
        raise HTTPException(status_code=404, detail="File not found")
    media_type = "application/pdf" if path.suffix.lower() == ".pdf" else "application/xml"
    return FileResponse(path, media_type=media_type, filename=path.name)
