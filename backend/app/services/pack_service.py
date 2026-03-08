from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Set

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from .declaration_service import build_complete_declaration, validate_decl, export_xml

APP_ROOT = Path(__file__).resolve().parent.parent
GENERATED_DIR = APP_ROOT.parent / "data" / "generated"
GENERATED_DIR.mkdir(parents=True, exist_ok=True)


def _write_lb01_worksheet_pdf(header: Dict[str, Any], worksheet: Dict[str, Any], items: List[Dict[str, Any]]) -> tuple[str, str]:
    doc_id = f"worksheet-lb01-{uuid.uuid4().hex[:10]}"
    out = GENERATED_DIR / f"{doc_id}.pdf"
    c = canvas.Canvas(str(out), pagesize=A4)
    _, h = A4

    consignor = header.get("consignorName", "COMPANY NAME")
    invoice_no = header.get("invoiceNumber", "N/A")
    invoice_date = header.get("invoiceDate", "N/A")
    work_ref = header.get("declarationRef", "N/A")
    consignee = header.get("consigneeCode", "N/A")
    port = header.get("port", "N/A")
    terms = header.get("term", "N/A")
    vessel = header.get("vesselName", "N/A")
    rotation_no = header.get("rotationNumber", "N/A")
    currency = header.get("currency", "USD")

    ex_rate = float(worksheet.get("exchange_rate", 6.77608) or 6.77608)
    fob_foreign = float(worksheet.get("fob_foreign", 0) or 0)
    freight_foreign = float(worksheet.get("freight_foreign", 0) or 0)
    insurance_foreign = float(worksheet.get("insurance_foreign", 0) or 0)
    other_foreign = float(worksheet.get("other_foreign", 0) or 0)
    deduction_foreign = float(worksheet.get("deduction_foreign", 0) or 0)

    cif_foreign = fob_foreign + freight_foreign + insurance_foreign + other_foreign - deduction_foreign
    cif_local = cif_foreign * ex_rate
    fob_local = fob_foreign * ex_rate
    freight_local = freight_foreign * ex_rate
    insurance_local = insurance_foreign * ex_rate

    duty = float(worksheet.get("duty", 0) or 0)
    surcharge = float(worksheet.get("surcharge", 0) or 0)
    vat = float(worksheet.get("vat", 0) or 0)
    extra_fees = float(worksheet.get("extra_fees_local", 0) or 0)
    customs_user_fee = float(worksheet.get("customs_user_fee", 40) or 40)
    ces_fees = float(worksheet.get("ces_fees", 0) or 0)
    cf2_fee = float(worksheet.get("cf2_fee", 0) or 0)

    total_taxes = duty + surcharge + vat + extra_fees + cf2_fee
    grand_total = total_taxes + customs_user_fee + ces_fees

    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, h - 40, "W O R K S H E E T")
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(540, h - 40, f"LB01/{work_ref}")

    c.setFont("Helvetica", 10)
    c.drawString(40, h - 60, f"{consignor}")
    c.drawString(300, h - 60, f"Consignee: {consignee}")
    c.drawString(40, h - 76, f"Inv No: {invoice_no}")
    c.drawString(150, h - 76, f"Date: {invoice_date}")
    c.drawString(300, h - 76, f"Work Sheet Ref: {work_ref}")
    c.drawString(40, h - 92, f"Port: {port}")
    c.drawString(150, h - 92, f"Terms: {terms}")
    c.drawString(300, h - 92, f"Vessel/Flight: {vessel}")
    c.drawString(40, h - 108, f"Rotation No: {rotation_no}")
    c.drawString(200, h - 108, f"Curr. of Payment: {currency}")
    c.drawString(350, h - 108, f"Exchange Rate: {ex_rate:,.6f}")

    c.drawString(40, h - 124, "EX-WORKS (FOB):")
    c.drawString(180, h - 124, f"{fob_foreign:,.2f} USD")
    c.drawString(300, h - 124, f"{fob_local:,.2f} TT$")
    c.drawString(40, h - 140, "Freight:")
    c.drawString(180, h - 140, f"{freight_foreign:,.2f} USD")
    c.drawString(300, h - 140, f"{freight_local:,.2f} TT$")
    c.drawString(40, h - 156, "Insurance:")
    c.drawString(180, h - 156, f"{insurance_foreign:,.2f} USD")
    c.drawString(300, h - 156, f"{insurance_local:,.2f} TT$")
    c.drawString(40, h - 172, "CIF Total:")
    c.drawString(180, h - 172, f"{cif_foreign:,.2f} USD")
    c.drawString(300, h - 172, f"{cif_local:,.2f} TT$")

    y = h - 194
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, "Rotation No.")
    c.drawString(100, y, "CPC")
    c.drawString(140, y, "HS Code")
    c.drawString(220, y, "Item Description")
    c.drawString(360, y, "FOB TT$")
    c.drawString(420, y, "CIF TT$")
    c.drawString(480, y, "Duty%")
    c.drawRightString(540, y, "VAT%")
    c.line(40, y - 4, 540, y - 4)
    y -= 18

    c.setFont("Helvetica", 9)
    for i, item in enumerate(items[:12], start=1):
        c.drawString(40, y, f"{i}.")
        c.drawString(100, y, str(item.get("cpc", "4000/000"))[:8])
        c.drawString(140, y, str(item.get("hsCode", ""))[:12])
        c.drawString(220, y, str(item.get("description", ""))[:25])
        c.drawString(360, y, f"{float(item.get('fobValue',0) or 0):,.2f}")
        c.drawString(420, y, f"{float(item.get('itemValue',0) or 0):,.2f}")
        c.drawString(480, y, f"{float(item.get('dutyRate', worksheet.get('duty_rate_pct', 40) or 40)):.0f}%")
        c.drawRightString(540, y, f"{float(item.get('vatRate', worksheet.get('vat_rate_pct', 15) or 15)):.0f}%")
        y -= 16
        if y < 100:
            break

    if y > 120:
        y = 120
    c.line(40, y - 10, 540, y - 10)
    y -= 24
    c.setFont("Helvetica-Bold", 11)
    c.drawString(40, y, "WORKSHEET TOTALS =")
    c.drawRightString(540, y, f"{cif_local:,.2f} TT$")

    y -= 30
    c.setFont("Helvetica-Bold", 11)
    c.drawString(40, y, "DUTIES/TAXES SUMMARY")
    c.line(40, y - 4, 540, y - 4)
    y -= 20

    c.setFont("Helvetica", 10)
    c.drawString(40, y, "DUTIES/TAXES DESCRIPTION")
    c.drawRightString(400, y, "PAYABLE (P)")
    c.drawRightString(540, y, "RELIEF (R)")
    y -= 16
    c.line(40, y, 540, y)
    y -= 18

    for label, payable in [
        ("01  IM.DTY  Import Duty", duty),
        ("05  SU.CHG  Import Surcharge", surcharge),
        ("     VAT    Value Added Tax", vat),
        ("     FEES   Other Fees", extra_fees),
        ("     CF2    Container Examination Fee", cf2_fee),
    ]:
        c.drawString(40, y, label)
        c.drawRightString(400, y, f"{payable:,.2f}")
        c.drawRightString(540, y, "0.00")
        y -= 14

    y -= 4
    c.line(40, y, 540, y)
    y -= 14
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, "SUMMARY TOTALS")
    c.drawRightString(400, y, f"{total_taxes:,.2f}")
    c.drawRightString(540, y, "0.00")

    y -= 20
    c.setFont("Helvetica", 10)
    c.drawString(40, y, "CFU  Customs User Fee")
    c.drawRightString(400, y, f"{customs_user_fee:,.2f}")
    if ces_fees > 0:
        y -= 14
        c.drawString(40, y, "CES-FEES  Container Examination Fees")
        c.drawRightString(400, y, f"{ces_fees:,.2f}")

    y -= 20
    c.line(40, y, 540, y)
    y -= 16
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, y, "TOTAL AMOUNT TO BE PAID")
    c.drawRightString(540, y, f"{grand_total:,.2f}")

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


def preflight_workbench(header: Dict[str, Any], worksheet: Dict[str, Any], items: List[Dict[str, Any]], containers: List[Dict[str, Any]]) -> Dict[str, Any]:
    errors: List[Dict[str, str]] = []
    warnings: List[Dict[str, str]] = []

    required_header = [
        ("declarationRef", "Declaration reference is required"),
        ("port", "Port is required"),
        ("term", "Terms are required"),
        ("modeOfTransport", "Mode of transport is required"),
        ("customsRegime", "Customs regime is required"),
        ("consigneeCode", "Consignee code is required"),
        ("consignorName", "Consignor/company name is required"),
        ("invoiceNumber", "Invoice number is required"),
        ("invoiceDate", "Invoice date is required"),
    ]
    for key, msg in required_header:
        if not str(header.get(key, "")).strip():
            errors.append({"path": f"header.{key}", "message": msg})

    if not items:
        errors.append({"path": "items", "message": "At least one item is required"})

    seen_hs_desc: Set[str] = set()
    for i, item in enumerate(items or []):
        hs = str(item.get("hsCode") or "").strip()
        desc = str(item.get("description") or "").strip()
        val = float(item.get("itemValue") or 0)
        qty = float(item.get("qty") or 0)
        gross = float(item.get("grossKg") or 0)
        net = float(item.get("netKg") or 0)

        if not hs:
            errors.append({"path": f"items[{i}].hsCode", "message": "HS code is required"})
        if hs and (not hs.isdigit() or len(hs) < 6):
            errors.append({"path": f"items[{i}].hsCode", "message": "HS code must be numeric and at least 6 digits"})
        if not desc:
            errors.append({"path": f"items[{i}].description", "message": "Description is required"})
        if val <= 0:
            errors.append({"path": f"items[{i}].itemValue", "message": "Item value must be > 0"})
        if qty <= 0:
            errors.append({"path": f"items[{i}].qty", "message": "Quantity must be > 0"})
        if gross < 0 or net < 0:
            errors.append({"path": f"items[{i}]", "message": "Weights cannot be negative"})
        if net > 0 and gross > 0 and net > gross:
            warnings.append({"path": f"items[{i}]", "message": "Net weight is greater than gross weight"})

        k = f"{hs}|{desc.lower()}"
        if hs and desc and k in seen_hs_desc:
            warnings.append({"path": f"items[{i}]", "message": "Possible duplicate item (same HS + description)"})
        seen_hs_desc.add(k)

    for i, c in enumerate(containers or []):
        cno = str(c.get("containerNo") or "").strip().upper()
        if not cno:
            errors.append({"path": f"containers[{i}].containerNo", "message": "Container number is required"})
        if float(c.get("packages") or 0) < 0 or float(c.get("goodsWeight") or 0) < 0:
            errors.append({"path": f"containers[{i}]", "message": "Packages/weight cannot be negative"})

    duty = float(worksheet.get("duty", 0) or 0)
    surcharge = float(worksheet.get("surcharge", 0) or 0)
    vat = float(worksheet.get("vat", 0) or 0)
    fees = float(worksheet.get("extra_fees_local", 0) or 0)
    customs_user_fee = float(worksheet.get("customs_user_fee", 0) or 0)
    ces_fees = float(worksheet.get("ces_fees", 0) or 0)
    cf2_fee = float(worksheet.get("cf2_fee", 0) or 0)
    total = float(worksheet.get("total_assessed", 0) or 0)

    exch = float(worksheet.get("exchange_rate", 0) or 0)
    if exch <= 0:
        errors.append({"path": "worksheet.exchange_rate", "message": "Exchange rate must be > 0"})

    expected_total = round(duty + surcharge + vat + fees + customs_user_fee + ces_fees + cf2_fee, 2)
    if abs(expected_total - total) > 0.01:
        warnings.append({
            "path": "worksheet.total_assessed",
            "message": f"Total assessed ({total:.2f}) differs from computed sum ({expected_total:.2f})",
        })

    return {
        "status": "fail" if errors else "pass",
        "errors": errors,
        "warnings": warnings,
        "counts": {"errors": len(errors), "warnings": len(warnings)},
    }


def generate_pack(req: Dict[str, Any]) -> Dict[str, Any]:
    header = (req or {}).get("header") or {}
    worksheet = (req or {}).get("worksheet") or {}
    items = (req or {}).get("items") or []
    containers = (req or {}).get("containers") or []

    preflight = preflight_workbench(header, worksheet, items, containers)
    if preflight["status"] != "pass":
        return {
            "status": "blocked",
            "generatedAt": datetime.utcnow().isoformat() + "Z",
            "preflight": preflight,
            "documents": [],
        }

    docs: List[Dict[str, str]] = []
    ws_id, _ = _write_lb01_worksheet_pdf(header, worksheet, items)
    docs.append({"name": "worksheet_pdf", "status": "generated", "ref": ws_id, "url": f"/pack/file/{ws_id}"})

    declaration = build_complete_declaration(header, worksheet, items, containers)
    c82_validation = validate_decl(declaration)
    sad_xml = export_xml(declaration)
    sad_xml_id, _ = _write_sad_xml(sad_xml)
    docs.append({"name": "c82_sad_xml", "status": "generated", "ref": sad_xml_id, "url": f"/pack/file/{sad_xml_id}"})

    return {
        "status": "generated",
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "preflight": preflight,
        "c82Validation": c82_validation,
        "documents": docs,
    }


def resolve_generated_file(doc_id: str) -> Path | None:
    pdf_path = GENERATED_DIR / f"{doc_id}.pdf"
    xml_path = GENERATED_DIR / f"{doc_id}.xml"
    if pdf_path.exists():
        return pdf_path
    if xml_path.exists():
        return xml_path
    return None
