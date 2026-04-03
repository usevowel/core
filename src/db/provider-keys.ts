/**
 * Provider keys persistence.
 * Stores encrypted API keys per app for engine, openai, grok.
 */

import type { Database } from "bun:sqlite";
import { getDb } from "./init";
import { encryptApiKey, decryptApiKey, getEncryptionSecret } from "../lib/crypto";

export type ProviderType = "engine" | "openai" | "grok";

export interface ProviderKeyRow {
  id: string;
  app_id: string;
  provider: string;
  label: string | null;
  encrypted_key: Buffer;
  iv: Buffer;
  vowel_prime_environment: string | null;
  vowel_prime_worker_url: string | null;
  created_at: number;
}

export interface CreateProviderKeyInput {
  appId: string;
  provider: ProviderType;
  label?: string;
  apiKey: string;
  vowelPrimeEnvironment?: string;
  vowelPrimeWorkerUrl?: string;
}

export interface ProviderKeyMeta {
  id: string;
  appId: string;
  provider: ProviderType;
  label: string | null;
  masked: string;
  vowelPrimeEnvironment: string | null;
  vowelPrimeWorkerUrl: string | null;
  createdAt: number;
}

function maskKey(key: string): string {
  if (key.length > 8) {
    return key.slice(0, 4) + "..." + key.slice(-4);
  }
  return "••••••••";
}

/**
 * Create a provider key. Encrypts the API key before storage.
 */
export async function createProviderKey(
  input: CreateProviderKeyInput
): Promise<ProviderKeyMeta> {
  const secret = getEncryptionSecret();
  const { encryptedKey, iv } = await encryptApiKey(input.apiKey, secret);

  const id = crypto.randomUUID();
  const now = Date.now();

  const db = getDb();
  db.run(
    `INSERT INTO provider_keys (id, app_id, provider, label, encrypted_key, iv, vowel_prime_environment, vowel_prime_worker_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.appId,
      input.provider,
      input.label ?? null,
      Buffer.from(encryptedKey),
      Buffer.from(iv),
      input.vowelPrimeEnvironment ?? null,
      input.vowelPrimeWorkerUrl ?? null,
      now,
    ]
  );
  db.close();

  return {
    id,
    appId: input.appId,
    provider: input.provider,
    label: input.label ?? null,
    masked: maskKey(input.apiKey),
    vowelPrimeEnvironment: input.vowelPrimeEnvironment ?? null,
    vowelPrimeWorkerUrl: input.vowelPrimeWorkerUrl ?? null,
    createdAt: now,
  };
}

/**
 * List provider keys for an app (metadata only, no plaintext).
 */
export function listProviderKeys(appId: string): ProviderKeyMeta[] {
  const db = getDb();
  const rows = db
    .query(
      `SELECT id, app_id, provider, label, encrypted_key, iv, vowel_prime_environment, vowel_prime_worker_url, created_at
       FROM provider_keys WHERE app_id = ? ORDER BY created_at ASC`
    )
    .all(appId) as ProviderKeyRow[];

  db.close();

  return rows.map((r) => ({
    id: r.id,
    appId: r.app_id,
    provider: r.provider as ProviderType,
    label: r.label,
    masked: r.encrypted_key.length > 0 ? "••••••••" : "••••••••", // We don't store plaintext for display
    vowelPrimeEnvironment: r.vowel_prime_environment,
    vowelPrimeWorkerUrl: r.vowel_prime_worker_url,
    createdAt: r.created_at,
  }));
}

/**
 * Get decrypted API key by id. Used internally for token generation.
 */
export async function getDecryptedProviderKey(
  id: string,
  appId: string
): Promise<{ apiKey: string; provider: ProviderType; vowelPrimeEnvironment?: string; vowelPrimeWorkerUrl?: string } | null> {
  const db = getDb();
  const row = db
    .query(
      `SELECT id, app_id, provider, encrypted_key, iv, vowel_prime_environment, vowel_prime_worker_url
       FROM provider_keys WHERE id = ? AND app_id = ?`
    )
    .get(id, appId) as ProviderKeyRow | undefined;

  db.close();

  if (!row) return null;

  const secret = getEncryptionSecret();
  const apiKey = await decryptApiKey(
    new Uint8Array(row.encrypted_key),
    new Uint8Array(row.iv),
    secret
  );

  return {
    apiKey,
    provider: row.provider as ProviderType,
    vowelPrimeEnvironment: row.vowel_prime_environment ?? undefined,
    vowelPrimeWorkerUrl: row.vowel_prime_worker_url ?? undefined,
  };
}

/**
 * Find a provider key for token generation.
 * Prefers key matching env/workerUrl; otherwise first key for provider.
 */
export async function findProviderKeyForToken(
  appId: string,
  provider: ProviderType,
  vowelPrimeConfig?: { environment?: string; workerUrl?: string }
): Promise<{ apiKey: string; vowelPrimeEnvironment?: string; vowelPrimeWorkerUrl?: string } | null> {
  const db = getDb();
  const rows = db
    .query(
      `SELECT id, app_id, provider, encrypted_key, iv, vowel_prime_environment, vowel_prime_worker_url
       FROM provider_keys WHERE app_id = ? AND provider = ? ORDER BY created_at ASC`
    )
    .all(appId, provider) as ProviderKeyRow[];

  db.close();

  if (rows.length === 0) return null;

  // Prefer key matching requested env/workerUrl
  let chosen = rows[0];
  if (vowelPrimeConfig && provider === "engine") {
    const env = vowelPrimeConfig.environment;
    const url = vowelPrimeConfig.workerUrl;
    const match = rows.find(
      (r) =>
        (env && r.vowel_prime_environment === env) ||
        (url && r.vowel_prime_worker_url === url)
    );
    if (match) chosen = match;
  }

  const secret = getEncryptionSecret();
  const apiKey = await decryptApiKey(
    new Uint8Array(chosen.encrypted_key),
    new Uint8Array(chosen.iv),
    secret
  );

  return {
    apiKey,
    vowelPrimeEnvironment: chosen.vowel_prime_environment ?? undefined,
    vowelPrimeWorkerUrl: chosen.vowel_prime_worker_url ?? undefined,
  };
}

/**
 * Delete a provider key.
 */
export function deleteProviderKey(id: string, appId: string): boolean {
  const db = getDb();
  const result = db.run("DELETE FROM provider_keys WHERE id = ? AND app_id = ?", [
    id,
    appId,
  ]);
  db.close();
  return result.changes > 0;
}
