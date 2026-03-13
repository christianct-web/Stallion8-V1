import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { extractDocuments } from "@/services/stallionApi";
import { TopNav } from "@/components/TopNav";

// Design tokens (matching paper/void system from other pages)
const C = {
  paper: "#F6F3EE", paperAlt: "#EFECE6", paperBorder: "#E2DDD6",
  paperMid: "#CCC7BE", ink: "#18150F", inkMid: "#3D3830", inkLight: "#6B6560",
  void_: "#111318", voidMid: "#191D26", voidSurface: "#1F2430",
  voidBorder: "#2E3748", ghost: "#A0AABB", ghostDim: "#6B7585",
  approved: "#1A5E3A", pending: "#96700A", warn: "#FEF3DC", warnBorder: "#D4A020",
};

type ExtractedItem = {
  id: string;
  consigneeName: string;
  consignorName: string;
  hsCode: string;
  invoiceValueForeign: number;
  currency: string;
  confidence: number;
  notes: string[];
  status: string;
};

function ConfidencePill({ confidence }: { confidence: number }) {
  const pct = Math.round((confidence || 0) * 100);
  const color = pct >= 80 ? C.approved : pct >= 60 ? C.pending : "#963A10";
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
      letterSpacing: "0.1em", color, padding: "2px 8px", borderRadius: 3,
      background: color + "18", border: `1px solid ${color}44`,
    }}>
      {pct}% CONF
    </span>
  );
}

export default function DocumentUpload() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<"batch" | "separate">("batch");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ExtractedItem[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const onPick = (list: FileList | null) => {
    if (!list) return;
    setFiles(prev => [...prev, ...Array.from(list)]);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const list = e.dataTransfer.files;
    if (list) setFiles(prev => [...prev, ...Array.from(list)]);
  }, []);

  const onExtract = async () => {
    if (!files.length) return;
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const res = await extractDocuments(files, mode);
      setResults(res.items || []);
    } catch (e: any) {
      setError(e?.message || "Extraction failed — check that files are valid PDFs");
    } finally {
      setLoading(false);
    }
  };

  const clearFiles = () => { setFiles([]); setResults([]); setError(""); };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,600&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        body { background: ${C.paper}; }
      `}</style>

      <div style={{ minHeight: "100vh", background: C.paper, fontFamily: "'Fraunces', serif", color: C.ink }}>
        <TopNav />

        {/* Page header */}
        <div style={{ background: C.void_, borderBottom: `1px solid ${C.voidBorder}`, padding: "24px 32px 20px" }}>
          <div style={{ maxWidth: 960, margin: "0 auto" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: C.ghostDim, marginBottom: 8 }}>
              EXTRACTION
            </div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1 }}>
              Document Extraction
            </h1>
            <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 13, color: C.ghost, marginTop: 6 }}>
              Upload commercial invoices, AWBs, and packing lists — AI extracts declaration fields automatically
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 32px 48px" }}>

          {/* Mode toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: C.inkLight, marginRight: 4 }}>
              MODE
            </div>
            {(["batch", "separate"] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: "6px 16px",
                  background: mode === m ? C.ink : "transparent",
                  border: `1px solid ${mode === m ? C.ink : C.paperBorder}`,
                  borderRadius: 3, cursor: "pointer",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, letterSpacing: "0.08em", fontWeight: 700,
                  color: mode === m ? C.paper : C.inkLight,
                  transition: "all 0.15s",
                }}
              >
                {m.toUpperCase()}
              </button>
            ))}
            <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 11, color: C.inkLight }}>
              {mode === "batch" ? "Multiple files → one declaration" : "One declaration per file"}
            </div>
          </div>

          {/* Upload zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => document.getElementById("file-input")?.click()}
            style={{
              border: `2px dashed ${dragging ? C.ink : C.paperMid}`,
              borderRadius: 4,
              padding: "40px 32px",
              textAlign: "center",
              cursor: "pointer",
              background: dragging ? C.paperAlt : C.paper,
              transition: "all 0.15s",
              marginBottom: 16,
            }}
          >
            <input
              id="file-input"
              type="file"
              multiple
              accept=".pdf,.xlsx,.csv"
              style={{ display: "none" }}
              onChange={e => onPick(e.target.files)}
            />
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 28, color: C.paperMid, marginBottom: 12, lineHeight: 1 }}>
              ⇪
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, color: C.inkMid, marginBottom: 6 }}>
              Drop invoices, AWBs, packing lists here
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: C.inkLight }}>
              or click to browse · PDF, XLSX, CSV accepted
            </div>
          </div>

          {/* File list + actions */}
          {files.length > 0 && (
            <div style={{ border: `1px solid ${C.paperBorder}`, borderRadius: 3, marginBottom: 16, overflow: "hidden" }}>
              <div style={{ padding: "8px 14px", background: C.paperAlt, borderBottom: `1px solid ${C.paperBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: C.inkLight }}>
                  {files.length} FILE{files.length !== 1 ? "S" : ""} QUEUED
                </span>
                <button onClick={e => { e.stopPropagation(); clearFiles(); }} style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "'Fraunces', serif", fontSize: 12, color: C.inkLight }}>
                  Clear
                </button>
              </div>
              {files.map((f, i) => (
                <div key={i} style={{ padding: "8px 14px", borderBottom: i < files.length - 1 ? `1px solid ${C.paperBorder}` : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "'Fraunces', serif", fontSize: 13, color: C.inkMid }}>{f.name}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.inkLight }}>
                    {(f.size / 1024).toFixed(0)} KB
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Extract button */}
          <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
            <button
              onClick={onExtract}
              disabled={!files.length || loading}
              style={{
                padding: "10px 24px",
                background: files.length && !loading ? C.ink : C.paperMid,
                border: "none", borderRadius: 3, cursor: files.length && !loading ? "pointer" : "not-allowed",
                fontFamily: "'Fraunces', serif", fontSize: 14, fontWeight: 600,
                color: files.length && !loading ? C.paper : C.inkLight,
                transition: "background 0.15s",
              }}
            >
              {loading ? "Extracting…" : "Run Extraction"}
            </button>
          </div>

          {error && (
            <div style={{ padding: "12px 16px", background: "#FEE8E8", border: "1px solid #B0202044", borderRadius: 3, marginBottom: 20, fontFamily: "'Fraunces', serif", fontSize: 13, color: "#7A1E1E" }}>
              {error}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: C.inkLight, marginBottom: 12 }}>
                EXTRACTION RESULTS · {results.length}
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {results.map(r => (
                  <div key={r.id} style={{ border: `1px solid ${C.paperBorder}`, borderRadius: 3, overflow: "hidden" }}>
                    {/* Card header */}
                    <div style={{ padding: "12px 16px", background: C.paperAlt, borderBottom: `1px solid ${C.paperBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, color: C.ink }}>
                          {r.consigneeName || "(No consignee extracted)"}
                        </div>
                        {r.consignorName && (
                          <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: C.inkLight, marginTop: 2 }}>
                            from {r.consignorName}
                          </div>
                        )}
                      </div>
                      <ConfidencePill confidence={r.confidence} />
                    </div>

                    {/* Card body */}
                    <div style={{ padding: "12px 16px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 20px", marginBottom: 10 }}>
                        {[
                          ["HS CODE", r.hsCode || "—"],
                          ["VALUE", r.hsCode ? `${r.currency} ${Number(r.invoiceValueForeign || 0).toLocaleString()}` : "—"],
                          ["REF", r.id],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.12em", color: C.inkLight, marginBottom: 3 }}>{label}</div>
                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: C.inkMid, fontWeight: 700 }}>{value}</div>
                          </div>
                        ))}
                      </div>

                      {!!r.notes?.length && (
                        <div style={{ padding: "7px 10px", background: C.warn, border: `1px solid ${C.warnBorder}44`, borderRadius: 3, marginBottom: 10, fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: "#7A5000" }}>
                          ⚠ {r.notes.join(" · ")}
                        </div>
                      )}

                      <button
                        onClick={() => navigate(`/stallion/brokerreview4?id=${r.id}`)}
                        style={{
                          padding: "7px 16px", background: "transparent",
                          border: `1px solid ${C.ink}`, borderRadius: 3,
                          cursor: "pointer", fontFamily: "'Fraunces', serif",
                          fontSize: 13, fontWeight: 600, color: C.ink,
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = C.ink; e.currentTarget.style.color = C.paper; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.ink; }}
                      >
                        Send to Review →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
