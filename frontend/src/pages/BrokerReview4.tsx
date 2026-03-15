import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  listDeclarations,
  reviewDeclaration,
  receiptDeclaration,
  submitDeclaration,
  generatePack,
  STALLION_BASE_URL,
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

type NoteEntry = { id: string; author: string; at: string; text: string };

function parseReviewNotes(raw?: string): NoteEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((n) => n && typeof n.text === "string")
        .map((n, i) => ({
          id: String(n.id ?? `${i}`),
          author: String(n.author ?? "Broker"),
          at: String(n.at ?? new Date().toISOString()),
          text: String(n.text ?? ""),
        }));
    }
  } catch {
    // legacy plain text notes fallback
  }
  return [{ id: "legacy", author: "Broker", at: new Date().toISOString(), text: raw }];
}

function serializeReviewNotes(notes: NoteEntry[]): string {
  return JSON.stringify(notes);
}

function toNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function deriveWorksheet(ws: Record<string, any> = {}) {
  const out: Record<string, any> = { ...ws };

  const invoice = toNum(ws.invoice_value_foreign) ?? 0;
  const freight = toNum(ws.freight_foreign) ?? 0;
  const insurance = toNum(ws.insurance_foreign) ?? 0;
  const other = toNum(ws.other_foreign) ?? 0;
  const deduction = toNum(ws.deduction_foreign) ?? 0;
  const ex = toNum(ws.exchange_rate) ?? 0;

  const cifForeign = (toNum(ws.cif_foreign) ?? (invoice + freight + insurance + other - deduction));
  const cifLocal = (toNum(ws.cif_local) ?? (cifForeign * ex));

  const dutyRate = (toNum(ws.duty_rate_pct) ?? 0) / 100;
  const surchargeRate = (toNum(ws.surcharge_rate_pct) ?? 0) / 100;
  const vatRate = (toNum(ws.vat_rate_pct) ?? 0) / 100;
  const extra = toNum(ws.extra_fees_local) ?? 0;

  const duty = toNum(ws.duty) ?? (cifLocal * dutyRate);
  const surcharge = toNum(ws.surcharge) ?? (cifLocal * surchargeRate);
  const vatBase = cifLocal + duty + surcharge;
  const vat = toNum(ws.vat) ?? (vatBase * vatRate);
  const total = toNum(ws.total_assessed) ?? (duty + surcharge + vat + extra);

  out.cif_foreign = Number.isFinite(cifForeign) ? cifForeign : null;
  out.cif_local = Number.isFinite(cifLocal) ? cifLocal : null;
  out.duty = Number.isFinite(duty) ? duty : null;
  out.surcharge = Number.isFinite(surcharge) ? surcharge : null;
  out.vat = Number.isFinite(vat) ? vat : null;
  out.total_assessed = Number.isFinite(total) ? total : null;

  const hasInputs = [invoice, ex].every((v) => Number.isFinite(v) && v > 0);
  const complete = Number.isFinite(out.total_assessed);

  return { values: out, hasInputs, complete };
}

// ─── Normalise API shape to ReviewDecl ───────────────────────────────────────
interface ReviewDecl {
  id:           string;
  status:       string;
  reference?:   string;
  brokerNotes?: string;
  notesThread?: NoteEntry[];
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
    notesThread:   parseReviewNotes(raw.review_notes ?? raw.brokerNotes ?? ""),
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

// ─── Review panel (right side) ───────────────────────────────────────────────
type ReviewTab = "FIELDS" | "ITEMS" | "WORKSHEET" | "HISTORY" | "NOTES";

function ReviewPanel({
  decl, onStatusChange, onBack, onPackEvent, idx, total,
}: {
  decl: ReviewDecl;
  onStatusChange: (
    id: string,
    status: string,
    notes: string,
    updated: any,
    options?: { stayOnCurrent?: boolean }
  ) => Promise<void>;
  onBack: () => void;
  onPackEvent: (id: string, event: { status: string; at: string; ref?: string; reason?: string; errors?: string[]; warnings?: string[]; suggestedTab?: ReviewTab }) => void;
  idx: number; total: number;
}) {
  const [tab,      setTab]      = useState<ReviewTab>("FIELDS");
  const [notesThread, setNotesThread] = useState<NoteEntry[]>(decl.notesThread ?? []);
  const [noteDraft, setNoteDraft] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [generatingPack, setGeneratingPack] = useState(false);

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
  const wsDerived = deriveWorksheet(ws);
  const itms = decl.items ?? [];
  const notesSerialized = serializeReviewNotes(notesThread);

  const isPending   = decl.status === "pending_review" || decl.status === "pending";
  const isApproved  = decl.status === "approved";
  const isSubmitted = decl.status === "submitted";
  const isReceipted = decl.status === "receipted";
  const isDone      = isReceipted;
  const canApprove = wsDerived.complete;

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
      await onStatusChange(decl.id, status, notesSerialized, {
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
      await onStatusChange(decl.id, "receipted", notesSerialized, { receipt_number: receiptNo });
    } finally {
      setSubmitting(null);
    }
  };

  const saveNote = async () => {
    const text = noteDraft.trim();
    if (!text) return;
    const updatedThread = [
      ...notesThread,
      { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, author: "Broker", at: new Date().toISOString(), text },
    ];
    setNotesThread(updatedThread);
    setNoteDraft("");

    setSubmitting("note");
    try {
      await onStatusChange(
        decl.id,
        decl.status,
        serializeReviewNotes(updatedThread),
        {},
        { stayOnCurrent: true }
      );
    } finally {
      setSubmitting(null);
    }
  };

  const getSuggestedTabFromPaths = (paths: string[]): ReviewTab => {
    const p = paths.join(" ").toLowerCase();
    if (p.includes("worksheet")) return "WORKSHEET";
    if (p.includes("item")) return "ITEMS";
    return "FIELDS";
  };

  const handleGeneratePack = async () => {
    setGeneratingPack(true);
    try {
      const header = Object.keys(editHeader).length > 0
        ? { ...decl.header, ...editHeader }
        : (decl.header ?? {});
      const items = Object.keys(editItems).length > 0
        ? itms.map((item: any, i: number) => ({ ...item, ...(editItems[i] ?? {}) }))
        : (itms ?? []);

      const res = await generatePack({
        declaration_id: decl.id,
        header,
        worksheet: decl.worksheet ?? {},
        items,
        containers: decl.containers ?? [],
      });

      const firstRef = res.documents?.find((d) => d?.ref)?.ref;
      const preflightErrors = (res.preflight?.errors ?? []).map((e: any) => `${e.path}: ${e.message}`);
      const preflightWarnings = (res.preflight?.warnings ?? []).map((w: any) => `${w.path}: ${w.message}`);
      const suggestedTab = getSuggestedTabFromPaths((res.preflight?.errors ?? []).map((e: any) => String(e.path || "")));

      onPackEvent(decl.id, {
        status: res.status,
        at: res.generatedAt || new Date().toISOString(),
        ref: firstRef,
        reason: res.status === "blocked" ? `Preflight blocked generation (${res.preflight?.counts?.errors ?? 0} errors).` : undefined,
        errors: preflightErrors,
        warnings: preflightWarnings,
        suggestedTab,
      });

      if (res.status === "blocked") {
        setTab(suggestedTab);
        alert(`Pack generation blocked by preflight (${res.preflight?.counts?.errors ?? 0} errors). See the blocker panel for exact fixes.`);
      } else {
        alert("Pack generated successfully.");
      }
    } catch {
      alert("Generate pack failed. Please try again.");
    } finally {
      setGeneratingPack(false);
    }
  };

  const lastBlockedEvent = [...(decl.export_events ?? [])].reverse().find((ev: any) => ev?.status === "blocked");

  const tabs: ReviewTab[] = ["FIELDS", "ITEMS", "WORKSHEET", "HISTORY", "NOTES"];

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
            {lastBlockedEvent && (
              <div style={{ marginBottom: 14, padding: "12px 14px", border: `1px solid ${C.critBorder}`, borderRadius: 3, background: C.critical }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: C.critBorder, fontWeight: 700, marginBottom: 6 }}>
                  PACK BLOCKED — ACTION REQUIRED
                </div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 12, color: C.inkMid, marginBottom: 8 }}>
                  {lastBlockedEvent.reason || "Preflight checks failed. Fix the items below, then regenerate pack."}
                </div>
                {(lastBlockedEvent.errors?.length ?? 0) > 0 && (
                  <ul style={{ margin: "0 0 10px 18px", padding: 0, color: C.inkMid, fontSize: 12 }}>
                    {lastBlockedEvent.errors.slice(0, 4).map((err: string, i: number) => (
                      <li key={i} style={{ marginBottom: 3, fontFamily: "'Fraunces', serif" }}>{err}</li>
                    ))}
                  </ul>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={() => setTab(lastBlockedEvent.suggestedTab || "FIELDS")}
                    style={{
                      padding: "7px 10px",
                      border: `1px solid ${C.critBorder}`,
                      borderRadius: 3,
                      background: "transparent",
                      color: C.critBorder,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 10,
                      cursor: "pointer",
                    }}
                  >
                    Go to {lastBlockedEvent.suggestedTab || "FIELDS"}
                  </button>
                  <button
                    onClick={() => setTab("WORKSHEET")}
                    style={{
                      padding: "7px 10px",
                      border: `1px solid ${C.paperBorder}`,
                      borderRadius: 3,
                      background: C.paper,
                      color: C.inkMid,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 10,
                      cursor: "pointer",
                    }}
                  >
                    Review worksheet totals
                  </button>
                </div>
              </div>
            )}

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
            {wsDerived.hasInputs && !wsDerived.complete && (
              <div style={{
                marginBottom: 12,
                padding: "8px 12px",
                borderRadius: 3,
                border: `1px solid ${C.warnBorder}`,
                background: C.warn,
                fontFamily: "'Fraunces', serif",
                fontStyle: "italic",
                fontSize: 12,
                color: C.warnText,
              }}>
                Worksheet is calculating — computed totals are being derived from inputs.
              </div>
            )}
            {[
              ["INVOICE VALUE (FOREIGN)", ws.invoice_value_foreign ?? ""],
              ["EXCHANGE RATE",           ws.exchange_rate          ?? ""],
              ["FREIGHT (FOREIGN)",       ws.freight_foreign        ?? ""],
              ["INSURANCE (FOREIGN)",     ws.insurance_foreign      ?? ""],
              ["OTHER (FOREIGN)",         ws.other_foreign          ?? ""],
              ["DEDUCTION (FOREIGN)",     ws.deduction_foreign      ?? ""],
              ["CIF (FOREIGN)",           wsDerived.values.cif_foreign],
              ["CIF (TTD)",               wsDerived.values.cif_local],
              ["DUTY RATE %",             ws.duty_rate_pct          ?? ""],
              ["DUTY",                    wsDerived.values.duty],
              ["SURCHARGE RATE %",        ws.surcharge_rate_pct     ?? ""],
              ["SURCHARGE",               wsDerived.values.surcharge],
              ["VAT RATE %",              ws.vat_rate_pct           ?? ""],
              ["VAT",                     wsDerived.values.vat],
              ["TOTAL ASSESSED (TTD)",    wsDerived.values.total_assessed],
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

            <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
              {notesThread.length === 0 ? (
                <div style={{
                  padding: "12px",
                  borderRadius: 3,
                  border: `1px solid ${C.paperBorder}`,
                  background: C.paperAlt,
                  fontFamily: "'Fraunces', serif",
                  fontStyle: "italic",
                  fontSize: 12,
                  color: C.inkLight,
                }}>
                  No notes yet.
                </div>
              ) : notesThread.map((n) => (
                <div key={n.id} style={{
                  padding: "10px 12px",
                  borderRadius: 3,
                  border: `1px solid ${C.paperBorder}`,
                  background: C.paper,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.inkMid }}>{n.author}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.inkLight }}>
                      {new Date(n.at).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 13, color: C.ink }}>{n.text}</div>
                </div>
              ))}
            </div>

            {!isDone && (
              <>
                <textarea
                  value={noteDraft}
                  onChange={e => setNoteDraft(e.target.value)}
                  placeholder="Add a note for review handoff…"
                  style={{
                    width: "100%", minHeight: 110, padding: "10px 12px",
                    fontFamily: "'Fraunces', serif", fontSize: 13, color: C.ink,
                    background: C.paper,
                    border: `1px solid ${C.paperBorder}`, borderRadius: 3, resize: "vertical",
                    marginBottom: 8,
                  }}
                />
                <button
                  onClick={saveNote}
                  disabled={!noteDraft.trim() || !!submitting}
                  style={{
                    padding: "8px 14px",
                    background: noteDraft.trim() ? C.ink : C.paperMid,
                    border: "none",
                    borderRadius: 3,
                    color: "#fff",
                    fontFamily: "'Fraunces', serif",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: noteDraft.trim() ? "pointer" : "not-allowed",
                  }}
                >
                  {submitting === "note" ? "Saving…" : "Save Note"}
                </button>
              </>
            )}
          </div>
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
              {!canApprove && (
                <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: C.warnText }}>
                  Complete worksheet totals before approval.
                </div>
              )}
              <button onClick={() => action("approved")} disabled={!!submitting || !canApprove}
                style={{
                  padding: "9px 24px",
                  background: canApprove ? C.approved : C.paperMid,
                  border: "none",
                  borderRadius: 3,
                  color: "#fff",
                  fontFamily: "'Fraunces', serif",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: canApprove ? "pointer" : "not-allowed",
                  marginLeft: "auto",
                }}>
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

          {/* Approved → Generate Pack + Submit */}
          {isApproved && (
            <>
              <button
                onClick={handleGeneratePack}
                disabled={generatingPack || !!submitting}
                style={{
                  padding: "9px 16px",
                  background: "transparent",
                  border: `1px solid ${C.approved}`,
                  borderRadius: 3,
                  color: C.approved,
                  fontFamily: "'Fraunces', serif",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {generatingPack ? "Generating…" : "Generate Pack"}
              </button>
              <button onClick={() => action("submitted")} disabled={!!submitting || generatingPack}
                style={{ padding: "9px 24px", background: C.submitted, border: "none", borderRadius: 3, color: "#fff", fontFamily: "'Fraunces', serif", fontSize: 13, fontWeight: 700, cursor: "pointer", marginLeft: "auto" }}>
                {submitting === "submitted" ? "Submitting…" : "Mark Submitted →"}
              </button>
            </>
          )}

          {/* Submitted → allow regenerate + receipt cue */}
          {isSubmitted && (
            <>
              <button
                onClick={handleGeneratePack}
                disabled={generatingPack || !!submitting}
                style={{
                  padding: "9px 16px",
                  background: "transparent",
                  border: `1px solid ${C.submitted}`,
                  borderRadius: 3,
                  color: C.submitted,
                  fontFamily: "'Fraunces', serif",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {generatingPack ? "Generating…" : "Regenerate Pack"}
              </button>
              <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: C.inkLight }}>
                Switch to Fields tab to enter the Customs receipt number
              </div>
            </>
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("stallion.review.sidebarCollapsed") === "1";
    } catch {
      return false;
    }
  });
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    try {
      return localStorage.getItem("stallion.review.onboardingHidden") !== "1";
    } catch {
      return true;
    }
  });

  const [searchParams] = useSearchParams();
  const urlId = searchParams.get("id");

  useEffect(() => { if (urlId && batch.length > 0 && !activeId) { setActiveId(urlId); } }, [batch, urlId, activeId]);

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

  useEffect(() => {
    try {
      localStorage.setItem("stallion.review.sidebarCollapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem("stallion.review.onboardingHidden", showOnboarding ? "0" : "1");
    } catch {
      // ignore
    }
  }, [showOnboarding]);

  useEffect(() => {
    if (activeId) setShowOnboarding(false);
  }, [activeId]);

  const sortedBatch = useMemo(() => {
    const confidenceRank = (d: ReviewDecl) => (typeof d.confidence === "number" ? d.confidence : 101);
    return [...batch].sort((a, b) => {
      const aPending = ["pending", "pending_review"].includes(a.status) ? 0 : 1;
      const bPending = ["pending", "pending_review"].includes(b.status) ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      const conf = confidenceRank(a) - confidenceRank(b);
      if (conf !== 0) return conf;
      const at = (x: any) => new Date(x?.updated_at || x?.reviewedAt || x?.reviewed_at || 0).getTime();
      return at(a) - at(b);
    });
  }, [batch]);

  const activeIdx = sortedBatch.findIndex(d => d.id === activeId);
  const active    = sortedBatch[activeIdx] ?? null;

  const reviewed  = sortedBatch.filter(d =>
    !["pending", "pending_review", "draft"].includes(d.status)
  ).length;
  const progress  = sortedBatch.length ? Math.round(reviewed / sortedBatch.length * 100) : 0;

  const handleStatusChange = async (
    id: string,
    status: string,
    notes: string,
    updated: any,
    options?: { stayOnCurrent?: boolean }
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
      notesThread:   parseReviewNotes(notes),
      reviewedBy:    "Broker",
      reviewedAt:    new Date().toISOString(),
      receiptNumber: updated?.receipt_number ?? d.receiptNumber,
      header:        updated?.header    ?? d.header,
      worksheet:     updated?.worksheet ?? d.worksheet,
      items:         updated?.items     ?? d.items,
    } : d));

    // Auto-advance to next pending only on real workflow transitions
    const next = sortedBatch.find((d, i) =>
      i > activeIdx && ["pending", "pending_review"].includes(d.status)
    );
    if (!options?.stayOnCurrent && status !== "submitted" && status !== "receipted") {
      setActiveId(next ? next.id : null);
    }
  };

  const handlePackEvent = (id: string, event: { status: string; at: string; ref?: string; reason?: string; errors?: string[]; warnings?: string[]; suggestedTab?: ReviewTab }) => {
    setBatch((prev) => prev.map((d) => {
      if (d.id !== id) return d;
      const events = [...(d.export_events ?? []), event];
      return {
        ...d,
        export_events: events,
        last_export: event,
      };
    }));
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!activeId) return;
      if (e.key === "ArrowRight" && activeIdx < sortedBatch.length - 1)
        setActiveId(sortedBatch[activeIdx + 1].id);
      if (e.key === "ArrowLeft" && activeIdx > 0)
        setActiveId(sortedBatch[activeIdx - 1].id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeId, activeIdx, sortedBatch]);

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
            <button
              onClick={() => setSidebarCollapsed((v) => !v)}
              style={{
                padding: "4px 10px",
                borderRadius: 3,
                border: "1px solid #2E3748",
                background: "transparent",
                color: "#A0AABB",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                cursor: "pointer",
                letterSpacing: "0.08em",
              }}
            >
              {sidebarCollapsed ? "SHOW QUEUE" : "HIDE QUEUE"}
            </button>
            <div style={{ width: 100, height: 2, background: "#2E3748", borderRadius: 1 }}>
              <div style={{ height: "100%", borderRadius: 1, width: `${progress}%`, background: "#1A5E3A", transition: "width 0.4s" }} />
            </div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#A0AABB" }}>
              {reviewed}/{sortedBatch.length}
            </span>
          </div>
        } />

        {/* Body — split layout */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
          {/* Left: batch list (collapsible) */}
          {!sidebarCollapsed && (
            <div style={{ width: 280, borderRight: `1px solid ${C.voidBorder}`, display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>
              <BatchList batch={sortedBatch} onSelect={setActiveId} loading={loading} />
            </div>
          )}

          {/* Right: review panel or empty state */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>
            {sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                style={{
                  position: "absolute",
                  top: 10,
                  left: 10,
                  zIndex: 5,
                  padding: "4px 10px",
                  borderRadius: 3,
                  border: `1px solid ${C.paperBorder}`,
                  background: C.paper,
                  color: C.inkLight,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  cursor: "pointer",
                }}
              >
                ← Queue
              </button>
            )}
            {active ? (
              <ReviewPanel
                key={active.id}
                decl={active}
                onStatusChange={handleStatusChange}
                onPackEvent={handlePackEvent}
                onBack={() => setActiveId(null)}
                idx={activeIdx}
                total={sortedBatch.length}
              />
            ) : (
              <div style={{ flex: 1, overflow: "auto", background: C.paper, padding: 32 }}>
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 36, color: C.paperMid, marginBottom: 16 }}>▤</div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 16, color: C.inkMid, fontWeight: 600, marginBottom: 8 }}>
                    Select a declaration
                  </div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: C.inkLight }}>
                    Choose from the queue on the left to begin review
                  </div>
                </div>

                {!showOnboarding ? (
                  <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
                    <button
                      onClick={() => setShowOnboarding(true)}
                      style={{
                        padding: "8px 12px",
                        border: `1px solid ${C.paperBorder}`,
                        borderRadius: 3,
                        background: C.paper,
                        color: C.inkLight,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 10,
                        letterSpacing: "0.08em",
                        cursor: "pointer",
                      }}
                    >
                      SHOW REVIEW GUIDE
                    </button>
                  </div>
                ) : (
                  <div style={{ maxWidth: 560, margin: "0 auto" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                      <button
                        onClick={() => setShowOnboarding(false)}
                        style={{
                          padding: "6px 10px",
                          border: `1px solid ${C.paperBorder}`,
                          borderRadius: 3,
                          background: C.paper,
                          color: C.inkLight,
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 10,
                          letterSpacing: "0.08em",
                          cursor: "pointer",
                        }}
                      >
                        HIDE GUIDE
                      </button>
                    </div>
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

                      <HelpTip>Declarations extracted by AI show a confidence score. Queue is sorted with lowest confidence first inside pending items.</HelpTip>
                    </HelpBox>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
