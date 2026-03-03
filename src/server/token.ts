/**
 * Token generation handler.
 * Uses stored provider keys (or env fallback) to mint ephemeral tokens.
 * Now with Bearer auth validation.
 */

import { findProviderKeyForToken } from "../db/provider-keys";
import { validateApiKey } from "../db/api-keys";

const VOWEL_PRIME_HTTP_URLS: Record<string, string> = {
  testing: "https://testing-prime.vowel.to",
  dev: "https://dev-prime.vowel.to",
  staging: "https://staging.prime.vowel.to",
  production: "https://prime.vowel.to",
  "billing-test": "https://billing-test.vowel.to",
};

function resolveVowelPrimeHttpUrl(config?: {
  environment?: string;
  workerUrl?: string;
}): string {
  if (config?.workerUrl) {
    return config.workerUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  }
  if (config?.environment && VOWEL_PRIME_HTTP_URLS[config.environment]) {
    return VOWEL_PRIME_HTTP_URLS[config.environment];
  }
  const selfHosted = process.env.SNDBRD_URL ?? process.env.SNDBRD_WS_URL;
  if (selfHosted) {
    const base = selfHosted.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    return base.replace(/\/v1\/realtime\/?$/, "");
  }
  return VOWEL_PRIME_HTTP_URLS.staging;
}

function httpToWsUrl(httpUrl: string): string {
  const ws = httpUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
  return ws.replace(/\/$/, "") + "/v1/realtime";
}

export interface TokenRequestBody {
  appId: string;
  origin: string;
  config?: {
    provider?: "vowel-prime" | "openai" | "grok";
    voiceConfig?: {
      model?: string;
      voice?: string;
      vowelPrimeConfig?: { environment?: string; workerUrl?: string };
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

async function getProviderApiKey(
  appId: string,
  provider: "vowel-prime" | "openai" | "grok",
  vowelPrimeConfig?: { environment?: string; workerUrl?: string }
): Promise<string> {
  const fromDb = await findProviderKeyForToken(appId, provider, vowelPrimeConfig);
  if (fromDb) return fromDb.apiKey;

  const envKeys: Record<string, string | undefined> = {
    "vowel-prime": process.env.SNDBRD_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    grok: process.env.XAI_API_KEY,
  };
  const fromEnv = envKeys[provider];
  if (fromEnv) return fromEnv;

  throw new Error(
    `No API key for ${provider}. Add a provider key in API Providers or set ${provider === "vowel-prime" ? "SNDBRD_API_KEY" : provider === "openai" ? "OPENAI_API_KEY" : "XAI_API_KEY"}`
  );
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
  // Validate the API key
  const validation = await validateApiKey(apiKey);
  if (!validation) {
    throw new Error("Invalid API key");
  }

  // Check scope
  if (!validation.scopes.includes("mint_ephemeral")) {
    throw new Error("API key missing required scope: mint_ephemeral");
  }

  // Use appId from body or fall back to the app associated with the API key
  const appId = body.appId || validation.appId;
  
  const provider = body.config?.provider ?? "vowel-prime";
  const voiceConfig = body.config?.voiceConfig;
  const vowelPrimeConfig = voiceConfig?.vowelPrimeConfig;

  const apiProviderKey = await getProviderApiKey(appId, provider, vowelPrimeConfig);

  const model = voiceConfig?.model ?? (provider === "vowel-prime" ? "moonshotai/kimi-k2-instruct-0905" : "gpt-realtime");
  const voice = voiceConfig?.voice ?? (provider === "vowel-prime" ? "Ashley" : "alloy");

  if (provider === "vowel-prime") {
    const httpUrl = resolveVowelPrimeHttpUrl(vowelPrimeConfig);
    const wsUrl = httpToWsUrl(httpUrl);
    const endpoint = `${httpUrl}/v1/realtime/sessions`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiProviderKey}`,
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
      throw new Error(err.error?.message || res.statusText || "vowel-prime token failed");
    }

    const data = (await res.json()) as { client_secret?: { value: string; expires_at: number }; value?: string };
    const tokenValue = data.client_secret?.value ?? data.value;
    const expiresAt = data.client_secret?.expires_at ?? Math.floor(Date.now() / 1000) + 300;

    if (!tokenValue) throw new Error("No token value in vowel-prime response");

    return {
      tokenName: tokenValue,
      token: tokenValue,
      model,
      provider: "vowel-prime",
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      metadata: {
        baseUrl: wsUrl,
        voice,
        audioFormat: "pcm16",
        sampleRate: 24000,
      },
    };
  }

  if (provider === "openai" || provider === "grok") {
    const baseUrl =
      provider === "openai"
        ? "https://api.openai.com"
        : "https://api.x.ai";
    const endpoint = `${baseUrl}/v1/realtime/client_secrets`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiProviderKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expires_after: { seconds: 300 } }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || res.statusText || `${provider} token failed`);
    }

    const data = (await res.json()) as { value: string; expires_at: number };
    const tokenValue = data.value;
    const expiresAt = data.expires_at ?? Math.floor(Date.now() / 1000) + 300;

    if (!tokenValue) throw new Error(`No token value in ${provider} response`);

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

  throw new Error(`Unsupported provider: ${provider}`);
}
