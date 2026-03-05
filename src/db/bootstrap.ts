/**
 * Startup bootstrap for system endpoint presets and optional dev seed app/key.
 */

import { ensureApp } from "./apps";
import {
  ensureApiKeyFromPlaintext,
  type ApiKeyScope,
} from "./api-keys";
import {
  seedSystemEndpointPresets,
  type EndpointProvider,
} from "./endpoint-presets";

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseScopes(value: string | undefined): ApiKeyScope[] {
  const values = parseList(value);
  const scopes = values.filter(
    (scope): scope is ApiKeyScope =>
      scope === "mint_ephemeral" || scope === "direct_ws"
  );
  return scopes.length > 0 ? scopes : ["mint_ephemeral"];
}

function parseProviders(value: string | undefined): EndpointProvider[] {
  const values = parseList(value);
  const providers = values.filter(
    (provider): provider is EndpointProvider =>
      provider === "vowel-prime" || provider === "openai" || provider === "grok"
  );
  return providers.length > 0 ? providers : ["vowel-prime"];
}

export async function bootstrapCoreDataFromEnv(): Promise<void> {
  seedSystemEndpointPresets();

  const publishableKey = process.env.CORE_BOOTSTRAP_PUBLISHABLE_KEY?.trim();
  if (!publishableKey) {
    return;
  }

  const appId = process.env.CORE_BOOTSTRAP_APP_ID?.trim() || "default";
  const appName = process.env.CORE_BOOTSTRAP_APP_NAME?.trim() || "Default App";
  const appDescription =
    process.env.CORE_BOOTSTRAP_APP_DESCRIPTION?.trim() ||
    "Bootstrap app for local self-hosted testing";
  const label = process.env.CORE_BOOTSTRAP_API_KEY_LABEL?.trim() || "Bootstrap key";
  const scopes = parseScopes(process.env.CORE_BOOTSTRAP_SCOPES);
  const allowedProviders = parseProviders(
    process.env.CORE_BOOTSTRAP_ALLOWED_PROVIDERS
  );
  const allowedEndpointPresets = parseList(
    process.env.CORE_BOOTSTRAP_ALLOWED_ENDPOINT_PRESETS
  );
  const defaultEndpointPreset =
    process.env.CORE_BOOTSTRAP_DEFAULT_ENDPOINT_PRESET?.trim() || undefined;

  ensureApp({
    id: appId,
    name: appName,
    description: appDescription,
    defaultProvider: "vowel-prime",
  });

  const result = await ensureApiKeyFromPlaintext({
    plaintext: publishableKey,
    appId,
    label,
    scopes,
    allowedProviders,
    allowedEndpointPresets,
    defaultEndpointPreset,
  });

  console.log(
    `[core] bootstrap publishable key ${result.created ? "created" : "already exists"} for app=${appId}`
  );
}
