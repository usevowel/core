/**
 * Token generation handler.
 * Uses provider secrets from environment variables and publishable-key policy checks.
 */

import { getApp } from "../db/apps";
import { validateApiKey } from "../db/api-keys";
import {
  normalizeCoreProvider,
  toClientTokenProvider,
  type ClientTokenProvider,
  type CoreBackendProvider,
  type CoreProviderInput,
} from "../lib/provider-identity";

export interface TokenRequestBody {
  apiKey?: string;
  appId?: string;
  origin: string;
  config?: {
    provider?: CoreProviderInput;
    routes?: Array<{
      path: string;
      description: string;
      queryParams?: string[];
    }>;
    actions?: Record<
      string,
      {
        description: string;
        parameters?: Record<
          string,
          {
            type: string;
            description: string;
            optional?: boolean;
            enum?: string[];
            items?: unknown;
          }
        >;
      }
    >;
    systemInstructionOverride?: string;
    initialGreetingPrompt?: string;
    voiceConfig?: {
      model?: string;
      voice?: string;
      language?: string;
      speakingRate?: number;
      llmProvider?: "groq" | "openrouter";
      openrouterOptions?: {
        provider?: string;
        siteUrl?: string;
        appName?: string;
      };
      initialGreetingPrompt?: string;
      turnDetectionPreset?: "aggressive" | "balanced" | "conservative";
      vowelPrimeConfig?: {
        endpointPreset?: string;
        httpUrl?: string;
        wsUrl?: string;
      };
      turnDetection?: {
        mode: "server_vad" | "client_vad" | "disabled";
        clientVAD?: {
          adapter?: string;
          config?: Record<string, unknown>;
          autoCommit?: boolean;
        };
        serverVAD?: {
          threshold?: number;
          prefixPaddingMs?: number;
          silenceDurationMs?: number;
        };
      };
    };
  };
}

export interface TokenResponse {
  tokenName: string;
  token?: string;
  model: string;
  provider: ClientTokenProvider;
  expiresAt: string;
  metadata?: Record<string, unknown>;
  systemInstructions?: string;
}

export class TokenRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "TokenRequestError";
  }
}

function requireProviderSecret(provider: CoreBackendProvider): string {
  const envKeys: Record<typeof provider, string | undefined> = {
    engine: process.env.VOWEL_ENGINE_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    grok: process.env.XAI_API_KEY,
  };

  const key = envKeys[provider];
  if (!key) {
    throw new TokenRequestError(
      400,
      `No API key for ${provider}. Set ${
        provider === "engine"
          ? "VOWEL_ENGINE_API_KEY"
          : provider === "openai"
            ? "OPENAI_API_KEY"
            : "XAI_API_KEY"
      }`
    );
  }

  return key;
}

function ensureAllowedProvider(
  requestedProvider: CoreBackendProvider,
  allowedProviders: string[]
): void {
  const normalizedAllowedProviders = allowedProviders
    .map((provider) => normalizeCoreProvider(provider))
    .filter((provider): provider is CoreBackendProvider => Boolean(provider));

  if (!normalizedAllowedProviders.includes(requestedProvider)) {
    throw new TokenRequestError(
      403,
      `Provider ${requestedProvider} is not allowed for this publishable key`
    );
  }
}

function getVowelEngineBaseUrl(): string {
  const baseUrl = process.env.VOWEL_ENGINE_URL?.trim();
  if (!baseUrl) {
    throw new TokenRequestError(500, "VOWEL_ENGINE_URL is not configured");
  }
  return baseUrl.replace(/\/$/, "");
}

function getVowelEngineWebsocketUrl(): string {
  const configuredWsUrl = process.env.VOWEL_ENGINE_WS_URL?.trim();
  if (configuredWsUrl) {
    return configuredWsUrl.replace(/\/$/, "");
  }

  const baseUrl = getVowelEngineBaseUrl();
  return baseUrl.startsWith("https://")
    ? `wss://${baseUrl.slice("https://".length)}`
    : baseUrl.startsWith("http://")
      ? `ws://${baseUrl.slice("http://".length)}`
      : baseUrl;
}

function buildSystemInstructions(config: TokenRequestBody["config"], appId: string): string {
  if (config?.systemInstructionOverride?.trim()) {
    return config.systemInstructionOverride.trim();
  }

  const routes = config?.routes ?? [];
  const actions = config?.actions ?? {};

  const routesSection =
    routes.length > 0
      ? `\n\nAVAILABLE ROUTES:\n${routes
          .map((route) => {
            const params =
              route.queryParams && route.queryParams.length > 0
                ? ` (query params: ${route.queryParams.join(", ")})`
                : "";
            return `- ${route.path}${params}: ${route.description}`;
          })
          .join("\n")}`
      : "";

  const actionsSection =
    Object.keys(actions).length > 0
      ? `\n\nAVAILABLE ACTIONS:\n${Object.entries(actions)
          .map(([name, action]) => `- ${name}: ${action.description}`)
          .join("\n")}`
      : "";

  return `You are a specialized voice assistant for app ${appId}.${routesSection}${actionsSection}

RULES:
1. Use only the provided routes and tools
2. Keep responses concise and natural
3. Confirm what you are doing when taking an action`;
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

  const appId = body.appId ?? validation.appId;

  if (appId !== validation.appId) {
    throw new TokenRequestError(
      403,
      "Publishable key is not authorized for the requested appId"
    );
  }

  const app = getApp(appId);
  if (!app) {
    throw new TokenRequestError(404, "App not found");
  }

  const appRuntimeConfig = app.runtimeConfig as TokenRequestBody["config"] | null;
  const provider =
    normalizeCoreProvider(appRuntimeConfig?.provider ?? body.config?.provider) ?? "engine";
  const effectiveConfig: TokenRequestBody["config"] = {
    ...(body.config ?? {}),
    ...(appRuntimeConfig ?? {}),
    provider,
    voiceConfig:
      provider === "engine"
        ? appRuntimeConfig?.voiceConfig
        : appRuntimeConfig?.voiceConfig ?? body.config?.voiceConfig,
  };

  ensureAllowedProvider(provider, validation.allowedProviders);

  const voiceConfig = effectiveConfig?.voiceConfig;
  const systemInstructions = buildSystemInstructions(effectiveConfig, appId);
  const model =
    voiceConfig?.model ??
    (provider === "engine"
      ? "openai/gpt-oss-20b"
      : "gpt-realtime");
  const voice =
    voiceConfig?.voice ??
    (provider === "engine" ? "Ashley" : "alloy");

  if (provider === "engine") {
    const endpoint = `${getVowelEngineBaseUrl()}/v1/realtime/sessions`;
    const providerApiKey = requireProviderSecret(provider);
    const {
      model: _model,
      voice: _voice,
      vowelPrimeConfig: _vowelPrimeConfig,
      openrouterOptions,
      ...otherVoiceConfig
    } = voiceConfig ?? {};

    const requestBody: Record<string, unknown> = {
      model,
      voice,
      ...otherVoiceConfig,
    };

    if (voiceConfig?.llmProvider) {
      requestBody.llmProvider = voiceConfig.llmProvider;
      if (voiceConfig.llmProvider === "openrouter" && openrouterOptions) {
        requestBody.openrouterProvider = openrouterOptions.provider;
        requestBody.openrouterSiteUrl = openrouterOptions.siteUrl;
        requestBody.openrouterAppName = openrouterOptions.appName;
      }
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providerApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new TokenRequestError(
        502,
        err.error?.message || res.statusText || "engine token failed"
      );
    }

    const data = (await res.json()) as {
      client_secret?: { value: string; expires_at: number };
      value?: string;
    };
    const tokenValue = data.client_secret?.value ?? data.value;
    const expiresAt = data.client_secret?.expires_at ?? Math.floor(Date.now() / 1000) + 300;

    if (!tokenValue) {
      throw new TokenRequestError(502, "No token value in engine response");
    }

    return {
      tokenName: tokenValue,
      token: tokenValue,
      model,
      provider: toClientTokenProvider(provider),
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      metadata: {
        baseUrl: getVowelEngineWebsocketUrl(),
        voice,
        audioFormat: "pcm16",
        sampleRate: 24000,
        sessionConfigDeliveredViaClient: true,
      },
      systemInstructions,
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
    systemInstructions,
  };
}
