// Validation Service - Hard-stop validation gate
// MVP required fields per ASYCUDA compliance

import {
  Declaration,
  DeclarationPayload,
  ValidationReport,
  ValidationError,
  FIELD_LABELS,
} from "@/types/declaration";

// Required fields for MVP hard-stop validation
const REQUIRED_FIELDS = [
  "identification.office_segment_customs_clearance_office_code",
  "identification.type_type_of_declaration",
  "declarant.declarant_code",
  "traders.consignee_consignee_code",
  "valuation.total_total_invoice",
  "valuation.total_cif",
] as const;

// Get nested value from object using dot notation path
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((current, key) => {
    if (current && typeof current === "object") {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj as unknown);
}

// Validate a single required field
function validateRequiredField(
  payload: DeclarationPayload,
  path: string
): ValidationError | null {
  const value = getNestedValue(payload as unknown as Record<string, unknown>, path);

  // Check if value is empty/undefined/null
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    (typeof value === "number" && isNaN(value))
  ) {
    return {
      path,
      message: `${FIELD_LABELS[path] || path} is required`,
      field_label: FIELD_LABELS[path],
    };
  }

  return null;
}

// Validate items array (at least one item with HS code)
function validateItems(payload: DeclarationPayload): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!payload.items || payload.items.length === 0) {
    errors.push({
      path: "items",
      message: "At least one line item is required",
      field_label: "Line Items",
    });
    return errors;
  }

  // Check each item has HS code
  payload.items.forEach((item, index) => {
    if (!item.tarification_hscode_commodity_code) {
      errors.push({
        path: `items[${index}].tarification_hscode_commodity_code`,
        message: `Line ${item.line_number}: HS Code is required`,
        field_label: "HS Code",
      });
    }
  });

  return errors;
}

// Main validation function
export function validateDeclaration(declaration: Declaration): ValidationReport {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const payload = declaration.payload_json;

  // Validate all required fields
  REQUIRED_FIELDS.forEach((path) => {
    const error = validateRequiredField(payload, path);
    if (error) {
      errors.push(error);
    }
  });

  // Validate items
  const itemErrors = validateItems(payload);
  errors.push(...itemErrors);

  // Optional warnings (not blocking)
  if (!payload.valuation.currency_code) {
    warnings.push({
      path: "valuation.currency_code",
      message: "Currency code not specified (defaulting to TTD)",
      field_label: "Currency Code",
    });
  }

  if (!payload.declarant.reference_number) {
    warnings.push({
      path: "declarant.reference_number",
      message: "Declarant reference number not provided",
      field_label: "Declarant Reference",
    });
  }

  return {
    status: errors.length === 0 ? "pass" : "fail",
    errors,
    warnings,
    validated_at: new Date().toISOString(),
  };
}

// Check if a specific field path has an error
export function hasFieldError(
  report: ValidationReport | null,
  path: string
): boolean {
  if (!report) return false;
  return report.errors.some((e) => e.path === path);
}

// Get error message for a field
export function getFieldError(
  report: ValidationReport | null,
  path: string
): string | null {
  if (!report) return null;
  const error = report.errors.find((e) => e.path === path);
  return error?.message || null;
}

// Get all errors for a section
export function getSectionErrors(
  report: ValidationReport | null,
  section: string
): ValidationError[] {
  if (!report) return [];
  return report.errors.filter((e) => e.path.startsWith(section));
}

// Check if a section has errors
export function sectionHasErrors(
  report: ValidationReport | null,
  section: string
): boolean {
  return getSectionErrors(report, section).length > 0;
}
