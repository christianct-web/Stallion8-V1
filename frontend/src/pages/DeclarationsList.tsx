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
import { formatDistanceToNow } from "date-fns";

// ─── Design tokens (matches workbench + broker review) ──────────────────────
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
  warnText:    "#7A5000",
  critical:    "#FEE8E8",
  critBorder:  "#B02020",
};

const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  Draft:    { color: C.ghostDim,  bg: C.voidSurface, label: "DRAFT"    },
  Ready:    { color: C.approved,  bg: "#F0FAF4",     label: "READY"    },
  Exported: { color: "#1E4A8C",   bg: "#EEF2FA",     label: "EXPORTED" },
  Pending:  { color: C.pending,   bg: C.warn,        label: "PENDING"  },
  Error:    { color: C.critBorder,bg: C.critical,    label: "ERROR"    },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Draft;
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 10, fontWeight: 700,
      letterSpacing: "0.1em",
      color: s.color, background: s.bg,
      padding: "3px 8px", borderRadius: 3,
      border: `1px solid ${s.color}33`,
    }}>
      {s.label}
    </span>
  );
}

// ─── Nav link ────────────────────────────────────────────────────────────────
function NavLink({
  label, sub, onClick, accent = false,
}: {
  label: string; sub: string; onClick: () => void; accent?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "10px 16px",
        background: hov
          ? (accent ? C.approved : C.voidSurface)
          : (accent ? "#1A5E3A22" : "transparent"),
        border: `1px solid ${accent ? C.approved + "55" : C.voidBorder}`,
        borderRadius: 3,
        cursor: "pointer",
        textAlign: "left" as const,
        transition: "background 0.15s",
        minWidth: 140,
      }}
    >
      <div style={{
        fontFamily: "'Fraunces', serif",
        fontSize: 13, fontWeight: 600,
        color: accent ? (hov ? "#fff" : C.approved) : (hov ? "#fff" : C.ghost),
        marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, letterSpacing: "0.08em",
        color: accent ? (hov ? "#fff" : C.approved + "aa") : C.ghostDim,
      }}>
        {sub}
      </div>
    </button>
  );
}

// ─── Icon buttons (no lucide dep needed here, using unicode) ─────────────────
function IconBtn({
  onClick, title, children, danger = false,
}: {
  onClick: (e: React.MouseEvent) => void;
  title: string; children: React.ReactNode; danger?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick} title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? (danger ? C.critical : C.paperAlt) : "transparent",
        border: `1px solid ${hov ? (danger ? C.critBorder + "55" : C.paperBorder) : "transparent"}`,
        borderRadius: 3, padding: "4px 8px",
        cursor: "pointer", color: danger ? C.critBorder : C.inkLight,
        fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
        transition: "all 0.12s",
      }}
    >
      {children}
    </button>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ hasSearch, onCreate }: { hasSearch: boolean; onCreate: () => void }) {
  return (
    <div style={{
      padding: "64px 32px", textAlign: "center",
      border: `1px solid ${C.paperBorder}`, borderRadius: 3,
      background: C.paper,
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 32, color: C.paperMid, marginBottom: 16, lineHeight: 1,
      }}>
        ▤
      </div>
      <div style={{
        fontFamily: "'Fraunces', serif", fontSize: 16,
        color: C.inkMid, fontWeight: 600, marginBottom: 8,
      }}>
        {hasSearch ? "No declarations match" : "No declarations yet"}
      </div>
      <div style={{
        fontFamily: "'Fraunces', serif", fontStyle: "italic",
        fontSize: 13, color: C.inkLight, marginBottom: 24,
      }}>
        {hasSearch
          ? "Try a different reference number or status"
          : "Create your first customs declaration to get started"}
      </div>
      {!hasSearch && (
        <button
          onClick={onCreate}
          style={{
            padding: "9px 20px",
            background: C.ink, border: "none", borderRadius: 3,
            color: C.paper, fontFamily: "'Fraunces', serif",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          + New Declaration
        </button>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function DeclarationsList() {
  const navigate = useNavigate();
  const { declarations, createDeclaration, duplicateDeclaration, deleteDeclaration } =
    useDeclarationStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [deleteId,    setDeleteId]    = useState<string | null>(null);

  const sorted = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return [...declarations]
      .filter(d =>
        !q ||
        d.reference_number.toLowerCase().includes(q) ||
        d.status.toLowerCase().includes(q)
      )
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [declarations, searchQuery]);

  const handleNew = () => {
    const d = createDeclaration();
    navigate(`/declaration/${d.id}`);
  };

  const handleDelete = () => {
    if (deleteId) { deleteDeclaration(deleteId); setDeleteId(null); }
  };

  // Status summary counts
  const counts = useMemo(() => ({
    total:    declarations.length,
    draft:    declarations.filter(d => d.status === "Draft").length,
    ready:    declarations.filter(d => d.status === "Ready").length,
    exported: declarations.filter(d => d.status === "Exported").length,
  }), [declarations]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-thumb { background: #2E3748; border-radius: 3px; }
        .decl-row:hover { background: ${C.paperAlt} !important; }
        .decl-row:hover .decl-ref { color: ${C.ink} !important; }
        input::placeholder { color: ${C.inkLight}; opacity: 0.7; }
      `}</style>

      <div style={{
        minHeight: "100vh",
        background: C.paper,
        fontFamily: "'Fraunces', serif",
        color: C.ink,
      }}>

        {/* ── Top bar ── */}
        <div style={{
          height: 52, background: C.void,
          borderBottom: `1px solid ${C.voidBorder}`,
          display: "flex", alignItems: "center",
          padding: "0 24px", gap: 16,
          position: "sticky", top: 0, zIndex: 20,
        }}>
          <div style={{
            fontFamily: "'Fraunces', serif", fontWeight: 700,
            fontSize: 17, color: "#fff",
          }}>
            Stallion
          </div>
          <div style={{ width: 1, height: 14, background: C.voidBorder }} />
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: C.ghostDim, letterSpacing: "0.1em",
          }}>
            CUSTOMS MANAGEMENT · TT · ASYCUDA
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <NavLink
              label="Workbench"
              sub="NEW DECLARATION"
              onClick={() => navigate("/stallion/workbench")}
            />
            <NavLink
              label="Broker Review"
              sub="REVIEW QUEUE"
              onClick={() => navigate("/stallion/brokerreview4")}
              accent
            />
          </div>
        </div>

        {/* ── Page header ── */}
        <div style={{
          borderBottom: `1px solid ${C.paperBorder}`,
          padding: "28px 32px 20px",
          display: "flex", alignItems: "flex-end",
          justifyContent: "space-between", flexWrap: "wrap", gap: 16,
        }}>
          <div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, letterSpacing: "0.14em", color: C.inkLight,
              marginBottom: 6,
            }}>
              DECLARATIONS
            </div>
            <h1 style={{
              fontFamily: "'Fraunces', serif", fontSize: 28,
              fontWeight: 700, color: C.ink, lineHeight: 1, margin: 0,
            }}>
              All Declarations
            </h1>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 24 }}>
            {[
              ["Total",    counts.total,    C.ink],
              ["Draft",    counts.draft,    C.ghostDim],
              ["Ready",    counts.ready,    C.approved],
              ["Exported", counts.exported, "#1E4A8C"],
            ].map(([label, count, color]) => (
              <div key={label as string} style={{ textAlign: "right" }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 20, fontWeight: 700,
                  color: color as string, lineHeight: 1,
                }}>
                  {count}
                </div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, color: C.inkLight,
                  letterSpacing: "0.1em", marginTop: 3,
                }}>
                  {(label as string).toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Toolbar ── */}
        <div style={{
          padding: "14px 32px",
          borderBottom: `1px solid ${C.paperBorder}`,
          display: "flex", alignItems: "center", gap: 12,
          flexWrap: "wrap",
        }}>
          {/* Search */}
          <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
            <span style={{
              position: "absolute", left: 12, top: "50%",
              transform: "translateY(-50%)",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12, color: C.inkLight, pointerEvents: "none",
            }}>
              ⌕
            </span>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by reference or status…"
              style={{
                width: "100%", padding: "8px 12px 8px 32px",
                background: C.paper,
                border: `1px solid ${C.paperBorder}`, borderRadius: 3,
                color: C.ink, fontSize: 13,
                fontFamily: "'Fraunces', serif",
                outline: "none",
              }}
              onFocus={e => (e.target.style.borderColor = C.inkLight)}
              onBlur={e  => (e.target.style.borderColor = C.paperBorder)}
            />
          </div>

          <div style={{ marginLeft: "auto" }}>
            <button
              onClick={handleNew}
              style={{
                padding: "9px 20px",
                background: C.ink, border: "none", borderRadius: 3,
                color: C.paper, fontFamily: "'Fraunces', serif",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={e => ((e.target as HTMLElement).style.opacity = "0.85")}
              onMouseLeave={e => ((e.target as HTMLElement).style.opacity = "1")}
            >
              + New Declaration
            </button>
          </div>
        </div>

        {/* ── Main content ── */}
        <div style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto" }}>
          {sorted.length === 0 ? (
            <EmptyState hasSearch={!!searchQuery.trim()} onCreate={handleNew} />
          ) : (
            <div style={{
              border: `1px solid ${C.paperBorder}`,
              borderRadius: 3, overflow: "hidden",
              background: C.paper,
            }}>
              {/* Table head */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "2fr 120px 80px 160px 80px",
                padding: "8px 16px",
                background: C.paperAlt,
                borderBottom: `1px solid ${C.paperBorder}`,
              }}>
                {["Reference", "Status", "Items", "Last Updated", ""].map((h, i) => (
                  <div key={i} style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10, fontWeight: 700,
                    letterSpacing: "0.12em", color: C.inkLight,
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
                    gridTemplateColumns: "2fr 120px 80px 160px 80px",
                    padding: "11px 16px",
                    borderBottom: idx < sorted.length - 1
                      ? `1px solid ${C.paperBorder}` : "none",
                    cursor: "pointer",
                    alignItems: "center",
                    transition: "background 0.1s",
                    background: C.paper,
                  }}
                >
                  {/* Reference */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11, color: C.ghostDim,
                      width: 20, flexShrink: 0,
                    }}>
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <div
                        className="decl-ref"
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 13, fontWeight: 700,
                          color: C.inkMid, letterSpacing: "0.04em",
                          transition: "color 0.1s",
                        }}
                      >
                        {decl.reference_number}
                      </div>
                      {decl.payload_json?.header?.consigneeName && (
                        <div style={{
                          fontFamily: "'Fraunces', serif",
                          fontSize: 11, color: C.inkLight,
                          marginTop: 1,
                          whiteSpace: "nowrap", overflow: "hidden",
                          textOverflow: "ellipsis", maxWidth: 280,
                        }}>
                          {decl.payload_json.header.consigneeName}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <div>
                    <StatusPill status={decl.status} />
                  </div>

                  {/* Items */}
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12, color: C.inkLight,
                  }}>
                    {decl.payload_json.items.length}
                    <span style={{ fontSize: 10, marginLeft: 3 }}>
                      item{decl.payload_json.items.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Last updated */}
                  <div style={{
                    fontFamily: "'Fraunces', serif", fontStyle: "italic",
                    fontSize: 12, color: C.inkLight,
                  }}>
                    {formatDistanceToNow(new Date(decl.updated_at), { addSuffix: true })}
                  </div>

                  {/* Actions */}
                  <div
                    style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}
                    onClick={e => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button style={{
                          background: "transparent",
                          border: `1px solid transparent`,
                          borderRadius: 3, padding: "4px 8px",
                          cursor: "pointer", color: C.inkLight,
                          fontSize: 14, lineHeight: 1,
                          transition: "all 0.12s",
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.background = C.paperAlt;
                          (e.currentTarget as HTMLElement).style.borderColor = C.paperBorder;
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.background = "transparent";
                          (e.currentTarget as HTMLElement).style.borderColor = "transparent";
                        }}
                        >
                          ···
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        style={{
                          fontFamily: "'Fraunces', serif",
                          background: C.paper,
                          border: `1px solid ${C.paperBorder}`,
                          borderRadius: 3,
                          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
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

          {/* Footer count */}
          {sorted.length > 0 && (
            <div style={{
              marginTop: 14,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, color: C.inkLight, letterSpacing: "0.06em",
            }}>
              {sorted.length} of {declarations.length} declaration{declarations.length !== 1 ? "s" : ""}
              {searchQuery && ` matching "${searchQuery}"`}
            </div>
          )}
        </div>
      </div>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent style={{
          fontFamily: "'Fraunces', serif",
          background: C.paper,
          border: `1px solid ${C.paperBorder}`,
          borderRadius: 3,
        }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ fontFamily: "'Fraunces', serif", color: C.ink }}>
              Delete Declaration
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: C.inkLight }}>
              This action cannot be undone. The declaration and all its data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{
              fontFamily: "'Fraunces', serif",
              background: "transparent",
              border: `1px solid ${C.paperBorder}`,
              color: C.inkMid, borderRadius: 3,
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
