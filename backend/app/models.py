from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional

class LookupItem(BaseModel):
    code: str
    label: str

class TemplateIn(BaseModel):
    name: str
    scope: str = Field(default="personal")
    kind: str = Field(default="shipment")
    payload: Dict[str, Any]

class TemplateOut(TemplateIn):
    id: str

class WorksheetInput(BaseModel):
    invoice_value_foreign: float = 0
    exchange_rate: float = 1
    freight_foreign: float = 0
    insurance_foreign: float = 0
    other_foreign: float = 0
    deduction_foreign: float = 0
    duty_rate_pct: float = 0
    surcharge_rate_pct: float = 0
    vat_rate_pct: float = 0
    extra_fees_local: float = 0

class DeclarationReq(BaseModel):
    declaration: Dict[str, Any]
    meta: Optional[Dict[str, Any]] = None

class ExportReq(DeclarationReq):
    options: Optional[Dict[str, Any]] = None

class ValidationReport(BaseModel):
    status: str
    errors: List[Dict[str, Any]]
    warnings: List[Dict[str, Any]]
    counts: Dict[str, int]
