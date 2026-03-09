const BASE_URL =
  (import.meta.env.VITE_STALLION_API_URL as string | undefined)?.replace(/\/$/, "") ||
  `${window.location.protocol}//${window.location.hostname}:8022`;

const REQUEST_TIMEOUT_MS = 12000;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const warnedKeys = new Set<string>();

function warnOnce(key: string, message: string, data?: unknown) {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  // eslint-disable-next-line no-console
  console.warn(`[stallionApi] ${message}`, data);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms);
    promise
      .then((v) => resolve(v))
      .catch((e) => reject(e))
      .finally(() => {
        if (timer) clearTimeout(timer);
      });
  });
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const request = () =>
    fetch(`${BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
      ...init,
    });

  let res: Response;
  try {
    res = await withTimeout(request(), REQUEST_TIMEOUT_MS);
  } catch (e) {
    // one retry for transient network/process churn
    res = await withTimeout(request(), REQUEST_TIMEOUT_MS).catch((retryErr) => {
      throw retryErr ?? e;
    });
  }

  if (!res.ok) {
    if (RETRYABLE_STATUSES.has(res.status)) {
      const retryRes = await withTimeout(request(), REQUEST_TIMEOUT_MS);
      if (!retryRes.ok) throw new Error(`${path} failed (${retryRes.status})`);
      return (await retryRes.json()) as T;
    }
    throw new Error(`${path} failed (${res.status})`);
  }

  return (await res.json()) as T;
}

function normalizeListEnvelope<T = any>(res: unknown, endpoint: string): T[] {
  if (Array.isArray(res)) return res as T[];

  if (res && typeof res === "object") {
    const o = res as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as T[];
    if (Array.isArray(o.declarations)) return o.declarations as T[];

    if (o.data && typeof o.data === "object") {
      const d = o.data as Record<string, unknown>;
      if (Array.isArray(d.items)) return d.items as T[];
      if (Array.isArray(d.declarations)) return d.declarations as T[];
    }

    warnOnce(
      `${endpoint}-envelope`,
      `Unexpected list envelope from ${endpoint}; expected array/items/declarations. Falling back to [].`,
      res
    );
    return [];
  }

  warnOnce(`${endpoint}-nonobject`, `Unexpected non-object response from ${endpoint}. Falling back to [].`, res);
  return [];
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

export async function listDeclarations(status?: string): Promise<{ items: any[] }> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await api<unknown>(`/declarations${q}`);
  return { items: normalizeListEnvelope(res, "/declarations") };
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
