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

interface IdentificationSectionProps {
  declarationId: string;
}

// Common declaration types for Trinidad & Tobago
const DECLARATION_TYPES = [
  { value: "IM4", label: "IM4 - Home Use" },
  { value: "IM5", label: "IM5 - Temporary Admission" },
  { value: "IM6", label: "IM6 - Re-importation" },
  { value: "IM7", label: "IM7 - Warehousing" },
  { value: "EX1", label: "EX1 - Definitive Export" },
  { value: "EX2", label: "EX2 - Temporary Export" },
  { value: "EX3", label: "EX3 - Re-exportation" },
];

// Common customs office codes for Trinidad & Tobago
const OFFICE_CODES = [
  { value: "TTPOSPBL", label: "TTPOSPBL - Port of Spain" },
  { value: "TTPTFPBL", label: "TTPTFPBL - Point Lisas" },
  { value: "TTSFRPBL", label: "TTSFRPBL - Piarco Airport" },
  { value: "TTSCBPBL", label: "TTSCBPBL - Scarborough (Tobago)" },
  { value: "TTPCLPBL", label: "TTPCLPBL - Point-a-Pierre" },
];

export default function IdentificationSection({
  declarationId,
}: IdentificationSectionProps) {
  const { getDeclaration, updatePayload } = useDeclarationStore();
  const declaration = getDeclaration(declarationId);

  if (!declaration) return null;

  const identification = declaration.payload_json.identification;
  const validationReport = declaration.last_validation_report;

  const handleChange = (field: string, value: string) => {
    updatePayload(declarationId, "identification", { [field]: value });
  };

  const getError = (field: string) =>
    getFieldError(validationReport, `identification.${field}`);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-1">
          Identification
        </h2>
        <p className="text-sm text-muted-foreground">
          Basic declaration identification and customs office information
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Customs Office Code - Required */}
        <div className="space-y-2">
          <Label
            htmlFor="office_code"
            className={cn(
              getError("office_segment_customs_clearance_office_code") &&
                "text-destructive"
            )}
          >
            Customs Office Code <span className="text-destructive">*</span>
          </Label>
          <Select
            value={identification.office_segment_customs_clearance_office_code || ""}
            onValueChange={(value) =>
              handleChange("office_segment_customs_clearance_office_code", value)
            }
          >
            <SelectTrigger
              className={cn(
                getError("office_segment_customs_clearance_office_code") &&
                  "field-error"
              )}
            >
              <SelectValue placeholder="Select customs office" />
            </SelectTrigger>
            <SelectContent>
              {OFFICE_CODES.map((office) => (
                <SelectItem key={office.value} value={office.value}>
                  {office.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {getError("office_segment_customs_clearance_office_code") && (
            <p className="field-error-message">
              {getError("office_segment_customs_clearance_office_code")}
            </p>
          )}
        </div>

        {/* Declaration Type - Required */}
        <div className="space-y-2">
          <Label
            htmlFor="declaration_type"
            className={cn(
              getError("type_type_of_declaration") && "text-destructive"
            )}
          >
            Declaration Type <span className="text-destructive">*</span>
          </Label>
          <Select
            value={identification.type_type_of_declaration || ""}
            onValueChange={(value) =>
              handleChange("type_type_of_declaration", value)
            }
          >
            <SelectTrigger
              className={cn(
                getError("type_type_of_declaration") && "field-error"
              )}
            >
              <SelectValue placeholder="Select declaration type" />
            </SelectTrigger>
            <SelectContent>
              {DECLARATION_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {getError("type_type_of_declaration") && (
            <p className="field-error-message">
              {getError("type_type_of_declaration")}
            </p>
          )}
        </div>

        {/* Request Type */}
        <div className="space-y-2">
          <Label htmlFor="request_type">Request Type</Label>
          <Select
            value={identification.type_request_type || ""}
            onValueChange={(value) => handleChange("type_request_type", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select request type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="H">H - First submission</SelectItem>
              <SelectItem value="A">A - Amendment</SelectItem>
              <SelectItem value="C">C - Cancellation</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Registration Number */}
        <div className="space-y-2">
          <Label htmlFor="registration_number">Registration Number</Label>
          <Input
            id="registration_number"
            value={
              identification.general_segment_registration_number_of_the_customs_declaration ||
              ""
            }
            onChange={(e) =>
              handleChange(
                "general_segment_registration_number_of_the_customs_declaration",
                e.target.value
              )
            }
            placeholder="Auto-assigned by ASYCUDA"
            className="font-mono"
          />
        </div>

        {/* Registration Date */}
        <div className="space-y-2">
          <Label htmlFor="registration_date">Registration Date</Label>
          <Input
            id="registration_date"
            type="date"
            value={identification.general_segment_registration_date || ""}
            onChange={(e) =>
              handleChange("general_segment_registration_date", e.target.value)
            }
          />
        </div>

        {/* Principal Customs Agent */}
        <div className="space-y-2">
          <Label htmlFor="agent_number">Principal Customs Agent Number</Label>
          <Input
            id="agent_number"
            value={identification.principal_customs_agent_number || ""}
            onChange={(e) =>
              handleChange("principal_customs_agent_number", e.target.value)
            }
            placeholder="Enter agent number"
          />
        </div>

        {/* Financial Transaction Type */}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="financial_type">Financial Transaction Type</Label>
          <Select
            value={identification.financial_transaction_type || ""}
            onValueChange={(value) =>
              handleChange("financial_transaction_type", value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select financial transaction type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 - Payment</SelectItem>
              <SelectItem value="2">2 - Credit</SelectItem>
              <SelectItem value="3">3 - Deferred payment</SelectItem>
              <SelectItem value="4">4 - Bank guarantee</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
