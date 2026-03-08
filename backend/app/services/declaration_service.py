from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
import xml.etree.ElementTree as ET

from fastapi import HTTPException
from jsonschema import Draft202012Validator, exceptions as js_exceptions

from ..store import LOOKUPS

APP_ROOT = Path(__file__).resolve().parent.parent
ACE_BACKEND = Path("/home/keiraops/.openclaw/workspace/ace-backend/asycuda_service")
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

# ── Accepted XML structure constants ──────────────────────────────────────────
# Counts verified against broker-accepted sample WAZI010726C4_XML.xml
ASSESSMENT_NOTICE_ITEM_TAX_TOTAL_COUNT = 8   # exact count required by ASYCUDA
GLOBAL_TAX_ITEM_COUNT = 3                    # exact count required by ASYCUDA
TAXATION_LINE_COUNT = 9                      # exact count per item required by ASYCUDA

# Currency name placeholder used by ASYCUDA when no foreign currency conversion
NO_FOREIGN_CURRENCY = "No foreign currency"


def get_path(obj: Dict[str, Any], path: str) -> Any:
    cur: Any = obj
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    return cur


def _null_elem(parent: ET.Element, tag: str) -> ET.Element:
    """
    Create <tag><null/></tag> — the ASYCUDA pattern for optional/absent fields.
    ASYCUDA distinguishes <Tag/> (empty string) from <Tag><null/></Tag> (not applicable).
    Always use this for optional fields that have no value.
    """
    elem = ET.SubElement(parent, tag)
    ET.SubElement(elem, "null")
    return elem


def _currency_block(
    parent: ET.Element,
    national: float,
    foreign: float,
    code: str,
    rate: float,
) -> None:
    """
    Emit the 5-child currency block used identically in both Gs_* (global valuation)
    and item_* (item valuation) sections. All five children are always required.

    Structure (from accepted sample):
        <Amount_national_currency>0.00</Amount_national_currency>
        <Amount_foreign_currency>0.00</Amount_foreign_currency>
        <Currency_code/> or <Currency_code><null/></Currency_code>
        <Currency_name>No foreign currency</Currency_name>
        <Currency_rate>1.0</Currency_rate>
    """
    ET.SubElement(parent, "Amount_national_currency").text = f"{national:.2f}"
    ET.SubElement(parent, "Amount_foreign_currency").text = f"{foreign:.2f}"
    # Empty code when no foreign currency (matches accepted sample pattern)
    if code:
        ET.SubElement(parent, "Currency_code").text = code
    else:
        ET.SubElement(parent, "Currency_code")
    ET.SubElement(parent, "Currency_name").text = NO_FOREIGN_CURRENCY
    ET.SubElement(parent, "Currency_rate").text = str(rate)


def _to_contract_items(workbench_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for it in workbench_items or []:
        hs_raw = str(it.get("tarification_hscode_commodity_code") or it.get("hsCode") or "").strip()
        hs_digits = "".join(ch for ch in hs_raw if ch.isdigit())
        if not hs_digits:
            continue

        bl_digits = "".join(filter(str.isdigit, str(it.get("blAwbNumber", ""))))
        previous_doc = int(bl_digits) if bl_digits else None

        row: Dict[str, Any] = {
            "tarification_hscode_commodity_code": int(hs_digits),
            "goods_description_commercial_description": str(it.get("description") or "").strip(),
            "goods_description_country_of_origin_code": str(it.get("countryOfOrigin", "US")).strip().upper(),
            "packages_kind_of_packages_code": str(it.get("packageType", "CT")).upper(),
            "packages_kind_of_packages_name": str(it.get("packageTypeName", "Carton")),
            # FIX #3: package counts must be integers, not floats (no "1394.0")
            "packages_number_of_packages": int(float(it.get("qty", 0) or 0)),
            "packages_marks1_of_packages": str(it.get("marks1", "AS ADDRESSED")).strip(),
            "packages_marks2_of_packages": str(it.get("marks2", "")).strip(),
            "valuation_item_weight_itm_gross_weight_itm": float(it.get("grossKg", 0) or 0),
            "valuation_item_weight_itm_net_weight_itm": float(it.get("netKg", 0) or 0),
            "valuation_item_total_cif_itm": float(it.get("itemValue", 0) or 0),
            "previous_doc_summary_declaration": previous_doc,
            "tarification_extended_customs_procedure": int(it.get("extendedCustomsProcedure", 4000) or 4000),
            # FIX #3: national_customs_procedure must emit as "000" (zero-padded string)
            # Store as int in contract, format in postprocess
            "tarification_national_customs_procedure": int(it.get("nationalCustomsProcedure", 0) or 0),
            "tarification_quota_code": str(it.get("quotaCode", "NEW")).strip(),
            "valuation_item_rate_of_adjustment": int(it.get("rateOfAdjustment", 1) or 1),
            "valuation_item_statistical_value": float(it.get("statisticalValue", 0) or 0),
            "valuation_item_item_invoice_amount_foreign_currency": float(it.get("itemValue", 0) or 0),
            "valuation_item_item_invoice_amount_national_currency": float(it.get("itemValueLocal", 0) or 0),
            "valuation_item_item_invoice_currency_code": str(it.get("currency", "USD")).upper(),
            "valuation_item_item_invoice_currency_rate": float(it.get("exchangeRate", 1.0) or 1.0),
        }
        out.append(row)
    return out


def build_complete_declaration(
    header: Dict[str, Any], worksheet: Dict[str, Any], items: List[Dict[str, Any]], containers: List[Dict[str, Any]]
) -> Dict[str, Any]:
    selected_port = str(header.get("port", "TTPTS") or "TTPTS")
    port_row = next((p for p in LOOKUPS.get("ports", []) if str(p.get("code")) == selected_port), None)
    office_code = (port_row or {}).get("asycudaCode") or selected_port
    office_name = (port_row or {}).get("label") or selected_port

    selected_regime = str(header.get("customsRegime", "C4") or "C4")
    regime_row = next((r for r in LOOKUPS.get("customs_regimes", []) if str(r.get("regimeCode")) == selected_regime), None)
    decl_code = (regime_row or {}).get("asycudaCode", "IM")
    decl_subcode = (regime_row or {}).get("asycudaSubCode", "4")

    exch = float(worksheet.get("exchange_rate", 1.0) or 1.0)
    fob_foreign = float(worksheet.get("fob_foreign", 0) or 0)
    freight_foreign = float(worksheet.get("freight_foreign", 0) or 0)
    insurance_foreign = float(worksheet.get("insurance_foreign", 0) or 0)
    other_foreign = float(worksheet.get("other_foreign", 0) or 0)
    deduction_foreign = float(worksheet.get("deduction_foreign", 0) or 0)

    cif_foreign = fob_foreign + freight_foreign + insurance_foreign + other_foreign - deduction_foreign
    cif_local = cif_foreign * exch

    contract_items = _to_contract_items(items)
    header_total_packages = int(float(header.get("totalPackages", 0) or 0))
    items_total_packages = sum(int(float(i.get("qty", 0) or 0)) for i in items)
    containers_total_packages = sum(int(float(c.get("packages", 0) or 0)) for c in containers) if containers else 0
    resolved_total_packages = header_total_packages or containers_total_packages or items_total_packages

    return {
        "identification": {
            "office_segment_customs_clearance_office_code": office_code,
            "type_type_of_declaration": decl_code,
            "declaration_gen_procedure_code": int(decl_subcode),
            "registration_number": header.get("declarationRef", ""),
            "registration_date": header.get("invoiceDate", ""),
        },
        "traders": {
            "exporter_exporter_name": f"{header.get('consignorName', '')}\n{header.get('consignorAddress', '')}",
            "consignee_consignee_code": header.get("consigneeCode", ""),
            "consignee_consignee_name": f"{header.get('consigneeName', header.get('consigneeCode', ''))}\n{header.get('consigneeAddress', '')}",
        },
        "declarant": {
            "declarant_code": header.get("declarantTIN", header.get("consigneeCode", "")),
            "declarant_name": header.get("declarantName", ""),
            "declarant_address": header.get("declarantAddress", ""),
            "reference_number": header.get("declarationRef", ""),
        },
        "general_information": {
            "country_country_first_destination": header.get("countryFirstDestination", "US"),
            "country_trading_country": header.get("tradingCountry", "US"),
            "export_export_country_code": header.get("exportCountryCode", "US"),
            "export_export_country_name": header.get("exportCountryName", "United States"),
            "destination_destination_country_code": "TT",
            "destination_destination_country_name": "Trinidad and Tobago",
            "country_of_origin_name": header.get("countryOfOriginName", "United States"),
            # FIX #4: comments_free_text carries BL, exchange rate, weight, ETA
            # and insurance declaration as a formatted block — required for airfreight
            "comments_free_text": (
                f"B/L - AWB NO:  {header.get('blAwbNumber', '')}"
                f"                Dated:  {header.get('blAwbDate', '')}\n"
                f"RATE OF EXCH: {header.get('currency', 'USD')}     {exch:.5f}\n"
                f"GROSS WGHT (kgs):    {float(worksheet.get('grossWeight', 0) or 0):.3f}\n"
                f"E T A:    {header.get('etaDate', '')}\n \n"
                f"WE HEREBY DECLARE THAT THE ABOVE MENTIONED GOODS ARE NOT INSURED "
                f"AND WILL NOT BE INSURED.\n \n"
            ),
        },
        "transport": {
            "border_office_code": office_code,
            "border_office_name": office_name,
            "container_flag": "true" if containers else "false",
            "delivery_terms_code": header.get("term", "CIF"),
            "delivery_terms_place": header.get("port", ""),
            "means_of_transport_border_information_identity": header.get("vesselName", ""),
            "means_of_transport_departure_arrival_information_identity": header.get("vesselName", ""),
        },
        "financial": {
            "bank_code": int(header.get("bankCode", 1) or 1),
            "mode_of_payment": header.get("modeOfPayment", "CASH"),
            "terms_code": int(header.get("termsCode", 99) or 99),
            "terms_description": header.get("termsDescription", "Basic"),
            "total_invoice": str(cif_local),
        },
        "valuation": {
            "calculation_working_mode": 2,
            "total_total_invoice": cif_local,
            "total_cif": cif_local,
            # Gs_* fields — global valuation section only, NOT copied to items
            "gs_invoice_amount_foreign_currency": cif_foreign,
            "gs_invoice_amount_national_currency": cif_local,
            "gs_invoice_currency_code": header.get("currency", "USD"),
            "gs_invoice_currency_rate": exch,
            "gs_external_freight_amount_foreign_currency": freight_foreign,
            "gs_external_freight_amount_national_currency": freight_foreign * exch,
            "gs_external_freight_currency_code": header.get("currency", "USD"),
            "gs_external_freight_currency_rate": exch,
            "gs_insurance_amount_foreign_currency": insurance_foreign,
            "gs_insurance_amount_national_currency": insurance_foreign * exch,
            "gs_insurance_currency_code": header.get("currency", "USD"),
            "gs_insurance_currency_rate": exch,
            "gs_other_cost_amount_foreign_currency": other_foreign,
            "gs_other_cost_amount_national_currency": other_foreign * exch,
            "gs_other_cost_currency_code": header.get("currency", "USD"),
            "gs_other_cost_currency_rate": exch,
            "gs_deduction_amount_foreign_currency": deduction_foreign,
            "gs_deduction_amount_national_currency": deduction_foreign * exch,
            "gs_deduction_currency_code": header.get("currency", "USD"),
            "gs_deduction_currency_rate": exch,
            "weight_gross_weight": str(float(worksheet.get("grossWeight", 0) or 0)),
        },
        "items": contract_items,
        "suppliers_documents": {
            "suppliers_document_name": header.get("consignorName", ""),
            "suppliers_document_street": header.get("consignorStreet", ""),
            "suppliers_document_city": header.get("consignorCity", ""),
            "suppliers_document_country": header.get("consignorCountry", ""),
            "suppliers_document_type_code": "IV05",
            "suppliers_document_invoice_nbr": int("".join(filter(str.isdigit, header.get("invoiceNumber", ""))) or "0"),
            # FIX #10: ASYCUDA expects MM/DD/YY date format, not ISO
            "suppliers_document_date": _format_asycuda_date(header.get("invoiceDate", "")),
        },
        "assessment_notice": {"item_tax_total": []},
        "global_taxes": {"global_tax_item": []},
        "property": {
            "sad_flow": "I",
            "forms_number_of_the_form": 1,
            "forms_total_number_of_forms": 1,
            "nbers_total_number_of_items": len(items),
            "nbers_total_number_of_packages": resolved_total_packages,
            "selected_page": 1,
        },
        "warehouse": {"identification": "", "delay": ""},
        "transit": {
            "principal_code": "",
            "principal_name": "",
            "signature_place": "",
            "signature_date": header.get("invoiceDate", ""),
            "destination_office": "",
            "seals_number": "",
            "result_of_control": "",
            "time_limit": "",
            "officer_name": "",
        },
    }


def _format_asycuda_date(iso_date: str) -> str:
    """
    FIX #10: Convert ISO date (YYYY-MM-DD) to ASYCUDA format (MM/DD/YY).
    Accepted sample uses: 12/29/25 not 2025-12-29.
    """
    if not iso_date:
        return ""
    try:
        dt = datetime.strptime(iso_date[:10], "%Y-%m-%d")
        return dt.strftime("%-m/%d/%y")   # e.g. 12/29/25
    except ValueError:
        return iso_date  # return as-is if already formatted or unparseable


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


def _ensure_top_level(parent: ET.Element, tag: str) -> ET.Element:
    elem = parent.find(tag)
    if elem is None:
        elem = ET.SubElement(parent, tag)
    return elem


def _ensure_text(parent: ET.Element, tag: str, value: str) -> ET.Element:
    elem = parent.find(tag)
    if elem is None:
        elem = ET.SubElement(parent, tag)
    if (elem.text is None or str(elem.text).strip() == "") and value is not None:
        elem.text = str(value)
    return elem


def _fix_hs_code_split(item_elem: ET.Element) -> None:
    """
    FIX #1: HS code must be split into Commodity_code + Precision_1.

    Accepted pattern:
        <HScode>
            <Commodity_code>84713000</Commodity_code>
            <Precision_1>300</Precision_1>
            <Precision_2><null/></Precision_2>
            <Precision_3><null/></Precision_3>
            <Precision_4><null/></Precision_4>
        </HScode>

    If the emitter outputs a flat <Commodity_code> without the split,
    or puts the full 11-digit string as Commodity_code, this corrects it.
    """
    tarification = item_elem.find("Tarification")
    if tarification is None:
        return

    hscode_elem = tarification.find("HScode")
    if hscode_elem is None:
        return

    commodity_elem = hscode_elem.find("Commodity_code")
    if commodity_elem is None:
        return

    raw = (commodity_elem.text or "").strip()
    digits = "".join(ch for ch in raw if ch.isdigit())

    if len(digits) >= 8:
        base = digits[:8]          # e.g. 84713000
        precision = digits[8:]     # e.g. 300 (or empty)
    else:
        base = digits
        precision = ""

    commodity_elem.text = base

    # Ensure Precision_1 — use precision suffix if present, else leave empty
    p1 = hscode_elem.find("Precision_1")
    if p1 is None:
        p1 = ET.SubElement(hscode_elem, "Precision_1")
    p1.text = precision if precision else ""

    # Ensure Precision_2/3/4 as <null/> stubs
    for tag in ("Precision_2", "Precision_3", "Precision_4"):
        existing = hscode_elem.find(tag)
        if existing is None:
            stub = ET.SubElement(hscode_elem, tag)
            ET.SubElement(stub, "null")


def _fix_national_customs_procedure(item_elem: ET.Element) -> None:
    """
    FIX #3: National_customs_procedure must be zero-padded string "000" not "0" or "0.0".
    Accepted pattern: <National_customs_procedure>000</National_customs_procedure>
    """
    tarification = item_elem.find("Tarification")
    if tarification is None:
        return
    ncp = tarification.find("National_customs_procedure")
    if ncp is not None:
        raw = (ncp.text or "0").strip()
        try:
            ncp.text = str(int(float(raw))).zfill(3)
        except ValueError:
            ncp.text = "000"


def _fix_package_count(item_elem: ET.Element) -> None:
    """
    FIX #3: Package count must be integer string, not float ("100" not "100.0").
    """
    packages = item_elem.find("Packages")
    if packages is None:
        return
    nop = packages.find("Number_of_packages")
    if nop is not None:
        raw = (nop.text or "0").strip()
        try:
            nop.text = str(int(float(raw)))
        except ValueError:
            pass


def _fix_value_item_formula(item_elem: ET.Element) -> None:
    """
    FIX #5: Value_item must be the literal formula string "FOB+freight+ins+other-ded"
    not a calculated total.
    Accepted pattern: <Value_item>0.00+0.00+0.00+0.00-0.00</Value_item>

    Extract component values from Valuation_item if present, else default to zeros.
    """
    tarification = item_elem.find("Tarification")
    if tarification is None:
        return

    vi_tag = tarification.find("Value_item")
    if vi_tag is None:
        vi_tag = ET.SubElement(tarification, "Value_item")

    # Try to pull actuals from Valuation_item
    val_item = item_elem.find("Valuation_item")
    def _get_amount(section_tag: str) -> float:
        if val_item is None:
            return 0.0
        section = val_item.find(section_tag)
        if section is None:
            return 0.0
        amt = section.find("Amount_national_currency")
        try:
            return float((amt.text or "0").strip()) if amt is not None else 0.0
        except ValueError:
            return 0.0

    fob = _get_amount("Item_Invoice")
    freight = _get_amount("item_external_freight")
    insurance = _get_amount("item_insurance")
    other = _get_amount("item_other_cost")
    deduction = _get_amount("item_deduction")

    vi_tag.text = f"{fob:.2f}+{freight:.2f}+{insurance:.2f}+{other:.2f}-{deduction:.2f}"


def _fix_item_valuation_blocks(item_elem: ET.Element, declaration: Dict[str, Any]) -> None:
    """
    FIX #1 (PRIMARY): Remove any Gs_* nodes injected into <Item> (the bad parity hack).
    Items must only use item_* valuation blocks, never Gs_* blocks.

    Accepted item valuation structure:
        <Valuation_item>
            <Weight_itm>...</Weight_itm>
            <Total_cost_itm>0.00</Total_cost_itm>
            <Total_CIF_itm>44446.39</Total_CIF_itm>
            <Rate_of_adjustment>1</Rate_of_adjustment>
            <Statistical_value>44446.39</Statistical_value>
            <Alpha_coeficient_of_apportionment/>
            <Item_Invoice>  ← capital I, uses currency block
            <item_external_freight>  ← lowercase i, uses currency block
            <item_internal_freight>
            <item_insurance>
            <item_other_cost>
            <item_deduction>
        </Valuation_item>
    """
    # Step 1: Remove all Gs_* nodes that were incorrectly injected into this item
    for gs_tag in list(item_elem):
        if gs_tag.tag.startswith("Gs_"):
            item_elem.remove(gs_tag)

    # Step 2: Ensure Valuation_item exists and has all required item_* blocks
    val_item = item_elem.find("Valuation_item")
    if val_item is None:
        val_item = ET.SubElement(item_elem, "Valuation_item")

    # Alpha_coeficient_of_apportionment — empty stub (note: ASYCUDA's own typo)
    if val_item.find("Alpha_coeficient_of_apportionment") is None:
        ET.SubElement(val_item, "Alpha_coeficient_of_apportionment")

    # item_* freight/cost blocks — all required even when zero
    # NOTE: item_* uses lowercase 'item_' prefix (not 'Gs_')
    # NOTE: Currency_code is <null/> when zero, not empty string
    item_cost_blocks = [
        "item_external_freight",
        "item_internal_freight",
        "item_insurance",
        "item_other_cost",
        "item_deduction",
    ]

    # Try to pull actual values from the declaration items
    items_data = declaration.get("items", [])
    item_idx = None
    for i, it_elem in enumerate(item_elem.getparent().findall("Item") if hasattr(item_elem, 'getparent') else []):
        if it_elem is item_elem:
            item_idx = i
            break

    item_data = items_data[item_idx] if item_idx is not None and item_idx < len(items_data) else {}

    for block_tag in item_cost_blocks:
        existing = val_item.find(block_tag)
        if existing is None:
            block = ET.SubElement(val_item, block_tag)
            ET.SubElement(block, "Amount_national_currency").text = "0.00"
            ET.SubElement(block, "Amount_foreign_currency").text = "0.00"
            # Use <null/> for currency code when no value — matches accepted sample
            null_code = ET.SubElement(block, "Currency_code")
            ET.SubElement(null_code, "null")
            ET.SubElement(block, "Currency_name").text = NO_FOREIGN_CURRENCY
            ET.SubElement(block, "Currency_rate").text = "0"


def _fix_taxation_stubs(item_elem: ET.Element) -> None:
    """
    FIX #8: <Taxation> block must contain exactly TAXATION_LINE_COUNT empty stubs.
    Accepted pattern: 9 × <Taxation_line/>
    """
    taxation = item_elem.find("Taxation")
    if taxation is None:
        taxation = ET.SubElement(item_elem, "Taxation")

    # Remove existing lines and rebuild to exact count
    for line in list(taxation.findall("Taxation_line")):
        taxation.remove(line)
    for _ in range(TAXATION_LINE_COUNT):
        ET.SubElement(taxation, "Taxation_line")


def _fix_assessment_notice(root: ET.Element) -> None:
    """
    FIX #9: <Assessment_notice> must contain exactly 8 × <Item_tax_total/> stubs.
    """
    notice = _ensure_top_level(root, "Assessment_notice")
    for stub in list(notice.findall("Item_tax_total")):
        notice.remove(stub)
    for _ in range(ASSESSMENT_NOTICE_ITEM_TAX_TOTAL_COUNT):
        ET.SubElement(notice, "Item_tax_total")


def _fix_global_taxes(root: ET.Element) -> None:
    """
    FIX #9: <Global_taxes> must contain exactly 3 × <Global_tax_item/> stubs.
    """
    gt = _ensure_top_level(root, "Global_taxes")
    for stub in list(gt.findall("Global_tax_item")):
        gt.remove(stub)
    for _ in range(GLOBAL_TAX_ITEM_COUNT):
        ET.SubElement(gt, "Global_tax_item")


def _fix_identification_skeletons(root: ET.Element) -> None:
    """
    FIX #4: Ensure Identification block has all required skeleton subnodes.
    Missing subnodes cause silent rejection even when top-level block exists.

    Accepted structure includes Registration, Assessment, receipt each with:
        <Serial_number><null/></Serial_number>
        <Number/>
        <Date/>
    """
    identification = _ensure_top_level(root, "Identification")

    for block_tag in ("Registration", "Assessment", "receipt"):
        block = identification.find(block_tag)
        if block is None:
            block = ET.SubElement(identification, block_tag)

        serial = block.find("Serial_number")
        if serial is None:
            serial = ET.SubElement(block, "Serial_number")
        if serial.find("null") is None and not (serial.text or "").strip():
            ET.SubElement(serial, "null")

        if block.find("Number") is None:
            ET.SubElement(block, "Number")
        if block.find("Date") is None:
            ET.SubElement(block, "Date")

    # Manifest_reference_number as <null/>
    manifest = identification.find("Manifest_reference_number")
    if manifest is None:
        manifest = ET.SubElement(identification, "Manifest_reference_number")
    if manifest.find("null") is None and not (manifest.text or "").strip():
        ET.SubElement(manifest, "null")


def _fix_property_nbers(root: ET.Element, declaration: Dict[str, Any]) -> None:
    """
    FIX #4: Property/Nbers must include Number_of_loading_lists as empty stub.
    Accepted: <Number_of_loading_lists/>
    """
    property_elem = _ensure_top_level(root, "Property")
    nbers = property_elem.find("Nbers")
    if nbers is None:
        nbers = ET.SubElement(property_elem, "Nbers")

    if nbers.find("Number_of_loading_lists") is None:
        ET.SubElement(nbers, "Number_of_loading_lists")

    pkg_decl = declaration.get("property", {}).get("nbers_total_number_of_packages", 0)
    _ensure_text(nbers, "Total_number_of_packages", str(int(pkg_decl)))


def _fix_financial_block(root: ET.Element) -> None:
    """
    FIX #4: Financial block requires Amounts sub-block with three empty children.
    Accepted:
        <Amounts>
            <Total_manual_taxes/>
            <Global_taxes></Global_taxes>
            <Totals_taxes></Totals_taxes>
        </Amounts>
    Also requires Guarantee block with proper null stubs.
    """
    financial = _ensure_top_level(root, "Financial")

    amounts = financial.find("Amounts")
    if amounts is None:
        amounts = ET.SubElement(financial, "Amounts")
    if amounts.find("Total_manual_taxes") is None:
        ET.SubElement(amounts, "Total_manual_taxes")
    if amounts.find("Global_taxes") is None:
        ET.SubElement(amounts, "Global_taxes")
    if amounts.find("Totals_taxes") is None:
        ET.SubElement(amounts, "Totals_taxes")

    guarantee = financial.find("Guarantee")
    if guarantee is None:
        guarantee = ET.SubElement(financial, "Guarantee")

    n_elem = guarantee.find("n")
    if n_elem is None:
        n_elem = ET.SubElement(guarantee, "n")
    if n_elem.find("null") is None and not (n_elem.text or "").strip():
        ET.SubElement(n_elem, "null")

    if guarantee.find("Amount") is None:
        ET.SubElement(guarantee, "Amount")
    if guarantee.find("Date") is None:
        ET.SubElement(guarantee, "Date")

    excluded = guarantee.find("Excluded_country")
    if excluded is None:
        excluded = ET.SubElement(guarantee, "Excluded_country")
    for sub_tag in ("Code", "n"):
        sub = excluded.find(sub_tag)
        if sub is None:
            sub = ET.SubElement(excluded, sub_tag)
        if sub.find("null") is None and not (sub.text or "").strip():
            ET.SubElement(sub, "null")


def _postprocess_xml(xml: str, declaration: Dict[str, Any]) -> str:
    root = ET.fromstring(xml)

    # ── FIX #9: Assessment_notice and Global_taxes exact stub counts ──
    _fix_assessment_notice(root)
    _fix_global_taxes(root)

    # ── FIX #4: Identification skeleton subnodes ──
    _fix_identification_skeletons(root)

    # ── FIX #4: Property/Nbers/Number_of_loading_lists stub ──
    _fix_property_nbers(root, declaration)

    # ── FIX #4: Financial/Amounts and Guarantee blocks ──
    _fix_financial_block(root)

    # Ensure required empty top-level stubs exist
    _ensure_top_level(root, "Warehouse")
    _ensure_top_level(root, "Transit")
    _ensure_top_level(root, "Suppliers_documents")

    # ── Per-item fixes ──
    for item_elem in root.findall("Item"):
        # FIX #1 (PRIMARY): Remove bad Gs_* injection, ensure correct item_* blocks
        _fix_item_valuation_blocks(item_elem, declaration)

        # FIX #1: HS code split into Commodity_code + Precision_1
        _fix_hs_code_split(item_elem)

        # FIX #3: National_customs_procedure zero-padded "000"
        _fix_national_customs_procedure(item_elem)

        # FIX #3: Package count as integer string
        _fix_package_count(item_elem)

        # FIX #5: Value_item as formula string
        _fix_value_item_formula(item_elem)

        # FIX #8: Exactly 9 Taxation_line stubs
        _fix_taxation_stubs(item_elem)

    return ET.tostring(root, encoding="utf-8", xml_declaration=True).decode("utf-8")


def export_xml(declaration: Dict[str, Any]) -> str:
    try:
        xml = emit_asycuda_xml(declaration, MAPPING, ace_compat=True, presence_xpaths=None)
    except TypeError:
        xml = emit_asycuda_xml(declaration, MAPPING)

    return _postprocess_xml(xml, declaration)
