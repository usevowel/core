/**
 * Endpoint preset persistence for token minting target selection.
 * Supports system presets (seeded from env/defaults) and user-managed presets.
 */

import type { Database } from "bun:sqlite";
import { getDb } from "./init";

export type EndpointProvider = "vowel-prime" | "openai" | "grok";

export interface EndpointPresetRow {
  id: string;
  name: string;
  provider: EndpointProvider;
  http_url: string;
  ws_url: string;
  is_system: number;
  enabled: number;
  created_at: number;
  updated_at: number;
}

export interface EndpointPreset {
  id: string;
  name: string;
  provider: EndpointProvider;
  httpUrl: string;
  wsUrl: string;
  isSystem: boolean;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateEndpointPresetInput {
  name: string;
  provider: EndpointProvider;
  httpUrl: string;
  wsUrl: string;
  enabled?: boolean;
  isSystem?: boolean;
}

export interface UpdateEndpointPresetInput {
  name?: string;
  httpUrl?: string;
  wsUrl?: string;
  enabled?: boolean;
}

const DEFAULT_VOWEL_PRIME_PRESETS = {
  testing: {
    httpUrl: "https://testing-prime.vowel.to",
    wsUrl: "wss://testing-prime.vowel.to/v1/realtime",
  },
  dev: {
    httpUrl: "https://dev-prime.vowel.to",
    wsUrl: "wss://dev-prime.vowel.to/v1/realtime",
  },
  staging: {
    httpUrl: "https://staging.prime.vowel.to",
    wsUrl: "wss://staging.prime.vowel.to/v1/realtime",
  },
  production: {
    httpUrl: "https://prime.vowel.to",
    wsUrl: "wss://prime.vowel.to/v1/realtime",
  },
  "billing-test": {
    httpUrl: "https://billing-test.vowel.to",
    wsUrl: "wss://billing-test.vowel.to/v1/realtime",
  },
} as const;

const SYSTEM_PRESET_PREFIX = "ENDPOINT_PRESET_VOWEL_PRIME_";

function rowToPreset(row: EndpointPresetRow): EndpointPreset {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    httpUrl: row.http_url,
    wsUrl: row.ws_url,
    isSystem: row.is_system === 1,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeUrlPair(input: {
  httpUrl?: string;
  wsUrl?: string;
}): { httpUrl: string; wsUrl: string } {
  const httpFromWs = input.wsUrl
    ? input.wsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/v1\/realtime\/?$/, "")
    : undefined;
  const wsFromHttp = input.httpUrl
    ? input.httpUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:").replace(/\/$/, "") + "/v1/realtime"
    : undefined;

  const httpUrl = (input.httpUrl ?? httpFromWs ?? "").trim().replace(/\/$/, "");
  const wsUrl = (input.wsUrl ?? wsFromHttp ?? "").trim().replace(/\/$/, "");
  if (!httpUrl || !wsUrl) {
    throw new Error("httpUrl and wsUrl are required");
  }
  return { httpUrl, wsUrl };
}

function upsertSystemPreset(
  db: Database,
  input: CreateEndpointPresetInput
): void {
  const now = Date.now();
  const existing = db
    .query(
      `SELECT id FROM endpoint_presets WHERE name = ? AND provider = ?`
    )
    .get(input.name, input.provider) as { id: string } | undefined;

  if (!existing) {
    db.run(
      `INSERT INTO endpoint_presets (id, name, provider, http_url, ws_url, is_system, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)`,
      [
        crypto.randomUUID(),
        input.name,
        input.provider,
        input.httpUrl,
        input.wsUrl,
        now,
        now,
      ]
    );
    return;
  }

  db.run(
    `UPDATE endpoint_presets
     SET http_url = ?, ws_url = ?, is_system = 1, enabled = 1, updated_at = ?
     WHERE id = ?`,
    [input.httpUrl, input.wsUrl, now, existing.id]
  );
}

function getSystemPresetEnvOverrides(): Record<string, string> {
  const entries = Object.entries(process.env).filter(([key, value]) => {
    return key.startsWith(SYSTEM_PRESET_PREFIX) && Boolean(value);
  });
  return Object.fromEntries(entries);
}

export function seedSystemEndpointPresets(): void {
  const db = getDb();
  const envOverrides = getSystemPresetEnvOverrides();

  for (const [name, defaults] of Object.entries(DEFAULT_VOWEL_PRIME_PRESETS)) {
    const wsOverride = envOverrides[`${SYSTEM_PRESET_PREFIX}${name.toUpperCase().replace(/-/g, "_")}_WS_URL`];
    const httpOverride = envOverrides[`${SYSTEM_PRESET_PREFIX}${name.toUpperCase().replace(/-/g, "_")}_HTTP_URL`];
    const { httpUrl, wsUrl } = normalizeUrlPair({
      httpUrl: httpOverride ?? defaults.httpUrl,
      wsUrl: wsOverride ?? defaults.wsUrl,
    });
    upsertSystemPreset(db, {
      name,
      provider: "vowel-prime",
      httpUrl,
      wsUrl,
      enabled: true,
      isSystem: true,
    });
  }

  db.close();
}

export function listEndpointPresets(provider?: EndpointProvider): EndpointPreset[] {
  const db = getDb();
  const rows = provider
    ? (db
        .query(
          `SELECT id, name, provider, http_url, ws_url, is_system, enabled, created_at, updated_at
           FROM endpoint_presets
           WHERE provider = ?
           ORDER BY is_system DESC, name ASC`
        )
        .all(provider) as EndpointPresetRow[])
    : (db
        .query(
          `SELECT id, name, provider, http_url, ws_url, is_system, enabled, created_at, updated_at
           FROM endpoint_presets
           ORDER BY provider ASC, is_system DESC, name ASC`
        )
        .all() as EndpointPresetRow[]);
  db.close();
  return rows.map(rowToPreset);
}

export function getEndpointPresetByName(
  provider: EndpointProvider,
  name: string
): EndpointPreset | null {
  const db = getDb();
  const row = db
    .query(
      `SELECT id, name, provider, http_url, ws_url, is_system, enabled, created_at, updated_at
       FROM endpoint_presets WHERE provider = ? AND name = ?`
    )
    .get(provider, name) as EndpointPresetRow | undefined;
  db.close();
  return row ? rowToPreset(row) : null;
}

export function getEndpointPresetByUrl(
  provider: EndpointProvider,
  url: string
): EndpointPreset | null {
  const normalized = url.trim().replace(/\/$/, "");
  const db = getDb();
  const row = db
    .query(
      `SELECT id, name, provider, http_url, ws_url, is_system, enabled, created_at, updated_at
       FROM endpoint_presets
       WHERE provider = ? AND (http_url = ? OR ws_url = ?)`
    )
    .get(provider, normalized, normalized) as EndpointPresetRow | undefined;
  db.close();
  return row ? rowToPreset(row) : null;
}

export function createEndpointPreset(input: CreateEndpointPresetInput): EndpointPreset {
  const now = Date.now();
  const { httpUrl, wsUrl } = normalizeUrlPair({
    httpUrl: input.httpUrl,
    wsUrl: input.wsUrl,
  });
  const db = getDb();
  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO endpoint_presets (id, name, provider, http_url, ws_url, is_system, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name.trim(),
      input.provider,
      httpUrl,
      wsUrl,
      input.isSystem ? 1 : 0,
      input.enabled === false ? 0 : 1,
      now,
      now,
    ]
  );
  db.close();
  return {
    id,
    name: input.name.trim(),
    provider: input.provider,
    httpUrl,
    wsUrl,
    isSystem: Boolean(input.isSystem),
    enabled: input.enabled !== false,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateEndpointPreset(
  id: string,
  input: UpdateEndpointPresetInput
): EndpointPreset | null {
  const db = getDb();
  const row = db
    .query(
      `SELECT id, name, provider, http_url, ws_url, is_system, enabled, created_at, updated_at
       FROM endpoint_presets WHERE id = ?`
    )
    .get(id) as EndpointPresetRow | undefined;

  if (!row) {
    db.close();
    return null;
  }

  if (row.is_system === 1) {
    db.close();
    throw new Error("System presets are read-only");
  }

  const { httpUrl, wsUrl } = normalizeUrlPair({
    httpUrl: input.httpUrl ?? row.http_url,
    wsUrl: input.wsUrl ?? row.ws_url,
  });
  const now = Date.now();
  const name = input.name?.trim() || row.name;
  const enabled = input.enabled === undefined ? row.enabled : input.enabled ? 1 : 0;

  db.run(
    `UPDATE endpoint_presets
     SET name = ?, http_url = ?, ws_url = ?, enabled = ?, updated_at = ?
     WHERE id = ?`,
    [name, httpUrl, wsUrl, enabled, now, id]
  );
  db.close();

  return {
    id: row.id,
    name,
    provider: row.provider,
    httpUrl,
    wsUrl,
    isSystem: false,
    enabled: enabled === 1,
    createdAt: row.created_at,
    updatedAt: now,
  };
}

export function deleteEndpointPreset(id: string): boolean {
  const db = getDb();
  const row = db
    .query(`SELECT id, is_system FROM endpoint_presets WHERE id = ?`)
    .get(id) as { id: string; is_system: number } | undefined;
  if (!row) {
    db.close();
    return false;
  }
  if (row.is_system === 1) {
    db.close();
    throw new Error("System presets cannot be deleted");
  }

  const result = db.run(`DELETE FROM endpoint_presets WHERE id = ?`, [id]);
  db.close();
  return result.changes > 0;
}
