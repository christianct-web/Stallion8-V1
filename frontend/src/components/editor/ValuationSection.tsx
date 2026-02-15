import { useDeclarationStore } from "@/store/declarationStore";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getFieldError } from "@/services/validationService";
import { cn } from "@/lib/utils";

interface ValuationSectionProps {
  declarationId: string;
}

// Common currency codes
const CURRENCY_CODES = [
  { value: "TTD", label: "TTD - Trinidad & Tobago Dollar" },
  { value: "USD", label: "USD - US Dollar" },
  { value: "EUR", label: "EUR - Euro" },
  { value: "GBP", label: "GBP - British Pound" },
  { value: "CAD", label: "CAD - Canadian Dollar" },
  { value: "CNY", label: "CNY - Chinese Yuan" },
  { value: "JPY", label: "JPY - Japanese Yen" },
];

// Incoterms
const INCOTERMS = [
  { value: "EXW", label: "EXW - Ex Works" },
  { value: "FCA", label: "FCA - Free Carrier" },
  { value: "CPT", label: "CPT - Carriage Paid To" },
  { value: "CIP", label: "CIP - Carriage and Insurance Paid To" },
  { value: "DAP", label: "DAP - Delivered at Place" },
  { value: "DPU", label: "DPU - Delivered at Place Unloaded" },
  { value: "DDP", label: "DDP - Delivered Duty Paid" },
  { value: "FAS", label: "FAS - Free Alongside Ship" },
  { value: "FOB", label: "FOB - Free on Board" },
  { value: "CFR", label: "CFR - Cost and Freight" },
  { value: "CIF", label: "CIF - Cost, Insurance and Freight" },
];

export default function ValuationSection({
  declarationId,
}: ValuationSectionProps) {
  const { getDeclaration, updatePayload } = useDeclarationStore();
  const declaration = getDeclaration(declarationId);

  if (!declaration) return null;

  const valuation = declaration.payload_json.valuation;
  const validationReport = declaration.last_validation_report;

  const handleChange = (field: string, value: string | number) => {
    updatePayload(declarationId, "valuation", { [field]: value });
  };

  const handleNumberChange = (field: string, value: string) => {
    const numValue = value === "" ? undefined : parseFloat(value);
    updatePayload(declarationId, "valuation", { [field]: numValue });
  };

  const getError = (field: string) =>
    getFieldError(validationReport, `valuation.${field}`);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-1">
          Valuation
        </h2>
        <p className="text-sm text-muted-foreground">
          Declaration value, currency, and cost breakdown
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Currency */}
        <div className="space-y-2">
          <Label htmlFor="currency_code">Currency</Label>
          <Select
            value={valuation.currency_code || ""}
            onValueChange={(value) => handleChange("currency_code", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select currency" />
            </SelectTrigger>
            <SelectContent>
              {CURRENCY_CODES.map((currency) => (
                <SelectItem key={currency.value} value={currency.value}>
                  {currency.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Exchange Rate */}
        <div className="space-y-2">
          <Label htmlFor="exchange_rate">Exchange Rate</Label>
          <Input
            id="exchange_rate"
            type="number"
            step="0.0001"
            value={valuation.exchange_rate ?? ""}
            onChange={(e) => handleNumberChange("exchange_rate", e.target.value)}
            placeholder="Rate to TTD"
          />
          <p className="text-xs text-muted-foreground">
            Conversion rate to Trinidad & Tobago Dollar
          </p>
        </div>

        {/* Incoterm */}
        <div className="space-y-2">
          <Label htmlFor="incoterm">Incoterm</Label>
          <Select
            value={valuation.incoterm || ""}
            onValueChange={(value) => handleChange("incoterm", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select incoterm" />
            </SelectTrigger>
            <SelectContent>
              {INCOTERMS.map((incoterm) => (
                <SelectItem key={incoterm.value} value={incoterm.value}>
                  {incoterm.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Country of Origin */}
        <div className="space-y-2">
          <Label htmlFor="country_origin">Country of Origin</Label>
          <Input
            id="country_origin"
            value={valuation.country_of_origin || ""}
            onChange={(e) => handleChange("country_of_origin", e.target.value)}
            placeholder="e.g., CN, US, GB"
            maxLength={2}
            className="uppercase font-mono"
          />
        </div>
      </div>

      {/* Value Breakdown */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-foreground mb-4">
          Value Breakdown
        </h3>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Total Invoice - Required */}
          <div className="space-y-2">
            <Label
              htmlFor="total_invoice"
              className={cn(
                getError("total_total_invoice") && "text-destructive"
              )}
            >
              Total Invoice Amount <span className="text-destructive">*</span>
            </Label>
            <Input
              id="total_invoice"
              type="number"
              step="0.01"
              value={valuation.total_total_invoice ?? ""}
              onChange={(e) =>
                handleNumberChange("total_total_invoice", e.target.value)
              }
              placeholder="0.00"
              className={cn(
                "font-mono",
                getError("total_total_invoice") && "field-error"
              )}
            />
            {getError("total_total_invoice") && (
              <p className="field-error-message">
                {getError("total_total_invoice")}
              </p>
            )}
          </div>

          {/* FOB Value */}
          <div className="space-y-2">
            <Label htmlFor="total_fob">FOB Value</Label>
            <Input
              id="total_fob"
              type="number"
              step="0.01"
              value={valuation.total_fob ?? ""}
              onChange={(e) => handleNumberChange("total_fob", e.target.value)}
              placeholder="0.00"
              className="font-mono"
            />
          </div>

          {/* Freight */}
          <div className="space-y-2">
            <Label htmlFor="freight">Freight Amount</Label>
            <Input
              id="freight"
              type="number"
              step="0.01"
              value={valuation.freight_amount ?? ""}
              onChange={(e) =>
                handleNumberChange("freight_amount", e.target.value)
              }
              placeholder="0.00"
              className="font-mono"
            />
          </div>

          {/* Insurance */}
          <div className="space-y-2">
            <Label htmlFor="insurance">Insurance Amount</Label>
            <Input
              id="insurance"
              type="number"
              step="0.01"
              value={valuation.insurance_amount ?? ""}
              onChange={(e) =>
                handleNumberChange("insurance_amount", e.target.value)
              }
              placeholder="0.00"
              className="font-mono"
            />
          </div>

          {/* Other Charges */}
          <div className="space-y-2">
            <Label htmlFor="other">Other Charges</Label>
            <Input
              id="other"
              type="number"
              step="0.01"
              value={valuation.other_charges ?? ""}
              onChange={(e) =>
                handleNumberChange("other_charges", e.target.value)
              }
              placeholder="0.00"
              className="font-mono"
            />
          </div>

          {/* Total CIF - Required */}
          <div className="space-y-2">
            <Label
              htmlFor="total_cif"
              className={cn(getError("total_cif") && "text-destructive")}
            >
              Total CIF Value <span className="text-destructive">*</span>
            </Label>
            <Input
              id="total_cif"
              type="number"
              step="0.01"
              value={valuation.total_cif ?? ""}
              onChange={(e) => handleNumberChange("total_cif", e.target.value)}
              placeholder="0.00"
              className={cn("font-mono", getError("total_cif") && "field-error")}
            />
            {getError("total_cif") && (
              <p className="field-error-message">{getError("total_cif")}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Cost + Insurance + Freight
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
