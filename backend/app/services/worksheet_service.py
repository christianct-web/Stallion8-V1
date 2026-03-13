from __future__ import annotations

from ..models import WorksheetInput


def calculate_worksheet(req: WorksheetInput) -> dict:
    cif_foreign = req.invoice_value_foreign + req.freight_foreign + req.insurance_foreign + req.other_foreign - req.deduction_foreign
    cif_local = cif_foreign * req.exchange_rate

    duty = cif_local * (req.duty_rate_pct / 100)
    surcharge = cif_local * (req.surcharge_rate_pct / 100)
    vat_base = cif_local + duty + surcharge
    vat = vat_base * (req.vat_rate_pct / 100)

    total = duty + surcharge + vat + req.extra_fees_local

    return {
        "fob_foreign": round(req.invoice_value_foreign, 2),
        "invoice_value_foreign": round(req.invoice_value_foreign, 2),
        "freight_foreign": round(req.freight_foreign, 2),
        "insurance_foreign": round(req.insurance_foreign, 2),
        "exchange_rate": round(req.exchange_rate, 6),
        "cif_foreign": round(cif_foreign, 2),
        "cif_local": round(cif_local, 2),
        "duty": round(duty, 2),
        "surcharge": round(surcharge, 2),
        "vat": round(vat, 2),
        "extra_fees_local": round(req.extra_fees_local, 2),
        "total_assessed": round(total, 2),
    }
