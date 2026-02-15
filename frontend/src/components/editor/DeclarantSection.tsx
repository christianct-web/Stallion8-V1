import { useDeclarationStore } from "@/store/declarationStore";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getFieldError } from "@/services/validationService";
import { cn } from "@/lib/utils";

interface DeclarantSectionProps {
  declarationId: string;
}

export default function DeclarantSection({
  declarationId,
}: DeclarantSectionProps) {
  const { getDeclaration, updatePayload } = useDeclarationStore();
  const declaration = getDeclaration(declarationId);

  if (!declaration) return null;

  const declarant = declaration.payload_json.declarant;
  const validationReport = declaration.last_validation_report;

  const handleChange = (field: string, value: string) => {
    updatePayload(declarationId, "declarant", { [field]: value });
  };

  const getError = (field: string) =>
    getFieldError(validationReport, `declarant.${field}`);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-1">
          Declarant
        </h2>
        <p className="text-sm text-muted-foreground">
          Information about the customs broker or declarant submitting this declaration
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Declarant Code - Required */}
        <div className="space-y-2">
          <Label
            htmlFor="declarant_code"
            className={cn(getError("declarant_code") && "text-destructive")}
          >
            Declarant Code <span className="text-destructive">*</span>
          </Label>
          <Input
            id="declarant_code"
            value={declarant.declarant_code || ""}
            onChange={(e) => handleChange("declarant_code", e.target.value)}
            placeholder="Enter declarant TIN/code"
            className={cn("font-mono", getError("declarant_code") && "field-error")}
          />
          {getError("declarant_code") && (
            <p className="field-error-message">{getError("declarant_code")}</p>
          )}
        </div>

        {/* Declarant Name */}
        <div className="space-y-2">
          <Label htmlFor="declarant_name">Declarant Name</Label>
          <Input
            id="declarant_name"
            value={declarant.declarant_name || ""}
            onChange={(e) => handleChange("declarant_name", e.target.value)}
            placeholder="Enter declarant name"
          />
        </div>

        {/* Reference Number */}
        <div className="space-y-2">
          <Label htmlFor="reference_number">Declarant Reference Number</Label>
          <Input
            id="reference_number"
            value={declarant.reference_number || ""}
            onChange={(e) => handleChange("reference_number", e.target.value)}
            placeholder="Internal reference number"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Your internal tracking reference for this declaration
          </p>
        </div>

        {/* Contact Information */}
        <div className="space-y-2">
          <Label htmlFor="declarant_contact">Contact Information</Label>
          <Input
            id="declarant_contact"
            value={declarant.declarant_contact || ""}
            onChange={(e) => handleChange("declarant_contact", e.target.value)}
            placeholder="Phone or email"
          />
        </div>

        {/* Address */}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="declarant_address">Declarant Address</Label>
          <Textarea
            id="declarant_address"
            value={declarant.declarant_address || ""}
            onChange={(e) => handleChange("declarant_address", e.target.value)}
            placeholder="Enter full address"
            rows={3}
          />
        </div>
      </div>
    </div>
  );
}
