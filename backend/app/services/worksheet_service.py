from __future__ import annotations

from ..models import WorksheetInput


def calculate_worksheet(req: WorksheetInput) -> dict:
    # FOB = invoice value + inland charges + uplift
    inland    = float(getattr(req, "inland_foreign", 0) or 0)
    uplift_pct= float(getattr(req, "uplift_pct", 0) or 0)
    exworks   = req.invoice_value_foreign
    fob       = exworks + inland + (exworks * uplift_pct / 100)

    cif_foreign = fob + req.freight_foreign + req.insurance_foreign + req.other_foreign - req.deduction_foreign
    cif_local   = cif_foreign * req.exchange_rate

    duty        = cif_local * (req.duty_rate_pct / 100)
    surcharge   = cif_local * (req.surcharge_rate_pct / 100)
    vat_base    = cif_local + duty + surcharge
    vat         = vat_base * (req.vat_rate_pct / 100)

    ces_fee_1   = float(getattr(req, "ces_fee_1", 0) or 0)
    ces_fee_2   = float(getattr(req, "ces_fee_2", 0) or 0)
    customs_user_fee = req.extra_fees_local  # CFU

    total = duty + surcharge + vat + customs_user_fee + ces_fee_1 + ces_fee_2

    return {
        "invoice_value_foreign": round(exworks, 2),
        "inland_foreign":        round(inland, 2),
        "uplift_pct":            round(uplift_pct, 4),
        "fob_foreign":           round(fob, 2),
        "fob_local":             round(fob * req.exchange_rate, 2),
        "freight_foreign":       round(req.freight_foreign, 2),
        "insurance_foreign":     round(req.insurance_foreign, 2),
        "exchange_rate":         round(req.exchange_rate, 6),
        "cif_foreign":           round(cif_foreign, 2),
        "cif_local":             round(cif_local, 2),
        "duty_rate_pct":         round(req.duty_rate_pct, 4),
        "surcharge_rate_pct":    round(req.surcharge_rate_pct, 4),
        "vat_rate_pct":          round(req.vat_rate_pct, 4),
        "duty":                  round(duty, 2),
        "surcharge":             round(surcharge, 2),
        "vat":                   round(vat, 2),
        "extra_fees_local":      round(customs_user_fee, 2),
        "customs_user_fee":      round(customs_user_fee, 2),
        "ces_fee_1":             round(ces_fee_1, 2),
        "ces_fee_2":             round(ces_fee_2, 2),
        "total_assessed":        round(total, 2),
    }
