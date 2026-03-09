import { useState, useEffect } from "react";
import { listDeclarations, reviewDeclaration } from "@/services/stallionApi";

const C = {
  paper: "#F6F3EE", paperAlt: "#EFECE6", paperBorder: "#E2DDD6", paperMid: "#CCC7BE",
  ink: "#18150F", inkMid: "#3D3830", inkLight: "#6B6560", void: "#111318", voidSurface: "#1F2430",
  voidBorder: "#2E3748", ghost: "#A0AABB", ghostDim: "#6B7585", pending: "#96700A", approved: "#1A5E3A",
  correction: "#963A10", rejected: "#7A1E1E", warn: "#FEF3DC", warnBorder: "#D4A020", warnText: "#7A5000",
  critical: "#FEE8E8", critBorder: "#B02020",
};

const STATUS_CFG: Record<string, any> = {
  pending_review: { color: C.pending, label: "Pending Review", short: "PENDING" },
  pending: { color: C.pending, label: "Pending Review", short: "PENDING" },
  approved: { color: C.approved, label: "Approved", short: "APPROVED" },
  needs_correction: { color: C.correction, label: "Needs Correction", short: "CORRECTION" },
  rejected: { color: C.rejected, label: "Rejected", short: "REJECTED" },
  receipted: { color: "#1E4A8C", label: "Receipted", short: "RECEIPTED" },
  draft: { color: C.ghostDim, label: "Draft", short: "DRAFT" },
};

function getBlockers(h: any) {
  return [
    [!h?.declarationRef, "Declaration Ref"],
    [!h?.consigneeCode, "Consignee Code"],
    [!h?.declarantTIN, "Declarant TIN"],
    [!h?.vesselName, "Vessel / Flight"],
    [!h?.etaDate, "ETA Date"],
    [!h?.blAwbNumber, "B/L · AWB No."],
  ].filter(([f]) => f).map(([, l]) => l as string);
}

function BatchList({ batch, onSelect }: { batch: any[]; onSelect: (id: string) => void }) {
  return (
    <div style={{ background: C.void, flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.voidBorder}` }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.ghostDim, letterSpacing: "0.12em" }}>
          BROKERREVIEW4 · {batch.length} DECLARATIONS
        </div>
      </div>
      {batch.map((d) => {
        const cfg = STATUS_CFG[d.status] || STATUS_CFG.pending;
        const blockers = getBlockers(d.header || {});
        return (
          <div key={d.id} onClick={() => onSelect(d.id)} style={{
            padding: "12px 16px", borderBottom: `1px solid ${C.voidBorder}`,
            cursor: "pointer", borderLeft: `3px solid ${cfg.color}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.ghost }}>{d.id}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: blockers.length ? C.warnText : cfg.color }}>{blockers.length ? `${blockers.length} MISSING` : cfg.short}</span>
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 13, color: "#E4DFD8" }}>{d.header?.consigneeName || "Unnamed"}</div>
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, value, onChange }: any) {
  return (
    <div style={{ borderBottom: `1px solid ${C.paperBorder}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "130px 1fr" }}>
        <div style={{ padding: "8px 8px 8px 14px", fontSize: 11, color: C.inkLight, borderRight: `1px solid ${C.paperBorder}` }}>{label}</div>
        <input value={value ?? ""} onChange={(e) => onChange?.(e.target.value)} style={{ padding: "8px 10px", background: "transparent", border: "none", outline: "none", color: C.ink, fontSize: 13 }} />
      </div>
    </div>
  );
}

function ReviewPanel({ decl, onStatusChange, onBack }: any) {
  const [header, setHeader] = useState({ ...decl.header });
  const [worksheet, setWs] = useState({ ...decl.worksheet });
  const [items, setItems] = useState((decl.items || []).map((i: any) => ({ ...i })));
  const [notes, setNotes] = useState(decl.review_notes || "");
  const blockers = getBlockers(header);
  const canApprove = blockers.length === 0;

  useEffect(() => {
    setHeader({ ...decl.header });
    setWs({ ...decl.worksheet });
    setItems((decl.items || []).map((i: any) => ({ ...i })));
    setNotes(decl.review_notes || "");
  }, [decl.id]);

  const H = (k: string) => (v: string) => setHeader((h: any) => ({ ...h, [k]: v }));

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.paper }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: C.void, borderBottom: `1px solid ${C.voidBorder}` }}>
        <button onClick={onBack} style={{ background: "transparent", border: `1px solid ${C.voidBorder}`, borderRadius: 3, color: C.ghost, fontSize: 11, padding: "4px 10px" }}>← BATCH</button>
        <div style={{ color: C.ghost, fontSize: 12 }}>{decl.id}</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <Field label="Ref. Number" value={header.declarationRef} onChange={H("declarationRef")} />
        <Field label="Consignee Code" value={header.consigneeCode} onChange={H("consigneeCode")} />
        <Field label="Declarant TIN" value={header.declarantTIN} onChange={H("declarantTIN")} />
        <Field label="Vessel / Flight" value={header.vesselName} onChange={H("vesselName")} />
        <Field label="ETA" value={header.etaDate} onChange={H("etaDate")} />
        <Field label="B/L · AWB No." value={header.blAwbNumber} onChange={H("blAwbNumber")} />
        <Field label="Exchange Rate" value={worksheet.exchange_rate} onChange={(v: string) => setWs((w: any) => ({ ...w, exchange_rate: Number(v || 0) }))} />
        <div style={{ padding: "12px 14px", borderTop: `1px solid ${C.paperBorder}`, color: C.inkLight, fontSize: 12 }}>
          Items: {items.length}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.paperBorder}`, background: C.paperAlt, padding: "10px 14px" }}>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ width: "100%", marginBottom: 8, padding: "7px 10px", border: `1px solid ${C.paperBorder}` }} />
        {!canApprove && <div style={{ marginBottom: 8, color: C.warnText, fontSize: 11 }}>Cannot approve — complete first: {blockers.join(", ")}</div>}
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <button onClick={() => onStatusChange(decl.id, "needs_correction", notes, { header, worksheet, items })}>Flag Correction</button>
          <button onClick={() => onStatusChange(decl.id, "rejected", notes, { header, worksheet, items })}>Reject</button>
          <button disabled={!canApprove} onClick={() => canApprove && onStatusChange(decl.id, "approved", notes, { header, worksheet, items })}>Approve</button>
        </div>
      </div>
    </div>
  );
}

export default function BrokerReview4() {
  const [batch, setBatch] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await listDeclarations();
        setBatch(res.items || []);
      } catch {
        setBatch([]);
      }
    })();
  }, []);

  const active = batch.find((d) => d.id === activeId) || null;

  const handleStatusChange = async (id: string, status: string, notes: string, updated: any) => {
    try {
      await reviewDeclaration(id, {
        action: status,
        review_notes: notes,
        reviewed_by: "Broker",
        reviewed_at: new Date().toISOString(),
        header: updated?.header,
        worksheet: updated?.worksheet,
        items: updated?.items,
      });
      setBatch((b) => b.map((d) => (d.id === id ? { ...d, status, review_notes: notes, ...updated } : d)));
      setActiveId(null);
    } catch {
      // noop
    }
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ height: 44, background: C.void, borderBottom: `1px solid ${C.voidBorder}`, display: "flex", alignItems: "center", padding: "0 14px" }}>
        <div style={{ color: "#fff", fontFamily: "'Fraunces', serif" }}>Stallion</div>
        <div style={{ marginLeft: 10, color: C.ghostDim, fontSize: 11 }}>BROKERREVIEW4</div>
      </div>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {active ? (
          <ReviewPanel decl={active} onStatusChange={handleStatusChange} onBack={() => setActiveId(null)} />
        ) : (
          <BatchList batch={batch} onSelect={setActiveId} />
        )}
      </div>
    </div>
  );
}
