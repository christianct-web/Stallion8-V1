import { useNavigate } from "react-router-dom";
import { useDeclarationStore } from "@/store/declarationStore";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useMemo } from "react";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";

// ─── Design tokens ──────────────────────────────────────────────────────────
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

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string; label: string }> = {
  Draft:    { color: C.ghostDim,   bg: C.voidSurface, border: C.voidBorder,      label: "DRAFT"    },
  Ready:    { color: C.approved,   bg: "#EBF7F1",     border: C.approved + "44", label: "READY"    },
  Exported: { color: "#1E4A8C",    bg: "#EEF2FA",     border: "#1E4A8C44",       label: "EXPORTED" },
  Pending:  { color: C.pending,    bg: C.warn,        border: C.warnBorder+"44", label: "PENDING"  },
  Error:    { color: C.critBorder, bg: C.critical,    border: C.critBorder+"44", label: "ERROR"    },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Draft;
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
  if (isToday(d))     return `Today · ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `Yesterday · ${format(d, "HH:mm")}`;
  return format(d, "dd MMM · HH:mm");
}

function TopNavButton({
  label,
  sub,
  path,
  accent,
  onNavigate,
}: {
  label: string;
  sub: string;
  path: string;
  accent?: boolean;
  onNavigate: (path: string) => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={() => onNavigate(path)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "8px 14px",
        background: hov
          ? (accent ? C.approved : C.voidSurface)
          : (accent ? C.approved + "18" : "transparent"),
        border: `1px solid ${accent ? C.approved + "55" : C.voidBorder}`,
        borderRadius: 3, cursor: "pointer",
        textAlign: "left" as const, transition: "background 0.15s",
      }}
    >
      <div style={{
        fontFamily: "'Fraunces', serif", fontSize: 13, fontWeight: 600,
        color: accent ? (hov ? "#fff" : C.approved) : (hov ? "#fff" : C.ghost),
        marginBottom: 1,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
        letterSpacing: "0.1em",
        color: accent ? (hov ? "#fff" : C.approved + "99") : C.ghostDim,
      }}>
        {sub}
      </div>
    </button>
  );
}

// ─── Urgent action card ──────────────────────────────────────────────────────
function ActionCard({
  count, label, sub, color, bg, border, onClick,
}: {
  count: number; label: string; sub: string;
  color: string; bg: string; border: string;
  onClick: () => void;
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
        transition: "all 0.15s",
        flex: 1, minWidth: 180,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 28, fontWeight: 700, color, lineHeight: 1,
        }}>
          {count}
        </span>
        <span style={{
          fontFamily: "'Fraunces', serif", fontSize: 14,
          fontWeight: 600, color,
        }}>
          {label}
        </span>
      </div>
      <div style={{
        fontFamily: "'Fraunces', serif", fontStyle: "italic",
        fontSize: 12, color: color + "bb",
      }}>
        {sub} →
      </div>
    </button>
  );
}

// ─── Workflow card ───────────────────────────────────────────────────────────
function WorkflowCard({
  title, sub, meta, accent, onClick,
}: {
  title: string; sub: string; meta: string;
  accent?: boolean; onClick: () => void;
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
      <div style={{
        fontFamily: "'Fraunces', serif", fontSize: 17,
        fontWeight: 700, color: titc, marginBottom: 5,
        transition: "color 0.15s",
      }}>
        {title}
      </div>
      <div style={{
        fontFamily: "'Fraunces', serif", fontStyle: "italic",
        fontSize: 12, color: subc, marginBottom: 12,
      }}>
        {sub}
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, letterSpacing: "0.1em",
        color: accent ? C.approved + "88" : C.ghostDim,
      }}>
        {meta}
      </div>
    </button>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function DeclarationsList() {
  const navigate = useNavigate();
  const { declarations, createDeclaration, duplicateDeclaration, deleteDeclaration } =
    useDeclarationStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [deleteId,    setDeleteId]    = useState<string | null>(null);

  // ── Derived state ──────────────────────────────────────────────────────────
  const counts = useMemo(() => ({
    total:      declarations.length,
    draft:      declarations.filter(d => d.status === "Draft").length,
    ready:      declarations.filter(d => d.status === "Ready").length,
    exported:   declarations.filter(d => d.status === "Exported").length,
    pending:    declarations.filter(d => d.status === "Pending").length,
    correction: declarations.filter(d => d.status === "needs_correction" || d.status === "Correction").length,
    thisMonth:  declarations.filter(d => {
      const now = new Date();
      const d2  = new Date(d.updated_at);
      return d2.getMonth() === now.getMonth() && d2.getFullYear() === now.getFullYear();
    }).length,
  }), [declarations]);

  const sorted = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return [...declarations]
      .filter(d =>
        !q ||
        d.reference_number.toLowerCase().includes(q) ||
        d.status.toLowerCase().includes(q) ||
        (d.payload_json?.header?.consigneeName || "").toLowerCase().includes(q)
      )
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [declarations, searchQuery]);

  // Recent activity — last 6 status changes
  const recentActivity = useMemo(() =>
    [...declarations]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 6),
    [declarations]
  );

  const hasUrgent = counts.pending > 0 || counts.correction > 0 || counts.ready > 0;

  const handleNew = () => {
    const d = createDeclaration();
    navigate(`/declaration/${d.id}`);
  };

  const handleDelete = () => {
    if (deleteId) { deleteDeclaration(deleteId); setDeleteId(null); }
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

        {/* ── Top bar ── */}
        <div style={{
          height: 52, background: C.void,
          borderBottom: `1px solid ${C.voidBorder}`,
          display: "flex", alignItems: "center",
          padding: "0 28px", gap: 16,
          position: "sticky", top: 0, zIndex: 20,
        }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 17, color: "#fff" }}>
            Stallion
          </div>
          <div style={{ width: 1, height: 14, background: C.voidBorder }} />
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.ghostDim, letterSpacing: "0.1em" }}>
            CUSTOMS MANAGEMENT · TT · ASYCUDA
          </div>

          {/* Month indicator */}
          <div style={{
            marginLeft: "auto",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: C.ghostDim, letterSpacing: "0.08em",
          }}>
            {format(new Date(), "MMMM yyyy").toUpperCase()}
          </div>
          <div style={{ width: 1, height: 14, background: C.voidBorder }} />

          {/* Nav actions */}
          <div style={{ display: "flex", gap: 8 }}>
            <TopNavButton label="Workbench" sub="NEW DECLARATION" path="/stallion/workbench" onNavigate={navigate} />
            <TopNavButton label="Broker Review" sub="REVIEW QUEUE" path="/stallion/brokerreview4" accent onNavigate={navigate} />
          </div>
        </div>

        {/* ── Hero band ── */}
        <div style={{
          background: C.void,
          borderBottom: `1px solid ${C.voidBorder}`,
          padding: "28px 32px 24px",
        }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, letterSpacing: "0.16em",
              color: C.ghostDim, marginBottom: 8,
            }}>
              DECLARATIONS
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
              <h1 style={{
                fontFamily: "'Fraunces', serif", fontSize: 32,
                fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1,
              }}>
                All Declarations
              </h1>

              {/* KPI strip */}
              <div style={{ display: "flex", gap: 28 }}>
                {[
                  { label: "TOTAL",      val: counts.total,     color: C.ghost      },
                  { label: "THIS MONTH", val: counts.thisMonth, color: C.ghost      },
                  { label: "READY",      val: counts.ready,     color: C.approved   },
                  { label: "EXPORTED",   val: counts.exported,  color: "#5580C8"    },
                  { label: "DRAFT",      val: counts.draft,     color: C.ghostDim   },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ textAlign: "right" }}>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 22, fontWeight: 700,
                      color, lineHeight: 1,
                    }}>
                      {val}
                    </div>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9, color: C.ghostDim,
                      letterSpacing: "0.12em", marginTop: 4,
                    }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Main body ── */}
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 32px 48px" }}>

          {/* ── Urgent actions ── */}
          {hasUrgent && (
            <div style={{ marginBottom: 28 }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, letterSpacing: "0.14em",
                color: C.inkLight, marginBottom: 10,
              }}>
                NEEDS ATTENTION
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <ActionCard
                  count={counts.pending}
                  label="Pending Review"
                  sub="Open broker review queue"
                  color={C.pending}
                  bg={C.warn}
                  border={C.warnBorder + "55"}
                  onClick={() => navigate("/stallion/brokerreview4")}
                />
                <ActionCard
                  count={counts.correction}
                  label="Need Correction"
                  sub="Declarations flagged by broker"
                  color={C.correction}
                  bg="#FEF0E8"
                  border={C.correction + "44"}
                  onClick={() => navigate("/stallion/brokerreview4")}
                />
                <ActionCard
                  count={counts.ready}
                  label="Ready to Submit"
                  sub="Approved, awaiting ASYCUDA"
                  color={C.approved}
                  bg="#EBF7F1"
                  border={C.approved + "44"}
                  onClick={() => {}}
                />
              </div>
            </div>
          )}

          {/* ── Workflow shortcuts ── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, letterSpacing: "0.14em",
              color: C.inkLight, marginBottom: 10,
            }}>
              WORKFLOWS
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <WorkflowCard
                title="Stallion Workbench"
                sub="Create and edit declarations manually or from extracted documents"
                meta="DECLARATION ENTRY · XML GENERATION · WORKSHEET"
                onClick={() => navigate("/stallion/workbench")}
              />
              <WorkflowCard
                title="Broker Review"
                sub="Review AI-extracted declarations, verify HS codes, approve for submission"
                meta={`REVIEW QUEUE · ${counts.pending + counts.correction} PENDING`}
                accent
                onClick={() => navigate("/stallion/brokerreview4")}
              />
            </div>
          </div>

          {/* ── Two-column lower section ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20, alignItems: "start" }}>

            {/* ── Declarations table ── */}
            <div>
              {/* Table toolbar */}
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                marginBottom: 10, flexWrap: "wrap",
              }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, letterSpacing: "0.14em",
                  color: C.inkLight,
                }}>
                  DECLARATIONS
                </div>
                <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
                  <span style={{
                    position: "absolute", left: 10, top: "50%",
                    transform: "translateY(-50%)",
                    color: C.inkLight, fontSize: 13, pointerEvents: "none",
                  }}>
                    ⌕
                  </span>
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search reference, consignee…"
                    style={{
                      width: "100%", padding: "7px 10px 7px 28px",
                      background: C.paper,
                      border: `1px solid ${C.paperBorder}`, borderRadius: 3,
                      color: C.ink, fontSize: 12,
                      fontFamily: "'Fraunces', serif",
                    }}
                  />
                </div>
                <button
                  onClick={handleNew}
                  style={{
                    marginLeft: "auto", padding: "7px 18px",
                    background: C.ink, border: "none", borderRadius: 3,
                    color: C.paper, fontFamily: "'Fraunces', serif",
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                    transition: "opacity 0.15s",
                  }}
                  onMouseEnter={e => ((e.currentTarget).style.opacity = "0.85")}
                  onMouseLeave={e => ((e.currentTarget).style.opacity = "1")}
                >
                  + New Declaration
                </button>
              </div>

              {/* Table */}
              {sorted.length === 0 ? (
                <div style={{
                  padding: "48px 32px", textAlign: "center",
                  border: `1px solid ${C.paperBorder}`, borderRadius: 3,
                  background: C.paper,
                }}>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 28, color: C.paperMid, marginBottom: 14, lineHeight: 1,
                  }}>
                    ▤
                  </div>
                  <div style={{
                    fontFamily: "'Fraunces', serif", fontSize: 15,
                    color: C.inkMid, fontWeight: 600, marginBottom: 6,
                  }}>
                    {searchQuery ? "No declarations match" : "No declarations yet"}
                  </div>
                  <div style={{
                    fontFamily: "'Fraunces', serif", fontStyle: "italic",
                    fontSize: 12, color: C.inkLight, marginBottom: 20,
                  }}>
                    {searchQuery
                      ? "Try a different reference or consignee name"
                      : "Create your first declaration or import from a spreadsheet"}
                  </div>
                  {!searchQuery && (
                    <button
                      onClick={handleNew}
                      style={{
                        padding: "9px 20px", background: C.ink,
                        border: "none", borderRadius: 3,
                        color: C.paper, fontFamily: "'Fraunces', serif",
                        fontSize: 13, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      + New Declaration
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ border: `1px solid ${C.paperBorder}`, borderRadius: 3, overflow: "hidden" }}>
                  {/* Head */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "2fr 110px 70px 150px 52px",
                    padding: "7px 14px", background: C.paperAlt,
                    borderBottom: `1px solid ${C.paperBorder}`,
                  }}>
                    {["Reference", "Status", "Items", "Updated", ""].map((h, i) => (
                      <div key={i} style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
                        color: C.inkLight,
                        textAlign: i === 4 ? "right" as const : "left" as const,
                      }}>
                        {h}
                      </div>
                    ))}
                  </div>

                  {/* Rows */}
                  {sorted.map((decl, idx) => (
                    <div
                      key={decl.id}
                      className="decl-row"
                      onClick={() => navigate(`/declaration/${decl.id}`)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2fr 110px 70px 150px 52px",
                        padding: "10px 14px",
                        borderBottom: idx < sorted.length - 1
                          ? `1px solid ${C.paperBorder}` : "none",
                        cursor: "pointer", alignItems: "center",
                        background: C.paper,
                      }}
                    >
                      {/* Reference + consignee */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 10, color: C.ghostDim, width: 18, flexShrink: 0,
                        }}>
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div
                            className="decl-ref"
                            style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 12, fontWeight: 700,
                              color: C.inkMid, letterSpacing: "0.04em",
                              transition: "color 0.1s",
                            }}
                          >
                            {decl.reference_number}
                          </div>
                          {decl.payload_json?.header?.consigneeName && (
                            <div style={{
                              fontFamily: "'Fraunces', serif", fontSize: 11,
                              color: C.inkLight, marginTop: 1,
                              whiteSpace: "nowrap", overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}>
                              {decl.payload_json.header.consigneeName}
                            </div>
                          )}
                        </div>
                      </div>

                      <div><StatusPill status={decl.status} /></div>

                      <div style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 12, color: C.inkLight,
                      }}>
                        {decl.payload_json.items.length}
                        <span style={{ fontSize: 10, marginLeft: 2 }}>
                          item{decl.payload_json.items.length !== 1 ? "s" : ""}
                        </span>
                      </div>

                      <div style={{
                        fontFamily: "'Fraunces', serif", fontStyle: "italic",
                        fontSize: 11, color: C.inkLight,
                      }}>
                        {formatDistanceToNow(new Date(decl.updated_at), { addSuffix: true })}
                      </div>

                      {/* Row menu */}
                      <div
                        style={{ display: "flex", justifyContent: "flex-end" }}
                        onClick={e => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              style={{
                                background: "transparent", border: "1px solid transparent",
                                borderRadius: 3, padding: "3px 7px",
                                cursor: "pointer", color: C.inkLight,
                                fontSize: 14, lineHeight: 1, transition: "all 0.12s",
                              }}
                              onMouseEnter={e => {
                                (e.currentTarget).style.background = C.paperAlt;
                                (e.currentTarget).style.borderColor = C.paperBorder;
                              }}
                              onMouseLeave={e => {
                                (e.currentTarget).style.background = "transparent";
                                (e.currentTarget).style.borderColor = "transparent";
                              }}
                            >
                              ···
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            style={{
                              fontFamily: "'Fraunces', serif",
                              background: C.paper, border: `1px solid ${C.paperBorder}`,
                              borderRadius: 3, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                              minWidth: 160,
                            }}
                          >
                            <DropdownMenuItem
                              onClick={() => navigate(`/declaration/${decl.id}`)}
                              style={{ fontSize: 13, cursor: "pointer" }}
                            >
                              <span style={{ marginRight: 8 }}>▤</span> Open
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                const dup = duplicateDeclaration(decl.id);
                                if (dup) navigate(`/declaration/${dup.id}`);
                              }}
                              style={{ fontSize: 13, cursor: "pointer" }}
                            >
                              <span style={{ marginRight: 8 }}>⎘</span> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteId(decl.id)}
                              style={{ fontSize: 13, cursor: "pointer", color: C.critBorder }}
                            >
                              <span style={{ marginRight: 8 }}>✕</span> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {sorted.length > 0 && (
                <div style={{
                  marginTop: 10, fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, color: C.inkLight, letterSpacing: "0.06em",
                }}>
                  {sorted.length} of {declarations.length} declaration{declarations.length !== 1 ? "s" : ""}
                  {searchQuery && ` matching "${searchQuery}"`}
                </div>
              )}
            </div>

            {/* ── Right column: activity + quick actions ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Quick actions */}
              <div style={{ border: `1px solid ${C.paperBorder}`, borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  padding: "8px 14px", background: C.paperAlt,
                  borderBottom: `1px solid ${C.paperBorder}`,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: C.inkLight,
                }}>
                  QUICK ACTIONS
                </div>
                {[
                  { label: "New Declaration",    sub: "Open workbench",       fn: handleNew,                                              icon: "+" },
                  { label: "Review Queue",       sub: "Open broker review",   fn: () => navigate("/stallion/brokerreview4"),               icon: "✓" },
                  { label: "New from Workbench", sub: "Full entry form",      fn: () => navigate("/stallion/workbench"),                   icon: "▤" },
                ].map(({ label, sub, fn, icon }) => (
                  <button
                    key={label}
                    onClick={fn}
                    style={{
                      width: "100%", padding: "10px 14px",
                      background: "transparent",
                      border: "none", borderBottom: `1px solid ${C.paperBorder}`,
                      cursor: "pointer", textAlign: "left" as const,
                      display: "flex", alignItems: "center", gap: 12,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.paperAlt)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 13, color: C.inkLight,
                      width: 20, textAlign: "center" as const, flexShrink: 0,
                    }}>
                      {icon}
                    </span>
                    <div>
                      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 13, color: C.ink, fontWeight: 600 }}>
                        {label}
                      </div>
                      <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 11, color: C.inkLight }}>
                        {sub}
                      </div>
                    </div>
                    <span style={{ marginLeft: "auto", color: C.inkLight, fontSize: 12 }}>›</span>
                  </button>
                ))}
                {/* Spacer to remove last border */}
                <div style={{ height: 0 }} />
              </div>

              {/* Recent activity */}
              <div style={{ border: `1px solid ${C.paperBorder}`, borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  padding: "8px 14px", background: C.paperAlt,
                  borderBottom: `1px solid ${C.paperBorder}`,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: C.inkLight,
                }}>
                  RECENT ACTIVITY
                </div>
                {recentActivity.length === 0 ? (
                  <div style={{
                    padding: "20px 14px", textAlign: "center",
                    fontFamily: "'Fraunces', serif", fontStyle: "italic",
                    fontSize: 12, color: C.inkLight,
                  }}>
                    No activity yet
                  </div>
                ) : recentActivity.map((decl, idx) => {
                  const cfg = STATUS_STYLE[decl.status] || STATUS_STYLE.Draft;
                  return (
                    <div
                      key={decl.id}
                      onClick={() => navigate(`/declaration/${decl.id}`)}
                      style={{
                        padding: "9px 14px",
                        borderBottom: idx < recentActivity.length - 1
                          ? `1px solid ${C.paperBorder}` : "none",
                        cursor: "pointer", transition: "background 0.1s",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = C.paperAlt)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 11, fontWeight: 700, color: C.inkMid,
                          letterSpacing: "0.04em",
                        }}>
                          {decl.reference_number}
                        </span>
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 9, fontWeight: 700,
                          color: cfg.color, letterSpacing: "0.08em",
                        }}>
                          {cfg.label}
                        </span>
                      </div>
                      <div style={{
                        fontFamily: "'Fraunces', serif", fontStyle: "italic",
                        fontSize: 11, color: C.inkLight,
                      }}>
                        {formatActivityDate(decl.updated_at)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* This month summary */}
              <div style={{
                border: `1px solid ${C.paperBorder}`, borderRadius: 3,
                overflow: "hidden",
              }}>
                <div style={{
                  padding: "8px 14px", background: C.paperAlt,
                  borderBottom: `1px solid ${C.paperBorder}`,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: C.inkLight,
                }}>
                  {format(new Date(), "MMMM yyyy").toUpperCase()}
                </div>
                {[
                  ["Declarations",  counts.thisMonth, C.inkMid   ],
                  ["Ready",         counts.ready,     C.approved  ],
                  ["Exported",      counts.exported,  "#5580C8"   ],
                  ["Draft",         counts.draft,     C.ghostDim  ],
                ].map(([label, val, color]) => (
                  <div key={label as string} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 14px", borderBottom: `1px solid ${C.paperBorder}`,
                  }}>
                    <span style={{ fontFamily: "'Fraunces', serif", fontSize: 12, color: C.inkLight }}>
                      {label}
                    </span>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 14, fontWeight: 700, color: color as string,
                    }}>
                      {val}
                    </span>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent style={{
          fontFamily: "'Fraunces', serif", background: C.paper,
          border: `1px solid ${C.paperBorder}`, borderRadius: 3,
        }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ fontFamily: "'Fraunces', serif", color: C.ink }}>
              Delete Declaration
            </AlertDialogTitle>
            <AlertDialogDescription style={{
              fontFamily: "'Fraunces', serif", fontStyle: "italic", color: C.inkLight,
            }}>
              This action cannot be undone. The declaration and all its data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{
              fontFamily: "'Fraunces', serif", background: "transparent",
              border: `1px solid ${C.paperBorder}`, color: C.inkMid, borderRadius: 3,
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              style={{
                fontFamily: "'Fraunces', serif", fontWeight: 600,
                background: C.critBorder, border: "none",
                color: "#fff", borderRadius: 3,
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
