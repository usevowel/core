/**
 * Token generation handler.
 * Uses provider secrets from environment variables and publishable-key policy checks.
 */

import { validateApiKey } from "../db/api-keys";
import {
  getEndpointPresetByName,
  getEndpointPresetByUrl,
} from "../db/endpoint-presets";

export interface TokenRequestBody {
  appId: string;
  origin: string;
  config?: {
    provider?: "vowel-prime" | "openai" | "grok";
    voiceConfig?: {
      model?: string;
      voice?: string;
      vowelPrimeConfig?: { endpointPreset?: string; environment?: string; workerUrl?: string };
    };
  };
}

export interface TokenResponse {
  tokenName: string;
  token?: string;
  model: string;
  provider: "vowel-prime" | "openai" | "grok";
  expiresAt: string;
  metadata?: Record<string, unknown>;
}

export class TokenRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "TokenRequestError";
  }
}

function requireProviderSecret(provider: "vowel-prime" | "openai" | "grok"): string {
  const envKeys: Record<typeof provider, string | undefined> = {
    "vowel-prime": process.env.SNDBRD_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    grok: process.env.XAI_API_KEY,
  };

  const key = envKeys[provider];
  if (!key) {
    throw new TokenRequestError(
      400,
      `No API key for ${provider}. Set ${
        provider === "vowel-prime"
          ? "SNDBRD_API_KEY"
          : provider === "openai"
            ? "OPENAI_API_KEY"
            : "XAI_API_KEY"
      }`
    );
  }

  return key;
}

function ensureAllowedProvider(
  requestedProvider: "vowel-prime" | "openai" | "grok",
  allowedProviders: string[]
): void {
  if (!allowedProviders.includes(requestedProvider)) {
    throw new TokenRequestError(
      403,
      `Provider ${requestedProvider} is not allowed for this publishable key`
    );
  }
}

function resolveVowelPrimePresetName(input: {
  endpointPreset?: string;
  environment?: string;
  workerUrl?: string;
  defaultPreset?: string | null;
}): string {
  if (input.endpointPreset?.trim()) {
    return input.endpointPreset.trim();
  }

  if (input.environment?.trim()) {
    return input.environment.trim();
  }

  if (input.workerUrl?.trim()) {
    const normalizedWorker = input.workerUrl.trim().replace(/\/$/, "");
    const fromUrl = getEndpointPresetByUrl("vowel-prime", normalizedWorker);
    if (!fromUrl) {
      throw new TokenRequestError(
        400,
        "workerUrl must match a configured endpoint preset"
      );
    }
    return fromUrl.name;
  }

  return input.defaultPreset?.trim() || "staging";
}

function ensureAllowedPreset(presetName: string, allowedPresetNames: string[]): void {
  if (!allowedPresetNames.includes(presetName)) {
    throw new TokenRequestError(
      403,
      `Endpoint preset '${presetName}' is not allowed for this publishable key`
    );
  }
}

/**
 * Handle token generation with Bearer auth
 * @param body - Token request body
 * @param apiKey - Bearer token from Authorization header
 */
export async function handleGenerateToken(
  body: TokenRequestBody,
  apiKey: string
): Promise<TokenResponse> {
  const validation = await validateApiKey(apiKey);
  if (!validation) {
    throw new TokenRequestError(401, "Invalid API key");
  }

  if (!validation.scopes.includes("mint_ephemeral")) {
    throw new TokenRequestError(403, "API key missing required scope: mint_ephemeral");
  }

  if (body.appId && body.appId !== validation.appId) {
    throw new TokenRequestError(
      403,
      "Publishable key is not authorized for the requested appId"
    );
  }

  const provider = body.config?.provider ?? "vowel-prime";
  ensureAllowedProvider(provider, validation.allowedProviders);

  const voiceConfig = body.config?.voiceConfig;
  const model =
    voiceConfig?.model ??
    (provider === "vowel-prime"
      ? "moonshotai/kimi-k2-instruct-0905"
      : "gpt-realtime");
  const voice = voiceConfig?.voice ?? (provider === "vowel-prime" ? "Ashley" : "alloy");

  if (provider === "vowel-prime") {
    const vowelPrimeConfig = voiceConfig?.vowelPrimeConfig;
    const presetName = resolveVowelPrimePresetName({
      endpointPreset: vowelPrimeConfig?.endpointPreset,
      environment: vowelPrimeConfig?.environment,
      workerUrl: vowelPrimeConfig?.workerUrl,
      defaultPreset: validation.defaultEndpointPreset,
    });

    ensureAllowedPreset(presetName, validation.allowedEndpointPresets);

    const preset = getEndpointPresetByName("vowel-prime", presetName);
    if (!preset) {
      throw new TokenRequestError(
        400,
        `Unknown endpoint preset '${presetName}' for vowel-prime`
      );
    }
    if (!preset.enabled) {
      throw new TokenRequestError(
        400,
        `Endpoint preset '${presetName}' is currently disabled`
      );
    }

    const endpoint = `${preset.httpUrl}/v1/realtime/sessions`;
    const providerApiKey = requireProviderSecret("vowel-prime");

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providerApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        voice,
        tools: [],
        instructions: "",
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new TokenRequestError(
        502,
        err.error?.message || res.statusText || "vowel-prime token failed"
      );
    }

    const data = (await res.json()) as {
      client_secret?: { value: string; expires_at: number };
      value?: string;
    };
    const tokenValue = data.client_secret?.value ?? data.value;
    const expiresAt = data.client_secret?.expires_at ?? Math.floor(Date.now() / 1000) + 300;

    if (!tokenValue) {
      throw new TokenRequestError(502, "No token value in vowel-prime response");
    }

    return {
      tokenName: tokenValue,
      token: tokenValue,
      model,
      provider: "vowel-prime",
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      metadata: {
        baseUrl: preset.wsUrl,
        endpointPreset: presetName,
        voice,
        audioFormat: "pcm16",
        sampleRate: 24000,
      },
    };
  }

  const providerApiKey = requireProviderSecret(provider);
  const baseUrl =
    provider === "openai" ? "https://api.openai.com" : "https://api.x.ai";
  const endpoint = `${baseUrl}/v1/realtime/client_secrets`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${providerApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expires_after: { seconds: 300 } }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new TokenRequestError(
      502,
      err.error?.message || res.statusText || `${provider} token failed`
    );
  }

  const data = (await res.json()) as { value: string; expires_at: number };
  const tokenValue = data.value;
  const expiresAt = data.expires_at ?? Math.floor(Date.now() / 1000) + 300;

  if (!tokenValue) {
    throw new TokenRequestError(502, `No token value in ${provider} response`);
  }

  const wsUrl =
    provider === "openai"
      ? "wss://api.openai.com/v1/realtime"
      : "wss://api.x.ai/v1/realtime";

  return {
    tokenName: tokenValue,
    token: tokenValue,
    model,
    provider,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    metadata: {
      baseUrl: wsUrl,
      voice,
      audioFormat: "pcm16",
      sampleRate: 24000,
    },
  };
}
