import { useDeclarationStore } from "@/store/declarationStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Copy, Trash2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFieldError } from "@/services/validationService";

interface ItemsSectionProps {
  declarationId: string;
}

export default function ItemsSection({ declarationId }: ItemsSectionProps) {
  const { getDeclaration, addItem, updateItem, removeItem, duplicateItem } =
    useDeclarationStore();
  const declaration = getDeclaration(declarationId);

  if (!declaration) return null;

  const items = declaration.payload_json.items;
  const validationReport = declaration.last_validation_report;

  const getItemError = (index: number, field: string) =>
    getFieldError(validationReport, `items[${index}].${field}`);

  const hasItemsError =
    validationReport?.errors.some((e) => e.path === "items") ?? false;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-1">
            Line Items
          </h2>
          <p className="text-sm text-muted-foreground">
            Add goods and commodities with HS codes for customs classification
          </p>
        </div>
        <Button
          onClick={() => addItem(declarationId)}
          className="gap-2 shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add Item
        </Button>
      </div>

      {/* Items Error */}
      {hasItemsError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
          <AlertCircle className="h-4 w-4" />
          At least one line item is required
        </div>
      )}

      {/* Items List */}
      {items.length === 0 ? (
        <div className="text-center py-12 bg-muted/50 rounded-lg border border-dashed">
          <div className="text-4xl mb-4">📦</div>
          <h3 className="text-lg font-medium text-foreground mb-2">
            No items yet
          </h3>
          <p className="text-muted-foreground mb-4">
            Add your first line item to this declaration
          </p>
          <Button onClick={() => addItem(declarationId)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add First Item
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid gap-3 p-3 bg-muted/50 border-b text-sm font-semibold text-foreground items-center"
            style={{ gridTemplateColumns: "auto 1fr 2fr 1fr 0.7fr auto" }}
          >
            <span className="w-8">#</span>
            <span>HS Code *</span>
            <span>Description</span>
            <span>Origin</span>
            <span>Packages</span>
            <span className="w-20">Actions</span>
          </div>

          {/* Item Rows */}
          {items.map((item, index) => {
            const hsCodeError = getItemError(index, "tarification_hscode_commodity_code");
            
            return (
              <div
                key={item.id}
                className="grid gap-3 p-3 border-b last:border-b-0 items-start hover:bg-muted/30 transition-colors"
                style={{ gridTemplateColumns: "auto 1fr 2fr 1fr 0.7fr auto" }}
              >
                {/* Line Number */}
                <span className="w-8 text-sm font-mono text-muted-foreground pt-2">
                  {item.line_number}
                </span>

                {/* HS Code - Required */}
                <div className="space-y-1">
                  <Input
                    value={item.tarification_hscode_commodity_code || ""}
                    onChange={(e) =>
                      updateItem(declarationId, item.id, {
                        tarification_hscode_commodity_code: e.target.value,
                      })
                    }
                    placeholder="e.g., 8471.30.00"
                    className={cn(
                      "font-mono text-sm",
                      hsCodeError && "field-error"
                    )}
                  />
                  {hsCodeError && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Required
                    </p>
                  )}
                </div>

                {/* Description */}
                <Input
                  value={item.description || ""}
                  onChange={(e) =>
                    updateItem(declarationId, item.id, {
                      description: e.target.value,
                    })
                  }
                  placeholder="Goods description"
                  className="text-sm"
                />

                {/* Country of Origin */}
                <Input
                  value={item.country_of_origin || ""}
                  onChange={(e) =>
                    updateItem(declarationId, item.id, {
                      country_of_origin: e.target.value.toUpperCase(),
                    })
                  }
                  placeholder="e.g., CN"
                  maxLength={2}
                  className="font-mono text-sm uppercase"
                />

                {/* Packages */}
                <Input
                  type="number"
                  value={item.packages_number ?? ""}
                  onChange={(e) =>
                    updateItem(declarationId, item.id, {
                      packages_number:
                        e.target.value === ""
                          ? undefined
                          : parseInt(e.target.value),
                    })
                  }
                  placeholder="0"
                  className="font-mono text-sm"
                  min={0}
                />

                {/* Actions */}
                <div className="flex gap-1 w-20">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => duplicateItem(declarationId, item.id)}
                    title="Duplicate item"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => removeItem(declarationId, item.id)}
                    title="Remove item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary */}
      {items.length > 0 && (
        <div className="flex justify-between items-center text-sm text-muted-foreground">
          <span>
            {items.length} item{items.length !== 1 ? "s" : ""}
          </span>
          <span>
            Total packages:{" "}
            {items.reduce((sum, item) => sum + (item.packages_number || 0), 0)}
          </span>
        </div>
      )}
    </div>
  );
}
