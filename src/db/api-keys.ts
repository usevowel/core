/**
 * API Keys persistence layer.
 * Stores encrypted API keys (vkey_ format) per app for Bearer auth.
 */

import { getDb } from "./init";
import { encryptApiKey, decryptApiKey, getEncryptionSecret } from "../lib/crypto";
import type { EndpointProvider } from "./endpoint-presets";

export interface ApiKeyRow {
  id: string;
  app_id: string;
  key_hash: string;
  encrypted_key: Buffer;
  iv: Buffer;
  scopes: string;
  label: string | null;
  allowed_providers: string;
  allowed_endpoint_presets: string;
  default_endpoint_preset: string | null;
  revoked_at: number | null;
  created_at: number;
}

export type ApiKeyScope = "mint_ephemeral" | "direct_ws";

export interface CreateApiKeyInput {
  appId: string;
  scopes: ApiKeyScope[];
  label?: string;
  allowedProviders?: EndpointProvider[];
  allowedEndpointPresets?: string[];
  defaultEndpointPreset?: string;
}

export interface UpdateApiKeyInput {
  scopes?: ApiKeyScope[];
  label?: string;
  allowedProviders?: EndpointProvider[];
  allowedEndpointPresets?: string[];
  defaultEndpointPreset?: string | null;
}

export interface ApiKeyMeta {
  id: string;
  appId: string;
  scopes: ApiKeyScope[];
  label: string | null;
  masked: string;
  allowedProviders: EndpointProvider[];
  allowedEndpointPresets: string[];
  defaultEndpointPreset: string | null;
  revokedAt: number | null;
  createdAt: number;
}

export interface ApiKeyWithPlaintext extends ApiKeyMeta {
  plaintext: string;
}

export interface ValidatedApiKey {
  id: string;
  appId: string;
  scopes: ApiKeyScope[];
  allowedProviders: EndpointProvider[];
  allowedEndpointPresets: string[];
  defaultEndpointPreset: string | null;
}

const VALID_PROVIDERS: EndpointProvider[] = ["vowel-prime", "openai", "grok"];
const DEFAULT_ALLOWED_PROVIDERS: EndpointProvider[] = ["vowel-prime"];
const DEFAULT_ALLOWED_ENDPOINT_PRESETS = ["staging"];

// vkey_ prefix + 64 hex chars = 70 chars total
const KEY_PREFIX = "vkey_";
const KEY_RANDOM_BYTES = 32; // 64 hex chars

function generateApiKey(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(KEY_RANDOM_BYTES));
  const hex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${KEY_PREFIX}${hex}`;
}

function hashKey(key: string): string {
  return Bun.hash(key).toString(16);
}

function maskKey(key: string): string {
  return key.slice(0, 10) + "..." + key.slice(-4);
}

function parseJsonArray<T>(value: string | null | undefined, fallback: T[]): T[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return fallback;
    return parsed as T[];
  } catch {
    return fallback;
  }
}

function normalizeAllowedProviders(input?: EndpointProvider[]): EndpointProvider[] {
  const source = input && input.length > 0 ? input : DEFAULT_ALLOWED_PROVIDERS;
  const unique = Array.from(new Set(source));
  const filtered = unique.filter((provider): provider is EndpointProvider =>
    VALID_PROVIDERS.includes(provider)
  );
  return filtered.length > 0 ? filtered : DEFAULT_ALLOWED_PROVIDERS;
}

function normalizeAllowedEndpointPresets(input?: string[]): string[] {
  const source = input && input.length > 0 ? input : DEFAULT_ALLOWED_ENDPOINT_PRESETS;
  const cleaned = source
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  const unique = Array.from(new Set(cleaned));
  return unique.length > 0 ? unique : DEFAULT_ALLOWED_ENDPOINT_PRESETS;
}

function resolveDefaultEndpointPreset(
  requestedDefault: string | null | undefined,
  allowedPresets: string[]
): string | null {
  if (!requestedDefault) {
    return allowedPresets[0] ?? null;
  }
  if (allowedPresets.includes(requestedDefault)) {
    return requestedDefault;
  }
  return allowedPresets[0] ?? null;
}

function rowToMeta(row: ApiKeyRow, maskedOverride?: string): ApiKeyMeta {
  const allowedProviders = normalizeAllowedProviders(
    parseJsonArray<EndpointProvider>(row.allowed_providers, DEFAULT_ALLOWED_PROVIDERS)
  );
  const allowedEndpointPresets = normalizeAllowedEndpointPresets(
    parseJsonArray<string>(row.allowed_endpoint_presets, DEFAULT_ALLOWED_ENDPOINT_PRESETS)
  );
  return {
    id: row.id,
    appId: row.app_id,
    scopes: parseJsonArray<ApiKeyScope>(row.scopes, ["mint_ephemeral"]),
    label: row.label,
    masked: maskedOverride ?? "vkey_••••••...••••",
    allowedProviders,
    allowedEndpointPresets,
    defaultEndpointPreset: resolveDefaultEndpointPreset(
      row.default_endpoint_preset,
      allowedEndpointPresets
    ),
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

async function insertApiKeyRecord(input: {
  appId: string;
  plaintext: string;
  scopes: ApiKeyScope[];
  label?: string;
  allowedProviders?: EndpointProvider[];
  allowedEndpointPresets?: string[];
  defaultEndpointPreset?: string | null;
}): Promise<ApiKeyWithPlaintext> {
  const keyHash = hashKey(input.plaintext);
  const secret = getEncryptionSecret();
  const { encryptedKey, iv } = await encryptApiKey(input.plaintext, secret);

  const id = crypto.randomUUID();
  const now = Date.now();
  const scopesJson = JSON.stringify(input.scopes);
  const allowedProviders = normalizeAllowedProviders(input.allowedProviders);
  const allowedEndpointPresets = normalizeAllowedEndpointPresets(
    input.allowedEndpointPresets
  );
  const defaultEndpointPreset = resolveDefaultEndpointPreset(
    input.defaultEndpointPreset,
    allowedEndpointPresets
  );

  const db = getDb();
  db.run(
    `INSERT INTO api_keys (
      id, app_id, key_hash, encrypted_key, iv, scopes, label,
      allowed_providers, allowed_endpoint_presets, default_endpoint_preset,
      revoked_at, created_at
    )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    [
      id,
      input.appId,
      keyHash,
      Buffer.from(encryptedKey),
      Buffer.from(iv),
      scopesJson,
      input.label ?? null,
      JSON.stringify(allowedProviders),
      JSON.stringify(allowedEndpointPresets),
      defaultEndpointPreset,
      now,
    ]
  );
  db.close();

  return {
    id,
    appId: input.appId,
    scopes: input.scopes,
    label: input.label ?? null,
    masked: maskKey(input.plaintext),
    plaintext: input.plaintext,
    allowedProviders,
    allowedEndpointPresets,
    defaultEndpointPreset,
    revokedAt: null,
    createdAt: now,
  };
}

/**
 * Create a new API key. Returns the plaintext key (shown once).
 */
export async function createApiKey(input: CreateApiKeyInput): Promise<ApiKeyWithPlaintext> {
  const plaintext = generateApiKey();
  return insertApiKeyRecord({
    appId: input.appId,
    plaintext,
    scopes: input.scopes,
    label: input.label,
    allowedProviders: input.allowedProviders,
    allowedEndpointPresets: input.allowedEndpointPresets,
    defaultEndpointPreset: input.defaultEndpointPreset,
  });
}

/**
 * Ensure a specific plaintext key exists. Used for bootstrap/dev seeding.
 */
export async function ensureApiKeyFromPlaintext(input: {
  plaintext: string;
  appId: string;
  scopes: ApiKeyScope[];
  label?: string;
  allowedProviders?: EndpointProvider[];
  allowedEndpointPresets?: string[];
  defaultEndpointPreset?: string | null;
}): Promise<{ created: boolean; key: ApiKeyMeta }> {
  const keyHash = hashKey(input.plaintext);
  const db = getDb();
  const row = db
    .query(
      `SELECT id, app_id, key_hash, encrypted_key, iv, scopes, label,
              allowed_providers, allowed_endpoint_presets, default_endpoint_preset,
              revoked_at, created_at
       FROM api_keys WHERE key_hash = ?`
    )
    .get(keyHash) as ApiKeyRow | undefined;
  db.close();

  if (row) {
    return { created: false, key: rowToMeta(row) };
  }

  const inserted = await insertApiKeyRecord({
    appId: input.appId,
    plaintext: input.plaintext,
    scopes: input.scopes,
    label: input.label,
    allowedProviders: input.allowedProviders,
    allowedEndpointPresets: input.allowedEndpointPresets,
    defaultEndpointPreset: input.defaultEndpointPreset,
  });

  return {
    created: true,
    key: {
      id: inserted.id,
      appId: inserted.appId,
      scopes: inserted.scopes,
      label: inserted.label,
      masked: inserted.masked,
      allowedProviders: inserted.allowedProviders,
      allowedEndpointPresets: inserted.allowedEndpointPresets,
      defaultEndpointPreset: inserted.defaultEndpointPreset,
      revokedAt: inserted.revokedAt,
      createdAt: inserted.createdAt,
    },
  };
}

/**
 * List API keys for an app with masked previews.
 */
export async function listApiKeys(appId: string): Promise<ApiKeyMeta[]> {
  const db = getDb();
  const rows = db
    .query(
      `SELECT id, app_id, key_hash, encrypted_key, iv, scopes, label,
              allowed_providers, allowed_endpoint_presets, default_endpoint_preset,
              revoked_at, created_at
       FROM api_keys WHERE app_id = ? ORDER BY created_at DESC`
    )
    .all(appId) as ApiKeyRow[];
  db.close();

  const secret = getEncryptionSecret();
  const maskedById = new Map<string, string>();
  for (const row of rows) {
    try {
      const plaintext = await decryptApiKey(
        new Uint8Array(row.encrypted_key),
        new Uint8Array(row.iv),
        secret
      );
      maskedById.set(row.id, maskKey(plaintext));
    } catch {
      maskedById.set(row.id, "vkey_••••••...••••");
    }
  }

  return rows.map((row) => rowToMeta(row, maskedById.get(row.id)));
}

/**
 * Reveal stored plaintext for a publishable key.
 * Keys remain encrypted at rest and are decrypted on demand.
 */
export async function revealApiKeyPlaintext(
  id: string,
  appId: string
): Promise<string | null> {
  const db = getDb();
  const row = db
    .query(
      `SELECT encrypted_key, iv
       FROM api_keys
       WHERE id = ? AND app_id = ?`
    )
    .get(id, appId) as { encrypted_key: Buffer; iv: Buffer } | undefined;
  db.close();

  if (!row) {
    return null;
  }

  try {
    const secret = getEncryptionSecret();
    return await decryptApiKey(
      new Uint8Array(row.encrypted_key),
      new Uint8Array(row.iv),
      secret
    );
  } catch {
    return null;
  }
}

/**
 * Validate an API key (for Bearer auth).
 * Returns the key metadata if valid, null otherwise.
 */
export async function validateApiKey(
  plaintextKey: string
): Promise<ValidatedApiKey | null> {
  const normalizedKey = plaintextKey.trim();
  if (!normalizedKey) {
    return null;
  }

  const keyHash = hashKey(normalizedKey);

  const db = getDb();
  const row = db
    .query(
      `SELECT id, app_id, encrypted_key, iv, scopes,
              allowed_providers, allowed_endpoint_presets,
              default_endpoint_preset, revoked_at
       FROM api_keys WHERE key_hash = ?`
    )
    .get(keyHash) as Omit<ApiKeyRow, "label" | "created_at"> | undefined;
  db.close();

  if (!row || row.revoked_at) return null;

  const secret = getEncryptionSecret();
  try {
    const decrypted = await decryptApiKey(
      new Uint8Array(row.encrypted_key),
      new Uint8Array(row.iv),
      secret
    );

    if (decrypted !== normalizedKey) {
      return null;
    }

    const allowedEndpointPresets = normalizeAllowedEndpointPresets(
      parseJsonArray<string>(row.allowed_endpoint_presets, DEFAULT_ALLOWED_ENDPOINT_PRESETS)
    );

    return {
      id: row.id,
      appId: row.app_id,
      scopes: parseJsonArray<ApiKeyScope>(row.scopes, ["mint_ephemeral"]),
      allowedProviders: normalizeAllowedProviders(
        parseJsonArray<EndpointProvider>(
          row.allowed_providers,
          DEFAULT_ALLOWED_PROVIDERS
        )
      ),
      allowedEndpointPresets,
      defaultEndpointPreset: resolveDefaultEndpointPreset(
        row.default_endpoint_preset,
        allowedEndpointPresets
      ),
    };
  } catch {
    return null;
  }
}

/**
 * Update API key policy settings.
 */
export function updateApiKey(
  id: string,
  appId: string,
  input: UpdateApiKeyInput
): ApiKeyMeta | null {
  const db = getDb();
  const row = db
    .query(
      `SELECT id, app_id, key_hash, encrypted_key, iv, scopes, label,
              allowed_providers, allowed_endpoint_presets, default_endpoint_preset,
              revoked_at, created_at
       FROM api_keys WHERE id = ? AND app_id = ?`
    )
    .get(id, appId) as ApiKeyRow | undefined;

  if (!row) {
    db.close();
    return null;
  }

  const scopes = input.scopes ?? parseJsonArray<ApiKeyScope>(row.scopes, ["mint_ephemeral"]);
  const allowedProviders = normalizeAllowedProviders(
    input.allowedProviders ??
      parseJsonArray<EndpointProvider>(row.allowed_providers, DEFAULT_ALLOWED_PROVIDERS)
  );
  const allowedEndpointPresets = normalizeAllowedEndpointPresets(
    input.allowedEndpointPresets ??
      parseJsonArray<string>(row.allowed_endpoint_presets, DEFAULT_ALLOWED_ENDPOINT_PRESETS)
  );
  const defaultEndpointPreset = resolveDefaultEndpointPreset(
    input.defaultEndpointPreset === undefined
      ? row.default_endpoint_preset
      : input.defaultEndpointPreset,
    allowedEndpointPresets
  );

  db.run(
    `UPDATE api_keys
     SET scopes = ?, label = ?,
         allowed_providers = ?, allowed_endpoint_presets = ?,
         default_endpoint_preset = ?
     WHERE id = ? AND app_id = ?`,
    [
      JSON.stringify(scopes),
      input.label === undefined ? row.label : input.label,
      JSON.stringify(allowedProviders),
      JSON.stringify(allowedEndpointPresets),
      defaultEndpointPreset,
      id,
      appId,
    ]
  );

  const updated = db
    .query(
      `SELECT id, app_id, key_hash, encrypted_key, iv, scopes, label,
              allowed_providers, allowed_endpoint_presets, default_endpoint_preset,
              revoked_at, created_at
       FROM api_keys WHERE id = ? AND app_id = ?`
    )
    .get(id, appId) as ApiKeyRow;
  db.close();

  return rowToMeta(updated);
}

/**
 * Revoke an API key without deleting historical metadata.
 */
export function revokeApiKey(id: string, appId: string): boolean {
  const db = getDb();
  const result = db.run(
    `UPDATE api_keys SET revoked_at = ? WHERE id = ? AND app_id = ? AND revoked_at IS NULL`,
    [Date.now(), id, appId]
  );
  db.close();
  return result.changes > 0;
}

/**
 * Delete an API key.
 */
export function deleteApiKey(id: string, appId: string): boolean {
  const db = getDb();
  const result = db.run("DELETE FROM api_keys WHERE id = ? AND app_id = ?", [id, appId]);
  db.close();

  return result.changes > 0;
}

/**
 * Get app ID from API key (for token generation).
 */
export async function getAppIdFromApiKey(
  plaintextKey: string
): Promise<string | null> {
  const validation = await validateApiKey(plaintextKey);
  return validation?.appId ?? null;
}
