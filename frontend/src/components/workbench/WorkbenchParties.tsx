import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";

interface WorkbenchPartiesProps {
  form: any;
  setForm: React.Dispatch<React.SetStateAction<any>>;
  sectionErrors: number;
  sectionWarnings: number;
}

function WbField({
  label, value, onChange, mono = false,
  warn = false, critical = false, note, placeholder, tooltip,
}: {
  label: string; value: string; onChange: (v: string) => void;
  mono?: boolean; warn?: boolean; critical?: boolean;
  note?: string; placeholder?: string; tooltip?: string;
}) {
  const cls = critical ? "critical" : warn ? "warn" : "";
  return (
    <div className={`wb-field ${cls}`}>
      <div className="wb-field-label">
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span style={{ borderBottom: "1px dotted var(--wb-paper-mid)", cursor: "help" }}>
                {label}
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" style={{ fontFamily: "var(--wb-font-serif)", fontSize: 12 }}>
              {tooltip}
            </TooltipContent>
          </Tooltip>
        ) : label}
      </div>
      <input
        className={`wb-field-input${mono ? " mono" : ""}`}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {note && <div className="wb-field-note">{note}</div>}
    </div>
  );
}

function SubHead({ label, warn = false }: { label: string; warn?: boolean }) {
  return <div className={`wb-subhead${warn ? " warn" : ""}`}>{label}</div>;
}

export function WorkbenchParties({
  form, setForm, sectionErrors, sectionWarnings,
}: WorkbenchPartiesProps) {

  const F = (k: string) => (v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  const hasIssue = sectionErrors > 0 || sectionWarnings > 0;
  const titleCls = sectionErrors > 0 ? "has-errors" : sectionWarnings > 0 ? "has-warnings" : "";

  return (
    <div className="wb-card" id="section-parties">
      <div className="wb-card-header">
        <span className={`wb-card-title ${titleCls}`}>
          Parties · Consignor · Consignee · Declarant
          {hasIssue && (
            <span style={{ marginLeft: 8 }}>({sectionErrors}E / {sectionWarnings}W)</span>
          )}
        </span>
      </div>

      <div className="wb-card-body">
        {/* ── Consignor ── */}
        <SubHead label="Consignor (Exporter)" />
        <WbField
          label="Name"
          value={form.consignorName}
          onChange={F("consignorName")}
          placeholder="CENTRAL INTERNATIONAL CO. LLC"
          tooltip="Full legal name of the overseas exporter as it appears on the commercial invoice"
        />
        <WbField
          label="Street"
          value={form.consignorStreet}
          onChange={F("consignorStreet")}
          placeholder="ONE WHITMAN ROAD, P.O BOX 525"
        />
        <WbField
          label="City"
          value={form.consignorCity}
          onChange={F("consignorCity")}
          placeholder="CANTON, MASSACHUSETTS"
        />
        <WbField
          label="Country"
          value={form.consignorCountry}
          onChange={F("consignorCountry")}
          mono placeholder="US"
        />
        {/* Legacy combined address field — kept for backward compat */}
        <WbField
          label="Full Address"
          value={form.consignorAddress}
          onChange={F("consignorAddress")}
          placeholder="Full address if street/city not split"
          note="Optional — use if street/city/country fields above are populated"
        />

        {/* ── Consignee ── */}
        <SubHead label="Consignee" warn={!form.consigneeCode} />
        <WbField
          label="Code"
          value={form.consigneeCode}
          onChange={F("consigneeCode")}
          mono
          critical={!form.consigneeCode}
          placeholder="N108974"
          tooltip="ASYCUDA consignee registration code — required for XML generation"
        />
        <WbField
          label="Name"
          value={form.consigneeName}
          onChange={F("consigneeName")}
          placeholder="BASCO FOOD DISTRIBUTORS LTD"
        />
        <WbField
          label="Address"
          value={form.consigneeAddress}
          onChange={F("consigneeAddress")}
          placeholder="#31 HENRY STREET, GASPARILLO"
        />

        {/* ── Declarant ── */}
        <SubHead label="Declarant (Broker)" warn={!form.declarantTIN} />
        <WbField
          label="TIN / Code"
          value={form.declarantTIN}
          onChange={F("declarantTIN")}
          mono
          critical={!form.declarantTIN}
          placeholder="BR0286"
          tooltip="Licensed customs broker TIN or ASYCUDA declarant code"
        />
        <WbField
          label="Name"
          value={form.declarantName}
          onChange={F("declarantName")}
          warn={!form.declarantName}
          placeholder="ANTHONY CHOW"
        />
      </div>
    </div>
  );
}
