import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  listDeclarations,
  reviewDeclaration,
  receiptDeclaration,
  submitDeclaration,
  generateBrokerageInvoice,
  listClients,
  STALLION_BASE_URL,
  type Client,
} from "@/services/stallionApi";
import { TopNav } from "@/components/TopNav";
import { HelpBox, HelpTip, HelpHeading } from "@/components/HelpBox";
import { HsLookup } from "@/components/HsLookup";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  paper:      "#F6F3EE", paperAlt:  "#EFECE6", paperBorder: "#E2DDD6",
  paperMid:   "#CCC7BE", ink:       "#18150F", inkMid:      "#3D3830",
  inkLight:   "#6B6560", void:      "#111318", voidMid:     "#191D26",
  voidSurface:"#1F2430", voidBorder:"#2E3748", ghost:       "#A0AABB",
  ghostDim:   "#6B7585", approved:  "#1A5E3A", pending:     "#96700A",
  correction: "#963A10", warn:      "#FEF3DC", warnBorder:  "#D4A020",
  warnText:   "#7A5000", critical:  "#FEE8E8", critBorder:  "#B02020",
  submitted:  "#1E4A8C", receipted: "#1E4A8C",
};

const STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
  draft:            { color: C.ghostDim,   bg: C.voidSurface, label: "DRAFT"       },
  pending_review:   { color: C.pending,    bg: C.warn,        label: "PENDING"     },
  pending:          { color: C.pending,    bg: C.warn,        label: "PENDING"     },
  approved:         { color: C.approved,   bg: "#EBF7F1",     label: "APPROVED"    },
  needs_correction: { color: C.correction, bg: "#FEF0E8",     label: "CORRECTION"  },
  rejected:         { color: C.critBorder, bg: C.critical,    label: "REJECTED"    },
  submitted:        { color: C.submitted,  bg: "#EEF2FA",     label: "SUBMITTED"   },
  receipted:        { color: C.receipted,  bg: "#EEF2FA",     label: "RECEIPTED"   },
};

function statusCfg(s: string) {
  return STATUS_CFG[s?.toLowerCase?.()] ?? STATUS_CFG.draft;
}

// ─── Normalise API shape to ReviewDecl ───────────────────────────────────────
interface ReviewDecl {
  id:           string;
  status:       string;
  reference?:   string;
  brokerNotes?: string;
  reviewedBy?:  string;
  reviewedAt?:  string;
  receiptNumber?: string;
  source?:      { type?: string; filename?: string };
  confidence?:  number;
  header?:      Record<string, any>;
  worksheet?:   Record<string, any>;
  items?:       any[];
  containers?:  any[];
  export_events?: any[];
  last_export?: any;
}

function normaliseDecl(raw: any): ReviewDecl {
  return {
    id:            raw.id          ?? "",
    status:        raw.status      ?? "draft",
    reference:     raw.reference_number ?? raw.header?.declarationRef ?? raw.id?.slice(0, 12) ?? "",
    brokerNotes:   raw.review_notes ?? raw.brokerNotes ?? "",
    reviewedBy:    raw.reviewed_by  ?? raw.reviewedBy  ?? "",
    reviewedAt:    raw.reviewed_at  ?? raw.reviewedAt  ?? "",
    receiptNumber: raw.receipt_number ?? raw.receiptNumber ?? "",
    source:        raw.source       ?? {},
    confidence:    raw.confidence   ?? null,
    header:        raw.header       ?? {},
    worksheet:     raw.worksheet    ?? {},
    items:         raw.items        ?? [],
    containers:    raw.containers   ?? [],
    export_events: raw.export_events ?? [],
    last_export:   raw.last_export  ?? null,
  };
}

// ─── Status pill ─────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const cfg = statusCfg(status);
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
      fontWeight: 700, letterSpacing: "0.1em",
      color: cfg.color, background: cfg.bg,
      padding: "3px 8px", borderRadius: 3,
      border: `1px solid ${cfg.color}44`, display: "inline-block",
    }}>{cfg.label}</span>
  );
}

// ─── Batch list (left panel) ─────────────────────────────────────────────────
function BatchList({
  batch, onSelect, loading,
}: {
  batch: ReviewDecl[]; onSelect: (id: string) => void; loading: boolean;
}) {
  const pending  = batch.filter(d => d.status === "pending_review" || d.status === "pending");
  const others   = batch.filter(d => d.status !== "pending_review" && d.status !== "pending");

  return (
    <div style={{ flex: 1, overflow: "auto", background: C.voidMid }}>
      {/* Sub-header */}
      <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.voidBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.ghostDim, letterSpacing: "0.1em" }}>
          {batch.length} DECLARATION{batch.length !== 1 ? "S" : ""}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", fontFamily: "'Fraunces', serif", fontStyle: "italic", color: C.ghostDim }}>
          Loading…
        </div>
      ) : batch.length === 0 ? (
        <div style={{ padding: 48, textAlign: "center" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 28, color: C.voidBorder, marginBottom: 16 }}>▤</div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, color: C.ghost, fontWeight: 600, marginBottom: 8 }}>Queue is clear</div>
          <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: C.ghostDim }}>
            No declarations pending review
          </div>
        </div>
      ) : (
        <div>
          {/* Pending group */}
          {pending.length > 0 && (
            <>
              <div style={{ padding: "8px 18px 4px", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", color: C.ghostDim }}>
                PENDING REVIEW · {pending.length}
              </div>
              {pending.map(d => <BatchRow key={d.id} d={d} onSelect={onSelect} />)}
            </>
          )}
          {/* Other group */}
          {others.length > 0 && (
            <>
              <div style={{ padding: "12px 18px 4px", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", color: C.ghostDim }}>
                ALL · {others.length}
              </div>
              {others.map(d => <BatchRow key={d.id} d={d} onSelect={onSelect} />)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BatchRow({ d, onSelect }: { d: ReviewDecl; onSelect: (id: string) => void }) {
  const [hov, setHov] = useState(false);
  const cfg = statusCfg(d.status);
  const consignee = d.header?.consigneeName ?? d.header?.consignee_name ?? "";
  return (
    <div
      onClick={() => onSelect(d.id)}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        padding: "11px 18px", cursor: "pointer", transition: "background 0.12s",
        background: hov ? C.voidSurface : "transparent",
        borderBottom: `1px solid ${C.voidBorder}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: hov ? "#fff" : C.ghost, letterSpacing: "0.04em" }}>
          {d.reference || d.id.slice(0, 14)}
        </div>
        <StatusPill status={d.status} />
      </div>
      {consignee && (
        <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 11, color: C.ghostDim }}>
          {consignee}
        </div>
      )}
      {d.items && d.items.length > 0 && (
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.ghostDim, marginTop: 2 }}>
          {d.items.length} item{d.items.length !== 1 ? "s" : ""}
          {d.confidence != null && ` · ${d.confidence}% conf.`}
        </div>
      )}
    </div>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────
function FieldRow({
  label, value, mono = false, highlight = false, editable = false,
  editValue, onEdit,
}: {
  label: string; value: string | number | null | undefined;
  mono?: boolean; highlight?: boolean; editable?: boolean;
  editValue?: string; onEdit?: (v: string) => void;
}) {
  const displayVal = value == null || value === "" ? "—" : String(value);
  return (
    <div style={{ padding: "7px 0", borderBottom: `1px solid ${C.paperBorder}`, display: "flex", gap: 12 }}>
      <div style={{ width: 160, flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.inkLight, letterSpacing: "0.06em", paddingTop: 2 }}>
        {label}
      </div>
      {editable && onEdit ? (
        <input
          value={editValue ?? displayVal}
          onChange={e => onEdit(e.target.value)}
          style={{
            flex: 1, fontFamily: mono ? "'JetBrains Mono', monospace" : "'Fraunces', serif",
            fontSize: 13, color: C.ink, background: highlight ? "#FEF9EC" : "transparent",
            border: `1px solid ${highlight ? C.warnBorder : C.paperBorder}`,
            borderRadius: 3, padding: "3px 8px",
          }}
        />
      ) : (
        <div style={{
          flex: 1, fontFamily: mono ? "'JetBrains Mono', monospace" : "'Fraunces', serif",
          fontSize: 13, color: displayVal === "—" ? C.inkLight : C.ink,
          fontStyle: !mono && displayVal === "—" ? "italic" : "normal",
          background: highlight ? "#FEF9EC" : "transparent",
          borderRadius: 2, padding: highlight ? "2px 6px" : 0,
        }}>
          {displayVal}
        </div>
      )}
    </div>
  );
}

// ─── Receipt input panel ─────────────────────────────────────────────────────
function ReceiptPanel({
  decl, onReceipt,
}: {
  decl: ReviewDecl; onReceipt: (receiptNo: string) => Promise<void>;
}) {
  const [receiptNo, setReceiptNo] = useState(decl.receiptNumber ?? "");
  const [saving,    setSaving]    = useState(false);

  const handleSubmit = async () => {
    const v = receiptNo.trim();
    if (!v) return;
    setSaving(true);
    try {
      await onReceipt(v);
    } finally {
      setSaving(false);
    }
  };

  if (decl.status === "receipted") {
    return (
      <div style={{ padding: "14px 18px", background: "#EEF2FA", border: `1px solid #1E4A8C44`, borderRadius: 3, marginBottom: 16 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: C.submitted, marginBottom: 6 }}>CUSTOMS RECEIPT</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700, color: C.submitted }}>
          {decl.receiptNumber || "—"}
        </div>
        <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 11, color: C.inkLight, marginTop: 4 }}>
          Receipted by {decl.reviewedBy || "Broker"} · {decl.reviewedAt ? new Date(decl.reviewedAt).toLocaleString() : ""}
        </div>
      </div>
    );
  }

  // Only show receipt entry for submitted declarations
  if (decl.status !== "submitted") return null;

  return (
    <div style={{ padding: "14px 18px", background: "#EEF2FA", border: `1px solid #1E4A8C55`, borderRadius: 3, marginBottom: 16 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: C.submitted, marginBottom: 10 }}>
        ENTER CUSTOMS RECEIPT NUMBER
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={receiptNo}
          onChange={e => setReceiptNo(e.target.value)}
          placeholder="e.g. C82/2025/001234"
          style={{
            flex: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
            padding: "8px 12px", border: `1px solid #1E4A8C55`,
            borderRadius: 3, background: "#fff", color: C.ink,
          }}
          onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
        />
        <button
          onClick={handleSubmit}
          disabled={!receiptNo.trim() || saving}
          style={{
            padding: "8px 18px",
            background: receiptNo.trim() ? C.submitted : C.voidBorder,
            border: "none", borderRadius: 3,
            color: "#fff", fontFamily: "'Fraunces', serif",
            fontSize: 13, fontWeight: 600, cursor: receiptNo.trim() ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Saving…" : "Confirm"}
        </button>
      </div>
    </div>
  );
}

// ─── Export history panel ─────────────────────────────────────────────────────
function ExportHistory({ events }: { events: any[] }) {
  if (!events || events.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", color: C.inkLight, marginBottom: 6 }}>
        EXPORT HISTORY
      </div>
      <div style={{ border: `1px solid ${C.paperBorder}`, borderRadius: 3, overflow: "hidden" }}>
        {events.slice(-5).reverse().map((ev, i) => (
          <div key={i} style={{ padding: "7px 12px", borderBottom: i < Math.min(events.length, 5) - 1 ? `1px solid ${C.paperBorder}` : "none", display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: ev.status === "generated" ? C.approved : C.critBorder, fontWeight: 700 }}>
              {(ev.status ?? "—").toUpperCase()}
            </span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.inkLight, flex: 1 }}>
              {ev.at ? new Date(ev.at).toLocaleString() : "—"}
            </span>
            {ev.ref && (
              <a href={`${STALLION_BASE_URL}/pack/file/${ev.ref}`} target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.approved, textDecoration: "none" }}>
                ↓ {ev.ref.slice(0, 16)}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Invoice tab ──────────────────────────────────────────────────────────────
function InvoiceTab({ decl }: { decl: ReviewDecl }) {
  const [clients, setClients]           = useState<Client[]>([]);
  const [selectedClientId, setClient]   = useState("");
  const [brokerageFee, setBrokerageFee] = useState("");
  const [invNotes, setInvNotes]         = useState("");
  const [generating, setGenerating]     = useState(false);
  const [generated, setGenerated]       = useState<{ doc_id: string; download_url: string } | null>(null);
  const [pastInvoices, setPastInvoices] = useState<any[]>((decl as any).brokerage_invoices || []);

  // Colours
  const green    = "#1A5C3A";
  const greenL   = "#EBF5EE";
  const paper    = C.paper;
  const paperAlt = C.paperAlt;
  const paperB   = C.paperBorder;
  const ink      = C.ink;
  const inkL     = C.inkLight;
  const inkM     = C.inkMid;

  useEffect(() => {
    listClients().then(setClients).catch(() => {});
    // Pre-fill client from consignee code
  }, []);

  useEffect(() => {
    const code = decl.header?.consigneeCode || "";
    if (code && clients.length) {
      const match = clients.find(c => c.consigneeCode?.toUpperCase() === code.toUpperCase());
      if (match) {
        setClient(match.id);
        if (!brokerageFee && match.defaultBrokerageFee)
          setBrokerageFee(String(match.defaultBrokerageFee));
      }
    }
  }, [clients, decl.header?.consigneeCode]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await generateBrokerageInvoice(decl.id, {
        brokerage_fee_ttd: parseFloat(brokerageFee) || 0,
        notes: invNotes,
        client_id: selectedClientId || undefined,
      });
      setGenerated(res);
      setPastInvoices(p => [...p, { docId: res.doc_id, generatedAt: new Date().toISOString(), brokerageFee: parseFloat(brokerageFee) || 0 }]);
    } catch (e: any) {
      alert(e.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const selectedClient = clients.find(c => c.id === selectedClientId);
  const ws = decl.worksheet || {};
  const cifTTD = typeof ws.cif_local === "number" ? ws.cif_local : 0;
  const totalAssessed = typeof ws.total_assessed === "number" ? ws.total_assessed : 0;
  const custUserFee = typeof ws.customs_user_fee === "number" ? ws.customs_user_fee : 40;
  const brokerageFeeNum = parseFloat(brokerageFee) || 0;
  const grandTotal = totalAssessed + custUserFee + brokerageFeeNum;

  const rowStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${paperB}` };
  const labelStyle: React.CSSProperties = { fontFamily: "'Fraunces', serif", fontSize: 13, color: inkM };
  const valStyle: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: ink };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", color: inkL }}>
        BROKERAGE INVOICE
      </div>

      {/* Client selector */}
      <div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: inkL, marginBottom: 6 }}>BILL TO</div>
        {clients.length === 0 ? (
          <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 13, color: inkL, background: paperAlt, border: `1px solid ${paperB}`, borderRadius: 4, padding: "10px 12px" }}>
            No clients in directory — <a href="/stallion/clients" style={{ color: green }}>add a client</a> to pre-fill billing details.
          </div>
        ) : (
          <select
            value={selectedClientId}
            onChange={e => {
              setClient(e.target.value);
              const cl = clients.find(c => c.id === e.target.value);
              if (cl?.defaultBrokerageFee && !brokerageFee) setBrokerageFee(String(cl.defaultBrokerageFee));
            }}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 4, border: `1px solid ${paperB}`, background: paper, fontFamily: "'Fraunces', serif", fontSize: 13, color: ink, outline: "none" }}
          >
            <option value="">— Select client —</option>
            {clients.map(cl => (
              <option key={cl.id} value={cl.id}>{cl.name}{cl.consigneeCode ? ` (${cl.consigneeCode})` : ""}</option>
            ))}
          </select>
        )}
        {selectedClient && (
          <div style={{ marginTop: 6, padding: "8px 10px", background: greenL, borderRadius: 4, fontFamily: "'Fraunces', serif", fontSize: 12, color: green }}>
            {selectedClient.address ? selectedClient.address.replace(/\n/g, "  ·  ") : "No address on file"}
            {selectedClient.contactName ? `  ·  Attn: ${selectedClient.contactName}` : ""}
          </div>
        )}
      </div>

      {/* Fee input */}
      <div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: inkL, marginBottom: 6 }}>BROKERAGE FEE (TTD)</div>
        <input
          type="number"
          value={brokerageFee}
          onChange={e => setBrokerageFee(e.target.value)}
          placeholder="750.00"
          style={{ width: "100%", padding: "8px 10px", borderRadius: 4, border: `1px solid ${paperB}`, background: paper, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: ink, outline: "none", boxSizing: "border-box" }}
        />
        <div style={{ fontSize: 11, color: inkL, fontFamily: "'Fraunces', serif", fontStyle: "italic", marginTop: 4 }}>
          Standard brokerage service charge — added on top of government duties and fees
        </div>
      </div>

      {/* Notes */}
      <div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: inkL, marginBottom: 6 }}>SERVICE NOTES (optional)</div>
        <textarea
          value={invNotes}
          onChange={e => setInvNotes(e.target.value)}
          placeholder="e.g. Includes permit processing, bond clearance fee, or special handling notes…"
          rows={2}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 4, border: `1px solid ${paperB}`, background: paper, fontFamily: "'Fraunces', serif", fontSize: 13, color: ink, outline: "none", resize: "vertical", boxSizing: "border-box" }}
        />
      </div>

      {/* Summary */}
      <div style={{ background: paperAlt, border: `1px solid ${paperB}`, borderRadius: 6, padding: "14px 16px" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: inkL, marginBottom: 10 }}>INVOICE SUMMARY</div>
        <div style={rowStyle}><span style={labelStyle}>CIF Value (TTD)</span><span style={valStyle}>{cifTTD ? `TT$ ${cifTTD.toLocaleString("en-TT", { minimumFractionDigits: 2 })}` : "—"}</span></div>
        <div style={rowStyle}><span style={labelStyle}>Duty + Surcharge + VAT</span><span style={valStyle}>{totalAssessed ? `TT$ ${totalAssessed.toLocaleString("en-TT", { minimumFractionDigits: 2 })}` : "—"}</span></div>
        <div style={rowStyle}><span style={labelStyle}>Customs User Fee</span><span style={valStyle}>TT$ {custUserFee.toFixed(2)}</span></div>
        <div style={{ ...rowStyle, borderBottom: "none", paddingTop: 10 }}>
          <span style={{ ...labelStyle, fontWeight: 700, color: ink }}>Brokerage Fee</span>
          <span style={{ ...valStyle, color: green }}>{brokerageFeeNum ? `TT$ ${brokerageFeeNum.toFixed(2)}` : "—"}</span>
        </div>
        <div style={{ marginTop: 10, padding: "10px 12px", background: green, borderRadius: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 14, color: "#fff" }}>Total Amount Due</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 15, color: "#fff" }}>
            TT$ {grandTotal.toLocaleString("en-TT", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={generating}
        style={{ padding: "11px 24px", background: generating ? "#2E7D52" : green, border: "none", borderRadius: 4, color: "#fff", fontFamily: "'Fraunces', serif", fontSize: 14, fontWeight: 700, cursor: generating ? "default" : "pointer" }}
      >
        {generating ? "Generating…" : "Generate Brokerage Invoice PDF"}
      </button>

      {/* Download link */}
      {generated && (
        <div style={{ background: greenL, border: `1px solid ${green}44`, borderRadius: 6, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 13, color: green }}>Invoice generated</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.inkLight, marginTop: 2 }}>{generated.doc_id}</div>
          </div>
          <a
            href={`${STALLION_BASE_URL}${generated.download_url}`}
            target="_blank" rel="noopener noreferrer"
            style={{ padding: "8px 18px", background: green, color: "#fff", borderRadius: 4, fontFamily: "'Fraunces', serif", fontSize: 13, fontWeight: 600, textDecoration: "none" }}
          >
            ↓ Download PDF
          </a>
        </div>
      )}

      {/* Past invoices */}
      {pastInvoices.length > 0 && (
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: inkL, marginBottom: 8 }}>PREVIOUS INVOICES</div>
          {pastInvoices.map((inv: any, i: number) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${paperB}` }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: inkM }}>{inv.docId}</div>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <span style={{ fontFamily: "'Fraunces', serif", fontSize: 12, color: inkL }}>{new Date(inv.generatedAt).toLocaleDateString()}</span>
                <a href={`${STALLION_BASE_URL}/pack/file/${inv.docId}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'Fraunces', serif", fontSize: 12, color: green }}>↓ PDF</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Review panel (right side) ───────────────────────────────────────────────
type ReviewTab = "FIELDS" | "ITEMS" | "WORKSHEET" | "HISTORY" | "NOTES" | "INVOICE";

function ReviewPanel({
  decl, onStatusChange, onBack, idx, total,
}: {
  decl: ReviewDecl;
  onStatusChange: (id: string, status: string, notes: string, updated: any) => Promise<void>;
  onBack: () => void;
  idx: number; total: number;
}) {
  const [tab,      setTab]      = useState<ReviewTab>("FIELDS");
  const [notes,    setNotes]    = useState(decl.brokerNotes ?? "");
  const [submitting, setSubmitting] = useState<string | null>(null);

  // Editable header fields
  const [editHeader, setEditHeader] = useState<Record<string, string>>({});
  const hdr = (key: string) => editHeader[key] ?? (decl.header?.[key] ?? "");
  const setHdr = (key: string, val: string) => setEditHeader(p => ({ ...p, [key]: val }));

  // Editable item fields (keyed by item index)
  const [editItems,  setEditItems]  = useState<Record<number, Partial<any>>>({});
  const setItemField = (i: number, key: string, val: any) =>
    setEditItems(p => ({ ...p, [i]: { ...(p[i] ?? {}), [key]: val } }));

  // HS lookup open state — stores item index (or -1 for none)
  const [hsSearchIdx, setHsSearchIdx] = useState<number | null>(null);

  const ws  = decl.worksheet ?? {};
  const itms = decl.items ?? [];

  const isPending   = decl.status === "pending_review" || decl.status === "pending";
  const isApproved  = decl.status === "approved";
  const isSubmitted = decl.status === "submitted";
  const isReceipted = decl.status === "receipted";
  const isDone      = isReceipted;

  // Action button helper
  const action = async (status: string) => {
    setSubmitting(status);
    try {
      const updatedHeader = Object.keys(editHeader).length > 0
        ? { ...decl.header, ...editHeader }
        : undefined;
      const updatedItems = Object.keys(editItems).length > 0
        ? itms.map((item: any, i: number) => ({ ...item, ...(editItems[i] ?? {}) }))
        : undefined;
      await onStatusChange(decl.id, status, notes, {
        ...(updatedHeader ? { header: updatedHeader } : {}),
        ...(updatedItems  ? { items:  updatedItems  } : {}),
      });
    } finally {
      setSubmitting(null);
    }
  };

  const handleReceipt = async (receiptNo: string) => {
    setSubmitting("receipted");
    try {
      await onStatusChange(decl.id, "receipted", notes, { receipt_number: receiptNo });
    } finally {
      setSubmitting(null);
    }
  };

  const tabs: ReviewTab[] = ["FIELDS", "ITEMS", "WORKSHEET", "HISTORY", "NOTES", "INVOICE"];

  return (
    <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", background: C.paper }}>
      {/* Panel top bar */}
      <div style={{ padding: "10px 18px", borderBottom: `1px solid ${C.paperBorder}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "transparent", border: `1px solid ${C.paperBorder}`, borderRadius: 3, color: C.inkLight, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, padding: "4px 10px", cursor: "pointer" }}>
          ← LIST
        </button>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: "0.04em" }}>
          {decl.reference || decl.id.slice(0, 16)}
        </div>
        <StatusPill status={decl.status} />
        {decl.confidence != null && (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.inkLight }}>
            {decl.confidence}% conf.
          </span>
        )}
        <div style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.ghost }}>
          {idx + 1} / {total}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.paperBorder}`, flexShrink: 0, background: C.paperAlt }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "9px 16px", background: "transparent", border: "none",
            borderBottom: tab === t ? `2px solid ${C.ink}` : "2px solid transparent",
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            letterSpacing: "0.1em", fontWeight: tab === t ? 700 : 400,
            color: tab === t ? C.ink : C.inkLight, cursor: "pointer",
          }}>{t}</button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "auto", padding: "18px 22px" }}>

        {/* Receipt + export history always visible at top of FIELDS */}
        {tab === "FIELDS" && (
          <>
            <ReceiptPanel decl={decl} onReceipt={handleReceipt} />
            <ExportHistory events={decl.export_events ?? []} />

            {/* Header fields */}
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", color: C.inkLight, marginBottom: 8 }}>
              HEADER
            </div>

            {/* HS code hero */}
            {itms.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ padding: "10px 14px", background: C.void, borderRadius: 3, display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "0.04em" }}>
                    {(editItems[0]?.hsCode ?? itms[0].hsCode ?? itms[0].tarification_hscode_commodity_code) || "——"}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Fraunces', serif", fontSize: 12, color: C.ghost }}>
                      {itms[0].description ?? ""}
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.ghostDim }}>
                      {itms.length} line item{itms.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => setHsSearchIdx(hsSearchIdx === 0 ? null : 0)}
                    style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                      padding: "4px 10px", background: "transparent",
                      border: `1px solid ${C.voidBorder}`, borderRadius: 3,
                      color: C.ghost, cursor: "pointer", flexShrink: 0,
                    }}
                  >
                    {hsSearchIdx === 0 ? "Close ✕" : "Lookup HS ↓"}
                  </button>
                </div>
                {hsSearchIdx === 0 && (
                  <HsLookup
                    defaultQuery={itms[0].description ?? ""}
                    onSelect={(code) => {
                      setItemField(0, "hsCode", code);
                      setHsSearchIdx(null);
                    }}
                    onClose={() => setHsSearchIdx(null)}
                    theme="paper"
                  />
                )}
              </div>
            )}

            {[
              ["DECLARATION REF",  "declarationRef",          true,  isPending],
              ["PORT",             "port",                    true,  false],
              ["CONSIGNEE",        "consigneeName",           false, isPending],
              ["CONSIGNEE CODE",   "consigneeCode",           true,  isPending],
              ["CONSIGNOR",        "consignorName",           false, false],
              ["DECLARANT TIN",    "declarantTIN",            true,  false],
              ["VESSEL",           "vesselName",              false, isPending],
              ["AWB / B/L",        "blAwbNumber",             true,  isPending],
              ["AWB DATE",         "blAwbDate",               true,  false],
              ["ETA DATE",         "etaDate",                 true,  false],
              ["INVOICE NO",       "invoiceNumber",           true,  isPending],
              ["INVOICE DATE",     "invoiceDate",             true,  false],
              ["CURRENCY",         "currency",                true,  false],
              ["EXPORT COUNTRY",   "exportCountryCode",       true,  false],
              ["TERMS",            "termsCode",               true,  false],
            ].map(([label, key, mono, hl]) => (
              <FieldRow key={key as string}
                label={label as string}
                value={decl.header?.[key as string]}
                mono={mono as boolean}
                highlight={!!hl && (!decl.header?.[key as string])}
                editable={isPending}
                editValue={hdr(key as string)}
                onEdit={v => setHdr(key as string, v)}
              />
            ))}

            {(decl.reviewedBy || decl.reviewedAt) && (
              <div style={{ marginTop: 14, fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 11, color: C.inkLight }}>
                Reviewed by {decl.reviewedBy || "—"} · {decl.reviewedAt ? new Date(decl.reviewedAt).toLocaleString() : ""}
              </div>
            )}
          </>
        )}

        {tab === "ITEMS" && (
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", color: C.inkLight, marginBottom: 10 }}>
              LINE ITEMS · {itms.length}
            </div>
            {itms.length === 0 ? (
              <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: C.inkLight, padding: "20px 0" }}>No items</div>
            ) : itms.map((item: any, i: number) => {
              const displayHs = editItems[i]?.hsCode ?? item.hsCode ?? item.tarification_hscode_commodity_code ?? "——";
              const isHsOpen = hsSearchIdx === (100 + i);
              return (
                <div key={item.id ?? i} style={{ border: `1px solid ${C.paperBorder}`, borderRadius: 3, padding: "12px 14px", marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: editItems[i]?.hsCode ? C.approved : C.ink, letterSpacing: "0.04em" }}>
                      {displayHs}
                    </span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.inkLight }}>
                        LINE {item.line_number ?? i + 1}
                      </span>
                      <button
                        onClick={() => setHsSearchIdx(isHsOpen ? null : 100 + i)}
                        style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                          padding: "3px 8px", background: "transparent",
                          border: `1px solid ${C.paperBorder}`, borderRadius: 3,
                          color: C.inkLight, cursor: "pointer",
                        }}
                      >
                        {isHsOpen ? "Close ✕" : "Lookup HS"}
                      </button>
                    </div>
                  </div>

                  {isHsOpen && (
                    <HsLookup
                      defaultQuery={item.description ?? ""}
                      onSelect={(code) => {
                        setItemField(i, "hsCode", code);
                        setHsSearchIdx(null);
                      }}
                      onClose={() => setHsSearchIdx(null)}
                      theme="paper"
                    />
                  )}

                  {[
                    ["DESCRIPTION", item.description ?? ""],
                    ["QTY",         `${item.qty ?? item.quantity ?? ""} ${item.unitCode ?? item.unit_of_measure ?? ""}`.trim()],
                    ["GROSS KG",    item.grossKg ?? item.gross_weight ?? ""],
                    ["NET KG",      item.netKg   ?? item.net_weight   ?? ""],
                    ["ITEM VALUE",  item.itemValue ?? item.customs_value ?? ""],
                    ["DUTY CODE",   item.dutyTaxCode ?? ""],
                    ["CPC",         item.cpc ?? ""],
                    ["PKG TYPE",    item.packageType ?? item.packages_kind ?? ""],
                  ].map(([l, v]) => (
                    <FieldRow key={l as string} label={l as string} value={v as any} mono={typeof v === "number"} />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {tab === "WORKSHEET" && (
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", color: C.inkLight, marginBottom: 10 }}>
              VALUATION
            </div>
            {[
              ["INVOICE VALUE (FOREIGN)", ws.invoice_value_foreign ?? ""],
              ["EXCHANGE RATE",           ws.exchange_rate          ?? ""],
              ["FREIGHT (FOREIGN)",       ws.freight_foreign        ?? ""],
              ["INSURANCE (FOREIGN)",     ws.insurance_foreign      ?? ""],
              ["OTHER (FOREIGN)",         ws.other_foreign          ?? ""],
              ["DEDUCTION (FOREIGN)",     ws.deduction_foreign      ?? ""],
              ["CIF (FOREIGN)",           ws.cif_foreign            ?? ""],
              ["CIF (TTD)",               ws.cif_local              ?? ""],
              ["DUTY RATE %",             ws.duty_rate_pct          ?? ""],
              ["DUTY",                    ws.duty                   ?? ""],
              ["SURCHARGE RATE %",        ws.surcharge_rate_pct     ?? ""],
              ["SURCHARGE",               ws.surcharge              ?? ""],
              ["VAT RATE %",              ws.vat_rate_pct           ?? ""],
              ["VAT",                     ws.vat                    ?? ""],
              ["TOTAL ASSESSED (TTD)",    ws.total_assessed         ?? ""],
            ].map(([l, v]) => (
              <FieldRow key={l as string} label={l as string} value={v as any} mono />
            ))}
          </div>
        )}

        {tab === "HISTORY" && (
          <div>
            <ExportHistory events={decl.export_events ?? []} />
            {(decl.export_events?.length ?? 0) === 0 && (
              <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: C.inkLight, padding: "20px 0" }}>
                No export history yet
              </div>
            )}
            {/* Lifecycle summary */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", color: C.inkLight, marginBottom: 8 }}>
                LIFECYCLE
              </div>
              {[
                { stage: "Extracted",     done: true },
                { stage: "Pending Review",done: decl.status !== "pending_review" && decl.status !== "pending" },
                { stage: "Approved",      done: ["approved","submitted","receipted"].includes(decl.status) },
                { stage: "Submitted",     done: ["submitted","receipted"].includes(decl.status) },
                { stage: "Receipted",     done: decl.status === "receipted" },
              ].map(({ stage, done }) => (
                <div key={stage} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.paperBorder}` }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: done ? C.approved : C.paperMid }}>
                    {done ? "✓" : "○"}
                  </span>
                  <span style={{ fontFamily: "'Fraunces', serif", fontSize: 13, color: done ? C.ink : C.inkLight }}>
                    {stage}
                  </span>
                </div>
              ))}
            </div>
            {decl.receiptNumber && (
              <div style={{ marginTop: 14, padding: "10px 14px", background: "#EEF2FA", borderRadius: 3 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: C.submitted, marginBottom: 4 }}>RECEIPT NUMBER</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 700, color: C.submitted }}>{decl.receiptNumber}</div>
              </div>
            )}
          </div>
        )}

        {tab === "NOTES" && (
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", color: C.inkLight, marginBottom: 8 }}>
              BROKER NOTES
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={isDone ? "No notes" : "Enter correction notes or remarks…"}
              disabled={isDone}
              style={{
                width: "100%", minHeight: 180, padding: "10px 12px",
                fontFamily: "'Fraunces', serif", fontSize: 13, color: C.ink,
                background: isDone ? C.paperAlt : C.paper,
                border: `1px solid ${C.paperBorder}`, borderRadius: 3, resize: "vertical",
              }}
            />
          </div>
        )}

        {tab === "INVOICE" && (
          <InvoiceTab decl={decl} />
        )}
      </div>

      {/* Action bar */}
      {!isDone && (
        <div style={{
          padding: "12px 22px", borderTop: `1px solid ${C.paperBorder}`,
          background: C.paper, flexShrink: 0,
          display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center",
        }}>
          {/* Pending → Approve / Correction */}
          {isPending && (
            <>
              <button onClick={() => action("needs_correction")} disabled={!!submitting}
                style={{ padding: "9px 18px", background: "transparent", border: `1px solid ${C.correction}`, borderRadius: 3, color: C.correction, fontFamily: "'Fraunces', serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                {submitting === "needs_correction" ? "Saving…" : "Needs Correction"}
              </button>
              <button onClick={() => action("approved")} disabled={!!submitting}
                style={{ padding: "9px 24px", background: C.approved, border: "none", borderRadius: 3, color: "#fff", fontFamily: "'Fraunces', serif", fontSize: 13, fontWeight: 700, cursor: "pointer", marginLeft: "auto" }}>
                {submitting === "approved" ? "Approving…" : "Approve →"}
              </button>
            </>
          )}

          {/* Correction → Re-review */}
          {decl.status === "needs_correction" && (
            <button onClick={() => action("pending_review")} disabled={!!submitting}
              style={{ padding: "9px 18px", background: C.pending, border: "none", borderRadius: 3, color: "#fff", fontFamily: "'Fraunces', serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {submitting === "pending_review" ? "Saving…" : "Send for Re-review"}
            </button>
          )}

          {/* Approved → Submit */}
          {isApproved && (
            <button onClick={() => action("submitted")} disabled={!!submitting}
              style={{ padding: "9px 24px", background: C.submitted, border: "none", borderRadius: 3, color: "#fff", fontFamily: "'Fraunces', serif", fontSize: 13, fontWeight: 700, cursor: "pointer", marginLeft: "auto" }}>
              {submitting === "submitted" ? "Submitting…" : "Mark Submitted →"}
            </button>
          )}

          {/* Submitted → receipt number shown inline via ReceiptPanel */}
          {isSubmitted && (
            <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: C.inkLight }}>
              Switch to Fields tab to enter the Customs receipt number
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────
export default function BrokerReview4() {
  const [batch,    setBatch]    = useState<ReviewDecl[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [searchParams] = useSearchParams();
  const urlId = searchParams.get("id");

  useEffect(() => { if (urlId && batch.length > 0 && !activeId) { setActiveId(urlId); } }, [batch, urlId]);

  useEffect(() => {
    (async () => {
      try {
        const { items } = await listDeclarations();
        setBatch(items.map(normaliseDecl));
      } catch {
        setBatch([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const activeIdx = batch.findIndex(d => d.id === activeId);
  const active    = batch[activeIdx] ?? null;

  const reviewed  = batch.filter(d =>
    !["pending", "pending_review", "draft"].includes(d.status)
  ).length;
  const progress  = batch.length ? Math.round(reviewed / batch.length * 100) : 0;

  const handleStatusChange = async (
    id: string, status: string, notes: string, updated: any
  ) => {
    try {
      await reviewDeclaration(id, {
        action:         status,
        review_notes:   notes,
        reviewed_by:    "Broker",
        reviewed_at:    new Date().toISOString(),
        receipt_number: updated?.receipt_number,
        header:         updated?.header,
        worksheet:      updated?.worksheet,
        items:          updated?.items,
      });
    } catch {
      // optimistic update regardless
    }

    setBatch(b => b.map(d => d.id === id ? {
      ...d,
      status,
      brokerNotes:   notes,
      reviewedBy:    "Broker",
      reviewedAt:    new Date().toISOString(),
      receiptNumber: updated?.receipt_number ?? d.receiptNumber,
      header:        updated?.header    ?? d.header,
      worksheet:     updated?.worksheet ?? d.worksheet,
      items:         updated?.items     ?? d.items,
    } : d));

    // Auto-advance to next pending
    const next = batch.find((d, i) =>
      i > activeIdx && ["pending", "pending_review"].includes(d.status)
    );
    if (status !== "submitted" && status !== "receipted") {
      setActiveId(next ? next.id : null);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!activeId) return;
      if (e.key === "ArrowRight" && activeIdx < batch.length - 1)
        setActiveId(batch[activeIdx + 1].id);
      if (e.key === "ArrowLeft" && activeIdx > 0)
        setActiveId(batch[activeIdx - 1].id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeId, activeIdx, batch]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400;1,9..144,600&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #2E3748; border-radius: 2px; }
        input:focus { background: #FDFAF5 !important; outline: none; } textarea:focus { outline: none; }
        button { transition: opacity 0.15s; } button:hover:not(:disabled) { opacity: 0.85; }
      `}</style>

      <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Fraunces', serif" }}>

        <TopNav rightSlot={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 100, height: 2, background: "#2E3748", borderRadius: 1 }}>
              <div style={{ height: "100%", borderRadius: 1, width: `${progress}%`, background: "#1A5E3A", transition: "width 0.4s" }} />
            </div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#A0AABB" }}>
              {reviewed}/{batch.length}
            </span>
          </div>
        } />

        {/* Body — split layout */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
          {/* Left: batch list (always visible on wider screens) */}
          <div style={{ width: 280, borderRight: `1px solid ${C.voidBorder}`, display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>
            <BatchList batch={batch} onSelect={setActiveId} loading={loading} />
          </div>

          {/* Right: review panel or empty state */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {active ? (
              <ReviewPanel
                key={active.id}
                decl={active}
                onStatusChange={handleStatusChange}
                onBack={() => setActiveId(null)}
                idx={activeIdx}
                total={batch.length}
              />
            ) : (
              <div style={{ flex: 1, overflow: "auto", background: C.paper, padding: 32 }}>
                <div style={{ textAlign: "center", marginBottom: 32 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 36, color: C.paperMid, marginBottom: 16 }}>▤</div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 16, color: C.inkMid, fontWeight: 600, marginBottom: 8 }}>
                    Select a declaration
                  </div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: C.inkLight }}>
                    Choose from the queue on the left to begin review
                  </div>
                </div>

                <div style={{ maxWidth: 560, margin: "0 auto" }}>
                  <HelpBox title="How broker review works" defaultOpen={true}>
                    <p style={{ margin: "0 0 10px" }}>
                      Every declaration passes through broker review before a C82 XML is generated.
                      Your job is to verify the AI-extracted fields, correct anything wrong, and either
                      approve or flag for correction.
                    </p>

                    <HelpHeading>THE REVIEW WORKFLOW</HelpHeading>
                    <div style={{ display: "grid", gap: 6 }}>
                      {[
                        ["1. Check the HS code", "This is the most critical field. Confirm the HS code matches the goods description. Use the TT Tariff link to verify the rate."],
                        ["2. Verify the invoice value", "The EXW/FOB value should match what's on the invoice. Set the correct duty rate % for this HS code."],
                        ["3. Confirm vessel / AWB and port", "Verify the transport details. Vessel name and port of entry are required for ASYCUDA."],
                        ["4. Check the exchange rate", "The CBTT rate is auto-fetched by shipped-on-board date. Confirm it matches your records."],
                        ["5. Approve or flag", "If all fields are correct, click Approve. If something needs fixing, click Flag Correction and add notes."],
                      ].map(([step, desc]) => (
                        <div key={step} style={{ paddingLeft: 12, borderLeft: "2px solid #E2DDD6" }}>
                          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 12, color: "#3D3830", marginBottom: 2 }}>{step}</div>
                          <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: "#6B6560" }}>{desc}</div>
                        </div>
                      ))}
                    </div>

                    <HelpHeading>ACTIONS</HelpHeading>
                    <div style={{ display: "grid", gap: 4 }}>
                      {[
                        ["Approve", "Declaration is correct and ready to generate C82 XML + LB01 worksheet."],
                        ["Flag Correction", "Something needs fixing. Add a note explaining what the ops team should change before resubmitting."],
                        ["Reject", "Declaration cannot be processed (duplicate, fraud, unrecoverable data issue)."],
                        ["Generate Pack", "Available after approval. Produces the ASYCUDA C82 XML and LB01 PDF worksheet for download."],
                        ["Receipt Number", "After ASYCUDA submission, enter the receipt number here to complete the lifecycle."],
                      ].map(([action, desc]) => (
                        <div key={action} style={{ display: "flex", gap: 8, fontSize: 12 }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#1A5E3A", minWidth: 120 }}>{action}</span>
                          <span style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: "#6B6560" }}>{desc}</span>
                        </div>
                      ))}
                    </div>

                    <HelpHeading>KEYBOARD SHORTCUTS</HelpHeading>
                    <div style={{ display: "grid", gap: 4 }}>
                      {[
                        ["← →", "Navigate previous / next declaration in queue"],
                        ["A", "Approve (when not in a text field)"],
                        ["C", "Flag for correction (when not in a text field)"],
                      ].map(([key, desc]) => (
                        <div key={key} style={{ display: "flex", gap: 8, fontSize: 12 }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#1E4A8C", minWidth: 60 }}>{key}</span>
                          <span style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: "#6B6560" }}>{desc}</span>
                        </div>
                      ))}
                    </div>

                    <HelpTip>Declarations extracted by AI show a confidence score. Start with the lowest confidence items first — they're most likely to need correction.</HelpTip>
                  </HelpBox>

                  <HelpBox title="What does ASYCUDA need?" variant="warn">
                    <p style={{ margin: "0 0 10px" }}>
                      ASYCUDA World will reject a declaration if any of these required fields are missing or incorrect:
                    </p>
                    <div style={{ display: "grid", gap: 4 }}>
                      {[
                        "HS code — must be numeric with dots (e.g. 9021.29.00.00), at least 6 digits",
                        "Vessel name or flight number — cannot be blank",
                        "Port of entry — must be a valid ASYCUDA port code (e.g. TTPTS, TTPIA)",
                        "Invoice value — must be greater than zero",
                        "Exchange rate — must be greater than zero",
                        "Consignee code and name — required for C82 header",
                        "At least one item with a valid HS code, description, quantity, and value",
                      ].map(f => (
                        <div key={f} style={{ display: "flex", gap: 8, fontSize: 12 }}>
                          <span style={{ color: "#963A10", flexShrink: 0 }}>✕</span>
                          <span style={{ fontFamily: "'Fraunces', serif", color: "#6B6560", fontStyle: "italic" }}>{f}</span>
                        </div>
                      ))}
                    </div>
                    <HelpTip>The Generate Pack button is blocked until all required fields pass preflight validation. Fix the errors shown, then generate.</HelpTip>
                  </HelpBox>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
