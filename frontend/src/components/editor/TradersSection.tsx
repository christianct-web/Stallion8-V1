import { useDeclarationStore } from "@/store/declarationStore";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getFieldError } from "@/services/validationService";
import { cn } from "@/lib/utils";

interface TradersSectionProps {
  declarationId: string;
}

// Common country codes
const COUNTRY_CODES = [
  { value: "TT", label: "TT - Trinidad and Tobago" },
  { value: "US", label: "US - United States" },
  { value: "CN", label: "CN - China" },
  { value: "GB", label: "GB - United Kingdom" },
  { value: "JM", label: "JM - Jamaica" },
  { value: "BB", label: "BB - Barbados" },
  { value: "GY", label: "GY - Guyana" },
  { value: "VE", label: "VE - Venezuela" },
  { value: "BR", label: "BR - Brazil" },
  { value: "CA", label: "CA - Canada" },
  { value: "DE", label: "DE - Germany" },
  { value: "JP", label: "JP - Japan" },
  { value: "IN", label: "IN - India" },
];

export default function TradersSection({ declarationId }: TradersSectionProps) {
  const { getDeclaration, updatePayload } = useDeclarationStore();
  const declaration = getDeclaration(declarationId);

  if (!declaration) return null;

  const traders = declaration.payload_json.traders;
  const validationReport = declaration.last_validation_report;

  const handleChange = (field: string, value: string) => {
    updatePayload(declarationId, "traders", { [field]: value });
  };

  const getError = (field: string) =>
    getFieldError(validationReport, `traders.${field}`);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-1">Traders</h2>
        <p className="text-sm text-muted-foreground">
          Consignee (importer), consignor (exporter), and notify party information
        </p>
      </div>

      {/* Consignee (Importer) */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-foreground border-b pb-2">
          Consignee (Importer)
        </h3>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Consignee Code - Required */}
          <div className="space-y-2">
            <Label
              htmlFor="consignee_code"
              className={cn(
                getError("consignee_consignee_code") && "text-destructive"
              )}
            >
              Consignee Code <span className="text-destructive">*</span>
            </Label>
            <Input
              id="consignee_code"
              value={traders.consignee_consignee_code || ""}
              onChange={(e) =>
                handleChange("consignee_consignee_code", e.target.value)
              }
              placeholder="TIN or registration number"
              className={cn(
                "font-mono",
                getError("consignee_consignee_code") && "field-error"
              )}
            />
            {getError("consignee_consignee_code") && (
              <p className="field-error-message">
                {getError("consignee_consignee_code")}
              </p>
            )}
          </div>

          {/* Consignee Name */}
          <div className="space-y-2">
            <Label htmlFor="consignee_name">Consignee Name</Label>
            <Input
              id="consignee_name"
              value={traders.consignee_consignee_name || ""}
              onChange={(e) =>
                handleChange("consignee_consignee_name", e.target.value)
              }
              placeholder="Company or individual name"
            />
          </div>

          {/* Consignee Country */}
          <div className="space-y-2">
            <Label htmlFor="consignee_country">Country</Label>
            <Select
              value={traders.consignee_country || ""}
              onValueChange={(value) => handleChange("consignee_country", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRY_CODES.map((country) => (
                  <SelectItem key={country.value} value={country.value}>
                    {country.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Consignee Address */}
          <div className="space-y-2">
            <Label htmlFor="consignee_address">Address</Label>
            <Textarea
              id="consignee_address"
              value={traders.consignee_address || ""}
              onChange={(e) =>
                handleChange("consignee_address", e.target.value)
              }
              placeholder="Full address"
              rows={2}
            />
          </div>
        </div>
      </div>

      {/* Consignor (Exporter) */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-foreground border-b pb-2">
          Consignor (Exporter)
        </h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="consignor_code">Consignor Code</Label>
            <Input
              id="consignor_code"
              value={traders.consignor_code || ""}
              onChange={(e) => handleChange("consignor_code", e.target.value)}
              placeholder="TIN or registration number"
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="consignor_name">Consignor Name</Label>
            <Input
              id="consignor_name"
              value={traders.consignor_name || ""}
              onChange={(e) => handleChange("consignor_name", e.target.value)}
              placeholder="Company or individual name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="consignor_country">Country</Label>
            <Select
              value={traders.consignor_country || ""}
              onValueChange={(value) => handleChange("consignor_country", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRY_CODES.map((country) => (
                  <SelectItem key={country.value} value={country.value}>
                    {country.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="consignor_address">Address</Label>
            <Textarea
              id="consignor_address"
              value={traders.consignor_address || ""}
              onChange={(e) => handleChange("consignor_address", e.target.value)}
              placeholder="Full address"
              rows={2}
            />
          </div>
        </div>
      </div>

      {/* Notify Party */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-foreground border-b pb-2">
          Notify Party
        </h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="notify_code">Notify Party Code</Label>
            <Input
              id="notify_code"
              value={traders.notify_party_code || ""}
              onChange={(e) => handleChange("notify_party_code", e.target.value)}
              placeholder="Code (if different from consignee)"
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notify_name">Notify Party Name</Label>
            <Input
              id="notify_name"
              value={traders.notify_party_name || ""}
              onChange={(e) => handleChange("notify_party_name", e.target.value)}
              placeholder="Name (if different from consignee)"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
