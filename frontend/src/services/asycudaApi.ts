import { DeclarationPayload, ValidationReport } from "@/types/declaration";

const BASE_URL =
  (import.meta.env.VITE_ASYCUDA_SERVICE_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} failed (${res.status}): ${text}`);
  }

  return (await res.json()) as T;
}

export async function validateViaApi(
  payload: DeclarationPayload,
  declarationId?: string
): Promise<ValidationReport> {
  const data = await postJson<ValidationReport & { meta?: unknown }>("/validate", {
    declaration: payload,
    meta: declarationId ? { declaration_id: declarationId } : undefined,
  });

  return {
    ...data,
    validated_at: (data as { validated_at?: string }).validated_at || new Date().toISOString(),
  };
}

export async function exportXmlViaApi(
  payload: DeclarationPayload,
  options?: { ace_compat?: boolean; presence_profile?: string }
): Promise<{ validation: ValidationReport; xml: string | null }> {
  const data = await postJson<{
    validation: ValidationReport;
    xml: string | null;
  }>("/export-xml", {
    declaration: payload,
    options: {
      ace_compat: options?.ace_compat ?? true,
      presence_profile: options?.presence_profile,
    },
  });

  return data;
}

export { BASE_URL as ASYCUDA_BASE_URL };
