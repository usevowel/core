/**
 * Initialize SQLite database and schema
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA } from "./schema";

function resolveDbPath(): string {
  const configuredPath = process.env.DB_PATH;

  // Keep test writes isolated even when .env sets DB_PATH=./data/core.db.
  if (
    process.env.NODE_ENV === "test" &&
    (!configuredPath || configuredPath === "./data/core.db")
  ) {
    return "./data/core.test.db";
  }

  return configuredPath || "./data/core.db";
}

export function getDb(): Database {
  const dbPath = resolveDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  return new Database(dbPath);
}

function hasColumn(db: Database, table: string, column: string): boolean {
  const rows = db
    .query(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function runMigrations(db: Database): void {
  if (!hasColumn(db, "apps", "runtime_config")) {
    db.run(`ALTER TABLE apps ADD COLUMN runtime_config TEXT`);
  }
  if (!hasColumn(db, "api_keys", "allowed_providers")) {
    db.run(
      `ALTER TABLE api_keys ADD COLUMN allowed_providers TEXT NOT NULL DEFAULT '["engine"]'`
    );
  }
  if (!hasColumn(db, "api_keys", "revoked_at")) {
    db.run(`ALTER TABLE api_keys ADD COLUMN revoked_at INTEGER`);
  }

  if (
    hasColumn(db, "api_keys", "allowed_endpoint_presets") ||
    hasColumn(db, "api_keys", "default_endpoint_preset")
  ) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys_v2 (
        id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        encrypted_key BLOB NOT NULL,
        iv BLOB NOT NULL,
        scopes TEXT NOT NULL,
        label TEXT,
        allowed_providers TEXT NOT NULL DEFAULT '["engine"]',
        revoked_at INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (app_id) REFERENCES apps(id)
      );

      INSERT INTO api_keys_v2 (
        id, app_id, key_hash, encrypted_key, iv, scopes, label,
        allowed_providers, revoked_at, created_at
      )
      SELECT
        id, app_id, key_hash, encrypted_key, iv, scopes, label,
        allowed_providers, revoked_at, created_at
      FROM api_keys;

      DROP TABLE api_keys;
      ALTER TABLE api_keys_v2 RENAME TO api_keys;
      CREATE INDEX IF NOT EXISTS idx_api_keys_app_id ON api_keys(app_id);
      CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
    `);
  }

  db.run(`DROP TABLE IF EXISTS endpoint_presets`);
}

export function initDb(): void {
  const dbPath = resolveDbPath();
  const db = getDb();
  db.exec(SCHEMA);
  runMigrations(db);
  db.close();
  console.log(`Database initialized at ${dbPath}`);
}

// Run when executed directly
if (import.meta.main) {
  initDb();
}
