from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, Set, List

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from jsonschema import Draft202012Validator, exceptions as js_exceptions

from .models import (
    TemplateIn,
    TemplateOut,
    WorksheetInput,
    DeclarationReq,
    ExportReq,
)
from .store import LOOKUPS, load_templates, save_templates
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

APP_ROOT = Path(__file__).resolve().parent

# Reuse proven emitter stack from existing ace-backend project if available.
ACE_BACKEND = Path("/root/.openclaw/workspace/ace-backend/asycuda_service")
VENDOR = ACE_BACKEND / "vendor"
CONTRACT = ACE_BACKEND / "contract/ACE_Replacement_Contract_v1/contract.v1.schema.json"

if VENDOR.exists():
    import sys
    for child in VENDOR.iterdir():
        if child.is_dir() and (child / "asycuda").exists():
            sys.path.insert(0, str(child))
            break
else:
    raise RuntimeError("Vendor mapping package missing. Expected ace-backend assets.")

try:
    from asycuda.load_mapping import load_mapping
    from asycuda.emitter import emit_asycuda_xml
except Exception as e:
    raise RuntimeError(f"Failed to import emitter modules: {e}")

if not CONTRACT.exists():
    raise RuntimeError("Contract schema missing in ace-backend.")

SCHEMA = json.loads(CONTRACT.read_text(encoding="utf-8"))
SCHEMA_VALIDATOR = Draft202012Validator(SCHEMA)

MAPPING_PATH = None
for child in VENDOR.iterdir():
    if child.is_dir() and (child / "mapping.json").exists():
        MAPPING_PATH = child / "mapping.json"
        break
if not MAPPING_PATH:
    raise RuntimeError("mapping.json not found")
MAPPING = load_mapping(MAPPING_PATH)

MVP_REQUIRED_PATHS = [
    "identification.office_segment_customs_clearance_office_code",
    "identification.type_type_of_declaration",
    "declarant.declarant_code",
    "traders.consignee_consignee_code",
    "valuation.total_total_invoice",
    "valuation.total_cif",
]


def get_path(obj: Dict[str, Any], path: str) -> Any:
    cur: Any = obj
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    return cur


def _to_contract_items(workbench_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for it in workbench_items or []:
        hs_raw = str(it.get("tarification_hscode_commodity_code") or it.get("hsCode") or "").strip()
        hs_digits = "".join(ch for ch in hs_raw if ch.isdigit())
        if not hs_digits:
            continue
        row: Dict[str, Any] = {
            "tarification_hscode_commodity_code": int(hs_digits),
        }
        desc = str(it.get("goods_description_commercial_description") or it.get("description") or "").strip()
        if desc:
            row["goods_description_commercial_description"] = desc
        if it.get("packageType"):
            row["packages_kind_of_packages_code"] = str(it.get("packageType"))
        if it.get("qty") is not None:
            try:
                row["packages_number_of_packages"] = float(it.get("qty") or 0)
            except Exception:
                pass
        if it.get("grossKg") is not None:
            try:
                row["valuation_item_weight_itm_gross_weight_itm"] = float(it.get("grossKg") or 0)
            except Exception:
                pass
        if it.get("netKg") is not None:
            try:
                row["valuation_item_weight_itm_net_weight_itm"] = float(it.get("netKg") or 0)
            except Exception:
                pass
        if it.get("itemValue") is not None:
            try:
                row["valuation_item_total_cif_itm"] = float(it.get("itemValue") or 0)
            except Exception:
                pass
        out.append(row)
    return out


def validate_decl(decl: Dict[str, Any]) -> Dict[str, Any]:
    errors = []
    warnings = []

    try:
        for err in sorted(SCHEMA_VALIDATOR.iter_errors(decl), key=str):
            errors.append({"path": "/".join([str(p) for p in err.path]) or "$", "message": err.message})
    except js_exceptions.SchemaError as e:
        raise HTTPException(status_code=500, detail=f"Schema error: {e}")

    for p in MVP_REQUIRED_PATHS:
        v = get_path(decl, p)
        if v is None or v == "":
            errors.append({"path": p, "message": "Required"})

    items = decl.get("items")
    if not isinstance(items, list) or len(items) < 1:
        errors.append({"path": "items", "message": "At least 1 item is required"})

    return {
        "status": "fail" if errors else "pass",
        "errors": errors,
        "warnings": warnings,
        "counts": {"errors": len(errors), "warnings": len(warnings)},
        "validated_at": datetime.utcnow().isoformat() + "Z",
    }


GENERATED_DIR = APP_ROOT.parent / "data" / "generated"
GENERATED_DIR.mkdir(parents=True, exist_ok=True)


def _write_pdf(title: str, lines: List[str]) -> tuple[str, str]:
    doc_id = f"{title.lower().replace(' ', '_')}-{uuid.uuid4().hex[:10]}"
    out = GENERATED_DIR / f"{doc_id}.pdf"
    c = canvas.Canvas(str(out), pagesize=A4)
    width, height = A4
    y = height - 40
    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, y, f"Stallion - {title}")
    y -= 24
    c.setFont("Helvetica", 10)
    for line in lines:
        if y < 50:
            c.showPage()
            c.setFont("Helvetica", 10)
            y = height - 40
        c.drawString(40, y, str(line)[:130])
        y -= 14
    c.showPage()
    c.save()
    return doc_id, str(out)


def _write_assessment_pdf(header: Dict[str, Any], worksheet: Dict[str, Any]) -> tuple[str, str]:
    doc_id = f"assessment_notice-{uuid.uuid4().hex[:10]}"
    out = GENERATED_DIR / f"{doc_id}.pdf"
    c = canvas.Canvas(str(out), pagesize=A4)
    _, h = A4

    c.setFont("Helvetica-Bold", 15)
    c.drawString(40, h - 40, "Assessment Notice")
    c.setFont("Helvetica", 10)
    c.drawString(40, h - 58, f"Customs office: {header.get('port','')}   -   Point Lisas")
    c.drawString(40, h - 74, f"Declarant/Consignee: {header.get('consigneeCode','')}")
    c.drawString(40, h - 90, f"Declaration reference: {header.get('declarationRef','')}    Model IM 4")

    y = h - 122
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, "Tax description")
    c.drawString(300, y, "Tax code")
    c.drawRightString(530, y, "Tax value")
    c.line(40, y - 4, 540, y - 4)
    y -= 20

    global_fee = float(worksheet.get("global_fee", 40) or 40)
    item_rows = [
        ("ICD  Import Duties", "ICD", float(worksheet.get("duty", 0) or 0)),
        ("SUR  Import Surcharge", "SUR", float(worksheet.get("surcharge", 0) or 0)),
        ("VAT  Value Added Tax", "VAT", float(worksheet.get("vat", 0) or 0)),
        ("CF2  C.P. Fees", "CF2", float(worksheet.get("extra_fees_local", 0) or 0)),
    ]

    c.setFont("Helvetica", 10)
    c.drawString(40, y, "UFC  CUS. DEC. USER FEE - COMMERCIAL")
    c.drawString(300, y, "UFC")
    c.drawRightString(530, y, f"{global_fee:,.2f}")
    y -= 16
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, "Total Global taxes")
    c.drawRightString(530, y, f"{global_fee:,.2f}")
    y -= 20

    c.setFont("Helvetica", 10)
    for name, code, val in item_rows:
        c.drawString(40, y, name)
        c.drawString(300, y, code)
        c.drawRightString(530, y, f"{val:,.2f}")
        y -= 16

    item_total = sum(v for _, _, v in item_rows)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, "Total Item taxes")
    c.drawRightString(530, y, f"{item_total:,.2f}")
    y -= 18

    grand_total = item_total + global_fee
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, y, "Total amount to be paid")
    c.drawRightString(530, y, f"{grand_total:,.2f}")

    c.setFont("Helvetica", 9)
    c.drawString(40, 42, f"Printed on: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC")
    c.drawRightString(540, 42, "Page 1 / 1")

    c.showPage()
    c.save()
    return doc_id, str(out)


def _write_information_pdf(header: Dict[str, Any], worksheet: Dict[str, Any], items: List[Dict[str, Any]], containers: List[Dict[str, Any]]) -> tuple[str, str]:
    doc_id = f"information_page-{uuid.uuid4().hex[:10]}"
    out = GENERATED_DIR / f"{doc_id}.pdf"
    c = canvas.Canvas(str(out), pagesize=A4)
    _, h = A4

    c.setFont("Helvetica-Bold", 15)
    c.drawString(40, h - 40, "Information Page")

    # Header block
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, h - 64, "Declaration header")
    c.line(40, h - 68, 540, h - 68)
    c.setFont("Helvetica", 10)
    c.drawString(40, h - 84, f"Declaration reference: {header.get('declarationRef','')}")
    c.drawString(300, h - 84, f"Customs office: {header.get('port','')}")
    c.drawString(40, h - 100, f"Terms: {header.get('term','')}")
    c.drawString(300, h - 100, f"Mode of transport: {header.get('modeOfTransport','')}")
    c.drawString(40, h - 116, f"Customs regime: {header.get('customsRegime','')}")
    c.drawString(300, h - 116, f"Consignee: {header.get('consigneeCode','')}")
    c.drawString(40, h - 132, f"Vessel/Flight: {header.get('vesselName','')}")

    # Quantities block
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, h - 156, "Shipment totals")
    c.line(40, h - 160, 540, h - 160)
    c.setFont("Helvetica", 10)
    total_packages = sum(float(x.get('packages', 0) or 0) for x in containers)
    total_weight = sum(float(x.get('goodsWeight', 0) or 0) for x in containers)
    c.drawString(40, h - 176, f"Items: {len(items)}")
    c.drawString(140, h - 176, f"Containers: {len(containers)}")
    c.drawString(280, h - 176, f"Packages: {int(total_packages) if total_packages else len(items)}")
    c.drawString(420, h - 176, f"Weight: {total_weight:,.2f}")

    # Financial summary block
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, h - 204, "Financial summary")
    c.line(40, h - 208, 540, h - 208)
    y = h - 224
    c.setFont("Helvetica", 10)
    rows = [
        ("CIF Foreign", float(worksheet.get('cif_foreign', 0) or 0)),
        ("CIF Local", float(worksheet.get('cif_local', 0) or 0)),
        ("Import Duty", float(worksheet.get('duty', 0) or 0)),
        ("Import Surcharge", float(worksheet.get('surcharge', 0) or 0)),
        ("VAT", float(worksheet.get('vat', 0) or 0)),
        ("Extra Fees", float(worksheet.get('extra_fees_local', 0) or 0)),
    ]
    for label, val in rows:
        c.drawString(40, y, label)
        c.drawRightString(530, y, f"{val:,.2f}")
        y -= 15

    c.line(40, y - 2, 540, y - 2)
    y -= 18
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, y, "TOTAL ASSESSED")
    c.drawRightString(530, y, f"{float(worksheet.get('total_assessed',0) or 0):,.2f}")

    c.setFont("Helvetica", 9)
    c.drawString(40, 42, f"Printed on: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC")
    c.drawRightString(540, 42, "Page 1 / 1")

    c.showPage()
    c.save()
    return doc_id, str(out)


def _write_container_pdf(header: Dict[str, Any], containers: List[Dict[str, Any]]) -> tuple[str, str]:
    doc_id = f"container_page-{uuid.uuid4().hex[:10]}"
    out = GENERATED_DIR / f"{doc_id}.pdf"
    c = canvas.Canvas(str(out), pagesize=A4)
    _, h = A4

    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, h - 40, "STALLION - CONTAINER PAGE")
    c.setFont("Helvetica", 10)
    c.drawString(40, h - 58, f"Customs office: {header.get('port','')}    Vessel: {header.get('vesselName','')}")

    y = h - 90
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, "Container")
    c.drawString(170, y, "Type")
    c.drawString(240, y, "Pkg Type")
    c.drawString(320, y, "Packages")
    c.drawString(420, y, "Goods Weight")
    c.line(40, y - 4, 540, y - 4)

    y -= 20
    c.setFont("Helvetica", 10)
    for row in containers[:20]:
      c.drawString(40, y, str(row.get('containerNo',''))[:20])
      c.drawString(170, y, str(row.get('type',''))[:10])
      c.drawString(240, y, str(row.get('packageType',''))[:10])
      c.drawRightString(380, y, str(row.get('packages',0)))
      c.drawRightString(530, y, f"{float(row.get('goodsWeight',0) or 0):,.2f}")
      y -= 16
      if y < 50:
        c.showPage()
        y = h - 40

    c.showPage()
    c.save()
    return doc_id, str(out)


def _write_sad_pdf(header: Dict[str, Any], worksheet: Dict[str, Any], items: List[Dict[str, Any]]) -> tuple[str, str]:
    doc_id = f"sad-{uuid.uuid4().hex[:10]}"
    out = GENERATED_DIR / f"{doc_id}.pdf"
    c = canvas.Canvas(str(out), pagesize=A4)
    _, h = A4

    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, h - 40, "SAD (Single Administrative Document)")
    c.setFont("Helvetica", 9)
    c.drawString(40, h - 58, "Trinidad and Tobago Customs & Excise Division")
    c.drawString(40, h - 74, f"Declaration Ref: {header.get('declarationRef','')}   Office: {header.get('port','')}")
    c.drawString(40, h - 90, f"Regime: {header.get('customsRegime','')}   Terms: {header.get('term','')}   Transport: {header.get('modeOfTransport','')}")
    c.drawString(40, h - 106, f"Consignee: {header.get('consigneeCode','')}   Vessel/Flight: {header.get('vesselName','')}")

    y = h - 136
    c.setFont("Helvetica-Bold", 9)
    c.drawString(40, y, "Commodity code")
    c.drawString(122, y, "CPC")
    c.drawString(160, y, "Description")
    c.drawString(330, y, "Gross kg")
    c.drawString(390, y, "Net kg")
    c.drawRightString(530, y, "Customs value")
    c.line(40, y - 4, 540, y - 4)
    y -= 16

    c.setFont("Helvetica", 9)
    for it in items[:16]:
        c.drawString(40, y, str(it.get('hsCode',''))[:12])
        c.drawString(122, y, str(it.get('cpc',''))[:8])
        c.drawString(160, y, str(it.get('description',''))[:31])
        c.drawString(330, y, str(it.get('grossKg','')))
        c.drawString(390, y, str(it.get('netKg','')))
        c.drawRightString(530, y, f"{float(it.get('itemValue', 0) or 0):,.2f}")
        y -= 14

    y -= 8
    c.setFont("Helvetica", 10)
    c.drawString(40, y, f"Total CIF (local): {float(worksheet.get('cif_local',0)):,.2f}")
    y -= 14
    c.drawString(40, y, f"Total assessed: {float(worksheet.get('total_assessed',0)):,.2f}")

    c.setFont("Helvetica", 9)
    c.drawString(40, 42, f"Printed on: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC")
    c.drawRightString(540, 42, "Page 1 / 1")

    c.showPage()
    c.save()
    return doc_id, str(out)


def _write_worksheet_pdf(header: Dict[str, Any], worksheet: Dict[str, Any], items: List[Dict[str, Any]]) -> tuple[str, str]:
    doc_id = f"worksheet-{uuid.uuid4().hex[:10]}"
    out = GENERATED_DIR / f"{doc_id}.pdf"
    c = canvas.Canvas(str(out), pagesize=A4)
    _, h = A4

    c.setFont("Helvetica-Bold", 15)
    c.drawString(40, h - 40, "WORK SHEET")
    c.setFont("Helvetica", 10)
    c.drawString(40, h - 58, f"Work Sheet Ref: {header.get('declarationRef','')}   Consignee: {header.get('consigneeCode','')}")
    c.drawString(40, h - 74, f"Port: {header.get('port','')}   Terms: {header.get('term','')}   Vessel: {header.get('vesselName','')}")
    c.drawString(40, h - 90, f"Regime: {header.get('customsRegime','')}   Mode of transport: {header.get('modeOfTransport','')}")


    y = h - 116
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, "ITEM DESCRIPTION")
    c.drawString(235, y, "HS")
    c.drawString(285, y, "CPC")
    c.drawString(330, y, "DUTY%")
    c.drawString(385, y, "SUR%")
    c.drawRightString(530, y, "LOCAL VALUE")
    c.line(40, y - 4, 540, y - 4)
    y -= 18

    duty_rate = float(worksheet.get('duty_rate_pct', 40) or 40)
    sur_rate = float(worksheet.get('surcharge_rate_pct', 15) or 15)
    c.setFont("Helvetica", 9)
    for item in items[:14]:
        c.drawString(40, y, str(item.get("description", ""))[:32])
        c.drawString(235, y, str(item.get("hsCode", ""))[:10])
        c.drawString(285, y, str(item.get("cpc", "4000/000"))[:10])
        c.drawString(335, y, f"{duty_rate:.0f}%")
        c.drawString(390, y, f"{sur_rate:.0f}%")
        c.drawRightString(530, y, f"{float(item.get('itemValue', worksheet.get('cif_local', 0)) or 0):,.2f}")
        y -= 15

    y -= 6
    c.line(40, y, 540, y)
    y -= 18

    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, "DUTIES/TAXES SUMMARY")
    y -= 16
    c.setFont("Helvetica", 10)
    summary_rows = [
        ("IM.DTY Import Duty", worksheet.get("duty", 0)),
        ("SU.CHG Import Surcharge", worksheet.get("surcharge", 0)),
        ("VAT Value Added Tax", worksheet.get("vat", 0)),
        ("FEES", worksheet.get("extra_fees_local", 0)),
    ]
    for label, val in summary_rows:
        c.drawString(40, y, label)
        c.drawRightString(530, y, f"{float(val):,.2f}")
        y -= 14

    y -= 2
    c.line(40, y, 540, y)
    y -= 16
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, y, "WORKSHEET TOTAL")
    c.drawRightString(530, y, f"{float(worksheet.get('total_assessed', 0)):,.2f}")

    c.setFont("Helvetica", 9)
    c.drawString(40, 42, f"Printed on: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC")
    c.drawRightString(540, 42, "Page 1 / 1")

    c.showPage()
    c.save()
    return doc_id, str(out)


def _write_receipt_pdf(header: Dict[str, Any], worksheet: Dict[str, Any]) -> tuple[str, str]:
    doc_id = f"receipt-{uuid.uuid4().hex[:10]}"
    out = GENERATED_DIR / f"{doc_id}.pdf"
    c = canvas.Canvas(str(out), pagesize=A4)
    _, h = A4

    selected_box23 = worksheet.get("box23_selected", []) or []
    box23_catalog = {str(x.get("type")): x for x in LOOKUPS.get("box23_types", [])}
    rows: List[tuple[str, float]] = []
    for code in selected_box23:
        row = box23_catalog.get(str(code))
        if row:
            rows.append((f"{row.get('type','')} - {row.get('label','')}", float(row.get("amount", 0) or 0)))

    box23_total = sum(v for _, v in rows)
    global_fee = float(worksheet.get("global_fee", 40) or 40)
    total = float(worksheet.get("total_assessed", 0) or 0)

    c.setFont("Helvetica-Bold", 15)
    c.drawString(40, h - 40, "Receipt")
    c.setFont("Helvetica", 10)
    c.drawString(40, h - 58, f"Customs office: {header.get('port','')}")
    c.drawString(40, h - 74, f"Declaration ref: {header.get('declarationRef','')}")
    c.drawString(40, h - 90, f"Assessment no: {header.get('assessmentRef','A 00000')}   Receipt no: {header.get('receiptRef','RCP-00001')}")
    c.drawString(40, h - 106, "Mode of payment: CASH")

    y = h - 136
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, "Fee description")
    c.drawRightString(530, y, "Amount")
    c.line(40, y - 4, 540, y - 4)
    y -= 18

    c.setFont("Helvetica", 10)
    c.drawString(40, y, "Global fee (UFC)")
    c.drawRightString(530, y, f"{global_fee:,.2f}")
    y -= 15

    if rows:
        for label, val in rows:
            c.drawString(40, y, label[:70])
            c.drawRightString(530, y, f"{val:,.2f}")
            y -= 15
    else:
        c.drawString(40, y, "Box 23 fees: none")
        c.drawRightString(530, y, "0.00")
        y -= 15

    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, "Box 23 subtotal")
    c.drawRightString(530, y, f"{box23_total:,.2f}")
    y -= 18

    c.line(40, y, 540, y)
    y -= 16
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, y, "Total amount to be paid")
    c.drawRightString(530, y, f"{total:,.2f}")

    c.setFont("Helvetica", 9)
    c.drawString(40, 42, f"Printed on: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC")
    c.drawRightString(540, 42, "Page 1 / 1")

    c.showPage()
    c.save()
    return doc_id, str(out)


def _write_sad_xml(xml: str) -> tuple[str, str]:
    doc_id = f"sad_xml-{uuid.uuid4().hex[:10]}"
    out = GENERATED_DIR / f"{doc_id}.xml"
    out.write_text(xml, encoding="utf-8")
    return doc_id, str(out)


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
    cif_foreign = req.invoice_value_foreign + req.freight_foreign + req.insurance_foreign + req.other_foreign - req.deduction_foreign
    cif_local = cif_foreign * req.exchange_rate

    duty = cif_local * (req.duty_rate_pct / 100)
    surcharge = cif_local * (req.surcharge_rate_pct / 100)
    vat_base = cif_local + duty + surcharge
    vat = vat_base * (req.vat_rate_pct / 100)

    total = duty + surcharge + vat + req.extra_fees_local

    return {
        "cif_foreign": round(cif_foreign, 2),
        "cif_local": round(cif_local, 2),
        "duty": round(duty, 2),
        "surcharge": round(surcharge, 2),
        "vat": round(vat, 2),
        "extra_fees_local": round(req.extra_fees_local, 2),
        "total_assessed": round(total, 2),
    }


@app.post("/declarations/validate")
def declarations_validate(req: DeclarationReq):
    return validate_decl(req.declaration)


@app.post("/declarations/export-xml")
def declarations_export_xml(req: ExportReq):
    report = validate_decl(req.declaration)
    if report["status"] != "pass":
        return {"validation": report, "xml": None}

    try:
        xml = emit_asycuda_xml(req.declaration, MAPPING, ace_compat=True, presence_xpaths=None)
    except TypeError:
        xml = emit_asycuda_xml(req.declaration, MAPPING)

    return {"validation": report, "xml": xml}


@app.post("/pack/generate")
def pack_generate(req: Dict[str, Any]):
    """Generate first-pass PDF artifacts for pack documents.

    This is v1 renderer (structure and key totals/refs) and will be refined for ASYCUDA visual parity.
    """
    header = (req or {}).get("header") or {}
    worksheet = (req or {}).get("worksheet") or {}
    items = (req or {}).get("items") or []
    containers = (req or {}).get("containers") or []

    common_lines = [
        f"Generated: {datetime.utcnow().isoformat()}Z",
        f"Port: {header.get('port','')}",
        f"Terms: {header.get('term','')}",
        f"Consignee: {header.get('consigneeCode','')}",
        f"Vessel/Flight: {header.get('vesselName','')}",
        f"Items: {len(items)}",
        f"Containers: {len(containers)}",
    ]

    docs: List[Dict[str, str]] = []

    ws_id, _ = _write_worksheet_pdf(header, worksheet, items)
    docs.append({"name": "worksheet_pdf", "status": "generated", "ref": ws_id, "url": f"/pack/file/{ws_id}"})

    selected_port = str(header.get("port", "TTPTS") or "TTPTS")
    port_row = next((p for p in LOOKUPS.get("ports", []) if str(p.get("code")) == selected_port), None)
    office_code = (port_row or {}).get("asycudaCode") or selected_port

    selected_regime = str(header.get("customsRegime", "C4") or "C4")
    regime_row = next((r for r in LOOKUPS.get("customs_regimes", []) if str(r.get("regimeCode")) == selected_regime), None)
    decl_type = f"{(regime_row or {}).get('asycudaCode', 'IM')}{(regime_row or {}).get('asycudaSubCode', '4')}"

    contract_items = _to_contract_items(items)

    declaration = (req or {}).get("declaration") or {
        "identification": {
            "office_segment_customs_clearance_office_code": office_code,
            "type_type_of_declaration": decl_type,
        },
        "declarant": {"declarant_code": header.get("consigneeCode", "UNKNOWN")},
        "traders": {"consignee_consignee_code": header.get("consigneeCode", "UNKNOWN")},
        "valuation": {
            "total_total_invoice": float(worksheet.get("cif_foreign", 0) or 0),
            "total_cif": float(worksheet.get("cif_local", 0) or 0),
        },
        "items": contract_items,
    }

    c82_validation = validate_decl(declaration)
    try:
        sad_xml = emit_asycuda_xml(declaration, MAPPING, ace_compat=True, presence_xpaths=None)
    except TypeError:
        sad_xml = emit_asycuda_xml(declaration, MAPPING)
    sad_xml_id, _ = _write_sad_xml(sad_xml)
    docs.append({"name": "c82_sad_xml", "status": "generated", "ref": sad_xml_id, "url": f"/pack/file/{sad_xml_id}"})

    info_id, _ = _write_information_pdf(header, worksheet, items, containers)
    docs.append({"name": "information_page", "status": "generated", "ref": info_id, "url": f"/pack/file/{info_id}"})

    sad_pdf_id, _ = _write_sad_pdf(header, worksheet, items)
    docs.append({"name": "sad_pdf", "status": "generated", "ref": sad_pdf_id, "url": f"/pack/file/{sad_pdf_id}"})

    asn_id, _ = _write_assessment_pdf(header, worksheet)
    docs.append({"name": "assessment_notice", "status": "generated", "ref": asn_id, "url": f"/pack/file/{asn_id}"})

    receipt_id, _ = _write_receipt_pdf(header, worksheet)
    docs.append({"name": "receipt", "status": "generated", "ref": receipt_id, "url": f"/pack/file/{receipt_id}"})

    if containers:
        c_id, _ = _write_container_pdf(header, containers)
        docs.append({"name": "container_page", "status": "generated", "ref": c_id, "url": f"/pack/file/{c_id}"})

    return {
        "status": "generated",
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "c82Validation": c82_validation,
        "documents": docs,
    }


@app.get("/pack/file/{doc_id}")
def pack_file(doc_id: str):
    pdf_path = GENERATED_DIR / f"{doc_id}.pdf"
    xml_path = GENERATED_DIR / f"{doc_id}.xml"

    if pdf_path.exists():
        return FileResponse(pdf_path, media_type="application/pdf", filename=pdf_path.name)
    if xml_path.exists():
        return FileResponse(xml_path, media_type="application/xml", filename=xml_path.name)

    raise HTTPException(status_code=404, detail="File not found")
