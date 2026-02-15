import { useDeclarationStore } from "@/store/declarationStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileDown, CheckCircle, XCircle, AlertTriangle, Loader2, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ReviewExportSectionProps {
  declarationId: string;
  onExport: () => void;
  isExporting: boolean;
}

export default function ReviewExportSection({
  declarationId,
  onExport,
  isExporting,
}: ReviewExportSectionProps) {
  const { getDeclaration } = useDeclarationStore();
  const declaration = getDeclaration(declarationId);

  if (!declaration) return null;

  const validationReport = declaration.last_validation_report;
  const payloadJson = declaration.payload_json;
  const exportedXml = declaration.last_exported_xml;

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(payloadJson, null, 2));
    toast.success("JSON copied to clipboard");
  };

  const handleCopyXml = () => {
    if (exportedXml) {
      navigator.clipboard.writeText(exportedXml);
      toast.success("XML copied to clipboard");
    }
  };

  const handleDownloadXml = () => {
    if (exportedXml) {
      const blob = new Blob([exportedXml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${declaration.reference_number}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("XML file downloaded");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-1">
          Review & Export
        </h2>
        <p className="text-sm text-muted-foreground">
          Review your declaration data and export to ASYCUDA-compatible XML
        </p>
      </div>

      <Tabs defaultValue="validation" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="validation">Validation</TabsTrigger>
          <TabsTrigger value="json">JSON Preview</TabsTrigger>
          <TabsTrigger value="xml" disabled={!exportedXml}>
            XML Output
          </TabsTrigger>
        </TabsList>

        {/* Validation Tab */}
        <TabsContent value="validation" className="space-y-4">
          {!validationReport ? (
            <Card>
              <CardContent className="py-8 text-center">
                <div className="text-4xl mb-4">🔍</div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  Not Yet Validated
                </h3>
                <p className="text-muted-foreground mb-4">
                  Click the "Validate" button in the top bar to check this declaration
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Status Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-3">
                    {validationReport.status === "pass" ? (
                      <>
                        <CheckCircle className="h-6 w-6 text-validation-success" />
                        <span className="text-validation-success">
                          Validation Passed
                        </span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-6 w-6 text-destructive" />
                        <span className="text-destructive">
                          Validation Failed
                        </span>
                      </>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Validated at{" "}
                    {new Date(validationReport.validated_at).toLocaleString()}
                  </p>
                </CardContent>
              </Card>

              {/* Errors */}
              {validationReport.errors.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-destructive" />
                      Errors ({validationReport.errors.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {validationReport.errors.map((error, index) => (
                        <li
                          key={index}
                          className="flex items-start gap-3 text-sm p-2 bg-destructive/5 rounded-lg"
                        >
                          <Badge variant="destructive" className="shrink-0">
                            Error
                          </Badge>
                          <div>
                            <p className="font-medium text-foreground">
                              {error.message}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono mt-1">
                              {error.path}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Warnings */}
              {validationReport.warnings.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-validation-warning" />
                      Warnings ({validationReport.warnings.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {validationReport.warnings.map((warning, index) => (
                        <li
                          key={index}
                          className="flex items-start gap-3 text-sm p-2 bg-yellow-500/5 rounded-lg"
                        >
                          <Badge
                            variant="outline"
                            className="shrink-0 border-yellow-500 text-yellow-600"
                          >
                            Warning
                          </Badge>
                          <div>
                            <p className="font-medium text-foreground">
                              {warning.message}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono mt-1">
                              {warning.path}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Export Action */}
              {validationReport.status === "pass" && (
                <Card className="border-validation-success/30 bg-validation-success/5">
                  <CardContent className="py-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-foreground">
                          Ready for Export
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Your declaration has passed validation and can be
                          exported
                        </p>
                      </div>
                      <Button
                        onClick={onExport}
                        disabled={isExporting}
                        size="lg"
                        className="gap-2"
                      >
                        {isExporting ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <FileDown className="h-5 w-5" />
                        )}
                        Export XML
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* JSON Preview Tab */}
        <TabsContent value="json">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Declaration JSON</CardTitle>
              <Button variant="outline" size="sm" onClick={handleCopyJson} className="gap-2">
                <Copy className="h-4 w-4" />
                Copy
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="json-preview text-xs">
                {JSON.stringify(payloadJson, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        {/* XML Output Tab */}
        <TabsContent value="xml">
          {exportedXml && (
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Exported XML</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyXml}
                    className="gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadXml}
                    className="gap-2"
                  >
                    <FileDown className="h-4 w-4" />
                    Download
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="json-preview text-xs">
                  {exportedXml}
                </pre>
                <p className="text-xs text-muted-foreground mt-3">
                  Exported at {new Date().toLocaleString()}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
