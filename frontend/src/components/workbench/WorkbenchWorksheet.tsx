import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────
interface Box23Type {
  type: string;
  label: string;
  amount: number;
  auto: boolean;
}

interface WorkbenchWorksheetProps {
  form: any;
  setForm: React.Dispatch<React.SetStateAction<any>>;
  calc: any;
  onCalculate: () => Promise<void>;
  box23Types: Box23Type[];
  selectedBox23: string[];
  setSelectedBox23: React.Dispatch<React.SetStateAction<string[]>>;
  // Shipped-on-board date for CBTT lookup (from blAwbDate)
  shippedOnBoardDate?: string;
  sectionErrors: number;
  sectionWarnings: number;
}

function WbField({
  label, value, onChange, mono = false,
  warn = false, critical = false, note, placeholder, type = "text", readOnly = false,
  action,
}: {
  label: string; value: string | number; onChange?: (v: string) => void;
  mono?: boolean; warn?: boolean; critical?: boolean; note?: string;
  placeholder?: string; type?: string; readOnly?: boolean;
  action?: { label: string; onClick: () => void; loading?: boolean };
}) {
  const cls = critical ? "critical" : warn ? "warn" : "";
  return (
    <div className={`wb-field ${cls}`}>
      <div className="wb-field-label">{label}</div>
      <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
        <input
          type={type}
          className={`wb-field-input${mono ? " mono" : ""}`}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
          style={{ flex: 1 }}
        />
        {action && (
          <button
            className="wb-btn wb-btn-ghost"
            style={{ marginRight: 8, whiteSpace: "nowrap", flexShrink: 0 }}
            onClick={action.onClick}
            disabled={action.loading}
          >
            {action.loading ? "Fetching…" : action.label}
          </button>
        )}
      </div>
      {note && <div className="wb-field-note">{note}</div>}
    </div>
  );
}

function SubHead({ label, warn = false }: { label: string; warn?: boolean }) {
  return <div className={`wb-subhead${warn ? " warn" : ""}`}>{label}</div>;
}

// ─── Calc results table ────────────────────────────────────────────────────
function CalcResults({ calc }: { calc: any }) {
  if (!calc) return null;

  const rows: Array<[string, string, boolean?]> = [
    ["FOB (Local)",       `TTD ${Number(calc.fob_local   ?? 0).toLocaleString("en-TT", { minimumFractionDigits: 2 })}`],
    ["Freight (Local)",   `TTD ${Number(calc.freight_local   ?? 0).toLocaleString("en-TT", { minimumFractionDigits: 2 })}`],
    ["Insurance (Local)", `TTD ${Number(calc.insurance_local ?? 0).toLocaleString("en-TT", { minimumFractionDigits: 2 })}`],
    ["Other (Local)",     `TTD ${Number(calc.other_local     ?? 0).toLocaleString("en-TT", { minimumFractionDigits: 2 })}`],
    ["Deduction (Local)", `TTD ${Number(calc.deduction_local ?? 0).toLocaleString("en-TT", { minimumFractionDigits: 2 })}`],
    ["CIF (Local)",       `TTD ${Number(calc.cif_local       ?? 0).toLocaleString("en-TT", { minimumFractionDigits: 2 })}`, true],
    ["Duty",              `TTD ${Number(calc.duty            ?? 0).toLocaleString("en-TT", { minimumFractionDigits: 2 })}`],
    ["Surcharge",         `TTD ${Number(calc.surcharge       ?? 0).toLocaleString("en-TT", { minimumFractionDigits: 2 })}`],
    ["VAT",               `TTD ${Number(calc.vat             ?? 0).toLocaleString("en-TT", { minimumFractionDigits: 2 })}`],
    ["Extra Fees",        `TTD ${Number(calc.extra_fees_local ?? 0).toLocaleString("en-TT", { minimumFractionDigits: 2 })}`],
    ["Total Taxes",       `TTD ${Number(calc.total_taxes ?? calc.total_assessed ?? 0).toLocaleString("en-TT", { minimumFractionDigits: 2 })}`, true],
  ];

  return (
    <div style={{ margin: "0 16px 16px" }}>
      <div style={{
        fontFamily: "var(--wb-font-mono)", fontSize: 10, letterSpacing: "0.12em",
        color: "var(--wb-ink-light)", marginBottom: 8, paddingTop: 12,
      }}>
        CALCULATED RESULTS
      </div>
      <table className="wb-calc-table">
        <tbody>
          {rows.map(([label, val, isTotal]) => (
            <tr key={label} className={isTotal ? "total" : ""}>
              <td>{label}</td>
              <td>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────
export function WorkbenchWorksheet({
  form, setForm, calc, onCalculate,
  box23Types, selectedBox23, setSelectedBox23,
  shippedOnBoardDate,
  sectionErrors, sectionWarnings,
}: WorkbenchWorksheetProps) {

  const [calculating, setCalculating] = useState(false);
  const [cbttLoading, setCbttLoading] = useState(false);
  const [cbttConfirmed, setCbttConfirmed] = useState(false);
  const [cbttDate, setCbttDate] = useState<string | null>(null);

  const FN = (k: string) => (v: string) => setForm((f: any) => ({ ...f, [k]: Number(v || 0) }));

  const handleCalculate = async () => {
    setCalculating(true);
    try {
      await onCalculate();
    } finally {
      setCalculating(false);
    }
  };

  const lookupCBTT = async () => {
    if (!shippedOnBoardDate) return;
    setCbttLoading(true);
    try {
      const d = shippedOnBoardDate.slice(0, 10);
      const res = await fetch(`https://api.exchangerate.host/${d}?base=USD&symbols=TTD`);
      const json = await res.json();
      const rate = Number(json?.rates?.TTD ?? 0);
      if (!rate || Number.isNaN(rate)) throw new Error("No exchange rate available for date");
      setForm((f: any) => ({ ...f, exchange_rate: Number(rate.toFixed(5)) }));
      setCbttConfirmed(true);
      setCbttDate(d);
    } catch {
      setCbttConfirmed(false);
    } finally {
      setCbttLoading(false);
    }
  };

  const toggleBox23 = (type: string) => {
    setSelectedBox23(sel =>
      sel.includes(type) ? sel.filter(t => t !== type) : [...sel, type]
    );
  };

  const liveCI = (
    (Number(form.invoice_value_foreign) || 0) +
    (Number(form.freight_foreign) || 0) +
    (Number(form.insurance_foreign) || 0) +
    (Number(form.other_foreign) || 0) -
    (Number(form.deduction_foreign) || 0)
  ) * (Number(form.exchange_rate) || 1);

  const hasIssue = sectionErrors > 0 || sectionWarnings > 0;
  const titleCls = sectionErrors > 0 ? "has-errors" : sectionWarnings > 0 ? "has-warnings" : "";

  return (
    <div className="wb-card" id="section-worksheet">
      <div className="wb-card-header">
        <span className={`wb-card-title ${titleCls}`}>
          Worksheet · Valuation · Rates
          {hasIssue && (
            <span style={{ marginLeft: 8 }}>({sectionErrors}E / {sectionWarnings}W)</span>
          )}
        </span>
        <button
          className="wb-btn wb-btn-primary"
          style={{ fontSize: 11, padding: "5px 14px" }}
          onClick={handleCalculate}
          disabled={calculating}
        >
          {calculating ? "Calculating…" : "↻  Calculate"}
        </button>
      </div>

      <div className="wb-card-body">
        <SubHead label="Exchange Rate" warn={!cbttConfirmed} />
        <WbField
          label="Exchange Rate"
          value={form.exchange_rate}
          onChange={FN("exchange_rate")}
          mono
          warn={!cbttConfirmed}
          note={
            cbttConfirmed
              ? `CBTT confirmed · ${cbttDate} · USD → TTD`
              : shippedOnBoardDate
                ? `SOB date: ${shippedOnBoardDate} — click LOOKUP CBTT to auto-fill Central Bank rate`
                : "Set AWB Date (SOB) in Header to enable CBTT lookup"
          }
          action={{
            label: "LOOKUP CBTT",
            onClick: lookupCBTT,
            loading: cbttLoading,
          }}
        />

        <SubHead label="Valuation (Foreign Currency)" />
        <WbField label="Invoice Value (FOB)" value={form.invoice_value_foreign} onChange={FN("invoice_value_foreign")} mono type="number" placeholder="0.00" />
        <WbField label="Freight" value={form.freight_foreign} onChange={FN("freight_foreign")} mono type="number" placeholder="0.00" />
        <WbField label="Insurance" value={form.insurance_foreign} onChange={FN("insurance_foreign")} mono type="number" placeholder="0.00" />
        <WbField label="Other" value={form.other_foreign} onChange={FN("other_foreign")} mono type="number" placeholder="0.00" />
        <WbField label="Deduction" value={form.deduction_foreign} onChange={FN("deduction_foreign")} mono type="number" placeholder="0.00" />

        <div className="wb-cif-row">
          <span className="wb-cif-label">Computed CIF (Local · live)</span>
          <span className="wb-cif-value">
            TTD {liveCI.toLocaleString("en-TT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <SubHead label="Tax Rates" />
        <WbField label="Duty Rate %" value={form.duty_rate_pct} onChange={FN("duty_rate_pct")} mono type="number" placeholder="40" />
        <WbField label="Surcharge Rate %" value={form.surcharge_rate_pct} onChange={FN("surcharge_rate_pct")} mono type="number" placeholder="15" />
        <WbField label="VAT Rate %" value={form.vat_rate_pct} onChange={FN("vat_rate_pct")} mono type="number" placeholder="0" />
        <WbField label="Extra Fees (Local)" value={form.extra_fees_local} onChange={FN("extra_fees_local")} mono type="number" placeholder="40" />
        <WbField label="Global Fee" value={form.global_fee} onChange={FN("global_fee")} mono type="number" placeholder="40" />

        {box23Types.length > 0 && (
          <>
            <SubHead label="Box 23 · Deferred Payment" />
            <div style={{ padding: "10px 16px", display: "flex", flexWrap: "wrap", gap: 8 }}>
              {box23Types.map(b => (
                <button
                  key={b.type}
                  onClick={() => toggleBox23(b.type)}
                  style={{
                    padding: "5px 12px",
                    fontFamily: "var(--wb-font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.06em",
                    borderRadius: "var(--wb-radius)",
                    cursor: "pointer",
                    border: selectedBox23.includes(b.type)
                      ? "1px solid var(--wb-approved)"
                      : "1px solid var(--wb-paper-border)",
                    background: selectedBox23.includes(b.type)
                      ? "#F0FAF4"
                      : "transparent",
                    color: selectedBox23.includes(b.type)
                      ? "var(--wb-approved)"
                      : "var(--wb-ink-light)",
                    transition: "all 0.15s",
                  }}
                >
                  {b.label}
                  {b.auto && (
                    <span style={{ marginLeft: 6, opacity: 0.6, fontSize: 10 }}>AUTO</span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {calc && <CalcResults calc={calc} />}
      </div>
    </div>
  );
}
