export interface EngineHealthResponse {
  status: string;
  runtime: string;
  configPath?: string;
  configLastUpdated?: string;
}

export interface EngineConfigResponse {
  version: number;
  lastUpdated: string;
  path: string;
  config: Record<string, unknown>;
}

export interface EngineConfigPreset {
  id: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
}

function getEngineBaseUrl(): string {
  const baseUrl = process.env.VOWEL_ENGINE_URL?.trim();
  if (!baseUrl) {
    throw new Error("VOWEL_ENGINE_URL is not configured");
  }
  return baseUrl.replace(/\/$/, "");
}

function getEngineApiKey(): string {
  const apiKey = process.env.VOWEL_ENGINE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("VOWEL_ENGINE_API_KEY is not configured");
  }
  return apiKey;
}

async function requestEngine<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getEngineBaseUrl()}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getEngineApiKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Engine request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

export async function getEngineHealth(): Promise<EngineHealthResponse> {
  const response = await fetch(`${getEngineBaseUrl()}/health`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Engine health request failed (${response.status})`);
  }
  return (await response.json()) as EngineHealthResponse;
}

export async function getEngineConfig(): Promise<EngineConfigResponse> {
  return requestEngine<EngineConfigResponse>("/config", {
    method: "GET",
  });
}

export async function validateEngineConfig(
  config: Record<string, unknown>
): Promise<EngineConfigResponse | { ok: true; config: Record<string, unknown> }> {
  return requestEngine("/config/validate", {
    method: "POST",
    body: JSON.stringify({ config }),
  });
}

export async function saveEngineConfig(
  config: Record<string, unknown>
): Promise<EngineConfigResponse> {
  return requestEngine<EngineConfigResponse>("/config", {
    method: "PUT",
    body: JSON.stringify({ config }),
  });
}

export async function reloadEngineConfig(): Promise<EngineConfigResponse> {
  return requestEngine<EngineConfigResponse>("/config/reload", {
    method: "POST",
  });
}

export async function listEnginePresets(): Promise<EngineConfigPreset[]> {
  const response = await requestEngine<{ presets: EngineConfigPreset[] }>("/presets", {
    method: "GET",
  });
  return response.presets;
}
