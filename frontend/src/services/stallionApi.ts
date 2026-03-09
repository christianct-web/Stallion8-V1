const BASE_URL =
  (import.meta.env.VITE_STALLION_API_URL as string | undefined)?.replace(/\/$/, "") ||
  `${window.location.protocol}//${window.location.hostname}:8022`;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return (await res.json()) as T;
}

export type LookupKind = "ports" | "terms" | "packages" | "duty_tax_codes" | "duty_tax_bases" | "cpc_codes" | "transport_modes" | "unit_codes" | "box23_types" | "customs_regimes" | "hs_tariff_samples";

export async function getLookup(kind: LookupKind): Promise<{ kind: string; items: { code: string; label: string }[] }> {
  return api(`/lookups/${kind}`);
}

export async function getTemplates(): Promise<Array<{ id: string; name: string; kind: string; scope: string; payload: any }>> {
  return api("/templates");
}

export async function createTemplate(payload: { name: string; kind: string; scope: string; payload: any }) {
  return api("/templates", { method: "POST", body: JSON.stringify(payload) });
}

export async function calculateWorksheet(payload: {
  invoice_value_foreign: number;
  exchange_rate: number;
  freight_foreign: number;
  insurance_foreign: number;
  other_foreign: number;
  deduction_foreign: number;
  duty_rate_pct: number;
  surcharge_rate_pct: number;
  vat_rate_pct: number;
  extra_fees_local: number;
}) {
  return api<{
    cif_foreign: number;
    cif_local: number;
    duty: number;
    surcharge: number;
    vat: number;
    extra_fees_local: number;
    total_assessed: number;
  }>("/worksheet/calculate", { method: "POST", body: JSON.stringify(payload) });
}

export async function generatePack(payload: {
  header: Record<string, unknown>;
  worksheet: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  containers: Array<Record<string, unknown>>;
}) {
  return api<{
    status: "generated" | "blocked";
    generatedAt: string;
    preflight?: {
      status: "pass" | "fail";
      errors: { path: string; message: string }[];
      warnings: { path: string; message: string }[];
      counts: { errors: number; warnings: number };
    };
    documents: { name: string; status: string; ref: string; url?: string }[];
  }>("/pack/generate", { method: "POST", body: JSON.stringify(payload) });
}

export async function listDeclarations(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return api<{ items: any[] }>(`/declarations${q}`);
}

export async function upsertDeclaration(payload: Record<string, unknown>) {
  return api<{ ok: boolean; id: string }>("/declarations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function reviewDeclaration(
  declarationId: string,
  payload: Record<string, unknown>
) {
  return api<{ ok: boolean; id: string; status: string }>(`/declarations/${declarationId}/review`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export { BASE_URL as STALLION_BASE_URL };
