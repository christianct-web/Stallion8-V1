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
  shippedOnBoardDate: string;   // blAwbDate from form — used for CBTT lookup
  sectionErrors: number;
  sectionWarnings: number;
}

const F = (n: number | undefined | null) =>
  n == null ? "—" : n.toLocaleString("en-TT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function WorkbenchWorksheet({
  form, setForm, calc, onCalculate,
  box23Types, selectedBox23, setSelectedBox23,
  shippedOnBoardDate,
  sectionErrors, sectionWarnings,
}: Props) {
  const [cbttLoading,  setCbttLoading]  = useState(false);
  const [cbttSource,   setCbttSource]   = useState<string | null>(null);
  const [cbttWarning,  setCbttWarning]  = useState<string | null>(null);

  const handleCbttLookup = async () => {
    setCbttLoading(true);
    setCbttWarning(null);
    try {
      // Use shipped-on-board date if available, otherwise today
      const dateStr = shippedOnBoardDate || new Date().toISOString().slice(0, 10);
      const result  = await getCbttRate(dateStr);

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
        ? selectedBox23.filter(t => t !== type)
        : [...selectedBox23, type]
    );
  };

  const badgeStyle = (count: number, warn = false) => ({
    fontFamily: "var(--wb-font-mono)", fontSize: 10, fontWeight: 700,
    padding: "2px 7px", borderRadius: 3,
    background: count > 0 ? (warn ? "var(--wb-warn-bg)" : "var(--wb-crit-bg)") : "transparent",
    color:      count > 0 ? (warn ? "var(--wb-pending)" : "var(--wb-crit-border)") : "transparent",
  });

  return (
    <section className="wb-section">
      <div className="wb-section-header">
        <span className="wb-section-title">Worksheet & Valuation</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {sectionErrors   > 0 && <span style={badgeStyle(sectionErrors)}>   {sectionErrors}E</span>}
          {sectionWarnings > 0 && <span style={badgeStyle(sectionWarnings, true)}>{sectionWarnings}W</span>}
        </div>
      </div>

      <div className="wb-fields">

        {/* ── Exchange rate ─────────────────────────────────────────────── */}
        <div className="wb-field-row">
          <label className="wb-label">EXCHANGE RATE (USD/TTD)</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
            <input
              className="wb-input"
              type="number" step="0.0001"
              value={form.exchange_rate}
              onChange={e => setForm((f: any) => ({ ...f, exchange_rate: parseFloat(e.target.value) || 0 }))}
              style={{ flex: 1 }}
            />
            <button
              className="wb-btn-secondary"
              onClick={handleCbttLookup}
              disabled={cbttLoading}
              title={shippedOnBoardDate ? `Lookup rate for ${shippedOnBoardDate}` : "Lookup today's CBTT rate"}
              style={{ whiteSpace: "nowrap", flexShrink: 0 }}
            >
              {cbttLoading ? "…" : "LOOKUP CBTT"}
            </button>
          </div>
        </div>

        {/* CBTT source / warning */}
        {(cbttSource || cbttWarning) && (
          <div style={{
            marginTop: -8, marginBottom: 4,
            padding: "6px 10px",
            background: cbttWarning ? "var(--wb-warn-bg)" : "#EBF7F1",
            border: `1px solid ${cbttWarning ? "var(--wb-warn-border)" : "var(--wb-approved)"}`,
            borderRadius: 3,
            fontFamily: "var(--wb-font-mono)", fontSize: 10,
            color: cbttWarning ? "var(--wb-pending)" : "var(--wb-approved)",
          }}>
            {cbttWarning
              ? cbttWarning
              : `✓ CBTT rate: ${form.exchange_rate} (${cbttSource}${shippedOnBoardDate ? ` · ${shippedOnBoardDate}` : ""})`}
          </div>
        )}

        {/* ── Foreign value fields ──────────────────────────────────────── */}
        {[
          ["INVOICE VALUE (FOREIGN)", "invoice_value_foreign"],
          ["FREIGHT (FOREIGN)",       "freight_foreign"],
          ["INSURANCE (FOREIGN)",     "insurance_foreign"],
          ["OTHER CHARGES (FOREIGN)", "other_foreign"],
          ["DEDUCTIONS (FOREIGN)",    "deduction_foreign"],
        ].map(([label, key]) => (
          <div key={key} className="wb-field-row">
            <label className="wb-label">{label}</label>
            <input
              className="wb-input"
              type="number" step="0.01"
              value={(form as any)[key]}
              onChange={e => setForm((f: any) => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
            />
          </div>
        ))}

        {/* ── Rate fields ───────────────────────────────────────────────── */}
        {[
          ["DUTY RATE %",      "duty_rate_pct"],
          ["SURCHARGE RATE %", "surcharge_rate_pct"],
          ["VAT RATE %",       "vat_rate_pct"],
          ["EXTRA FEES (TTD)", "extra_fees_local"],
        ].map(([label, key]) => (
          <div key={key} className="wb-field-row">
            <label className="wb-label">{label}</label>
            <input
              className="wb-input"
              type="number" step="0.01"
              value={(form as any)[key]}
              onChange={e => setForm((f: any) => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
            />
          </div>
        ))}

        {/* ── Calculate button ──────────────────────────────────────────── */}
        <div style={{ marginTop: 8, marginBottom: 12 }}>
          <button className="wb-btn-primary" onClick={onCalculate} style={{ width: "100%" }}>
            ⟳ CALCULATE WORKSHEET
          </button>
        </div>

        {/* ── Calc results ─────────────────────────────────────────────── */}
        {calc && (
          <div style={{
            background: "var(--wb-void)", borderRadius: 4,
            padding: "14px 16px", marginBottom: 12,
          }}>
            <div style={{ fontFamily: "var(--wb-font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--wb-ghost-dim)", marginBottom: 10 }}>
              CALCULATED TOTALS
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10, marginBottom: 12 }}>
              {[
                ["CIF (FOREIGN)", F(calc.cif_foreign), "var(--wb-ghost)"],
                ["CIF (TTD)", F(calc.cif_local), "#fff"],
                ["TOTAL ASSESSED", F(calc.total_assessed), "#fff"],
              ].map(([label, val, color]) => (
                <div key={label} style={{
                  border: "1px solid var(--wb-void-border)",
                  borderRadius: 4,
                  padding: "10px 12px",
                  background: "var(--wb-void-surface)",
                }}>
                  <div style={{ fontFamily: "var(--wb-font-mono)", fontSize: 9, letterSpacing: "0.08em", color: "var(--wb-ghost-dim)", marginBottom: 4 }}>
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
                ["Duty",               F(calc.duty)],
                ["Surcharge",          F(calc.surcharge)],
                ["VAT",                F(calc.vat)],
                ["Extra Fees",         F(calc.extra_fees_local)],
              ].map(([label, val]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontFamily: "var(--wb-font-mono)", fontSize: 10, color: "var(--wb-ghost-dim)" }}>{label}</span>
                  <span style={{ fontFamily: "var(--wb-font-mono)", fontSize: 12, fontWeight: 700, color: "var(--wb-ghost)" }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Box 23 charges ────────────────────────────────────────────── */}
        {box23Types.length > 0 && (
          <div>
            <div style={{ fontFamily: "var(--wb-font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--wb-ghost-dim)", marginBottom: 8 }}>
              BOX 23 CHARGES
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {box23Types.map(b => (
                <button
                  key={b.type}
                  onClick={() => toggleBox23(b.type)}
                  className={selectedBox23.includes(b.type) ? "wb-tag wb-tag-active" : "wb-tag"}
                >
                  {b.label} · {b.amount}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
