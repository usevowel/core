/**
 * API Keys persistence layer.
 * Stores encrypted API keys (vkey_ format) per app for Bearer auth.
 */

import type { Database } from "bun:sqlite";
import { getDb } from "./init";
import { encryptApiKey, decryptApiKey, getEncryptionSecret } from "../lib/crypto";

export interface ApiKeyRow {
  id: string;
  app_id: string;
  key_hash: string;
  encrypted_key: Buffer;
  iv: Buffer;
  scopes: string;
  label: string | null;
  created_at: number;
}

export type ApiKeyScope = "mint_ephemeral" | "direct_ws";

export interface CreateApiKeyInput {
  appId: string;
  scopes: ApiKeyScope[];
  label?: string;
}

export interface ApiKeyMeta {
  id: string;
  appId: string;
  scopes: ApiKeyScope[];
  label: string | null;
  masked: string;
  createdAt: number;
}

export interface ApiKeyWithPlaintext extends ApiKeyMeta {
  plaintext: string;
}

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
  // Simple hash for lookup - in production could use bcrypt/scrypt
  // For SQLite lookup performance, we use a simple hash
  return Bun.hash(key).toString(16);
}

function maskKey(key: string): string {
  return key.slice(0, 10) + "..." + key.slice(-4);
}

/**
 * Create a new API key. Returns the plaintext key (shown once).
 */
export async function createApiKey(input: CreateApiKeyInput): Promise<ApiKeyWithPlaintext> {
  const plaintext = generateApiKey();
  const keyHash = hashKey(plaintext);
  
  const secret = getEncryptionSecret();
  const { encryptedKey, iv } = await encryptApiKey(plaintext, secret);

  const id = crypto.randomUUID();
  const now = Date.now();
  const scopesJson = JSON.stringify(input.scopes);

  const db = getDb();
  db.run(
    `INSERT INTO api_keys (id, app_id, key_hash, encrypted_key, iv, scopes, label, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.appId,
      keyHash,
      Buffer.from(encryptedKey),
      Buffer.from(iv),
      scopesJson,
      input.label ?? null,
      now,
    ]
  );
  db.close();

  return {
    id,
    appId: input.appId,
    scopes: input.scopes,
    label: input.label ?? null,
    masked: maskKey(plaintext),
    createdAt: now,
    plaintext,
  };
}

/**
 * List API keys for an app (metadata only, no plaintext).
 */
export function listApiKeys(appId: string): ApiKeyMeta[] {
  const db = getDb();
  const rows = db
    .query(
      `SELECT id, app_id, scopes, label, created_at
       FROM api_keys WHERE app_id = ? ORDER BY created_at DESC`
    )
    .all(appId) as Omit<ApiKeyRow, "key_hash" | "encrypted_key" | "iv">[];
  db.close();

  return rows.map((r) => ({
    id: r.id,
    appId: r.app_id,
    scopes: JSON.parse(r.scopes) as ApiKeyScope[],
    label: r.label,
    masked: "••••••••••••••••",
    createdAt: r.created_at,
  }));
}

/**
 * Validate an API key (for Bearer auth).
 * Returns the key metadata if valid, null otherwise.
 */
export async function validateApiKey(
  plaintextKey: string
): Promise<{ id: string; appId: string; scopes: ApiKeyScope[] } | null> {
  const keyHash = hashKey(plaintextKey);
  
  const db = getDb();
  const row = db
    .query(
      `SELECT id, app_id, encrypted_key, iv, scopes
       FROM api_keys WHERE key_hash = ?`
    )
    .get(keyHash) as ApiKeyRow | undefined;
  db.close();

  if (!row) return null;

  // Verify the key matches by decrypting and comparing
  const secret = getEncryptionSecret();
  try {
    const decrypted = await decryptApiKey(
      new Uint8Array(row.encrypted_key),
      new Uint8Array(row.iv),
      secret
    );
    
    if (decrypted !== plaintextKey) {
      return null;
    }

    return {
      id: row.id,
      appId: row.app_id,
      scopes: JSON.parse(row.scopes) as ApiKeyScope[],
    };
  } catch {
    return null;
  }
}

/**
 * Delete an API key.
 */
export function deleteApiKey(id: string, appId: string): boolean {
  const db = getDb();
  const result = db.run(
    "DELETE FROM api_keys WHERE id = ? AND app_id = ?",
    [id, appId]
  );
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
