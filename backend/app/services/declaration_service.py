from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

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

        bl_digits = "".join(filter(str.isdigit, str(it.get("blAwbNumber", ""))))
        previous_doc = int(bl_digits) if bl_digits else None

        row: Dict[str, Any] = {
            "tarification_hscode_commodity_code": int(hs_digits),
            "goods_description_commercial_description": str(it.get("description") or "").strip(),
            "goods_description_country_of_origin_code": str(it.get("countryOfOrigin", "US")).strip().upper(),
            "packages_kind_of_packages_code": str(it.get("packageType", "CT")).upper(),
            "packages_kind_of_packages_name": str(it.get("packageTypeName", "Carton")),
            "packages_number_of_packages": float(it.get("qty", 0) or 0),
            "packages_marks1_of_packages": str(it.get("marks1", "AS ADDRESSED")).strip(),
            "packages_marks2_of_packages": str(it.get("marks2", "")).strip(),
            "valuation_item_weight_itm_gross_weight_itm": float(it.get("grossKg", 0) or 0),
            "valuation_item_weight_itm_net_weight_itm": float(it.get("netKg", 0) or 0),
            "valuation_item_total_cif_itm": float(it.get("itemValue", 0) or 0),
            "previous_doc_summary_declaration": previous_doc,
            "tarification_extended_customs_procedure": int(it.get("extendedCustomsProcedure", 4000) or 4000),
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
            "comments_free_text": f"B/L - AWB NO: {header.get('blAwbNumber', '')}               Dated: {header.get('blAwbDate', '')}\nRATE OF EXCH: {header.get('currency', 'USD')}     {exch:,.5f}\nGROSS WGHT (kgs):    {worksheet.get('grossWeight', 0):,.3f}\nE T A:    {header.get('etaDate', '')}\n\n",
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
            "suppliers_document_date": header.get("invoiceDate", ""),
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


def export_xml(declaration: Dict[str, Any]) -> str:
    try:
        return emit_asycuda_xml(declaration, MAPPING, ace_compat=True, presence_xpaths=None)
    except TypeError:
        return emit_asycuda_xml(declaration, MAPPING)
