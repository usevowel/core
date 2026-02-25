/**
 * SQLite schema for Vowel Core
 * Apps and API keys persistence
 */

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  default_provider TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  encrypted_key BLOB NOT NULL,
  iv BLOB NOT NULL,
  scopes TEXT NOT NULL,
  label TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (app_id) REFERENCES apps(id)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_app_id ON api_keys(app_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

CREATE TABLE IF NOT EXISTS provider_keys (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  label TEXT,
  encrypted_key BLOB NOT NULL,
  iv BLOB NOT NULL,
  vowel_prime_environment TEXT,
  vowel_prime_worker_url TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (app_id) REFERENCES apps(id)
);

CREATE INDEX IF NOT EXISTS idx_provider_keys_app_id ON provider_keys(app_id);
CREATE INDEX IF NOT EXISTS idx_provider_keys_provider ON provider_keys(provider);
`;
