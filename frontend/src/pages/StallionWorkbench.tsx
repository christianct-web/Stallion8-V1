import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  calculateWorksheet,
  createTemplate,
  generatePack,
  getLookup,
  getTemplates,
  STALLION_BASE_URL,
} from "@/services/stallionApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

const uid = () =>
  (globalThis.crypto && "randomUUID" in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

export default function StallionWorkbench() {
  const [ports, setPorts] = useState<Array<{ code: string; label: string }>>([]);
  const [terms, setTerms] = useState<Array<{ code: string; label: string }>>([]);
  const [packages, setPackages] = useState<Array<{ code: string; label: string }>>([]);
  const [transportModes, setTransportModes] = useState<Array<{ code: string; label: string }>>([]);
  const [customsRegimes, setCustomsRegimes] = useState<Array<{ regimeCode: string; asycudaSubCode?: string; asycudaCode?: string; label: string }>>([]);
  const [unitCodes, setUnitCodes] = useState<Array<{ code: string; asycudaCode?: string; label: string }>>([]);
  const [dutyTaxCodes, setDutyTaxCodes] = useState<Array<{ code: string; abbr?: string; label: string }>>([]);
  const [dutyTaxBases, setDutyTaxBases] = useState<Array<{ code: string; label: string }>>([]);
  const [cpcCodes, setCpcCodes] = useState<Array<{ code: string; cpc?: string; label: string }>>([]);
  const [box23Types, setBox23Types] = useState<Array<{ type: string; label: string; amount: number; auto: boolean }>>([]);
  const [hsTariffSamples, setHsTariffSamples] = useState<Array<{ description: string; tariff: string; taxes?: Array<{ code: string; rate: number }> }>>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; payload: any }>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const [form, setForm] = useState({
    // Header - Reference
    declarationRef: "",
    // Header - Location
    port: "",
    term: "",
    modeOfTransport: "",
    customsRegime: "",
    // Header - Parties
    consignorName: "",
    consignorAddress: "",
    consignorStreet: "",
    consignorCity: "",
    consignorCountry: "",
    consigneeCode: "",
    consigneeName: "",
    consigneeAddress: "",
    // Header - Declarant
    declarantTIN: "",
    declarantName: "",
    // Header - Transport
    vesselName: "",
    blAwbNumber: "",
    blAwbDate: "",
    etaDate: "",
    // Header - Financial
    invoiceNumber: "",
    invoiceDate: "",
    currency: "USD",
    bankCode: "01",
    modeOfPayment: "CASH",
    termsCode: "99",
    termsDescription: "Basic",
    // Header - Country
    countryFirstDestination: "US",
    tradingCountry: "US",
    exportCountryCode: "US",
    exportCountryName: "United States",
    countryOfOriginName: "United States",
    // Worksheet values
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
      description: "",
      hsCode: "",
      qty: 1,
      packageType: "",
      grossKg: 0,
      netKg: 0,
      itemValue: 0,
      dutyTaxCode: "",
      dutyTaxBase: "",
      cpc: "",
      unitCode: "",
    },
  ]);

  const [containers, setContainers] = useState<Array<{
    id: string;
    containerNo: string;
    type: string;
    packageType: string;
    packages: number;
    goodsWeight: number;
  }>>([]);

  const [calc, setCalc] = useState<any>(null);
  const [selectedBox23, setSelectedBox23] = useState<string[]>([]);
  const [packResult, setPackResult] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const [p, t, pk, tr, cr, uc, dt, db, cpc, b23, hs, tm] = await Promise.all([
          getLookup("ports"),
          getLookup("terms"),
          getLookup("packages"),
          getLookup("transport_modes"),
          getLookup("customs_regimes"),
          getLookup("unit_codes"),
          getLookup("duty_tax_codes"),
          getLookup("duty_tax_bases"),
          getLookup("cpc_codes"),
          getLookup("box23_types"),
          getLookup("hs_tariff_samples"),
          getTemplates(),
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
        setSelectedBox23((b23.items as any[]).filter((x) => x.auto).map((x) => x.type));
        setTemplates(tm as any);
      } catch {
        toast.error("Could not load Stallion lookup/template data.");
      }
    })();
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((x) => x.id === selectedTemplateId),
    [templates, selectedTemplateId]
  );
  useEffect(() => {
    const dutyCodes = items.map(item => item.dutyTaxCode).filter(Boolean);
    const hasDuty = dutyCodes.includes('01');
    const hasSurcharge = dutyCodes.includes('05');
    const hasVAT = dutyCodes.includes('20');
    
    setForm(f => ({
      ...f,
      duty_rate_pct: hasDuty ? 40 : f.duty_rate_pct,
      surcharge_rate_pct: hasSurcharge ? 15 : f.surcharge_rate_pct,
      vat_rate_pct: hasVAT ? 12.5 : f.vat_rate_pct
    }));
  }, [items]);


  const applyTemplate = () => {
    if (!selectedTemplate) return;
    setForm((f) => ({ ...f, ...(selectedTemplate.payload || {}) }));
    toast.success("Template applied");
  };

  const saveTemplate = async () => {
    const name = prompt("Template name?");
    if (!name) return;
    try {
      await createTemplate({
        name,
        kind: "shipment",
        scope: "team",
        payload: {
          declarationRef: form.declarationRef,
          port: form.port,
          term: form.term,
          modeOfTransport: form.modeOfTransport,
          customsRegime: form.customsRegime,
          consigneeCode: form.consigneeCode,
          vesselName: form.vesselName,
          duty_rate_pct: form.duty_rate_pct,
          surcharge_rate_pct: form.surcharge_rate_pct,
          vat_rate_pct: form.vat_rate_pct,
          global_fee: form.global_fee,
        },
      });
      const tm = await getTemplates();
      setTemplates(tm as any);
      toast.success("Template saved");
    } catch {
      toast.error("Failed to save template");
    }
  };

  const runCalc = async () => {
    try {
      const r = await calculateWorksheet({
        invoice_value_foreign: Number(form.invoice_value_foreign),
        exchange_rate: Number(form.exchange_rate),
        freight_foreign: Number(form.freight_foreign),
        insurance_foreign: Number(form.insurance_foreign),
        other_foreign: Number(form.other_foreign),
        deduction_foreign: Number(form.deduction_foreign),
        duty_rate_pct: Number(form.duty_rate_pct),
        surcharge_rate_pct: Number(form.surcharge_rate_pct),
        vat_rate_pct: Number(form.vat_rate_pct),
        extra_fees_local: Number(form.extra_fees_local),
      });
      setCalc(r);
      toast.success("Worksheet calculated");
    } catch {
      toast.error("Worksheet calculation failed");
    }
  };

  const runGeneratePack = async () => {
    if (!calc) {
      toast.error("Run worksheet calculation first.");
      return;
    }

    try {
      const result = await generatePack({
        header: {
          // Reference
          declarationRef: form.declarationRef,
          // Location
          port: form.port,
          term: form.term,
          modeOfTransport: form.modeOfTransport,
          customsRegime: form.customsRegime,
          // Parties
          consignorName: form.consignorName,
          consignorAddress: form.consignorAddress,
          consignorStreet: form.consignorStreet,
          consignorCity: form.consignorCity,
          consignorCountry: form.consignorCountry,
          consigneeCode: form.consigneeCode,
          consigneeName: form.consigneeName,
          consigneeAddress: form.consigneeAddress,
          // Declarant
          declarantTIN: form.declarantTIN,
          declarantName: form.declarantName,
          // Transport
          vesselName: form.vesselName,
          blAwbNumber: form.blAwbNumber,
          blAwbDate: form.blAwbDate,
          etaDate: form.etaDate,
          // Financial
          invoiceNumber: form.invoiceNumber,
          invoiceDate: form.invoiceDate,
          currency: form.currency,
          bankCode: form.bankCode,
          modeOfPayment: form.modeOfPayment,
          termsCode: form.termsCode,
          termsDescription: form.termsDescription,
          // Country
          countryFirstDestination: form.countryFirstDestination,
          tradingCountry: form.tradingCountry,
          exportCountryCode: form.exportCountryCode,
          exportCountryName: form.exportCountryName,
          countryOfOriginName: form.countryOfOriginName,
        },
        worksheet: {
          ...form,
          ...calc,
          box23_selected: selectedBox23,
        },
        items,
        containers,
      });
      setPackResult(result);
      if (result.status === "blocked") {
        toast.error("Pack blocked: fix required fields and try again.");
      } else {
        toast.success("Pack generated successfully");
      }
    } catch {
      toast.error("Generate Pack failed");
    }
  };

  const setNum = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: Number(v || 0) }));

  const toggleBox23 = (type: string) => {
    setSelectedBox23((arr) => (arr.includes(type) ? arr.filter((x) => x !== type) : [...arr, type]));
  };

  const applyBox23Fees = () => {
    const total = box23Types
      .filter((x) => selectedBox23.includes(x.type))
      .reduce((sum, x) => sum + Number(x.amount || 0), 0);
    setForm((f: any) => ({ ...f, extra_fees_local: total }));
    toast.success("Box 23 fees applied to extra fees");
  };

  const findHsSuggestion = (description: string) => {
    const q = (description || "").trim().toUpperCase();
    if (!q) return null;
    return hsTariffSamples.find((s) => q.includes((s.description || "").toUpperCase()) || (s.description || "").toUpperCase().includes(q));
  };

  const updateItem = (id: string, key: string, value: string | number) => {
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, [key]: value } : it)));
  };

  const addItem = () => {
    setItems((arr) => [
      ...arr,
      {
        id: uid(),
        description: "",
        hsCode: "",
        qty: 1,
        packageType: "",
        grossKg: 0,
        netKg: 0,
        itemValue: 0,
        dutyTaxCode: "",
        dutyTaxBase: "",
        cpc: "",
        unitCode: "",
      },
    ]);
  };

  const removeItem = (id: string) => setItems((arr) => arr.filter((x) => x.id !== id));

  const addContainer = () => {
    setContainers((arr) => [
      ...arr,
      {
        id: uid(),
        containerNo: "",
        type: "40RE",
        packageType: "CT",
        packages: 0,
        goodsWeight: 0,
      },
    ]);
  };

  const updateContainer = (id: string, key: string, value: string | number) => {
    setContainers((arr) => arr.map((c) => (c.id === id ? { ...c, [key]: value } : c)));
  };

  const removeContainer = (id: string) => setContainers((arr) => arr.filter((x) => x.id !== id));

  const sectionIssueCounts = useMemo(() => {
    const out: Record<string, { e: number; w: number }> = {
      Header: { e: 0, w: 0 },
      Parties: { e: 0, w: 0 },
      Worksheet: { e: 0, w: 0 },
      Items: { e: 0, w: 0 },
      Containers: { e: 0, w: 0 },
    };
    const pf = packResult?.preflight;
    if (!pf) return out;

    for (const e of pf.errors || []) {
      const b = bucketFromPath(e.path);
      if (out[b]) out[b].e += 1;
    }
    for (const w of pf.warnings || []) {
      const b = bucketFromPath(w.path);
      if (out[b]) out[b].w += 1;
    }
    return out;
  }, [packResult]);

  const allErrors = useMemo(() => {
    const pfErrors = packResult?.preflight?.errors || [];
    const c82Errors = packResult?.c82Validation?.errors || [];
    return [...pfErrors, ...c82Errors] as Array<{ path: string; message: string }>;
  }, [packResult]);

  const findError = (...paths: string[]) => {
    for (const p of paths) {
      const exact = allErrors.find((e) => e.path === p);
      if (exact) return exact.message;
      const pref = allErrors.find((e) => e.path.startsWith(`${p}.`) || e.path.startsWith(`${p}[`));
      if (pref) return pref.message;
    }
    return null;
  };

  const hasError = (...paths: string[]) => Boolean(findError(...paths));

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Stallion Workbench</h1>
              <p className="text-sm text-muted-foreground">
                Modern worksheet-first customs entry (prototype)
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={runGeneratePack} disabled={!calc}>Generate Pack</Button>
              <Link to="/">
                <Button variant="outline">Back</Button>
              </Link>
            </div>
          </div>

        <Card id="section-header">
          <CardHeader>
            <CardTitle>
              Header + Lookups + Templates
              {(sectionIssueCounts.Header.e + sectionIssueCounts.Header.w) > 0 ? (
                <span className="ml-2 text-xs font-medium text-muted-foreground">
                  ({sectionIssueCounts.Header.e}E/{sectionIssueCounts.Header.w}W)
                </span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-4">
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Declaration Ref</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Customs declaration reference number (e.g., LB01/23)</p>
          </TooltipContent>
        </Tooltip>
              <Input value={form.declarationRef} onChange={(e) => setForm((f) => ({ ...f, declarationRef: e.target.value }))} placeholder="LB01/23" />
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Port of Entry</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Port where goods will be cleared through customs</p>
          </TooltipContent>
        </Tooltip>
              <Select value={form.port} onValueChange={(v) => setForm((f) => ({ ...f, port: v }))}>
                <SelectTrigger className={hasError("header.port", "identification.office_segment_customs_clearance_office_code") ? "border-red-500" : ""}>
                  <SelectValue placeholder="Select port" />
                </SelectTrigger>
                <SelectContent>
                  {ports.map((p) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.code} - {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {findError("header.port", "identification.office_segment_customs_clearance_office_code") ? (
                <p className="mt-1 text-xs text-red-600">{findError("header.port", "identification.office_segment_customs_clearance_office_code")}</p>
              ) : null}
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Terms of Delivery</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Incoterms governing delivery (CIF, FOB, etc.)</p>
          </TooltipContent>
        </Tooltip>
              <Select value={form.term} onValueChange={(v) => setForm((f) => ({ ...f, term: v }))}>
                <SelectTrigger className={hasError("header.term") ? "border-red-500" : ""}>
                  <SelectValue placeholder="Select terms" />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((t: any) => (
                    <SelectItem key={t.code} value={t.code}>
                      {t.code} - {t.abbr ? `${t.abbr} - ` : ""}{t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {findError("header.term") ? <p className="mt-1 text-xs text-red-600">{findError("header.term")}</p> : null}
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Mode of Transport</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">How goods arrive (Sea, Air, Road)</p>
          </TooltipContent>
        </Tooltip>
              <Select value={form.modeOfTransport} onValueChange={(v) => setForm((f) => ({ ...f, modeOfTransport: v }))}>
                <SelectTrigger className={hasError("header.modeOfTransport") ? "border-red-500" : ""}>
                  <SelectValue placeholder="Select transport mode" />
                </SelectTrigger>
                <SelectContent>
                  {transportModes.map((m) => (
                    <SelectItem key={m.code} value={m.code}>
                      {m.code} - {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {findError("header.modeOfTransport") ? <p className="mt-1 text-xs text-red-600">{findError("header.modeOfTransport")}</p> : null}
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Customs Regime</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Type of customs procedure (Import, Transit, etc.)</p>
          </TooltipContent>
        </Tooltip>
              <Select value={form.customsRegime} onValueChange={(v) => setForm((f) => ({ ...f, customsRegime: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select regime" />
                </SelectTrigger>
                <SelectContent>
                  {customsRegimes.map((r) => (
                    <SelectItem key={r.regimeCode} value={r.regimeCode}>
                      {r.regimeCode} - {r.asycudaCode || ""}/{r.asycudaSubCode || ""} - {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Consignee Code</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Importer's customs registration code</p>
          </TooltipContent>
        </Tooltip>
              <Input
                value={form.consigneeCode}
                onChange={(e) => setForm((f) => ({ ...f, consigneeCode: e.target.value }))}
              />
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Vessel / Flight</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Name of vessel or flight number</p>
          </TooltipContent>
        </Tooltip>
              <Input
                className={hasError("header.vesselName") ? "border-red-500" : ""}
                value={form.vesselName}
                onChange={(e) => setForm((f) => ({ ...f, vesselName: e.target.value }))}
              />
              {findError("header.vesselName") ? <p className="mt-1 text-xs text-red-600">{findError("header.vesselName")}</p> : null}
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Supplier Name</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Exporter/supplier company name</p>
          </TooltipContent>
        </Tooltip>
              <Input
                value={form.consignorName}
                onChange={(e) => setForm((f) => ({ ...f, consignorName: e.target.value }))}
              />
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Supplier Address</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Supplier's full address (street, city, country)</p>
          </TooltipContent>
        </Tooltip>
              <Input
                value={form.consignorAddress}
                onChange={(e) => {
                  const newAddress = e.target.value;
                  // Parse address lines
                  const lines = newAddress.split('\n');
                  const newStreet = lines[0] || '';
                  const newCity = lines[1] || '';
                  // Note: country is not parsed from address - keep separate
                  setForm((f) => ({ 
                    ...f, 
                    consignorAddress: newAddress,
                    consignorStreet: newStreet,
                    consignorCity: newCity
                  }));
                }}
              />
            </div>
            <div>
              <Label>Supplier Street</Label>
              <Input
                className={hasError("header.consignorStreet") ? "border-red-500" : ""}
                value={form.consignorStreet}
                onChange={(e) => setForm((f) => ({ ...f, consignorStreet: e.target.value }))}
              />
              {findError("header.consignorStreet") ? <p className="mt-1 text-xs text-red-600">{findError("header.consignorStreet")}</p> : null}
            </div>
            <div>
              <Label>Supplier City</Label>
              <Input
                className={hasError("header.consignorCity") ? "border-red-500" : ""}
                value={form.consignorCity}
                onChange={(e) => setForm((f) => ({ ...f, consignorCity: e.target.value }))}
              />
              {findError("header.consignorCity") ? <p className="mt-1 text-xs text-red-600">{findError("header.consignorCity")}</p> : null}
            </div>
            <div>
              <Label>Supplier Country</Label>
              <Input
                className={hasError("header.consignorCountry") ? "border-red-500" : ""}
                value={form.consignorCountry}
                onChange={(e) => setForm((f) => ({ ...f, consignorCountry: e.target.value }))}
              />
              {findError("header.consignorCountry") ? <p className="mt-1 text-xs text-red-600">{findError("header.consignorCountry")}</p> : null}
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Invoice Number</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Commercial invoice number</p>
          </TooltipContent>
        </Tooltip>
              <Input
                value={form.invoiceNumber}
                onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
              />
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Invoice Date</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Date of commercial invoice</p>
          </TooltipContent>
        </Tooltip>
              <Input
                type="date"
                value={form.invoiceDate}
                onChange={(e) => setForm((f) => ({ ...f, invoiceDate: e.target.value }))}
              />
            </div>
            <div>
              <Label>Saved Templates</Label>
              <div className="flex gap-2">
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={applyTemplate}>
                  Apply
                </Button>
              </div>
            </div>
            <div className="flex items-end">
              <Button onClick={saveTemplate}>Save current as template</Button>
            </div>
          </CardContent>
        </Card>

        <Card id="section-parties">
          <CardHeader>
            <CardTitle>
              Parties & Financial Details
              {(sectionIssueCounts.Parties.e + sectionIssueCounts.Parties.w) > 0 ? (
                <span className="ml-2 text-xs font-medium text-muted-foreground">
                  ({sectionIssueCounts.Parties.e}E/{sectionIssueCounts.Parties.w}W)
                </span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-4">
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Consignee Name</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Name of the importer/consignee</p>
          </TooltipContent>
        </Tooltip>
              <Input
                value={form.consigneeName}
                onChange={(e) => setForm((f) => ({ ...f, consigneeName: e.target.value }))}
              />
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Consignee Address</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Importer's address for customs purposes</p>
          </TooltipContent>
        </Tooltip>
              <Input
                value={form.consigneeAddress}
                onChange={(e) => setForm((f) => ({ ...f, consigneeAddress: e.target.value }))}
              />
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Declarant TIN</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Declarant's Taxpayer Identification Number</p>
          </TooltipContent>
        </Tooltip>
              <Input
                value={form.declarantTIN}
                onChange={(e) => setForm((f) => ({ ...f, declarantTIN: e.target.value }))}
              />
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Declarant Name</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Name of the customs declarant</p>
          </TooltipContent>
        </Tooltip>
              <Input
                value={form.declarantName}
                onChange={(e) => setForm((f) => ({ ...f, declarantName: e.target.value }))}
              />
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>B/L AWB Number</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Bill of Lading or Air Waybill number</p>
          </TooltipContent>
        </Tooltip>
              <Input
                className={hasError("header.blAwbNumber") ? "border-red-500" : ""}
                value={form.blAwbNumber}
                onChange={(e) => setForm((f) => ({ ...f, blAwbNumber: e.target.value }))}
              />
              {findError("header.blAwbNumber") ? <p className="mt-1 text-xs text-red-600">{findError("header.blAwbNumber")}</p> : null}
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>B/L AWB Date</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Date of transport document</p>
          </TooltipContent>
        </Tooltip>
              <Input
                type="date"
                value={form.blAwbDate}
                onChange={(e) => setForm((f) => ({ ...f, blAwbDate: e.target.value }))}
              />
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>ETA Date</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Estimated Time of Arrival at port</p>
          </TooltipContent>
        </Tooltip>
              <Input
                type="date"
                value={form.etaDate}
                onChange={(e) => setForm((f) => ({ ...f, etaDate: e.target.value }))}
              />
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Currency</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Currency of invoice (USD, EUR, etc.)</p>
          </TooltipContent>
        </Tooltip>
              <Input
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              />
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Bank Code</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Bank code for payment processing</p>
          </TooltipContent>
        </Tooltip>
              <Input
                value={form.bankCode}
                onChange={(e) => setForm((f) => ({ ...f, bankCode: e.target.value }))}
              />
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Mode of Payment</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Method of payment (CASH, CREDIT, etc.)</p>
          </TooltipContent>
        </Tooltip>
              <Input
                value={form.modeOfPayment}
                onChange={(e) => setForm((f) => ({ ...f, modeOfPayment: e.target.value }))}
              />
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Terms Code</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Payment terms code</p>
          </TooltipContent>
        </Tooltip>
              <Input
                value={form.termsCode}
                onChange={(e) => setForm((f) => ({ ...f, termsCode: e.target.value }))}
              />
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Terms Description</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Description of payment terms</p>
          </TooltipContent>
        </Tooltip>
              <Input
                value={form.termsDescription}
                onChange={(e) => setForm((f) => ({ ...f, termsDescription: e.target.value }))}
              />
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Country First Destination</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">First country of destination after export</p>
          </TooltipContent>
        </Tooltip>
              <Input
                value={form.countryFirstDestination}
                onChange={(e) => setForm((f) => ({ ...f, countryFirstDestination: e.target.value }))}
              />
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Trading Country</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Country of trading partner</p>
          </TooltipContent>
        </Tooltip>
              <Input
                value={form.tradingCountry}
                onChange={(e) => setForm((f) => ({ ...f, tradingCountry: e.target.value }))}
              />
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Export Country Code</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Country code of exporter</p>
          </TooltipContent>
        </Tooltip>
              <Input
                value={form.exportCountryCode}
                onChange={(e) => setForm((f) => ({ ...f, exportCountryCode: e.target.value }))}
              />
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Export Country Name</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Name of export country</p>
          </TooltipContent>
        </Tooltip>
              <Input
                value={form.exportCountryName}
                onChange={(e) => setForm((f) => ({ ...f, exportCountryName: e.target.value }))}
              />
            </div>
            <div>
              <Tooltip>
          <TooltipTrigger asChild>
            <Label>Country of Origin Name</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Country where goods were produced</p>
          </TooltipContent>
        </Tooltip>
              <Input
                value={form.countryOfOriginName}
                onChange={(e) => setForm((f) => ({ ...f, countryOfOriginName: e.target.value }))}
              />
            </div>
          </CardContent>
        </Card>


        <Card id="section-items">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                Item Editor v1
                {(sectionIssueCounts.Items.e + sectionIssueCounts.Items.w) > 0 ? (
                  <span className="ml-2 text-xs font-medium text-muted-foreground">
                    ({sectionIssueCounts.Items.e}E/{sectionIssueCounts.Items.w}W)
                  </span>
                ) : null}
              </CardTitle>
              <Button variant="outline" onClick={addItem}>Add Item</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((item, idx) => (
              <div key={item.id} className="grid md:grid-cols-8 gap-2 border rounded p-3">
                <div>
                  <Label>{`Item ${idx + 1} Description`}</Label>
                  <Input value={item.description} onChange={(e)=>updateItem(item.id,'description',e.target.value)} />
                  <div className="mt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const hit = findHsSuggestion(item.description);
                        if (!hit) return toast.error("No HS sample match found");
                        updateItem(item.id, 'hsCode', hit.tariff);
                        toast.success(`HS suggested: ${hit.tariff}`);
                      }}
                    >
                      Suggest HS
                    </Button>
                  </div>
                </div>
                <Field label="HS Code">
                  <Input
                    className={hasError(`items[${idx}].hsCode`) || hasError("items") ? "border-red-500" : ""}
                    value={item.hsCode}
                    onChange={(e)=>updateItem(item.id,'hsCode',e.target.value)}
                  />
                  {findError(`items[${idx}].hsCode`) ? <p className="mt-1 text-xs text-red-600">{findError(`items[${idx}].hsCode`)}</p> : null}
                </Field>
                <div>
                  <Tooltip>
          <TooltipTrigger asChild>
            <Label>CPC</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Customs Procedure Code</p>
          </TooltipContent>
        </Tooltip>
                  <Select value={item.cpc || ""} onValueChange={(v)=>updateItem(item.id,'cpc',v)}>
                    <SelectTrigger><SelectValue placeholder="CPC" /></SelectTrigger>
                    <SelectContent>
                      {cpcCodes.map((c)=><SelectItem key={c.code} value={c.code}>{c.code} - {c.cpc || ""} - {c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Tooltip>
          <TooltipTrigger asChild>
            <Label>Duty/Tax</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Duty or tax code applied to item</p>
          </TooltipContent>
        </Tooltip>
                  <Select value={item.dutyTaxCode || ""} onValueChange={(v)=>updateItem(item.id,'dutyTaxCode',v)}>
                    <SelectTrigger><SelectValue placeholder="Code" /></SelectTrigger>
                    <SelectContent>
                      {dutyTaxCodes.map((d)=><SelectItem key={d.code} value={d.code}>{d.code} - {d.abbr || ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Tooltip>
          <TooltipTrigger asChild>
            <Label>Duty/Tax Base</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Base for duty calculation (value, weight, etc.)</p>
          </TooltipContent>
        </Tooltip>
                  <Select value={item.dutyTaxBase || ""} onValueChange={(v)=>updateItem(item.id,'dutyTaxBase',v)}>
                    <SelectTrigger><SelectValue placeholder="Base" /></SelectTrigger>
                    <SelectContent>
                      {dutyTaxBases.map((b)=><SelectItem key={b.code} value={b.code}>{b.code} - {b.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Tooltip>
          <TooltipTrigger asChild>
            <Label>Unit Code</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Unit of measurement code</p>
          </TooltipContent>
        </Tooltip>
                  <Select value={item.unitCode || ""} onValueChange={(v)=>updateItem(item.id,'unitCode',v)}>
                    <SelectTrigger><SelectValue placeholder="Unit" /></SelectTrigger>
                    <SelectContent>
                      {unitCodes.map((u)=><SelectItem key={u.code} value={u.code}>{u.code} - {u.asycudaCode || ""} - {u.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Field label="Qty"><Input type="number" value={item.qty} onChange={(e)=>updateItem(item.id,'qty',Number(e.target.value||0))} /></Field>
                <div>
                  <Tooltip>
          <TooltipTrigger asChild>
            <Label>Package</Label>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">Type of packaging</p>
          </TooltipContent>
        </Tooltip>
                  <Select value={item.packageType} onValueChange={(v)=>updateItem(item.id,'packageType',v)}>
                    <SelectTrigger><SelectValue placeholder="Pkg" /></SelectTrigger>
                    <SelectContent>{packages.map((p:any)=><SelectItem key={p.code} value={p.code}>{p.code} - {p.asycudaCode || ""} - {p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Field label="Gross Kg"><Input type="number" value={item.grossKg} onChange={(e)=>updateItem(item.id,'grossKg',Number(e.target.value||0))} /></Field>
                <Field label="Net Kg"><Input type="number" value={item.netKg} onChange={(e)=>updateItem(item.id,'netKg',Number(e.target.value||0))} /></Field>
                <Field label="Item Value"><Input type="number" value={item.itemValue} onChange={(e)=>updateItem(item.id,'itemValue',Number(e.target.value||0))} /></Field>
                <div className="flex items-end"><Button variant="ghost" onClick={()=>removeItem(item.id)}>Remove</Button></div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card id="section-containers">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                Container Panel
                {(sectionIssueCounts.Containers.e + sectionIssueCounts.Containers.w) > 0 ? (
                  <span className="ml-2 text-xs font-medium text-muted-foreground">
                    ({sectionIssueCounts.Containers.e}E/{sectionIssueCounts.Containers.w}W)
                  </span>
                ) : null}
              </CardTitle>
              <Button variant="outline" onClick={addContainer}>Add Container</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {containers.length === 0 && <p className="text-sm text-muted-foreground">No containers added.</p>}
            {containers.map((c, idx) => (
              <div key={c.id} className="grid md:grid-cols-7 gap-2 border rounded p-3">
                <Field label={`Container ${idx + 1} No`}><Input value={c.containerNo} onChange={(e)=>updateContainer(c.id,'containerNo',e.target.value)} /></Field>
                <Field label="Type"><Input value={c.type} onChange={(e)=>updateContainer(c.id,'type',e.target.value)} /></Field>
                <div>
                  <Label>Package Type</Label>
                  <Select value={c.packageType} onValueChange={(v)=>updateContainer(c.id,'packageType',v)}>
                    <SelectTrigger><SelectValue placeholder="Pkg" /></SelectTrigger>
                    <SelectContent>{packages.map((p:any)=><SelectItem key={p.code} value={p.code}>{p.code} - {p.asycudaCode || ""} - {p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Field label="Packages"><Input type="number" value={c.packages} onChange={(e)=>updateContainer(c.id,'packages',Number(e.target.value||0))} /></Field>
                <Field label="Goods Weight"><Input type="number" value={c.goodsWeight} onChange={(e)=>updateContainer(c.id,'goodsWeight',Number(e.target.value||0))} /></Field>
                <div className="flex items-end"><Button variant="ghost" onClick={()=>removeContainer(c.id)}>Remove</Button></div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card id="section-worksheet">
          <CardHeader>
            <CardTitle>
              Worksheet Calculator
              {(sectionIssueCounts.Worksheet.e + sectionIssueCounts.Worksheet.w) > 0 ? (
                <span className="ml-2 text-xs font-medium text-muted-foreground">
                  ({sectionIssueCounts.Worksheet.e}E/{sectionIssueCounts.Worksheet.w}W)
                </span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-4 gap-4">
            <Field label="Invoice (foreign)">
              <Input type="number" value={form.invoice_value_foreign} onChange={(e) => setNum("invoice_value_foreign", e.target.value)} />
            </Field>
            <Field label="Exchange rate">
              <Input
                className={hasError("worksheet.exchange_rate") ? "border-red-500" : ""}
                type="number"
                value={form.exchange_rate}
                onChange={(e) => setNum("exchange_rate", e.target.value)}
              />
              {findError("worksheet.exchange_rate") ? <p className="mt-1 text-xs text-red-600">{findError("worksheet.exchange_rate")}</p> : null}
            </Field>
            <Field label="Freight">
              <Input type="number" value={form.freight_foreign} onChange={(e) => setNum("freight_foreign", e.target.value)} />
            </Field>
            <Field label="Insurance">
              <Input type="number" value={form.insurance_foreign} onChange={(e) => setNum("insurance_foreign", e.target.value)} />
            </Field>
            <Field label="Other">
              <Input type="number" value={form.other_foreign} onChange={(e) => setNum("other_foreign", e.target.value)} />
            </Field>
            <Field label="Deduction">
              <Input type="number" value={form.deduction_foreign} onChange={(e) => setNum("deduction_foreign", e.target.value)} />
            </Field>
            <Field label="Duty %">
              <Input type="number" value={form.duty_rate_pct} onChange={(e) => setNum("duty_rate_pct", e.target.value)} />
            </Field>
            <Field label="Surcharge %">
              <Input type="number" value={form.surcharge_rate_pct} onChange={(e) => setNum("surcharge_rate_pct", e.target.value)} />
            </Field>
            <Field label="VAT %">
              <Input type="number" value={form.vat_rate_pct} onChange={(e) => setNum("vat_rate_pct", e.target.value)} />
            </Field>
            <Field label="Extra fees (local)">
              <Input type="number" value={form.extra_fees_local} onChange={(e) => setNum("extra_fees_local", e.target.value)} />
            </Field>
            <Field label="Global fee (UFC)">
              <Input type="number" value={form.global_fee} onChange={(e) => setNum("global_fee", e.target.value)} />
            </Field>
            <div className="md:col-span-4">
              <Label>Box 23 Types (fee presets)</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {box23Types.map((b) => {
                  const active = selectedBox23.includes(b.type);
                  return (
                    <Button
                      key={b.type}
                      type="button"
                      variant={active ? "default" : "outline"}
                      onClick={() => toggleBox23(b.type)}
                    >
                      {b.type} ({Number(b.amount || 0).toFixed(2)})
                    </Button>
                  );
                })}
                <Button type="button" variant="secondary" onClick={applyBox23Fees}>Apply Box 23 to Extra Fees</Button>
              </div>
            </div>
            <div className="md:col-span-4 flex gap-2 pt-2">
              <Button onClick={runCalc}>Calculate</Button>
            </div>
            {calc && (
              <div className="md:col-span-4 grid md:grid-cols-4 gap-2 text-sm bg-muted/40 p-3 rounded">
                <Result label="CIF (foreign)" value={calc.cif_foreign} />
                <Result label="CIF (local)" value={calc.cif_local} />
                <Result label="Duty" value={calc.duty} />
                <Result label="Surcharge" value={calc.surcharge} />
                <Result label="VAT" value={calc.vat} />
                <Result label="Extra fees" value={calc.extra_fees_local} />
                <Result label="Total assessed" value={calc.total_assessed} strong />
              </div>
            )}
          </CardContent>
        </Card>

        {packResult && (
          <Card>
            <CardHeader><CardTitle>Generate Pack Result</CardTitle></CardHeader>
            <CardContent>
              <div className="text-sm mb-2">Status: <b>{packResult.status}</b> | Generated: {packResult.generatedAt}</div>
              {packResult?.preflight ? <PreflightChecklist preflight={packResult.preflight} /> : null}
              <ul className="text-sm space-y-1">
                {packResult.documents?.map((d: any) => (
                  <li key={d.name}>
                    • {d.name}: {d.status} ({d.ref}){" "}
                    {d.url ? (
                      <a className="underline text-blue-600" href={`${STALLION_BASE_URL}${d.url}`} target="_blank" rel="noreferrer">
                        open
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  </TooltipProvider>
);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  // Simple description mapping
  const fieldDescriptions: Record<string, string> = {
    "Invoice (foreign)": "Total invoice value in foreign currency",
    "Exchange rate": "Exchange rate to local currency",
    "Freight": "International freight cost in foreign currency",
    "Insurance": "Insurance cost in foreign currency",
    "Other": "Other costs (packing, handling) in foreign currency",
    "Deduction": "Any deductions from CIF value",
    "Duty %": "Import duty percentage rate",
    "Surcharge %": "Import surcharge percentage rate",
    "VAT %": "Value Added Tax percentage rate",
    "Extra fees (local)": "Additional local fees (Box 23, etc.)",
    "Global fee (UFC)": "Fixed customs user fee",
    "CIF (foreign)": "Cost, Insurance, Freight in foreign currency",
    "CIF (local)": "Cost, Insurance, Freight in local currency",
    "Duty": "Calculated import duty amount",
    "Surcharge": "Calculated import surcharge amount",
    "VAT": "Calculated Value Added Tax amount",
    "Extra fees": "Total of extra local fees",
    "Total assessed": "Total amount to be paid to customs",
  };
  
  const description = fieldDescriptions[label] || label;
  
  return (
    <div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Label>{label}</Label>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-sm">{description}</p>
        </TooltipContent>
      </Tooltip>
      {children}
    </div>
  );
}

function Result({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={strong ? "font-bold text-lg" : "font-medium"}>{Number(value).toLocaleString()}</div>
    </div>
  );
}

function bucketFromPath(path: string): "Header" | "Parties" | "Items" | "Containers" | "Worksheet" | "Other" {
  if (path.startsWith("header.")) {
    const field = path.substring(7); // Remove "header."
    // Fields that belong to Parties section
    const partiesFields = [
      "consignorStreet", "consignorCity", "consignorCountry",
      "consigneeName", "consigneeAddress",
      "declarantTIN", "declarantName",
      "blAwbNumber", "blAwbDate", "etaDate",
      "currency", "bankCode", "modeOfPayment", "termsCode", "termsDescription",
      "countryFirstDestination", "tradingCountry", "exportCountryCode", "exportCountryName", "countryOfOriginName"
    ];
    // Check if field matches any parties field (could be exact or with dot suffix)
    for (const pf of partiesFields) {
      if (field === pf || field.startsWith(pf + ".")) {
        return "Parties";
      }
    }
    // All other header fields go to Header section
    return "Header";
  }
  if (path.startsWith("items[")) return "Items";
  if (path.startsWith("containers[")) return "Containers";
  if (path.startsWith("worksheet.")) return "Worksheet";
  return "Other";
}

function sectionIdFromBucket(bucket: string): string | null {
  if (bucket === "Header") return "section-header";
  if (bucket === "Parties") return "section-parties";
  if (bucket === "Items") return "section-items";
  if (bucket === "Containers") return "section-containers";
  if (bucket === "Worksheet") return "section-worksheet";
  return null;
}

function jumpToSection(bucket: string) {
  const id = sectionIdFromBucket(bucket);
  if (!id) return;
  const section = document.getElementById(id);
  section?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Focus first editable control after scroll for one-click remediation.
  setTimeout(() => {
    const el = section?.querySelector(
      'input, textarea, [role="combobox"], select, button[role="combobox"]'
    ) as HTMLElement | null;
    el?.focus();
  }, 220);
}

function PreflightChecklist({
  preflight,
}: {
  preflight: {
    status: "pass" | "fail";
    errors: { path: string; message: string }[];
    warnings: { path: string; message: string }[];
    counts: { errors: number; warnings: number };
  };
}) {
  const errorGroups = preflight.errors.reduce((acc, e) => {
    const key = bucketFromPath(e.path);
    acc[key] = acc[key] || [];
    acc[key].push(e);
    return acc;
  }, {} as Record<string, Array<{ path: string; message: string }>>);

  const warningGroups = preflight.warnings.reduce((acc, w) => {
    const key = bucketFromPath(w.path);
    acc[key] = acc[key] || [];
    acc[key].push(w);
    return acc;
  }, {} as Record<string, Array<{ path: string; message: string }>>);

  return (
    <div className="space-y-3 mb-3">
      {preflight.errors.length > 0 ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <div className="font-semibold mb-2">Fix before generate ({preflight.counts.errors} errors)</div>
          {Object.entries(errorGroups).map(([section, rows]) => (
            <div key={section} className="mb-2 last:mb-0">
              <div className="font-medium flex items-center gap-2">
                <span>{section}</span>
                {sectionIdFromBucket(section) ? (
                  <button
                    type="button"
                    className="underline"
                    onClick={() => jumpToSection(section)}
                  >
                    Jump to section
                  </button>
                ) : null}
              </div>
              <ul className="list-disc pl-5">
                {rows.map((r, i) => (
                  <li key={`${section}-${r.path}-${i}`}>{r.path}: {r.message}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {preflight.warnings.length > 0 ? (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          <div className="font-semibold mb-2">Warnings ({preflight.counts.warnings})</div>
          {Object.entries(warningGroups).map(([section, rows]) => (
            <div key={section} className="mb-2 last:mb-0">
              <div className="font-medium flex items-center gap-2">
                <span>{section}</span>
                {sectionIdFromBucket(section) ? (
                  <button
                    type="button"
                    className="underline"
                    onClick={() => jumpToSection(section)}
                  >
                    Jump to section
                  </button>
                ) : null}
              </div>
              <ul className="list-disc pl-5">
                {rows.map((r, i) => (
                  <li key={`${section}-${r.path}-${i}`}>{r.path}: {r.message}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
