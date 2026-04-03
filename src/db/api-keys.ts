/**
 * API Keys persistence layer.
 * Stores encrypted API keys (vkey_ format) per app for Bearer auth.
 */

import { getDb } from "./init";
import { encryptApiKey, decryptApiKey, getEncryptionSecret } from "../lib/crypto";
import { normalizeCoreProvider, type CoreBackendProvider } from "../lib/provider-identity";

export type ApiKeyProvider = CoreBackendProvider;

export interface ApiKeyRow {
  id: string;
  app_id: string;
  key_hash: string;
  encrypted_key: Buffer;
  iv: Buffer;
  scopes: string;
  label: string | null;
  allowed_providers: string;
  revoked_at: number | null;
  created_at: number;
}

export type ApiKeyScope = "mint_ephemeral" | "direct_ws";

export interface CreateApiKeyInput {
  appId: string;
  scopes: ApiKeyScope[];
  label?: string;
  allowedProviders?: ApiKeyProvider[];
}

export interface UpdateApiKeyInput {
  scopes?: ApiKeyScope[];
  label?: string;
  allowedProviders?: ApiKeyProvider[];
}

export interface ApiKeyMeta {
  id: string;
  appId: string;
  scopes: ApiKeyScope[];
  label: string | null;
  masked: string;
  allowedProviders: ApiKeyProvider[];
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
  allowedProviders: ApiKeyProvider[];
}

const VALID_PROVIDERS: ApiKeyProvider[] = ["engine", "openai", "grok"];
const DEFAULT_ALLOWED_PROVIDERS: ApiKeyProvider[] = ["engine"];

const KEY_PREFIX = "vkey_";
const KEY_RANDOM_BYTES = 32;

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

function normalizeAllowedProviders(input?: ApiKeyProvider[]): ApiKeyProvider[] {
  const source = input && input.length > 0 ? input : DEFAULT_ALLOWED_PROVIDERS;
  const unique = Array.from(new Set(source.map((provider) => normalizeCoreProvider(provider))));
  const filtered = unique.filter((provider): provider is ApiKeyProvider => Boolean(provider));
  return filtered.length > 0 ? filtered : DEFAULT_ALLOWED_PROVIDERS;
}

function rowToMeta(row: ApiKeyRow, maskedOverride?: string): ApiKeyMeta {
  const allowedProviders = normalizeAllowedProviders(
    parseJsonArray<ApiKeyProvider>(row.allowed_providers, DEFAULT_ALLOWED_PROVIDERS)
  );
  return {
    id: row.id,
    appId: row.app_id,
    scopes: parseJsonArray<ApiKeyScope>(row.scopes, ["mint_ephemeral"]),
    label: row.label,
    masked: maskedOverride ?? "vkey_••••••...••••",
    allowedProviders,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

async function insertApiKeyRecord(input: {
  appId: string;
  plaintext: string;
  scopes: ApiKeyScope[];
  label?: string;
  allowedProviders?: ApiKeyProvider[];
}): Promise<ApiKeyWithPlaintext> {
  const keyHash = hashKey(input.plaintext);
  const secret = getEncryptionSecret();
  const { encryptedKey, iv } = await encryptApiKey(input.plaintext, secret);

  const id = crypto.randomUUID();
  const now = Date.now();
  const scopesJson = JSON.stringify(input.scopes);
  const allowedProviders = normalizeAllowedProviders(input.allowedProviders);

  const db = getDb();
  db.run(
    `INSERT INTO api_keys (
      id, app_id, key_hash, encrypted_key, iv, scopes, label,
      allowed_providers, revoked_at, created_at
    )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    [
      id,
      input.appId,
      keyHash,
      Buffer.from(encryptedKey),
      Buffer.from(iv),
      scopesJson,
      input.label ?? null,
      JSON.stringify(allowedProviders),
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
    revokedAt: null,
    createdAt: now,
  };
}

export async function createApiKey(input: CreateApiKeyInput): Promise<ApiKeyWithPlaintext> {
  const plaintext = generateApiKey();
  return insertApiKeyRecord({
    appId: input.appId,
    plaintext,
    scopes: input.scopes,
    label: input.label,
    allowedProviders: input.allowedProviders,
  });
}

export async function ensureApiKeyFromPlaintext(input: {
  plaintext: string;
  appId: string;
  scopes: ApiKeyScope[];
  label?: string;
  allowedProviders?: ApiKeyProvider[];
}): Promise<{ created: boolean; key: ApiKeyMeta }> {
  const keyHash = hashKey(input.plaintext);
  const db = getDb();
  const row = db
    .query(
      `SELECT id, app_id, key_hash, encrypted_key, iv, scopes, label,
              allowed_providers, revoked_at, created_at
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
      revokedAt: inserted.revokedAt,
      createdAt: inserted.createdAt,
    },
  };
}

export async function listApiKeys(appId: string): Promise<ApiKeyMeta[]> {
  const db = getDb();
  const rows = db
    .query(
      `SELECT id, app_id, key_hash, encrypted_key, iv, scopes, label,
              allowed_providers, revoked_at, created_at
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
              allowed_providers, revoked_at
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

    return {
      id: row.id,
      appId: row.app_id,
      scopes: parseJsonArray<ApiKeyScope>(row.scopes, ["mint_ephemeral"]),
      allowedProviders: normalizeAllowedProviders(
        parseJsonArray<ApiKeyProvider>(row.allowed_providers, DEFAULT_ALLOWED_PROVIDERS)
      ),
    };
  } catch {
    return null;
  }
}

export function updateApiKey(
  id: string,
  appId: string,
  input: UpdateApiKeyInput
): ApiKeyMeta | null {
  const db = getDb();
  const row = db
    .query(
      `SELECT id, app_id, key_hash, encrypted_key, iv, scopes, label,
              allowed_providers, revoked_at, created_at
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
      parseJsonArray<ApiKeyProvider>(row.allowed_providers, DEFAULT_ALLOWED_PROVIDERS)
  );

  db.run(
    `UPDATE api_keys
     SET scopes = ?, label = ?, allowed_providers = ?
     WHERE id = ? AND app_id = ?`,
    [
      JSON.stringify(scopes),
      input.label === undefined ? row.label : input.label,
      JSON.stringify(allowedProviders),
      id,
      appId,
    ]
  );

  const updated = db
    .query(
      `SELECT id, app_id, key_hash, encrypted_key, iv, scopes, label,
              allowed_providers, revoked_at, created_at
       FROM api_keys WHERE id = ? AND app_id = ?`
    )
    .get(id, appId) as ApiKeyRow;
  db.close();

  return rowToMeta(updated);
}

export function revokeApiKey(id: string, appId: string): boolean {
  const db = getDb();
  const result = db.run(
    `UPDATE api_keys SET revoked_at = ? WHERE id = ? AND app_id = ? AND revoked_at IS NULL`,
    [Date.now(), id, appId]
  );
  db.close();
  return result.changes > 0;
}

export function deleteApiKey(id: string, appId: string): boolean {
  const db = getDb();
  const result = db.run("DELETE FROM api_keys WHERE id = ? AND app_id = ?", [id, appId]);
  db.close();

  return result.changes > 0;
}

export async function getAppIdFromApiKey(
  plaintextKey: string
): Promise<string | null> {
  const validation = await validateApiKey(plaintextKey);
  return validation?.appId ?? null;
}
