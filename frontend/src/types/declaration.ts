// ACE Replacement - Declaration Data Types
// Aligned with ASYCUDA-compatible schema for Trinidad & Tobago

export type DeclarationStatus = "Draft" | "Ready" | "Exported";

// Identification Section
export interface IdentificationData {
  office_segment_customs_clearance_office_code?: string;
  type_type_of_declaration?: string;
  type_request_type?: string;
  general_segment_registration_number_of_the_customs_declaration?: string;
  general_segment_registration_date?: string;
  principal_customs_agent_number?: string;
  financial_transaction_type?: string;
}

// Declarant Section
export interface DeclarantData {
  declarant_code?: string;
  declarant_name?: string;
  reference_number?: string;
  declarant_address?: string;
  declarant_contact?: string;
}

// Traders Section
export interface TradersData {
  // Consignee (Importer)
  consignee_consignee_code?: string;
  consignee_consignee_name?: string;
  consignee_address?: string;
  consignee_country?: string;
  
  // Consignor (Exporter)
  consignor_code?: string;
  consignor_name?: string;
  consignor_address?: string;
  consignor_country?: string;
  
  // Notify Party
  notify_party_code?: string;
  notify_party_name?: string;
}

// Valuation Section
export interface ValuationData {
  total_total_invoice?: number;
  total_cif?: number;
  total_fob?: number;
  freight_amount?: number;
  insurance_amount?: number;
  other_charges?: number;
  currency_code?: string;
  exchange_rate?: number;
  incoterm?: string;
  country_of_origin?: string;
}

// Line Item
export interface DeclarationItem {
  id: string;
  line_number: number;
  tarification_hscode_commodity_code?: string;
  description?: string;
  country_of_origin?: string;
  packages_number?: number;
  packages_kind?: string;
  gross_weight?: number;
  net_weight?: number;
  quantity?: number;
  unit_of_measure?: string;
  statistical_value?: number;
  customs_value?: number;
  duty_rate?: number;
  duty_amount?: number;
  vat_rate?: number;
  vat_amount?: number;
  additional_code?: string;
  preference_code?: string;
}

// Full Declaration Payload (stored in payload_json)
export interface DeclarationPayload {
  identification: IdentificationData;
  declarant: DeclarantData;
  traders: TradersData;
  valuation: ValuationData;
  items: DeclarationItem[];
}

// Validation Error
export interface ValidationError {
  path: string;
  message: string;
  field_label?: string;
}

// Validation Report
export interface ValidationReport {
  status: "pass" | "fail";
  errors: ValidationError[];
  warnings: ValidationError[];
  validated_at: string;
}

// Full Declaration Record (app-wide data model)
export interface Declaration {
  id: string;
  reference_number: string;
  status: DeclarationStatus;
  payload_json: DeclarationPayload;
  last_validation_report: ValidationReport | null;
  last_exported_xml: string | null;
  created_at: string;
  updated_at: string;
}

// Create empty payload template
export const createEmptyPayload = (): DeclarationPayload => ({
  identification: {},
  declarant: {},
  traders: {},
  valuation: {},
  items: [],
});

// Create new declaration
export const createNewDeclaration = (): Declaration => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    reference_number: generateReferenceNumber(),
    status: "Draft",
    payload_json: createEmptyPayload(),
    last_validation_report: null,
    last_exported_xml: null,
    created_at: now,
    updated_at: now,
  };
};

// Generate reference number (TT-YYYYMMDD-XXXX format)
function generateReferenceNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `TT-${year}${month}${day}-${random}`;
}

// Create empty item
export const createEmptyItem = (lineNumber: number): DeclarationItem => ({
  id: crypto.randomUUID(),
  line_number: lineNumber,
});

// Field labels for validation messages
export const FIELD_LABELS: Record<string, string> = {
  "identification.office_segment_customs_clearance_office_code": "Customs Office Code",
  "identification.type_type_of_declaration": "Declaration Type",
  "declarant.declarant_code": "Declarant Code",
  "traders.consignee_consignee_code": "Consignee Code",
  "valuation.total_total_invoice": "Total Invoice Amount",
  "valuation.total_cif": "Total CIF Value",
  "items": "Line Items",
};
