import { useParams, useNavigate } from "react-router-dom";
import { useDeclarationStore } from "@/store/declarationStore";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle, FileDown, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/StatusPill";
import { validateDeclaration } from "@/services/validationService";
import { exportXmlViaApi, validateViaApi } from "@/services/asycudaApi";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Section components
import IdentificationSection from "@/components/editor/IdentificationSection";
import DeclarantSection from "@/components/editor/DeclarantSection";
import TradersSection from "@/components/editor/TradersSection";
import ValuationSection from "@/components/editor/ValuationSection";
import ItemsSection from "@/components/editor/ItemsSection";
import ReviewExportSection from "@/components/editor/ReviewExportSection";

type EditorSection =
  | "identification"
  | "declarant"
  | "traders"
  | "valuation"
  | "items"
  | "review";

const SECTIONS: { key: EditorSection; label: string; icon: string }[] = [
  { key: "identification", label: "Identification", icon: "🏛️" },
  { key: "declarant", label: "Declarant", icon: "👤" },
  { key: "traders", label: "Traders", icon: "🤝" },
  { key: "valuation", label: "Valuation", icon: "💰" },
  { key: "items", label: "Items", icon: "📦" },
  { key: "review", label: "Review & Export", icon: "✅" },
];

export default function DeclarationEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    getDeclaration,
    updateReferenceNumber,
    setValidationReport,
    setExportedXml,
  } = useDeclarationStore();
  
  const [activeSection, setActiveSection] = useState<EditorSection>("identification");
  const [isValidating, setIsValidating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const declaration = getDeclaration(id || "");

  useEffect(() => {
    if (!declaration && id) {
      navigate("/");
    }
  }, [declaration, id, navigate]);

  if (!declaration) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading declaration...</p>
        </div>
      </div>
    );
  }

  const handleValidate = async () => {
    setIsValidating(true);

    try {
      // Primary: backend validation (matches service contract)
      const report = await validateViaApi(declaration.payload_json, declaration.id);
      setValidationReport(declaration.id, report);

      if (report.status === "pass") {
        toast.success("Validation passed! Declaration is ready for export.");
        setActiveSection("review");
      } else {
        toast.error(`Validation failed: ${report.errors.length} error(s) found.`);
      }
    } catch {
      // Fallback: local validator so UI remains usable offline
      const report = validateDeclaration(declaration);
      setValidationReport(declaration.id, report);
      toast.error("Backend validation unavailable. Used local validation fallback.");
    } finally {
      setIsValidating(false);
    }
  };

  const handleExport = async () => {
    if (declaration.status !== "Ready") {
      toast.error("Declaration must be validated before export.");
      return;
    }

    setIsExporting(true);

    try {
      const result = await exportXmlViaApi(declaration.payload_json, {
        ace_compat: true,
      });

      setValidationReport(declaration.id, result.validation);

      if (result.validation.status !== "pass" || !result.xml) {
        toast.error("Export blocked: validation failed on backend.");
        return;
      }

      setExportedXml(declaration.id, result.xml);
      toast.success("Declaration exported successfully!");
      setActiveSection("review");
    } catch {
      toast.error("Backend export unavailable. Check ASYCUDA service connection.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleRefNumberChange = (value: string) => {
    updateReferenceNumber(declaration.id, value);
  };

  const getSectionErrors = (section: EditorSection) => {
    if (!declaration.last_validation_report) return 0;
    const sectionMap: Record<EditorSection, string> = {
      identification: "identification",
      declarant: "declarant",
      traders: "traders",
      valuation: "valuation",
      items: "items",
      review: "",
    };
    return declaration.last_validation_report.errors.filter((e) =>
      e.path.startsWith(sectionMap[section])
    ).length;
  };

  const renderSection = () => {
    const props = { declarationId: declaration.id };
    
    switch (activeSection) {
      case "identification":
        return <IdentificationSection {...props} />;
      case "declarant":
        return <DeclarantSection {...props} />;
      case "traders":
        return <TradersSection {...props} />;
      case "valuation":
        return <ValuationSection {...props} />;
      case "items":
        return <ItemsSection {...props} />;
      case "review":
        return (
          <ReviewExportSection
            {...props}
            onExport={handleExport}
            isExporting={isExporting}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Bar */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="flex items-center justify-between px-6 py-3">
          {/* Left: Back button + Reference */}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            
            <div className="flex items-center gap-3">
              <Input
                value={declaration.reference_number}
                onChange={(e) => handleRefNumberChange(e.target.value)}
                className="font-mono text-sm w-56"
              />
              <StatusPill status={declaration.status} />
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleValidate}
              disabled={isValidating}
              className="gap-2"
            >
              {isValidating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              Validate
            </Button>
            
            <Button
              onClick={handleExport}
              disabled={declaration.status !== "Ready" || isExporting}
              className="gap-2"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              Export XML
            </Button>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Navigation */}
        <nav className="w-64 border-r bg-card p-4 shrink-0 overflow-y-auto">
          <div className="space-y-1">
            {SECTIONS.map((section) => {
              const errorCount = getSectionErrors(section.key);
              const isActive = activeSection === section.key;

              return (
                <button
                  key={section.key}
                  onClick={() => setActiveSection(section.key)}
                  className={cn(
                    "section-nav-item w-full text-left",
                    isActive && "active"
                  )}
                >
                  <span className="text-lg">{section.icon}</span>
                  <span className="flex-1">{section.label}</span>
                  {errorCount > 0 && (
                    <span className="flex items-center gap-1 text-xs text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      {errorCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Validation Summary */}
          {declaration.last_validation_report && (
            <div className="mt-6 pt-6 border-t">
              <div
                className={cn(
                  "text-sm font-medium mb-2",
                  declaration.last_validation_report.status === "pass"
                    ? "text-validation-success"
                    : "text-destructive"
                )}
              >
                {declaration.last_validation_report.status === "pass"
                  ? "✓ Validation Passed"
                  : `✗ ${declaration.last_validation_report.errors.length} Error(s)`}
              </div>
              {declaration.last_validation_report.warnings.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  {declaration.last_validation_report.warnings.length} warning(s)
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl animate-fade-in">{renderSection()}</div>
        </main>
      </div>
    </div>
  );
}
