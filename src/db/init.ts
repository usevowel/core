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
  if (!hasColumn(db, "api_keys", "allowed_providers")) {
    db.run(
      `ALTER TABLE api_keys ADD COLUMN allowed_providers TEXT NOT NULL DEFAULT '["vowel-prime"]'`
    );
  }
  if (!hasColumn(db, "api_keys", "allowed_endpoint_presets")) {
    db.run(
      `ALTER TABLE api_keys ADD COLUMN allowed_endpoint_presets TEXT NOT NULL DEFAULT '["staging"]'`
    );
  }
  if (!hasColumn(db, "api_keys", "default_endpoint_preset")) {
    db.run(`ALTER TABLE api_keys ADD COLUMN default_endpoint_preset TEXT`);
  }
  if (!hasColumn(db, "api_keys", "revoked_at")) {
    db.run(`ALTER TABLE api_keys ADD COLUMN revoked_at INTEGER`);
  }
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
