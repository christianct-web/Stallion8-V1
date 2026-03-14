import { useEffect, useMemo, useRef, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { HelpBox, HelpTip, HelpHeading } from "@/components/HelpBox";
import {
  calculateWorksheet,
  createTemplate,
  generatePack,
  getLookup,
  getTemplates,
  upsertDeclaration,
  STALLION_BASE_URL,
} from "@/services/stallionApi";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";

import { WorkbenchHeader }     from "@/components/workbench/WorkbenchHeader";
import { WorkbenchParties }    from "@/components/workbench/WorkbenchParties";
import { WorkbenchItems }      from "@/components/workbench/WorkbenchItems";
import { WorkbenchContainers } from "@/components/workbench/WorkbenchContainers";
import { WorkbenchWorksheet }  from "@/components/workbench/WorkbenchWorksheet";
import { WorkbenchActions, bucketFromPath } from "@/components/workbench/WorkbenchActions";

import "@/styles/workbench.css";

const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

// Stable declaration ID for this workbench session.
// Persisted so Save Draft + Generate Pack always reference the same record.
function useStableId() {
  const ref = useRef<string>(uid());
  return ref.current;
}

function buildHeader(form: any) {
  return {
    declarationRef:          form.declarationRef,
    port:                    form.port,
    term:                    form.term,
    modeOfTransport:         form.modeOfTransport,
    customsRegime:           form.customsRegime,
    consignorName:           form.consignorName,
    consignorAddress:        form.consignorAddress,
    consignorStreet:         form.consignorStreet,
    consignorCity:           form.consignorCity,
    consignorCountry:        form.consignorCountry,
    consigneeCode:           form.consigneeCode,
    consigneeName:           form.consigneeName,
    consigneeAddress:        form.consigneeAddress,
    declarantTIN:            form.declarantTIN,
    declarantName:           form.declarantName,
    vesselName:              form.vesselName,
    blAwbNumber:             form.blAwbNumber,
    blAwbDate:               form.blAwbDate,
    etaDate:                 form.etaDate,
    invoiceNumber:           form.invoiceNumber,
    invoiceDate:             form.invoiceDate,
    currency:                form.currency,
    bankCode:                form.bankCode,
    modeOfPayment:           form.modeOfPayment,
    termsCode:               form.termsCode,
    termsDescription:        form.termsDescription,
    countryFirstDestination: form.countryFirstDestination,
    tradingCountry:          form.tradingCountry,
    exportCountryCode:       form.exportCountryCode,
    exportCountryName:       form.exportCountryName,
    countryOfOriginName:     form.countryOfOriginName,
  };
}

function buildWorksheet(form: any) {
  return {
    invoice_value_foreign: form.invoice_value_foreign,
    exchange_rate:         form.exchange_rate,
    freight_foreign:       form.freight_foreign,
    insurance_foreign:     form.insurance_foreign,
    other_foreign:         form.other_foreign,
    deduction_foreign:     form.deduction_foreign,
    duty_rate_pct:         form.duty_rate_pct,
    surcharge_rate_pct:    form.surcharge_rate_pct,
    vat_rate_pct:          form.vat_rate_pct,
    extra_fees_local:      form.extra_fees_local,
    global_fee:            form.global_fee,
  };
}

export default function StallionWorkbench() {
  // ── stable declaration ID for this session ──────────────────────────────
  const declarationId = useStableId();

  // ── lookups ──────────────────────────────────────────────────────────────
  const [ports,          setPorts]          = useState<Array<{ code: string; label: string }>>([]);
  const [terms,          setTerms]          = useState<Array<{ code: string; label: string }>>([]);
  const [packages,       setPackages]       = useState<Array<{ code: string; label: string }>>([]);
  const [transportModes, setTransportModes] = useState<Array<{ code: string; label: string }>>([]);
  const [customsRegimes, setCustomsRegimes] = useState<Array<{ regimeCode: string; asycudaSubCode?: string; asycudaCode?: string; label: string }>>([]);
  const [unitCodes,      setUnitCodes]      = useState<Array<{ code: string; asycudaCode?: string; label: string }>>([]);
  const [dutyTaxCodes,   setDutyTaxCodes]   = useState<Array<{ code: string; abbr?: string; label: string }>>([]);
  const [dutyTaxBases,   setDutyTaxBases]   = useState<Array<{ code: string; label: string }>>([]);
  const [cpcCodes,       setCpcCodes]       = useState<Array<{ code: string; cpc?: string; label: string }>>([]);
  const [box23Types,     setBox23Types]     = useState<Array<{ type: string; label: string; amount: number; auto: boolean }>>([]);
  const [hsTariffSamples, setHsTariffSamples] = useState<Array<{ description: string; tariff: string; taxes?: Array<{ code: string; rate: number }> }>>([]);

  // ── templates ─────────────────────────────────────────────────────────────
  const [templates,          setTemplates]          = useState<Array<{ id: string; name: string; payload: any }>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  // ── form state ─────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    declarationRef: "",
    port: "",
    term: "",
    modeOfTransport: "",
    customsRegime: "",
    consignorName: "",
    consignorAddress: "",
    consignorStreet: "",
    consignorCity: "",
    consignorCountry: "",
    consigneeCode: "",
    consigneeName: "",
    consigneeAddress: "",
    declarantTIN: "",
    declarantName: "",
    vesselName: "",
    blAwbNumber: "",
    blAwbDate: "",
    etaDate: "",
    invoiceNumber: "",
    invoiceDate: "",
    currency: "USD",
    bankCode: "01",
    modeOfPayment: "CASH",
    termsCode: "99",
    termsDescription: "Basic",
    countryFirstDestination: "US",
    tradingCountry: "US",
    exportCountryCode: "US",
    exportCountryName: "United States",
    countryOfOriginName: "United States",
    invoice_value_foreign: 0,
    exchange_rate: 6.77,
    freight_foreign: 0,
    insurance_foreign: 0,
    other_foreign: 0,
    deduction_foreign: 0,
    duty_rate_pct: 40,
    surcharge_rate_pct: 15,
    vat_rate_pct: 0,
    extra_fees_local: 40,
    global_fee: 40,
  });

  const [items, setItems] = useState([
    {
      id: uid(),
      description: "", hsCode: "", qty: 1,
      packageType: "", grossKg: 0, netKg: 0, itemValue: 0,
      dutyTaxCode: "", dutyTaxBase: "", cpc: "", unitCode: "",
    },
  ]);

  const [containers, setContainers] = useState<Array<{
    id: string; containerNo: string; type: string;
    packageType: string; packages: number; goodsWeight: number;
  }>>([]);

  const [calc,          setCalc]          = useState<any>(null);
  const [selectedBox23, setSelectedBox23] = useState<string[]>([]);
  const [packResult,    setPackResult]    = useState<any>(null);
  const [preflight,     setPreflight]     = useState<any>(null);
  const [generating,    setGenerating]    = useState(false);
  const [savingDraft,   setSavingDraft]   = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<number | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // ── bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [p, t, pk, tr, cr, uc, dt, db, cpc, b23, hs] = await Promise.all([
          getLookup("ports"),         getLookup("terms"),
          getLookup("packages"),      getLookup("transport_modes"),
          getLookup("customs_regimes"), getLookup("unit_codes"),
          getLookup("duty_tax_codes"), getLookup("duty_tax_bases"),
          getLookup("cpc_codes"),     getLookup("box23_types"),
          getLookup("hs_tariff_samples"),
        ]);
        setPorts(p.items);
        setTerms(t.items);
        setPackages(pk.items);
        setTransportModes(tr.items as any);
        setCustomsRegimes(cr.items as any);
        setUnitCodes(uc.items as any);
        setDutyTaxCodes(dt.items as any);
        setDutyTaxBases(db.items as any);
        setCpcCodes(cpc.items as any);
        setBox23Types(b23.items as any);
        setHsTariffSamples(hs.items as any);
        setSelectedBox23((b23.items as any[]).filter(x => x.auto).map(x => x.type));
      } catch {
        toast.error("Failed to load lookups");
      }
    })();
  }, []);

  useEffect(() => {
    getTemplates().then(r => setTemplates(r as any)).catch(() => {});
  }, []);

  useEffect(() => {
    const dutyCodes = items.map(i => i.dutyTaxCode).filter(Boolean);
    setForm(f => ({ ...f, extra_fees_local: dutyCodes.length * 40 }));
  }, [items]);

  useEffect(() => {
    if (!lastGeneratedAt) {
      setCooldownSeconds(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, 8 - Math.floor((Date.now() - lastGeneratedAt) / 1000));
      setCooldownSeconds(remaining);
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [lastGeneratedAt]);

  // ── template load ──────────────────────────────────────────────────────────
  const handleLoadTemplate = (id: string) => {
    const tpl = templates.find(t => t.id === id);
    if (!tpl) return;
    setForm(f => ({ ...f, ...(tpl.payload || {}) }));
    toast.success(`Template "${tpl.name}" loaded`);
  };

  // ── worksheet calculate ────────────────────────────────────────────────────
  const handleCalculate = async () => {
    try {
      const r = await calculateWorksheet({
        invoice_value_foreign: Number(form.invoice_value_foreign),
        exchange_rate:         Number(form.exchange_rate),
        freight_foreign:       Number(form.freight_foreign),
        insurance_foreign:     Number(form.insurance_foreign),
        other_foreign:         Number(form.other_foreign),
        deduction_foreign:     Number(form.deduction_foreign),
        duty_rate_pct:         Number(form.duty_rate_pct),
        surcharge_rate_pct:    Number(form.surcharge_rate_pct),
        vat_rate_pct:          Number(form.vat_rate_pct),
        extra_fees_local:      Number(form.extra_fees_local),
      });
      setCalc(r);
      if ((r as any).preflight) setPreflight((r as any).preflight);
      toast.success("Worksheet calculated");
    } catch (err: any) {
      toast.error(err?.message ?? "Calculation failed");
    }
  };

  // ── save draft ─────────────────────────────────────────────────────────────
  // FIX: uses stable declarationId and persists to backend JSON store.
  const handleSaveDraft = async () => {
    setSavingDraft(true);
    try {
      const header    = buildHeader(form);
      const worksheet = buildWorksheet(form);

      await upsertDeclaration({
        id:         declarationId,
        status:     "draft",
        updated_at: new Date().toISOString(),
        source:     { type: "WORKBENCH", filename: "manual-entry" },
        confidence: 100,
        header,
        worksheet,
        items,
        containers,
        review_notes: "",
      });

      toast.success("Draft saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
    } finally {
      setSavingDraft(false);
    }
  };

  // ── generate pack ──────────────────────────────────────────────────────────
  // FIX: upserts first (status=pending_review) then passes declaration_id
  // to /pack/generate so export events are logged against the correct record.
  const handleGenerate = async () => {
    if (!calc) {
      toast.error("Run worksheet calculation first.");
      return;
    }
    if (cooldownSeconds > 0) {
      toast.error(`Please wait ${cooldownSeconds}s before generating again.`);
      return;
    }
    if (lastGeneratedAt && Date.now() - lastGeneratedAt < 15000) {
      const ok = window.confirm("You generated a pack recently. Generate again now?");
      if (!ok) return;
    }

    setGenerating(true);
    try {
      const header    = buildHeader(form);
      const worksheet = buildWorksheet(form);

      // Upsert as pending_review before generating so broker queue sees it
      await upsertDeclaration({
        id:         declarationId,
        status:     "pending_review",
        updated_at: new Date().toISOString(),
        source:     { type: "WORKBENCH", filename: "manual-entry" },
        confidence: 100,
        header,
        worksheet,
        items,
        containers,
        review_notes: "",
      });

      const result = await generatePack({
        declaration_id: declarationId,
        header,
        worksheet: {
          ...worksheet,
          ...(calc ?? {}),
        },
        items,
        containers,
      });

      setPackResult(result);
      if (result.preflight) setPreflight(result.preflight);
      setLastGeneratedAt(Date.now());

      if (result.status === "blocked") {
        toast.error("Pack blocked — fix required fields");
      } else {
        toast.success("Pack generated — declaration queued for broker review");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Pack generation failed");
    } finally {
      setGenerating(false);
    }
  };

  // ── section issue counts ───────────────────────────────────────────────────
  const sectionIssueCounts = useMemo(() => {
    const counts = {
      Header:     { e: 0, w: 0 },
      Parties:    { e: 0, w: 0 },
      Items:      { e: 0, w: 0 },
      Containers: { e: 0, w: 0 },
      Worksheet:  { e: 0, w: 0 },
    } as Record<string, { e: number; w: number }>;

    if (!preflight) return counts;
    preflight.errors?.forEach((err: any) => {
      const b = bucketFromPath(err.path);
      if (counts[b]) counts[b].e++;
    });
    preflight.warnings?.forEach((w: any) => {
      const b = bucketFromPath(w.path);
      if (counts[b]) counts[b].w++;
    });
    return counts;
  }, [preflight]);

  return (
    <TooltipProvider>
      <div className="wb-page" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <TopNav rightSlot={
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {preflight && (
              <span style={{
                fontFamily: "var(--wb-font-mono)", fontSize: 11, letterSpacing: "0.06em",
                color: preflight.status === "pass" ? "var(--wb-approved)" : "var(--wb-crit-border)",
              }}>
                {preflight.status === "pass"
                  ? `✓ ${preflight.counts.warnings}W`
                  : `✗ ${preflight.counts.errors}E · ${preflight.counts.warnings}W`}
              </span>
            )}
            <span style={{ fontFamily: "var(--wb-font-mono)", fontSize: 11, color: "var(--wb-ghost-dim)", letterSpacing: "0.06em" }}>
              {declarationId.slice(0, 8).toUpperCase()}
            </span>
          </div>
        } />

        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "12px 16px 0" }}>
          <HelpBox title="Workbench: manual declaration entry">
            <p style={{ margin: "0 0 10px" }}>
              Use the Workbench to create or edit declarations manually. Fill in the five tabs in order —
              then click Generate Pack to produce the C82 XML and LB01 worksheet.
            </p>
            <HelpHeading>THE FIVE TABS</HelpHeading>
            <div style={{ display: "grid", gap: 5 }}>
              {[
                ["Header", "Declaration reference, port of entry, customs regime (usually IM4), terms of delivery (CIF/FOB/EXW)."],
                ["Parties", "Consignee (the TT importer — name, address, TIN) and consignor (the overseas exporter)."],
                ["Transport", "Vessel or flight name, AWB/BL number, shipped-on-board date, ETA."],
                ["Worksheet", "Invoice value, exchange rate, freight, insurance. Stallion calculates duty, VAT, and surcharge automatically. Click LOOKUP CBTT to fetch the official exchange rate by date."],
                ["Items", "One row per HS code line. Enter the HS code, description, country of origin, quantity, weight, and value."],
              ].map(([tab, desc]) => (
                <div key={tab} style={{ display: "flex", gap: 8, fontSize: 12 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#1A5E3A", minWidth: 90, flexShrink: 0 }}>{tab}</span>
                  <span style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: "#6B6560" }}>{desc}</span>
                </div>
              ))}
            </div>
            <HelpHeading>KEY FIELDS</HelpHeading>
            <div style={{ display: "grid", gap: 5 }}>
              {[
                ["HS Code", "Format: 9021.29.00.00 (dots included). Must be at least 6 digits. Determines the duty rate."],
                ["Exchange Rate", "Click LOOKUP CBTT to auto-fetch the Central Bank TT rate for the shipped-on-board date."],
                ["Customs Regime", "IM4 is the standard import code for commercial shipments into Trinidad."],
                ["CPC", "Customs Procedure Code — usually 4000 for standard import. Leave as default unless advised otherwise."],
              ].map(([field, desc]) => (
                <div key={field} style={{ display: "flex", gap: 8, fontSize: 12 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#96700A", minWidth: 120, flexShrink: 0 }}>{field}</span>
                  <span style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: "#6B6560" }}>{desc}</span>
                </div>
              ))}
            </div>
            <HelpTip>Save Draft at any time — the declaration is stored in the backend and will appear in the broker review queue when you're ready.</HelpTip>
          </HelpBox>
        </div>

        <div style={{ flex: 1, maxWidth: 860, margin: "0 auto", width: "100%", padding: "24px 16px 120px" }}>
          <WorkbenchHeader
            form={form} setForm={setForm}
            ports={ports} terms={terms}
            transportModes={transportModes} customsRegimes={customsRegimes}
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            setSelectedTemplateId={setSelectedTemplateId}
            onLoadTemplate={handleLoadTemplate}
            sectionErrors={sectionIssueCounts.Header.e}
            sectionWarnings={sectionIssueCounts.Header.w}
          />
          <WorkbenchParties
            form={form} setForm={setForm}
            sectionErrors={sectionIssueCounts.Parties.e}
            sectionWarnings={sectionIssueCounts.Parties.w}
          />
          <WorkbenchItems
            items={items} setItems={setItems}
            packages={packages} unitCodes={unitCodes}
            dutyTaxCodes={dutyTaxCodes} dutyTaxBases={dutyTaxBases}
            cpcCodes={cpcCodes} hsTariffSamples={hsTariffSamples}
            sectionErrors={sectionIssueCounts.Items.e}
            sectionWarnings={sectionIssueCounts.Items.w}
          />
          <WorkbenchContainers
            containers={containers} setContainers={setContainers}
            packages={packages}
            sectionErrors={sectionIssueCounts.Containers.e}
            sectionWarnings={sectionIssueCounts.Containers.w}
          />
          <WorkbenchWorksheet
            form={form} setForm={setForm}
            calc={calc} onCalculate={handleCalculate}
            box23Types={box23Types}
            selectedBox23={selectedBox23} setSelectedBox23={setSelectedBox23}
            shippedOnBoardDate={form.blAwbDate}
            sectionErrors={sectionIssueCounts.Worksheet.e}
            sectionWarnings={sectionIssueCounts.Worksheet.w}
          />
          <WorkbenchActions
            preflight={preflight} packResult={packResult}
            onGenerate={handleGenerate} onSaveDraft={handleSaveDraft}
            generating={generating} savingDraft={savingDraft}
            calc={calc}
            cooldownSeconds={cooldownSeconds}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
