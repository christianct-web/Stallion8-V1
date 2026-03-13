import { useNavigate } from "react-router-dom";
import { listDeclarations, downloadRegisterCsv, deleteDeclaration } from "@/services/stallionApi";
import { TopNav } from "@/components/TopNav";
import { HelpBox, HelpTip, HelpHeading } from "@/components/HelpBox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useMemo, useEffect, useCallback } from "react";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";

// ─── Design tokens ──────────────────────────────────────────────────────────
const C = {
  paper: "#F6F3EE", paperAlt: "#EFECE6", paperBorder: "#E2DDD6",
  paperMid: "#CCC7BE", ink: "#18150F", inkMid: "#3D3830", inkLight: "#6B6560",
  void: "#111318", voidMid: "#191D26", voidSurface: "#1F2430",
  voidBorder: "#2E3748", ghost: "#A0AABB", ghostDim: "#6B7585",
  pending: "#96700A", approved: "#1A5E3A", correction: "#963A10",
  rejected: "#7A1E1E", warn: "#FEF3DC", warnBorder: "#D4A020",
  warnText: "#7A5000", critical: "#FEE8E8", critBorder: "#B02020",
};

// Unified status config — covers both backend and localStorage statuses
const STATUS_STYLE: Record<string, { color: string; bg: string; border: string; label: string }> = {
  Draft:            { color: C.ghostDim,    bg: C.voidSurface, border: C.voidBorder,         label: "DRAFT"       },
  draft:            { color: C.ghostDim,    bg: C.voidSurface, border: C.voidBorder,         label: "DRAFT"       },
  Ready:            { color: C.approved,    bg: "#EBF7F1",     border: C.approved + "44",    label: "READY"       },
  Exported:         { color: "#1E4A8C",     bg: "#EEF2FA",     border: "#1E4A8C44",           label: "EXPORTED"    },
  pending_review:   { color: C.pending,     bg: C.warn,        border: C.warnBorder + "44",  label: "PENDING"     },
  pending:          { color: C.pending,     bg: C.warn,        border: C.warnBorder + "44",  label: "PENDING"     },
  approved:         { color: C.approved,    bg: "#EBF7F1",     border: C.approved + "44",    label: "APPROVED"    },
  needs_correction: { color: C.correction,  bg: "#FEF0E8",     border: C.correction + "44",  label: "CORRECTION"  },
  rejected:         { color: C.rejected,    bg: C.critical,    border: C.rejected + "44",    label: "REJECTED"    },
  submitted:        { color: "#1E4A8C",     bg: "#EEF2FA",     border: "#1E4A8C44",           label: "SUBMITTED"   },
  receipted:        { color: "#1E4A8C",     bg: "#EEF2FA",     border: "#1E4A8C44",           label: "RECEIPTED"   },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.draft;
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
      color: s.color, background: s.bg,
      padding: "3px 8px", borderRadius: 3,
      border: `1px solid ${s.border}`,
      display: "inline-block",
    }}>
      {s.label}
    </span>
  );
}

function formatActivityDate(dateString: string) {
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "—";
  if (isToday(d))     return `Today · ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `Yesterday · ${format(d, "HH:mm")}`;
  return format(d, "dd MMM · HH:mm");
}

// Backend is the single source of truth for declarations.
function mergeDeclarations(backend: any[]): any[] {
  return [...backend]
    .map(d => ({ ...d, _source: "backend" }))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

// ─── Action card (urgent) ────────────────────────────────────────────────────
function ActionCard({
  count, label, sub, color, bg, border, onClick,
}: {
  count: number; label: string; sub: string;
  color: string; bg: string; border: string; onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  if (count === 0) return null;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "14px 18px",
        background: hov ? bg : bg + "88",
        border: `1px solid ${border}`,
        borderRadius: 3, cursor: "pointer",
        textAlign: "left" as const,
        transition: "all 0.15s", flex: 1, minWidth: 180,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>
          {count}
        </span>
        <span style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontWeight: 600, color }}>
          {label}
        </span>
      </div>
      <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: color + "bb" }}>
        {sub} →
      </div>
    </button>
  );
}

// ─── Workflow card ────────────────────────────────────────────────────────────
function WorkflowCard({
  title, sub, meta, accent, onClick,
}: {
  title: string; sub: string; meta: string; accent?: boolean; onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  const bg   = accent ? (hov ? C.approved : "#1A5E3A11") : (hov ? C.voidSurface : C.void);
  const bord = accent ? C.approved + "55" : C.voidBorder;
  const titc = accent ? (hov ? "#fff" : C.approved) : (hov ? "#fff" : C.ghost);
  const subc = accent ? C.approved + "99" : C.ghostDim;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "20px 22px", background: bg,
        border: `1px solid ${bord}`, borderRadius: 3,
        cursor: "pointer", textAlign: "left" as const,
        transition: "all 0.18s", flex: 1,
      }}
    >
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 700, color: titc, marginBottom: 5 }}>
        {title}
      </div>
      <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: subc, marginBottom: 12 }}>
        {sub}
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: accent ? C.approved + "88" : C.ghostDim }}>
        {meta}
      </div>
    </button>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function DeclarationsList() {
  const navigate = useNavigate();

  const [backendDeclarations, setBackendDeclarations] = useState<any[]>([]);
  const [loadingBackend, setLoadingBackend] = useState(true);
  const [searchQuery,    setSearchQuery]    = useState("");
  const [deleteId,       setDeleteId]       = useState<string | null>(null);
  const [csvExporting,   setCsvExporting]   = useState(false);

  // ── Fetch backend declarations ─────────────────────────────────────────────
  const fetchBackend = useCallback(async () => {
    try {
      const { items } = await listDeclarations();
      setBackendDeclarations(items);
    } catch {
      // backend unreachable — continue with local only
    } finally {
      setLoadingBackend(false);
    }
  }, []);

  useEffect(() => { fetchBackend(); }, [fetchBackend]);

  // ── Merged + filtered ──────────────────────────────────────────────────────
  const allDeclarations = useMemo(
    () => mergeDeclarations(backendDeclarations),
    [backendDeclarations]
  );

  const sorted = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return allDeclarations.filter(d => {
      if (!q) return true;
      const ref    = (d.reference_number || d.id || "").toLowerCase();
      const name   = (d.header?.consigneeName || "").toLowerCase();
      const status = (d.status || "").toLowerCase();
      return ref.includes(q) || name.includes(q) || status.includes(q);
    });
  }, [allDeclarations, searchQuery]);

  // ── Counts ─────────────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const now = new Date();
    return {
      total:      allDeclarations.length,
      pending:    allDeclarations.filter(d => d.status === "pending_review" || d.status === "pending").length,
      correction: allDeclarations.filter(d => d.status === "needs_correction").length,
      approved:   allDeclarations.filter(d => d.status === "approved").length,
      exported:   allDeclarations.filter(d => d.status === "Exported" || d.status === "submitted").length,
      receipted:  allDeclarations.filter(d => d.status === "receipted").length,
      thisMonth:  allDeclarations.filter(d => {
        const u = new Date(d.updated_at);
        return u.getMonth() === now.getMonth() && u.getFullYear() === now.getFullYear();
      }).length,
    };
  }, [allDeclarations]);

  const hasUrgent = counts.pending > 0 || counts.correction > 0;

  const recentActivity = useMemo(
    () => [...allDeclarations].slice(0, 6),
    [allDeclarations]
  );

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleNew = () => {
    navigate("/stallion/workbench");
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDeclaration(deleteId);
      setBackendDeclarations(prev => prev.filter((d: any) => d.id !== deleteId));
    } catch {
      // silent
    }
    setDeleteId(null);
  };

  const handleCsvExport = async () => {
    setCsvExporting(true);
    try {
      await downloadRegisterCsv(format(new Date(), "yyyy-MM"));
    } catch {
      // silent — downloadRegisterCsv has its own fallback
    } finally {
      setCsvExporting(false);
    }
  };

  const handleRowClick = (d: any) => {
    navigate(`/stallion/brokerreview4?id=${d.id}`);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,600&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        body { background: ${C.paper}; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-thumb { background: #2E3748; border-radius: 3px; }
        .decl-row { transition: background 0.1s; }
        .decl-row:hover { background: ${C.paperAlt} !important; }
        .decl-row:hover .decl-ref { color: ${C.ink} !important; }
        input::placeholder { color: ${C.inkLight}; opacity: 0.6; }
        input:focus { outline: none; border-color: ${C.inkLight} !important; }
      `}</style>

      <div style={{ minHeight: "100vh", background: C.paper, fontFamily: "'Fraunces', serif", color: C.ink }}>

        <TopNav />

        {/* ── Hero ── */}
        <div style={{ background: C.void, borderBottom: `1px solid ${C.voidBorder}`, padding: "28px 32px 24px" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: C.ghostDim, marginBottom: 8 }}>
              DECLARATIONS
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 32, fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1 }}>
                All Declarations
              </h1>
              <div style={{ display: "flex", gap: 28 }}>
                {[
                  ["TOTAL",      counts.total,     C.ghost],
                  ["THIS MONTH", counts.thisMonth,  C.ghost],
                  ["PENDING",    counts.pending,    counts.pending > 0 ? C.pending : C.ghostDim],
                  ["APPROVED",   counts.approved,   C.approved],
                  ["RECEIPTED",  counts.receipted,  "#5580C8"],
                ].map(([label, val, color]) => (
                  <div key={label as string} style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 700, color: color as string, lineHeight: 1 }}>
                      {val}
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: C.ghostDim, letterSpacing: "0.12em", marginTop: 4 }}>
                      {label as string}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 32px 48px" }}>

          {/* Urgent actions */}
          {hasUrgent && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: C.inkLight, marginBottom: 10 }}>
                NEEDS ATTENTION
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <ActionCard count={counts.pending} label="Pending Review" sub="Open broker review queue"
                  color={C.pending} bg={C.warn} border={C.warnBorder + "55"}
                  onClick={() => navigate("/stallion/brokerreview4")} />
                <ActionCard count={counts.correction} label="Need Correction" sub="Declarations flagged by broker"
                  color={C.correction} bg="#FEF0E8" border={C.correction + "44"}
                  onClick={() => navigate("/stallion/brokerreview4")} />
              </div>
            </div>
          )}

          {/* Workflow cards */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: C.inkLight, marginBottom: 10 }}>
              WORKFLOWS
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <WorkflowCard title="Stallion Workbench"
                sub="Create and edit declarations manually or from extracted documents"
                meta="DECLARATION ENTRY · XML GENERATION · WORKSHEET"
                onClick={() => navigate("/stallion/workbench")} />
              <WorkflowCard title="Broker Review"
                sub="Review AI-extracted declarations, verify HS codes, approve for submission"
                meta={`REVIEW QUEUE · ${counts.pending + counts.correction} PENDING`}
                accent onClick={() => navigate("/stallion/brokerreview4")} />
            </div>
          </div>

          {/* Two-column layout */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20, alignItems: "start" }}>

            {/* Declarations table */}
            <div>
              {/* Toolbar */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: C.inkLight }}>
                  DECLARATIONS
                </div>
                <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
                  <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.inkLight, fontSize: 13, pointerEvents: "none" }}>
                    ⌕
                  </span>
                  <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search reference, consignee, status…"
                    style={{
                      width: "100%", padding: "7px 10px 7px 28px",
                      background: C.paper, border: `1px solid ${C.paperBorder}`,
                      borderRadius: 3, color: C.ink, fontSize: 12,
                      fontFamily: "'Fraunces', serif",
                    }} />
                </div>
                {/* Export CSV */}
                <button
                  onClick={handleCsvExport}
                  disabled={csvExporting}
                  style={{
                    padding: "7px 14px", background: "transparent",
                    border: `1px solid ${C.paperBorder}`, borderRadius: 3,
                    color: C.inkLight, fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10, letterSpacing: "0.08em", cursor: "pointer",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = C.inkLight)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.paperBorder)}
                >
                  {csvExporting ? "EXPORTING…" : "↓ REGISTER CSV"}
                </button>
                <button onClick={handleNew} style={{
                  marginLeft: "auto", padding: "7px 18px",
                  background: C.ink, border: "none", borderRadius: 3,
                  color: C.paper, fontFamily: "'Fraunces', serif",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                >
                  + New Declaration
                </button>
              </div>

              {/* Table */}
              {loadingBackend && allDeclarations.length === 0 ? (
                <div style={{ padding: "40px 32px", textAlign: "center", fontFamily: "'Fraunces', serif", fontStyle: "italic", color: C.inkLight, border: `1px solid ${C.paperBorder}`, borderRadius: 3 }}>
                  Loading declarations…
                </div>
              ) : sorted.length === 0 ? (
                <div style={{ padding: "48px 32px", textAlign: "center", border: `1px solid ${C.paperBorder}`, borderRadius: 3, background: C.paper }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 28, color: C.paperMid, marginBottom: 14, lineHeight: 1 }}>▤</div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, color: C.inkMid, fontWeight: 600, marginBottom: 6 }}>
                    {searchQuery ? "No declarations match" : "No declarations yet"}
                  </div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: C.inkLight, marginBottom: 20 }}>
                    {searchQuery ? "Try a different search" : "Create your first declaration or generate a pack from the workbench"}
                  </div>
                  {!searchQuery && (
                    <button onClick={handleNew} style={{ padding: "9px 20px", background: C.ink, border: "none", borderRadius: 3, color: C.paper, fontFamily: "'Fraunces', serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      + New Declaration
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ border: `1px solid ${C.paperBorder}`, borderRadius: 3, overflow: "hidden" }}>
                  {/* Head */}
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 120px 70px 150px 52px", padding: "7px 14px", background: C.paperAlt, borderBottom: `1px solid ${C.paperBorder}` }}>
                    {["Reference", "Status", "Items", "Updated", ""].map((h, i) => (
                      <div key={i} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: C.inkLight, textAlign: i === 4 ? "right" as const : "left" as const }}>
                        {h}
                      </div>
                    ))}
                  </div>
                  {/* Rows */}
                  {sorted.map((decl, idx) => {
                    const refLabel = decl.reference_number || decl.header?.declarationRef || decl.id?.slice(0, 12) || "—";
                    const consignee = decl.header?.consigneeName || "";
                    const itemCount = (decl.items || decl.payload_json?.items || []).length;
                    const updatedAt = decl.updated_at || decl.created_at || "";
                    return (
                      <div key={decl.id} className="decl-row"
                        onClick={() => handleRowClick(decl)}
                        style={{
                          display: "grid", gridTemplateColumns: "2fr 120px 70px 150px 52px",
                          padding: "10px 14px",
                          borderBottom: idx < sorted.length - 1 ? `1px solid ${C.paperBorder}` : "none",
                          cursor: "pointer", alignItems: "center", background: C.paper,
                        }}
                      >
                        {/* Ref + consignee */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.ghostDim, width: 18, flexShrink: 0 }}>
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div className="decl-ref" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: C.inkMid, letterSpacing: "0.04em", transition: "color 0.1s" }}>
                              {refLabel}
                            </div>
                            {consignee && (
                              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 11, color: C.inkLight, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {consignee}
                              </div>
                            )}
                          </div>
                        </div>
                        <div><StatusPill status={decl.status} /></div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: C.inkLight }}>
                          {itemCount}<span style={{ fontSize: 10, marginLeft: 2 }}>item{itemCount !== 1 ? "s" : ""}</span>
                        </div>
                        <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 11, color: C.inkLight }}>
                          {updatedAt ? formatDistanceToNow(new Date(updatedAt), { addSuffix: true }) : "—"}
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <button
                            onClick={e => { e.stopPropagation(); setDeleteId(decl.id); }}
                            style={{
                              background: "transparent", border: "none", cursor: "pointer",
                              color: C.inkLight, fontSize: 14, padding: "4px 6px", borderRadius: 3,
                              lineHeight: 1,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = "#963A10")}
                            onMouseLeave={e => (e.currentTarget.style.color = C.inkLight)}
                            title="Delete"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {sorted.length > 0 && (
                <div style={{ marginTop: 10, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.inkLight, letterSpacing: "0.06em" }}>
                  {sorted.length} of {allDeclarations.length} declaration{allDeclarations.length !== 1 ? "s" : ""}
                  {searchQuery && ` matching "${searchQuery}"`}
                  {" · "}<span style={{ color: C.ghostDim }}>{backendDeclarations.length} from backend</span>
                </div>
              )}
            </div>

            {/* Right column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Quick actions */}
              <div style={{ border: `1px solid ${C.paperBorder}`, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ padding: "8px 14px", background: C.paperAlt, borderBottom: `1px solid ${C.paperBorder}`, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: C.inkLight }}>
                  QUICK ACTIONS
                </div>
                {[
                  { label: "New Declaration",    sub: "Open workbench",      fn: handleNew,                                        icon: "+" },
                  { label: "Review Queue",       sub: "Open broker review",  fn: () => navigate("/stallion/brokerreview4"),         icon: "✓" },
                  { label: "Extract Documents",  sub: "Upload PDF invoices", fn: () => navigate("/stallion/extract"),              icon: "⇪" },
                  { label: "New from Workbench", sub: "Full entry form",     fn: () => navigate("/stallion/workbench"),             icon: "▤" },
                  { label: "Export Register CSV", sub: "Monthly register log", fn: handleCsvExport,                                icon: "↓" },
                ].map(({ label, sub, fn, icon }) => (
                  <button key={label} onClick={fn} style={{ width: "100%", padding: "10px 14px", background: "transparent", border: "none", borderBottom: `1px solid ${C.paperBorder}`, cursor: "pointer", textAlign: "left" as const, display: "flex", alignItems: "center", gap: 12, transition: "background 0.1s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.paperAlt)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: C.inkLight, width: 20, textAlign: "center" as const, flexShrink: 0 }}>{icon}</span>
                    <div>
                      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 13, color: C.ink, fontWeight: 600 }}>{label}</div>
                      <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 11, color: C.inkLight }}>{sub}</div>
                    </div>
                    <span style={{ marginLeft: "auto", color: C.inkLight, fontSize: 12 }}>›</span>
                  </button>
                ))}
              </div>

              {/* Getting started */}
              <HelpBox title="How Stallion works">
                <p style={{ margin: "0 0 10px" }}>
                  Stallion automates the Trinidad &amp; Tobago customs declaration process from document upload to ASYCUDA C82 XML generation.
                </p>
                <div style={{ display: "grid", gap: 6 }}>
                  {[
                    ["1. Extract", "Upload commercial invoices and AWBs. AI reads them and pre-fills the declaration fields."],
                    ["2. Review", "Broker verifies HS codes, values, and transport details. Approves or flags for correction."],
                    ["3. Generate", "Stallion produces the C82 XML for ASYCUDA upload and the LB01 worksheet PDF."],
                    ["4. Receipt", "After ASYCUDA processing, enter the receipt number to complete the record."],
                  ].map(([step, desc]) => (
                    <div key={step} style={{ display: "flex", gap: 8, fontSize: 12 }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#1A5E3A", minWidth: 60, flexShrink: 0 }}>{step}</span>
                      <span style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: "#6B6560" }}>{desc}</span>
                    </div>
                  ))}
                </div>
                <HelpTip>Start by clicking "Extract Documents" — upload your invoice and AWB, and Stallion will have a draft declaration ready for review in under 30 seconds.</HelpTip>
              </HelpBox>

              {/* Recent activity */}
              <div style={{ border: `1px solid ${C.paperBorder}`, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ padding: "8px 14px", background: C.paperAlt, borderBottom: `1px solid ${C.paperBorder}`, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: C.inkLight }}>
                  RECENT ACTIVITY
                </div>
                {recentActivity.length === 0 ? (
                  <div style={{ padding: "20px 14px", textAlign: "center", fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: C.inkLight }}>
                    No activity yet
                  </div>
                ) : recentActivity.map((decl, idx) => {
                  const cfg = STATUS_STYLE[decl.status] || STATUS_STYLE.draft;
                  const ref = decl.reference_number || decl.header?.declarationRef || decl.id?.slice(0, 10);
                  return (
                    <div key={decl.id} onClick={() => handleRowClick(decl)}
                      style={{ padding: "9px 14px", borderBottom: idx < recentActivity.length - 1 ? `1px solid ${C.paperBorder}` : "none", cursor: "pointer", transition: "background 0.1s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = C.paperAlt)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: C.inkMid, letterSpacing: "0.04em" }}>{ref}</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, color: cfg.color, letterSpacing: "0.08em" }}>{cfg.label}</span>
                      </div>
                      <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 11, color: C.inkLight }}>
                        {formatActivityDate(decl.updated_at || "")}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* This month summary */}
              <div style={{ border: `1px solid ${C.paperBorder}`, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ padding: "8px 14px", background: C.paperAlt, borderBottom: `1px solid ${C.paperBorder}`, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: C.inkLight }}>
                  {format(new Date(), "MMMM yyyy").toUpperCase()}
                </div>
                {[
                  ["Declarations", counts.thisMonth, C.inkMid],
                  ["Pending",      counts.pending,   counts.pending > 0 ? C.pending : C.inkLight],
                  ["Approved",     counts.approved,  C.approved],
                  ["Receipted",    counts.receipted, "#5580C8"],
                ].map(([label, val, color]) => (
                  <div key={label as string} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", borderBottom: `1px solid ${C.paperBorder}` }}>
                    <span style={{ fontFamily: "'Fraunces', serif", fontSize: 12, color: C.inkLight }}>{label}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: color as string }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent style={{ fontFamily: "'Fraunces', serif", background: C.paper, border: `1px solid ${C.paperBorder}`, borderRadius: 3 }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ fontFamily: "'Fraunces', serif", color: C.ink }}>Delete Declaration</AlertDialogTitle>
            <AlertDialogDescription style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: C.inkLight }}>
              This action cannot be undone. The declaration will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ fontFamily: "'Fraunces', serif", background: "transparent", border: `1px solid ${C.paperBorder}`, color: C.inkMid, borderRadius: 3 }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, background: C.critBorder, border: "none", color: "#fff", borderRadius: 3 }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
