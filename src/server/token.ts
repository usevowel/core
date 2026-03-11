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
  appId?: string;
  origin: string;
  config?: {
    provider?: "vowel-prime" | "openai" | "grok";
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
      vowelPrimeConfig?: {
        endpointPreset?: string;
        environment?: string;
        workerUrl?: string;
      };
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

  const provider = body.config?.provider ?? "vowel-prime";
  ensureAllowedProvider(provider, validation.allowedProviders);

  const voiceConfig = body.config?.voiceConfig;
  const systemInstructions = buildSystemInstructions(body.config, appId);
  const model =
    voiceConfig?.model ??
    (provider === "vowel-prime"
      ? "openai/gpt-oss-20b"
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
    const {
      model: _model,
      voice: _voice,
      language: _language,
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
