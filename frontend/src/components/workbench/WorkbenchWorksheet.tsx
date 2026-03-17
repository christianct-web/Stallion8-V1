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
      const dateStr = shippedOnBoardDate || new Date().toISOString().slice(0, 10);
      const result  = await getCbttRate(dateStr);
      if (!result) { setCbttWarning("CBTT lookup unavailable — check backend connection"); return; }
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

  // sub-label style for section groupings
  const subLabel: React.CSSProperties = {
    fontFamily: "var(--wb-font-mono)", fontSize: 9, letterSpacing: "0.14em",
    color: "var(--wb-ghost-dim)", padding: "8px 0 4px",
    borderBottom: "1px solid var(--wb-void-border)", marginBottom: 4,
  };

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
        <div style={subLabel}>EXCHANGE RATE</div>
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

        {(cbttSource || cbttWarning) && (
          <div style={{
            marginTop: -8, marginBottom: 4, padding: "6px 10px",
            background: cbttWarning ? "var(--wb-warn-bg)" : "#EBF7F1",
            border: `1px solid ${cbttWarning ? "var(--wb-warn-border)" : "var(--wb-approved)"}`,
            borderRadius: 3, fontFamily: "var(--wb-font-mono)", fontSize: 10,
            color: cbttWarning ? "var(--wb-pending)" : "var(--wb-approved)",
          }}>
            {cbttWarning
              ? cbttWarning
              : `✓ CBTT rate: ${form.exchange_rate} (${cbttSource}${shippedOnBoardDate ? ` · ${shippedOnBoardDate}` : ""})`}
          </div>
        )}

        {/* ── EX-WORKS & Inland ────────────────────────────────────────── */}
        <div style={subLabel}>EX-WORKS / FOB</div>
        {([
          ["INVOICE VALUE / EX-WORKS (FOREIGN)", "invoice_value_foreign", "The supplier's ex-works or FOB price on the commercial invoice"],
          ["INLAND CHARGES (FOREIGN)",            "inland_foreign",        "Inland freight/trucking from factory to port of export — added to EX-WORKS to arrive at FOB"],
          ["% UPLIFT",                             "uplift_pct",           "Percentage uplift applied to EX-WORKS for statistical or insurance purposes"],
        ] as [string, string, string][]).map(([label, key, tip]) => (
          <div key={key} className="wb-field-row">
            <label className="wb-label" title={tip}>{label}</label>
            <input
              className="wb-input"
              type="number" step="0.01"
              value={(form as any)[key] ?? 0}
              onChange={e => setForm((f: any) => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
            />
          </div>
        ))}

        {/* ── CIF components ───────────────────────────────────────────── */}
        <div style={subLabel}>CIF COMPONENTS</div>
        {([
          ["FREIGHT (FOREIGN)",       "freight_foreign"],
          ["INSURANCE (FOREIGN)",     "insurance_foreign"],
          ["OTHER CHARGES (FOREIGN)", "other_foreign"],
          ["DEDUCTIONS (FOREIGN)",    "deduction_foreign"],
        ] as [string, string][]).map(([label, key]) => (
          <div key={key} className="wb-field-row">
            <label className="wb-label">{label}</label>
            <input
              className="wb-input"
              type="number" step="0.01"
              value={(form as any)[key] ?? 0}
              onChange={e => setForm((f: any) => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
            />
          </div>
        ))}

        {/* ── Duty & Tax rates ─────────────────────────────────────────── */}
        <div style={subLabel}>DUTY & TAX RATES</div>
        {([
          ["DUTY RATE %",      "duty_rate_pct"],
          ["SURCHARGE RATE %", "surcharge_rate_pct"],
          ["VAT RATE %",       "vat_rate_pct"],
        ] as [string, string][]).map(([label, key]) => (
          <div key={key} className="wb-field-row">
            <label className="wb-label">{label}</label>
            <input
              className="wb-input"
              type="number" step="0.01"
              value={(form as any)[key] ?? 0}
              onChange={e => setForm((f: any) => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
            />
          </div>
        ))}

        {/* ── Box 23 / Fees ────────────────────────────────────────────── */}
        <div style={subLabel}>FEES (TTD)</div>
        {([
          ["CUSTOMS USER FEE / CFU (TTD)", "extra_fees_local", "Standard Customs User Fee — typically TT$80"],
          ["CES FEE 1 — Container Ex Fee", "ces_fee_1",        "Container Examination Fee (standard) — typically TT$1,050"],
          ["CES FEE 2 — Container Ex Fee", "ces_fee_2",        "Container Examination Fee (second line) — typically TT$750"],
        ] as [string, string, string][]).map(([label, key, tip]) => (
          <div key={key} className="wb-field-row">
            <label className="wb-label" title={tip}>{label}</label>
            <input
              className="wb-input"
              type="number" step="0.01"
              value={(form as any)[key] ?? 0}
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
              {([
                ["FOB (Foreign)",      calc.fob_foreign],
                ["CIF (Foreign)",      calc.cif_foreign],
                ["CIF (TTD)",          calc.cif_local],
                ["Duty",               calc.duty],
                ["Surcharge",          calc.surcharge],
                ["VAT",                calc.vat],
                ["CFU",                calc.customs_user_fee ?? calc.extra_fees_local],
                ["CES Fees",           (calc.ces_fee_1 ?? 0) + (calc.ces_fee_2 ?? 0)],
              ] as [string, number][]).map(([label, val]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontFamily: "var(--wb-font-mono)", fontSize: 10, color: "var(--wb-ghost-dim)" }}>{label}</span>
                  <span style={{ fontFamily: "var(--wb-font-mono)", fontSize: 12, fontWeight: 700, color: "var(--wb-ghost)" }}>{F(val)}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--wb-void-border)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: "var(--wb-font-mono)", fontSize: 10, color: "var(--wb-ghost)" }}>TOTAL AMOUNT DUE (TTD)</span>
              <span style={{ fontFamily: "var(--wb-font-mono)", fontSize: 18, fontWeight: 700, color: "#fff" }}>{F(calc.total_assessed)}</span>
            </div>
          </div>
        )}

        {/* ── Box 23 charges (legacy toggle) ──────────────────────────── */}
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


