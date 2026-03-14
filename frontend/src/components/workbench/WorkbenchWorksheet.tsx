import { useState } from "react";
import { getCbttRate } from "@/services/stallionApi";

interface Props {
  form: any;
  setForm: (fn: (f: any) => any) => void;
  calc: any;
  onCalculate: () => void;
  box23Types: Array<{ type: string; label: string; amount: number; auto: boolean }>;
  selectedBox23: string[];
  setSelectedBox23: (v: string[]) => void;
  shippedOnBoardDate: string;
  sectionErrors: number;
  sectionWarnings: number;
}

const F = (n: number | undefined | null) =>
  n == null ? "—" : n.toLocaleString("en-TT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function WbField({
  label,
  value,
  onChange,
  mono = false,
  critical = false,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  mono?: boolean;
  critical?: boolean;
}) {
  return (
    <div className={`wb-field ${critical ? "critical" : ""}`}>
      <div className="wb-field-label">{label}</div>
      <input
        className={`wb-field-input${mono ? " mono" : ""}`}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function WorkbenchWorksheet({
  form,
  setForm,
  calc,
  onCalculate,
  box23Types,
  selectedBox23,
  setSelectedBox23,
  shippedOnBoardDate,
  sectionErrors,
  sectionWarnings,
}: Props) {
  const [cbttLoading, setCbttLoading] = useState(false);
  const [cbttSource, setCbttSource] = useState<string | null>(null);
  const [cbttWarning, setCbttWarning] = useState<string | null>(null);

  const handleCbttLookup = async () => {
    setCbttLoading(true);
    setCbttWarning(null);
    try {
      const dateStr = shippedOnBoardDate || new Date().toISOString().slice(0, 10);
      const result = await getCbttRate(dateStr);

      if (!result) {
        setCbttWarning("CBTT lookup unavailable — check backend connection");
        return;
      }

      setForm((f: any) => ({ ...f, exchange_rate: result.rate }));
      setCbttSource(result.source);

      if (result.source === "fallback") {
        setCbttWarning(`⚠ Backend couldn't reach Central Bank — using last known rate (${result.rate})`);
      } else {
        setCbttWarning(null);
      }
    } catch {
      setCbttWarning("CBTT lookup failed");
    } finally {
      setCbttLoading(false);
    }
  };

  const toggleBox23 = (type: string) => {
    setSelectedBox23(
      selectedBox23.includes(type)
        ? selectedBox23.filter((t) => t !== type)
        : [...selectedBox23, type],
    );
  };

  const hasIssue = sectionErrors > 0 || sectionWarnings > 0;
  const titleCls = sectionErrors > 0 ? "has-errors" : sectionWarnings > 0 ? "has-warnings" : "";

  return (
    <section className="wb-card" id="section-worksheet">
      <div className="wb-card-header">
        <span className={`wb-card-title ${titleCls}`}>
          Worksheet & Valuation
          {hasIssue && <span style={{ marginLeft: 8 }}>({sectionErrors}E / {sectionWarnings}W)</span>}
        </span>
      </div>

      <div className="wb-card-body">
        <div className="wb-subhead">Exchange & Inputs</div>

        <div className="wb-field">
          <div className="wb-field-label">EXCHANGE RATE (USD/TTD)</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 10px" }}>
            <input
              className="wb-field-input mono"
              type="number"
              step="0.0001"
              value={form.exchange_rate}
              onChange={(e) => setForm((f: any) => ({ ...f, exchange_rate: parseFloat(e.target.value) || 0 }))}
              style={{ padding: 0 }}
            />
            <button
              className="wb-btn wb-btn-secondary"
              onClick={handleCbttLookup}
              disabled={cbttLoading}
              title={shippedOnBoardDate ? `Lookup rate for ${shippedOnBoardDate}` : "Lookup today's CBTT rate"}
              style={{ whiteSpace: "nowrap", padding: "5px 10px", fontSize: 11 }}
            >
              {cbttLoading ? "…" : "LOOKUP CBTT"}
            </button>
          </div>
        </div>

        {(cbttSource || cbttWarning) && (
          <div
            style={{
              margin: "10px 16px",
              padding: "6px 10px",
              background: cbttWarning ? "var(--wb-warn)" : "#EBF7F1",
              border: `1px solid ${cbttWarning ? "var(--wb-warn-border)" : "var(--wb-approved)"}`,
              borderRadius: 3,
              fontFamily: "var(--wb-font-mono)",
              fontSize: 10,
              color: cbttWarning ? "var(--wb-warn-text)" : "var(--wb-approved)",
            }}
          >
            {cbttWarning
              ? cbttWarning
              : `✓ CBTT rate: ${form.exchange_rate} (${cbttSource}${shippedOnBoardDate ? ` · ${shippedOnBoardDate}` : ""})`}
          </div>
        )}

        {[
          ["INVOICE VALUE (FOREIGN)", "invoice_value_foreign"],
          ["FREIGHT (FOREIGN)", "freight_foreign"],
          ["INSURANCE (FOREIGN)", "insurance_foreign"],
          ["OTHER CHARGES (FOREIGN)", "other_foreign"],
          ["DEDUCTIONS (FOREIGN)", "deduction_foreign"],
          ["DUTY RATE %", "duty_rate_pct"],
          ["SURCHARGE RATE %", "surcharge_rate_pct"],
          ["VAT RATE %", "vat_rate_pct"],
          ["EXTRA FEES (TTD)", "extra_fees_local"],
        ].map(([label, key]) => (
          <WbField
            key={key}
            label={label}
            value={form[key]}
            onChange={(v) => setForm((f: any) => ({ ...f, [key]: parseFloat(v) || 0 }))}
            mono
            critical={label === "EXCHANGE RATE (USD/TTD)" && Number(form.exchange_rate) <= 0}
          />
        ))}

        <div style={{ padding: "12px 16px" }}>
          <button className="wb-btn wb-btn-primary" onClick={onCalculate} style={{ width: "100%" }}>
            ⟳ CALCULATE WORKSHEET
          </button>
        </div>

        {calc && (
          <>
            <div className="wb-subhead">Calculated Totals</div>
            <div style={{ background: "var(--wb-void)", margin: "12px 16px", borderRadius: 4, padding: "14px 16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10, marginBottom: 12 }}>
                {[
                  ["CIF (FOREIGN)", F(calc.cif_foreign), "var(--wb-ghost)"],
                  ["CIF (TTD)", F(calc.cif_local), "#fff"],
                  ["TOTAL ASSESSED", F(calc.total_assessed), "#fff"],
                ].map(([label, val, color]) => (
                  <div
                    key={label}
                    style={{
                      border: "1px solid var(--wb-void-border)",
                      borderRadius: 4,
                      padding: "10px 12px",
                      background: "var(--wb-void-surface)",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--wb-font-mono)",
                        fontSize: 9,
                        letterSpacing: "0.08em",
                        color: "var(--wb-ghost-dim)",
                        marginBottom: 4,
                      }}
                    >
                      {label}
                    </div>
                    <div style={{ fontFamily: "var(--wb-font-mono)", fontSize: 20, fontWeight: 700, color: color as string }}>
                      {val}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                {[
                  ["Duty", F(calc.duty)],
                  ["Surcharge", F(calc.surcharge)],
                  ["VAT", F(calc.vat)],
                  ["Extra Fees", F(calc.extra_fees_local)],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontFamily: "var(--wb-font-mono)", fontSize: 10, color: "var(--wb-ghost-dim)" }}>{label}</span>
                    <span style={{ fontFamily: "var(--wb-font-mono)", fontSize: 12, fontWeight: 700, color: "var(--wb-ghost)" }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {box23Types.length > 0 && (
          <>
            <div className="wb-subhead">Box 23 Charges</div>
            <div style={{ padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {box23Types.map((b) => (
                <button
                  key={b.type}
                  onClick={() => toggleBox23(b.type)}
                  className={selectedBox23.includes(b.type) ? "wb-tag wb-tag-active" : "wb-tag"}
                >
                  {b.label} · {b.amount}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
