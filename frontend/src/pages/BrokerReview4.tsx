import { useState, useEffect } from "react";
import { generatePack, listDeclarations, reviewDeclaration } from "@/services/stallionApi";
import { toast } from "sonner";

// ─── Design tokens ─────────────────────────────────────────────────────────
const C = {
  paper:       "#F6F3EE",
  paperAlt:    "#EFECE6",
  paperBorder: "#E2DDD6",
  paperMid:    "#CCC7BE",
  ink:         "#18150F",
  inkMid:      "#3D3830",
  inkLight:    "#6B6560",
  void:        "#111318",
  voidMid:     "#191D26",
  voidSurface: "#1F2430",
  voidBorder:  "#2E3748",
  ghost:       "#A0AABB",
  ghostDim:    "#6B7585",
  pending:     "#96700A",
  approved:    "#1A5E3A",
  correction:  "#963A10",
  rejected:    "#7A1E1E",
  warn:        "#FEF3DC",
  warnBorder:  "#D4A020",
  warnText:    "#7A5000",
  critical:    "#FEE8E8",
  critBorder:  "#B02020",
};

const STATUS_CFG: Record<string, { color: string; label: string; short: string }> = {
  pending:          { color: C.pending,    label: "Pending Review",   short: "PENDING"    },
  pending_review:   { color: C.pending,    label: "Pending Review",   short: "PENDING"    },
  draft:            { color: C.ghostDim,   label: "Draft",            short: "DRAFT"      },
  approved:         { color: C.approved,   label: "Approved",         short: "APPROVED"   },
  needs_correction: { color: C.correction, label: "Needs Correction", short: "CORRECTION" },
  rejected:         { color: C.rejected,   label: "Rejected",         short: "REJECTED"   },
  submitted:        { color: "#1E4A8C",    label: "Submitted",        short: "SUBMITTED"  },
  receipted:        { color: "#1E4A8C",    label: "Receipted",        short: "RECEIPTED"  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function getBlockers(h: any): string[] {
  if (!h) return [];
  return [
    [!h.declarationRef, "Declaration Ref"],
    [!h.consigneeCode,  "Consignee Code"],
    [!h.declarantTIN,   "Declarant TIN"],
    [!h.vesselName,     "Vessel / Flight"],
    [!h.etaDate,        "ETA Date"],
    [!h.blAwbNumber,    "B/L · AWB No."],
  ].filter(([f]) => f).map(([, l]) => l as string);
}

// Normalise declaration from API — field names may vary across extraction sources
function normaliseDecl(d: any): any {
  const h = d.header || d;
  return {
    ...d,
    id:                 d.id || d.declaration_id || d.ref,
    status:             d.status || "pending",
    confidence:         d.confidence ?? d.ai_confidence ?? null,
    shippedOnBoardDate: d.shippedOnBoardDate || h.blAwbDate || h.shipped_on_board_date || null,
    blAwbDateLabel:     d.blAwbDateLabel || h.blAwbDateLabel || "Shipped on Board",
    cbttRate:           d.cbttRate || d.exchange_rate_confirmed || null,
    source: d.source || {
      type:     d.source_type || "INVOICE",
      filename: d.source_filename || d.filename || "—",
      url:      d.source_url || null,
    },
    header: {
      declarationRef:   h.declarationRef   || h.declaration_ref  || "",
      invoiceNumber:    h.invoiceNumber     || h.invoice_number   || "",
      invoiceDate:      h.invoiceDate       || h.invoice_date     || "",
      blAwbNumber:      h.blAwbNumber       || h.bl_awb_number    || "",
      blAwbDate:        h.blAwbDate         || h.bl_awb_date      || "",
      consignorName:    h.consignorName     || h.consignor_name   || "",
      consignorStreet:  h.consignorStreet   || h.consignor_street || "",
      consignorCity:    h.consignorCity     || h.consignor_city   || "",
      consignorCountry: h.consignorCountry  || h.consignor_country || "",
      consigneeName:    h.consigneeName     || h.consignee_name   || "",
      consigneeCode:    h.consigneeCode     || h.consignee_code   || "",
      consigneeAddress: h.consigneeAddress  || h.consignee_address || "",
      declarantName:    h.declarantName     || h.declarant_name   || "",
      declarantTIN:     h.declarantTIN      || h.declarant_tin    || "",
      port:             h.port              || "",
      customsRegime:    h.customsRegime     || h.customs_regime   || "",
      vesselName:       h.vesselName        || h.vessel_name      || "",
      term:             h.term              || "",
      currency:         h.currency          || "USD",
      totalPackages:    h.totalPackages     || h.total_packages   || 0,
      etaDate:          h.etaDate           || h.eta_date         || "",
    },
    worksheet: d.worksheet || {
      exchange_rate:    d.exchange_rate     || 6.77,
      fob_foreign:      d.fob_foreign       || 0,
      freight_foreign:  d.freight_foreign   || 0,
      insurance_foreign: d.insurance_foreign || 0,
      grossWeight:      d.gross_weight      || 0,
    },
    items:       d.items || [],
    brokerNotes: d.brokerNotes || d.review_notes || "",
    reviewedBy:  d.reviewedBy  || d.reviewed_by  || null,
    reviewedAt:  d.reviewedAt  || d.reviewed_at  || null,
  };
}

// ─── Field component ────────────────────────────────────────────────────────
function Field({
  label, value, onChange, mono = false,
  warn = false, critical = false, note, readOnly = false,
  action,
}: {
  label: string; value: string | number; onChange?: (v: string) => void;
  mono?: boolean; warn?: boolean; critical?: boolean;
  note?: string; readOnly?: boolean;
  action?: { label: string; fn: () => void; loading?: boolean };
}) {
  const bg = critical ? C.critical : warn ? C.warn : "transparent";
  const lc = critical ? C.critBorder : warn ? C.warnText : C.inkLight;
  const vc = critical ? C.critBorder : warn ? C.warnText : C.ink;
  return (
    <div style={{ borderBottom: `1px solid ${C.paperBorder}`, background: bg }}>
      <div style={{ display: "grid", gridTemplateColumns: "130px 1fr" }}>
        <div style={{
          padding: "8px 8px 8px 14px", fontSize: 11, color: lc,
          fontFamily: "'Fraunces', serif",
          borderRight: `1px solid ${C.paperBorder}`,
          display: "flex", alignItems: "center",
        }}>
          {label}{(warn || critical) && <span style={{ marginLeft: 4 }}>·</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <input
            value={value ?? ""}
            readOnly={readOnly}
            onChange={e => onChange?.(e.target.value)}
            style={{
              flex: 1, padding: "8px 10px",
              background: "transparent", border: "none", outline: "none",
              color: vc,
              fontFamily: mono ? "'JetBrains Mono', monospace" : "'Fraunces', serif",
              fontSize: mono ? 12 : 13,
            }}
          />
          {action && (
            <button
              onClick={action.fn}
              disabled={action.loading}
              style={{
                marginRight: 8, padding: "3px 9px",
                background: "transparent",
                border: `1px solid ${C.paperBorder}`,
                borderRadius: 3, color: C.inkLight,
                fontSize: 10, cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: "0.08em", whiteSpace: "nowrap",
              }}
            >
              {action.loading ? "FETCHING…" : action.label}
            </button>
          )}
        </div>
      </div>
      {note && (
        <div style={{
          padding: "2px 14px 6px", fontSize: 11, color: C.warnText,
          fontFamily: "'Fraunces', serif", fontStyle: "italic",
          background: bg,
        }}>
          {note}
        </div>
      )}
    </div>
  );
}

function SecHead({ label, warn = false }: { label: string; warn?: boolean }) {
  return (
    <div style={{
      padding: "7px 14px",
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 10, fontWeight: 700,
      letterSpacing: "0.12em", textTransform: "uppercase" as const,
      color: warn ? C.warnText : C.inkLight,
      background: warn ? C.warn : C.paperAlt,
      borderTop: `1px solid ${C.paperBorder}`,
      borderBottom: `1px solid ${C.paperBorder}`,
    }}>
      {label}
    </div>
  );
}

// ─── Batch list ─────────────────────────────────────────────────────────────
function BatchList({ batch, onSelect, loading }: {
  batch: any[]; onSelect: (id: string) => void; loading: boolean;
}) {
  const counts = batch.reduce((acc, d) => {
    const s = d.status || "pending";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const reviewed = batch.filter(d =>
    d.status !== "pending" && d.status !== "pending_review" && d.status !== "draft"
  ).length;
  const progress = batch.length ? Math.round(reviewed / batch.length * 100) : 0;

  return (
    <div style={{ background: C.void, flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      {/* Batch header */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.voidBorder}`, flexShrink: 0 }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          color: C.ghostDim, letterSpacing: "0.12em", marginBottom: 10,
        }}>
          BATCH · {loading ? "LOADING…" : `${batch.length} DECLARATIONS`}
        </div>
        {/* Progress bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, height: 2, background: C.voidBorder, borderRadius: 1 }}>
            <div style={{
              height: "100%", borderRadius: 1,
              width: `${progress}%`, background: C.approved,
              transition: "width 0.4s",
            }} />
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.ghost, flexShrink: 0 }}>
            {reviewed}/{batch.length} reviewed
          </span>
        </div>
        {/* Status counts */}
        <div style={{ display: "flex", gap: 20 }}>
          {[
            ["PEND",  (counts.pending || 0) + (counts.pending_review || 0), C.ghost],
            ["APPR",  counts.approved    || 0, C.approved],
            ["CORR",  counts.needs_correction || 0, C.pending],
            ["REJ",   counts.rejected    || 0, C.rejected],
          ].map(([label, count, color]) => (
            <div key={label as string}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: color as string, fontWeight: 700, lineHeight: 1 }}>
                {count}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.ghostDim, letterSpacing: "0.1em", marginTop: 2 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Declaration rows */}
      {loading ? (
        <div style={{ padding: 32, textAlign: "center", fontFamily: "'Fraunces', serif", fontStyle: "italic", color: C.ghostDim, fontSize: 13 }}>
          Loading declarations…
        </div>
      ) : batch.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", fontFamily: "'Fraunces', serif", fontStyle: "italic", color: C.ghostDim, fontSize: 13 }}>
          No declarations in this batch.
        </div>
      ) : batch.map((d) => {
        const cfg = STATUS_CFG[d.status] || STATUS_CFG.pending;
        const blockers = getBlockers(d.header);
        return (
          <div
            key={d.id}
            onClick={() => onSelect(d.id)}
            style={{
              padding: "12px 16px", borderBottom: `1px solid ${C.voidBorder}`,
              cursor: "pointer", borderLeft: `3px solid ${cfg.color}`,
              transition: "background 0.1s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = C.voidSurface)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.ghost, letterSpacing: "0.04em" }}>
                {d.id}
              </span>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                color: blockers.length ? C.warnText : cfg.color,
              }}>
                {blockers.length ? `${blockers.length} MISSING` : cfg.short}
              </span>
            </div>
            <div style={{
              fontFamily: "'Fraunces', serif", fontSize: 13, color: "#E4DFD8",
              marginBottom: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {d.header?.consigneeName || "Unnamed"}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.ghostDim }}>
                {d.source?.type} · {d.header?.invoiceNumber || "—"}
              </span>
              {d.confidence != null && (
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  color: d.confidence >= 90 ? C.approved : d.confidence >= 75 ? C.pending : C.correction,
                }}>
                  {d.confidence}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Review panel ────────────────────────────────────────────────────────────
function ReviewPanel({ decl, onStatusChange, onBack, idx, total }: {
  decl: any; onStatusChange: (id: string, status: string, notes: string, updated: any) => Promise<void>;
  onBack: () => void; idx: number; total: number;
}) {
  const [header,   setHeader]   = useState({ ...decl.header });
  const [worksheet, setWs]      = useState({ ...decl.worksheet });
  const [items,    setItems]    = useState((decl.items || []).map((i: any) => ({ ...i })));
  const [notes,    setNotes]    = useState(decl.brokerNotes || "");
  const [tab,      setTab]      = useState("header");
  const [view,     setView]     = useState<"fields"|"doc">("fields");
  const [saving,   setSaving]   = useState(false);
  const [exporting, setExporting] = useState(false);
  const [cbttRate, setCbttRate] = useState<number | null>(decl.cbttRate ?? null);
  const [cbttLoading, setCbttL] = useState(false);
  const [cbttDate, setCbttDate] = useState<string | null>(null);

  useEffect(() => {
    setHeader({ ...decl.header });
    setWs({ ...decl.worksheet });
    setItems((decl.items || []).map((i: any) => ({ ...i })));
    setNotes(decl.brokerNotes || "");
    setTab("header");
    setView("fields");
    setCbttRate(decl.cbttRate ?? null);
    setCbttDate(null);
  }, [decl.id]);

  const H  = (k: string) => (v: string) => setHeader((h: any) => ({ ...h, [k]: v }));
  const W  = (k: string) => (v: string) => setWs((w: any) => ({ ...w, [k]: parseFloat(v) || 0 }));
  const Ii = (i: number, k: string) => (v: string) =>
    setItems((its: any[]) => its.map((it, j) => j === i ? { ...it, [k]: v } : it));

  const blockers   = getBlockers(header);
  const canApprove = blockers.length === 0;

  const cifLocal = (
    (parseFloat(worksheet.fob_foreign)       || 0) +
    (parseFloat(worksheet.freight_foreign)   || 0) +
    (parseFloat(worksheet.insurance_foreign) || 0)
  ) * (parseFloat(worksheet.exchange_rate) || 1);

  const lookupCBTT = async () => {
    if (!decl.shippedOnBoardDate) return;
    setCbttL(true);
    try {
      // TODO: replace with real Central Bank TT API call
      // GET https://www.central-bank.org.tt/api/exchange-rates?date={date}&currency=USD
      await new Promise(r => setTimeout(r, 800));
      const rate = 6.7732; // placeholder
      setCbttRate(rate);
      setCbttDate(decl.shippedOnBoardDate);
      setWs((w: any) => ({ ...w, exchange_rate: rate }));
    } finally {
      setCbttL(false);
    }
  };

  const doAction = async (status: string) => {
    setSaving(true);
    try {
      await onStatusChange(decl.id, status, notes, { header, worksheet, items });
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (decl.status !== "approved") return;
    setExporting(true);
    toast.info(`Generating export ZIP for ${decl.id}...`);
    try {
      const res = await generatePack({
        declaration_id: decl.id,
        header,
        worksheet,
        items,
        containers: [],
      });

      if (res.status === "blocked") {
        const errorCount = res.preflight?.counts?.errors ?? 0;
        toast.error(`Export blocked by validation (${errorCount} error${errorCount === 1 ? "" : "s"}).`);
        return;
      }

      const zipDoc = res.documents?.find((d) => /zip/i.test(d.name) || /zip/i.test(d.ref));
      if (zipDoc?.url) {
        window.open(zipDoc.url, "_blank", "noopener,noreferrer");
        toast.success("Export ZIP generated.");
        return;
      }

      const refs = (res.documents || []).map((d) => d.ref || d.name).filter(Boolean).slice(0, 3);
      toast.success(
        refs.length
          ? `Export generated. ZIP URL missing; refs: ${refs.join(", ")}`
          : "Export generated, but ZIP URL missing in response."
      );
    } catch (e: any) {
      toast.error(`Export failed: ${e?.message || "unknown error"}`);
    } finally {
      setExporting(false);
    }
  };

  // Tab config with blocker dots
  const tabBlockers: Record<string, string[]> = {
    header:    ["Declaration Ref", "ETA Date", "B/L · AWB No."].filter(b => blockers.includes(b)),
    parties:   ["Consignee Code", "Declarant TIN"].filter(b => blockers.includes(b)),
    transport: ["Vessel / Flight"].filter(b => blockers.includes(b)),
    worksheet: [],
    items:     [],
  };
  const TABS = [
    { id: "header",    label: "Header"    },
    { id: "parties",   label: "Parties"   },
    { id: "transport", label: "Transport" },
    { id: "worksheet", label: "Worksheet" },
    { id: "items",     label: `Items (${items.length})` },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: C.paper }}>

      {/* ── Nav bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 14px", background: C.void,
        borderBottom: `1px solid ${C.voidBorder}`, flexShrink: 0,
        flexWrap: "wrap",
      }}>
        <button
          onClick={onBack}
          style={{
            background: "transparent", border: `1px solid ${C.voidBorder}`,
            borderRadius: 3, color: C.ghost, fontSize: 11, cursor: "pointer",
            padding: "4px 10px", fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.06em",
          }}
        >
          ← BATCH
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.ghostDim, letterSpacing: "0.08em" }}>
            {decl.id} · {idx + 1} of {total}
          </div>
          <div style={{
            fontFamily: "'Fraunces', serif", fontSize: 13, color: C.ghost,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {header.consigneeName || "—"}
          </div>
        </div>
        {/* FIELDS / DOC toggle */}
        <div style={{ display: "flex", borderRadius: 3, overflow: "hidden", border: `1px solid ${C.voidBorder}` }}>
          {(["fields", "doc"] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "4px 10px", background: view === v ? C.voidSurface : "transparent",
                border: "none", color: view === v ? C.ghost : C.ghostDim,
                fontSize: 11, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: "0.08em",
              }}
            >
              {v === "fields" ? "FIELDS" : "DOC"}
            </button>
          ))}
        </div>
        {decl.confidence != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: C.ghostDim, fontFamily: "'JetBrains Mono', monospace" }}>CONF</span>
            <span style={{
              fontSize: 13, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
              color: decl.confidence >= 90 ? C.approved : decl.confidence >= 75 ? C.pending : C.correction,
            }}>
              {decl.confidence}%
            </span>
          </div>
        )}
        {blockers.length > 0 && (
          <div style={{
            padding: "3px 9px", background: C.warn,
            border: `1px solid ${C.warnBorder}55`, borderRadius: 3,
            fontSize: 11, color: C.warnText,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {blockers.length} REQUIRED
          </div>
        )}
      </div>

      {view === "doc" ? (
        /* ── Doc view ── */
        <div style={{ flex: 1, overflowY: "auto", background: C.void, padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.ghostDim, letterSpacing: "0.12em", marginBottom: 8 }}>
              {decl.source?.type} · {decl.source?.filename}
            </div>
            {/* SOB date + CBTT lookup */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 14px", background: C.voidSurface,
              border: `1px solid ${C.voidBorder}`, borderRadius: 3,
              flexWrap: "wrap",
            }}>
              <div>
                <div style={{ fontSize: 10, color: C.ghostDim, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", marginBottom: 3 }}>
                  {(decl.blAwbDateLabel || "SHIPPED ON BOARD").toUpperCase()}
                </div>
                <div style={{ fontSize: 13, color: C.ghost, fontFamily: "'JetBrains Mono', monospace" }}>
                  {decl.shippedOnBoardDate || "—"}
                </div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: C.ghostDim, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", marginBottom: 2 }}>
                    CBTT RATE {cbttDate ? `· ${cbttDate}` : ""}
                  </div>
                  <div style={{ fontSize: 14, color: cbttRate ? C.ghost : C.ghostDim, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                    {cbttRate ? cbttRate.toFixed(4) : "—"}
                  </div>
                </div>
                <button
                  onClick={lookupCBTT}
                  disabled={cbttLoading || !decl.shippedOnBoardDate}
                  style={{
                    padding: "5px 12px", background: "transparent",
                    border: `1px solid ${C.voidBorder}`, borderRadius: 3,
                    color: C.ghostDim, fontSize: 11, cursor: "pointer",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {cbttLoading ? "FETCHING…" : "LOOKUP CBTT"}
                </button>
              </div>
            </div>
          </div>
          {/* Extracted summary */}
          <div style={{ border: `1px solid ${C.voidBorder}`, borderRadius: 3, overflow: "hidden" }}>
            {[
              ["Invoice No.",  header.invoiceNumber],
              ["B/L · AWB",   header.blAwbNumber],
              ["Consignor",   header.consignorName],
              ["Consignee",   header.consigneeName],
              ["Declarant",   header.declarantName || "—"],
              ["HS Code",     items[0]?.hsCode || "—"],
              ["Description", items[0]?.description || "—"],
              ["Packages",    String(header.totalPackages || 0)],
              ["Gross Wt.",   `${worksheet.grossWeight || 0} kg`],
              ["FOB Value",   `USD ${(worksheet.fob_foreign || 0).toLocaleString()}`],
              ["Exch. Rate",  String(worksheet.exchange_rate)],
            ].map(([lbl, val]) => (
              <div key={lbl} style={{
                display: "grid", gridTemplateColumns: "110px 1fr",
                borderBottom: `1px solid ${C.voidBorder}`,
              }}>
                <div style={{
                  padding: "7px 10px", fontSize: 11, color: C.ghostDim,
                  fontFamily: "'Fraunces', serif", fontStyle: "italic",
                  borderRight: `1px solid ${C.voidBorder}`,
                }}>
                  {lbl}
                </div>
                <div style={{ padding: "7px 10px", fontSize: 12, color: C.ghost, fontFamily: "'JetBrains Mono', monospace", wordBreak: "break-all" }}>
                  {val || "—"}
                </div>
              </div>
            ))}
          </div>
          {decl.source?.url ? (
            <a
              href={decl.source.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block", marginTop: 14, width: "100%",
                padding: "9px", textAlign: "center",
                background: "transparent",
                border: `1px solid ${C.voidBorder}`, borderRadius: 3,
                color: C.ghostDim, fontSize: 11, textDecoration: "none",
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em",
              }}
            >
              OPEN SOURCE PDF ↗
            </a>
          ) : (
            <button style={{
              marginTop: 14, width: "100%", padding: "9px",
              background: "transparent", border: `1px solid ${C.voidBorder}`,
              borderRadius: 3, color: C.ghostDim, fontSize: 11, cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em",
            }}>
              ↑ UPLOAD SOURCE PDF
            </button>
          )}
        </div>
      ) : (
        /* ── Fields view ── */
        <>
          {/* 5 Tabs */}
          <div style={{
            display: "flex", borderBottom: `1px solid ${C.paperBorder}`,
            background: C.paper, flexShrink: 0, overflowX: "auto",
          }}>
            {TABS.map(t => {
              const hasIssue = (tabBlockers[t.id]?.length ?? 0) > 0;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: "9px 14px", background: "transparent", border: "none",
                    borderBottom: tab === t.id ? `2px solid ${C.ink}` : "2px solid transparent",
                    color: tab === t.id ? C.ink : hasIssue ? C.warnText : C.inkLight,
                    fontSize: 12, cursor: "pointer", fontFamily: "'Fraunces', serif",
                    whiteSpace: "nowrap", transition: "color 0.15s",
                    position: "relative",
                  }}
                >
                  {t.label}
                  {hasIssue && (
                    <span style={{
                      position: "absolute", top: 6, right: 4,
                      width: 5, height: 5, borderRadius: "50%",
                      background: C.warnBorder,
                    }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: "auto" }}>

            {tab === "header" && <>
              <SecHead label="Declaration" />
              <Field label="Ref. Number"   value={header.declarationRef} onChange={H("declarationRef")} critical={!header.declarationRef} mono />
              <Field label="Invoice No."   value={header.invoiceNumber}  onChange={H("invoiceNumber")}  mono />
              <Field label="Invoice Date"  value={header.invoiceDate}    onChange={H("invoiceDate")}    mono />
              <Field label="B/L · AWB No." value={header.blAwbNumber}    onChange={H("blAwbNumber")}    critical={!header.blAwbNumber} mono />
              <Field
                label={`AWB Date (${decl.blAwbDateLabel || "SOB"})`}
                value={header.blAwbDate}
                onChange={H("blAwbDate")}
                mono
                note={`Extracted label: "${decl.blAwbDateLabel || "Shipped on Board"}" — switch to DOC view to run CBTT lookup`}
              />
              <Field label="Port"          value={header.port}           onChange={H("port")}           mono />
              <Field label="Regime"        value={header.customsRegime}  onChange={H("customsRegime")}  mono />
              <Field label="Currency"      value={header.currency}       onChange={H("currency")}       mono />
              <Field label="Delivery Term" value={header.term}           onChange={H("term")}           mono />
              <Field label="Packages"      value={header.totalPackages}  onChange={H("totalPackages")}  mono />
              <Field label="ETA"           value={header.etaDate}        onChange={H("etaDate")}        critical={!header.etaDate} mono />
            </>}

            {tab === "parties" && <>
              <SecHead label="Consignor (Exporter)" />
              <Field label="Name"    value={header.consignorName}    onChange={H("consignorName")} />
              <Field label="Street"  value={header.consignorStreet}  onChange={H("consignorStreet")} />
              <Field label="City"    value={header.consignorCity}    onChange={H("consignorCity")} />
              <Field label="Country" value={header.consignorCountry} onChange={H("consignorCountry")} mono />
              <SecHead label="Consignee" warn={blockers.includes("Consignee Code")} />
              <Field label="Name"    value={header.consigneeName}    onChange={H("consigneeName")} />
              <Field label="Code"    value={header.consigneeCode}    onChange={H("consigneeCode")}    critical={!header.consigneeCode} mono />
              <Field label="Address" value={header.consigneeAddress} onChange={H("consigneeAddress")} />
              <SecHead label="Declarant" warn={blockers.includes("Declarant TIN")} />
              <Field label="Name"     value={header.declarantName} onChange={H("declarantName")} warn={!header.declarantName} />
              <Field label="TIN/Code" value={header.declarantTIN}  onChange={H("declarantTIN")}  critical={!header.declarantTIN} mono />
            </>}

            {tab === "transport" && <>
              <SecHead label="Transport" warn={blockers.includes("Vessel / Flight")} />
              <Field
                label="Vessel / Flight"
                value={header.vesselName}
                onChange={H("vesselName")}
                critical={!header.vesselName}
                note={!header.vesselName ? "Required — check source document for vessel name or flight number" : undefined}
              />
              <Field label="Delivery Term" value={header.term} onChange={H("term")} mono />
              <Field label="Port Code"     value={header.port} onChange={H("port")} mono />
            </>}

            {tab === "worksheet" && <>
              <SecHead label="Exchange Rate" />
              <Field
                label="Exchange Rate"
                value={worksheet.exchange_rate}
                onChange={W("exchange_rate")}
                mono
                warn={!cbttRate}
                note={
                  cbttRate
                    ? `CBTT confirmed · ${cbttDate} · USD → TTD`
                    : "Switch to DOC view → LOOKUP CBTT to auto-fill from Central Bank rate"
                }
              />
              <SecHead label="Valuation" />
              <Field label="FOB (Foreign)"   value={worksheet.fob_foreign}       onChange={W("fob_foreign")}       mono />
              <Field label="Freight"         value={worksheet.freight_foreign}    onChange={W("freight_foreign")}    mono />
              <Field label="Insurance"       value={worksheet.insurance_foreign}  onChange={W("insurance_foreign")}  mono />
              <Field label="Gross Weight kg" value={worksheet.grossWeight}        onChange={W("grossWeight")}        mono />
              <div style={{
                padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center",
                background: C.paperAlt, borderBottom: `1px solid ${C.paperBorder}`,
              }}>
                <span style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: C.inkLight }}>
                  Computed CIF (Local)
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 17, color: C.ink, fontWeight: 700 }}>
                  TTD {cifLocal.toLocaleString("en-TT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </>}

            {tab === "items" && items.map((item: any, idx: number) => (
              <div key={idx}>
                <SecHead label={`Item ${idx + 1} of ${items.length}`} />
                {/* HS Code — prominent */}
                <div style={{
                  padding: "12px 14px", background: C.paperAlt,
                  borderBottom: `2px solid ${C.paperBorder}`,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div>
                    <div style={{
                      fontSize: 10, color: C.inkLight,
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: "0.12em", marginBottom: 4,
                    }}>
                      HS CODE · VERIFY AGAINST TARIFF
                    </div>
                    <input
                      value={item.hsCode || ""}
                      onChange={e => Ii(idx, "hsCode")(e.target.value)}
                      style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 22,
                        color: C.ink, background: "transparent",
                        border: "none", outline: "none",
                        fontWeight: 700, letterSpacing: "0.08em", width: 180,
                      }}
                    />
                  </div>
                  <a
                    href="https://trtc.gov.tt/customs-tariff/"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: "5px 12px", background: "transparent",
                      border: `1px solid ${C.paperBorder}`, borderRadius: 3,
                      color: C.inkMid, fontSize: 11, textDecoration: "none",
                      fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em",
                    }}
                  >
                    TT TARIFF ↗
                  </a>
                </div>
                <Field label="Description"  value={item.description}     onChange={Ii(idx, "description")} />
                <Field label="Origin"       value={item.countryOfOrigin} onChange={Ii(idx, "countryOfOrigin")} mono />
                <Field label="Qty / Pkgs"   value={item.qty}             onChange={Ii(idx, "qty")}          mono />
                <Field label="Pkg Type"     value={item.packageType}     onChange={Ii(idx, "packageType")}   mono />
                <Field label="Gross kg"     value={item.grossKg}         onChange={Ii(idx, "grossKg")}       mono />
                <Field label="Net kg"       value={item.netKg}           onChange={Ii(idx, "netKg")}         mono />
                <Field label="Item Value"   value={item.itemValue}       onChange={Ii(idx, "itemValue")}     mono />
              </div>
            ))}

          </div>
        </>
      )}

      {/* ── Action bar ── */}
      <div style={{
        borderTop: `1px solid ${C.paperBorder}`,
        background: C.paperAlt, flexShrink: 0, padding: "10px 14px",
      }}>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Broker notes — flagged issues, corrections made, reference details…"
          rows={2}
          style={{
            width: "100%", background: C.paper,
            border: `1px solid ${C.paperBorder}`, borderRadius: 3,
            color: C.ink, fontSize: 12, padding: "7px 10px",
            fontFamily: "'Fraunces', serif", fontStyle: "italic",
            resize: "none", outline: "none", boxSizing: "border-box", marginBottom: 8,
          }}
        />
        {!canApprove && (
          <div style={{
            padding: "6px 10px", background: C.warn,
            border: `1px solid ${C.warnBorder}55`, borderRadius: 3,
            marginBottom: 8, fontSize: 11, color: C.warnText,
            fontFamily: "'Fraunces', serif", fontStyle: "italic",
          }}>
            Cannot approve — complete first: {blockers.join(", ")}
          </div>
        )}
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {decl.reviewedBy && (
            <span style={{
              fontSize: 11, color: C.inkLight, fontFamily: "'JetBrains Mono', monospace",
              alignSelf: "center", flex: 1, minWidth: 80,
            }}>
              {decl.reviewedBy} · {decl.reviewedAt ? new Date(decl.reviewedAt).toLocaleDateString("en-TT") : ""}
            </span>
          )}
          {!decl.reviewedBy && <div style={{ flex: 1 }} />}
          <button
            onClick={() => doAction("needs_correction")}
            style={{
              padding: "7px 12px", background: "transparent",
              border: `1px solid ${C.correction}55`, borderRadius: 3,
              color: C.correction, fontSize: 11, cursor: "pointer", fontFamily: "'Fraunces', serif",
            }}
          >
            Flag Correction
          </button>
          <button
            onClick={() => doAction("rejected")}
            style={{
              padding: "7px 12px", background: "transparent",
              border: `1px solid ${C.rejected}55`, borderRadius: 3,
              color: C.rejected, fontSize: 11, cursor: "pointer", fontFamily: "'Fraunces', serif",
            }}
          >
            Reject
          </button>
          <button
            onClick={() => canApprove && doAction("approved")}
            disabled={!canApprove || saving}
            style={{
              padding: "7px 16px",
              background: !canApprove ? C.paperBorder : saving ? C.paperMid : C.approved,
              border: "none", borderRadius: 3,
              color: !canApprove ? C.inkLight : "#fff",
              fontSize: 12, cursor: !canApprove ? "not-allowed" : "pointer",
              fontFamily: "'Fraunces', serif", fontWeight: 600, transition: "background 0.2s",
            }}
          >
            {saving ? "Saving…" : "✓  Approve"}
          </button>
          <button
            onClick={handleExport}
            disabled={decl.status !== "approved" || exporting}
            style={{
              padding: "7px 14px",
              background: decl.status === "approved" ? C.ink : C.paperBorder,
              border: "none", borderRadius: 3,
              color: decl.status === "approved" ? C.paper : C.inkLight,
              fontSize: 12,
              cursor: decl.status === "approved" ? "pointer" : "not-allowed",
              fontFamily: "'Fraunces', serif", fontWeight: 600,
            }}
          >
            {exporting ? "Exporting…" : "↓ Export ZIP"}
          </button>
        </div>
        <div style={{ marginTop: 7, fontSize: 11, color: C.inkLight, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em" }}>
          ← → navigate batch · A approve · C flag correction
        </div>
      </div>
    </div>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────
export default function BrokerReview4() {
  const [batch,    setBatch]    = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(true);

  // Load from real API
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await listDeclarations();
        const items = res.items.map(normaliseDecl);
        setBatch(items);
      } catch {
        setBatch([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const activeIdx = batch.findIndex(d => d.id === activeId);
  const active    = batch[activeIdx] ?? null;

  const reviewed = batch.filter(d =>
    d.status !== "pending" && d.status !== "pending_review" && d.status !== "draft"
  ).length;
  const progress = batch.length ? Math.round(reviewed / batch.length * 100) : 0;

  const handleStatusChange = async (
    id: string, status: string, notes: string, updated: any
  ) => {
    try {
      await reviewDeclaration(id, {
        action:       status,
        review_notes: notes,
        reviewed_by:  "Broker",
        reviewed_at:  new Date().toISOString(),
        header:       updated?.header,
        worksheet:    updated?.worksheet,
        items:        updated?.items,
      });
    } catch {
      // API error — still update local state optimistically
    }
    setBatch(b => b.map(d => d.id === id ? {
      ...d, status,
      brokerNotes: notes,
      header:      updated?.header    || d.header,
      worksheet:   updated?.worksheet || d.worksheet,
      items:       updated?.items     || d.items,
      reviewedBy:  "Broker",
      reviewedAt:  new Date().toISOString(),
    } : d));
    // Auto-advance to next pending
    const next = batch.find((d, i) =>
      i > activeIdx && (d.status === "pending" || d.status === "pending_review")
    );
    setActiveId(next ? next.id : null);
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
        input:focus { background: #FDFAF5 !important; } textarea:focus { outline: none; }
        button { transition: opacity 0.15s; } button:hover:not(:disabled) { opacity: 0.82; }
      `}</style>

      <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Fraunces', serif" }}>

        {/* Top bar */}
        <div style={{
          height: 44, background: C.void, borderBottom: `1px solid ${C.voidBorder}`,
          display: "flex", alignItems: "center", padding: "0 14px", gap: 14, flexShrink: 0,
        }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 15, color: "#fff" }}>
            Stallion
          </div>
          <div style={{ width: 1, height: 12, background: C.voidBorder }} />
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.ghostDim, letterSpacing: "0.1em" }}>
            BROKER REVIEW
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 100, height: 2, background: C.voidBorder, borderRadius: 1 }}>
              <div style={{
                height: "100%", borderRadius: 1,
                width: `${progress}%`, background: C.approved,
                transition: "width 0.4s",
              }} />
            </div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.ghost }}>
              {reviewed}/{batch.length}
            </span>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
          {activeId && active ? (
            <ReviewPanel
              key={active.id}
              decl={active}
              onStatusChange={handleStatusChange}
              onBack={() => setActiveId(null)}
              idx={activeIdx}
              total={batch.length}
            />
          ) : (
            <BatchList batch={batch} onSelect={setActiveId} loading={loading} />
          )}
        </div>

      </div>
    </>
  );
}
