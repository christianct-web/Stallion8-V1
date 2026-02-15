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
    declarationRef: "",
    port: "",
    term: "",
    modeOfTransport: "",
    customsRegime: "",
    consigneeCode: "",
    vesselName: "",
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
    try {
      const result = await generatePack({
        header: {
          declarationRef: form.declarationRef,
          port: form.port,
          term: form.term,
          modeOfTransport: form.modeOfTransport,
          customsRegime: form.customsRegime,
          consigneeCode: form.consigneeCode,
          vesselName: form.vesselName,
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
      toast.success("Generate Pack shell complete");
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

  return (
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
            <Button onClick={runGeneratePack}>Generate Pack</Button>
            <Link to="/">
              <Button variant="outline">Back</Button>
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Header + Lookups + Templates</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-4">
            <div>
              <Label>Declaration Ref</Label>
              <Input value={form.declarationRef} onChange={(e) => setForm((f) => ({ ...f, declarationRef: e.target.value }))} placeholder="LB01/23" />
            </div>
            <div>
              <Label>Port of Entry</Label>
              <Select value={form.port} onValueChange={(v) => setForm((f) => ({ ...f, port: v }))}>
                <SelectTrigger>
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
            </div>
            <div>
              <Label>Terms of Delivery</Label>
              <Select value={form.term} onValueChange={(v) => setForm((f) => ({ ...f, term: v }))}>
                <SelectTrigger>
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
            </div>
            <div>
              <Label>Mode of Transport</Label>
              <Select value={form.modeOfTransport} onValueChange={(v) => setForm((f) => ({ ...f, modeOfTransport: v }))}>
                <SelectTrigger>
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
            </div>
            <div>
              <Label>Customs Regime</Label>
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
              <Label>Consignee Code</Label>
              <Input
                value={form.consigneeCode}
                onChange={(e) => setForm((f) => ({ ...f, consigneeCode: e.target.value }))}
              />
            </div>
            <div>
              <Label>Vessel / Flight</Label>
              <Input
                value={form.vesselName}
                onChange={(e) => setForm((f) => ({ ...f, vesselName: e.target.value }))}
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

        <Card>
          <CardHeader>
            <CardTitle>Worksheet Calculator</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-4 gap-4">
            <Field label="Invoice (foreign)">
              <Input type="number" value={form.invoice_value_foreign} onChange={(e) => setNum("invoice_value_foreign", e.target.value)} />
            </Field>
            <Field label="Exchange rate">
              <Input type="number" value={form.exchange_rate} onChange={(e) => setNum("exchange_rate", e.target.value)} />
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

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Item Editor v1</CardTitle>
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
                <Field label="HS Code"><Input value={item.hsCode} onChange={(e)=>updateItem(item.id,'hsCode',e.target.value)} /></Field>
                <div>
                  <Label>CPC</Label>
                  <Select value={item.cpc || ""} onValueChange={(v)=>updateItem(item.id,'cpc',v)}>
                    <SelectTrigger><SelectValue placeholder="CPC" /></SelectTrigger>
                    <SelectContent>
                      {cpcCodes.map((c)=><SelectItem key={c.code} value={c.code}>{c.code} - {c.cpc || ""} - {c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Duty/Tax</Label>
                  <Select value={item.dutyTaxCode || ""} onValueChange={(v)=>updateItem(item.id,'dutyTaxCode',v)}>
                    <SelectTrigger><SelectValue placeholder="Code" /></SelectTrigger>
                    <SelectContent>
                      {dutyTaxCodes.map((d)=><SelectItem key={d.code} value={d.code}>{d.code} - {d.abbr || ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Duty/Tax Base</Label>
                  <Select value={item.dutyTaxBase || ""} onValueChange={(v)=>updateItem(item.id,'dutyTaxBase',v)}>
                    <SelectTrigger><SelectValue placeholder="Base" /></SelectTrigger>
                    <SelectContent>
                      {dutyTaxBases.map((b)=><SelectItem key={b.code} value={b.code}>{b.code} - {b.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Unit Code</Label>
                  <Select value={item.unitCode || ""} onValueChange={(v)=>updateItem(item.id,'unitCode',v)}>
                    <SelectTrigger><SelectValue placeholder="Unit" /></SelectTrigger>
                    <SelectContent>
                      {unitCodes.map((u)=><SelectItem key={u.code} value={u.code}>{u.code} - {u.asycudaCode || ""} - {u.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Field label="Qty"><Input type="number" value={item.qty} onChange={(e)=>updateItem(item.id,'qty',Number(e.target.value||0))} /></Field>
                <div>
                  <Label>Package</Label>
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

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Container Panel</CardTitle>
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

        {packResult && (
          <Card>
            <CardHeader><CardTitle>Generate Pack Result</CardTitle></CardHeader>
            <CardContent>
              <div className="text-sm mb-2">Status: <b>{packResult.status}</b> | Generated: {packResult.generatedAt}</div>
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
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
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
