/**
 * Database schema tests.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { SCHEMA } from "./schema.js";

describe("Database schema", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(SCHEMA);
  });

  test("creates apps table", () => {
    const result = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='apps'").get();
    expect(result).toBeDefined();
    expect((result as { name: string }).name).toBe("apps");
  });

  test("creates api_keys table", () => {
    const result = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'").get();
    expect(result).toBeDefined();
    expect((result as { name: string }).name).toBe("api_keys");
  });

  test("apps table has required columns", () => {
    const info = db.query("PRAGMA table_info(apps)").all() as { name: string }[];
    const names = info.map((c) => c.name);
    expect(names).toContain("id");
    expect(names).toContain("name");
    expect(names).toContain("description");
    expect(names).toContain("default_provider");
    expect(names).toContain("created_at");
    expect(names).toContain("updated_at");
  });

  test("api_keys table has required columns", () => {
    const info = db.query("PRAGMA table_info(api_keys)").all() as { name: string }[];
    const names = info.map((c) => c.name);
    expect(names).toContain("id");
    expect(names).toContain("app_id");
    expect(names).toContain("key_hash");
    expect(names).toContain("encrypted_key");
    expect(names).toContain("iv");
    expect(names).toContain("scopes");
    expect(names).toContain("label");
    expect(names).toContain("created_at");
  });

  test("creates provider_keys table", () => {
    const result = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='provider_keys'")
      .get();
    expect(result).toBeDefined();
    expect((result as { name: string }).name).toBe("provider_keys");
  });

  test("can insert and query app", () => {
    const now = Date.now();
    db.run(
      "INSERT INTO apps (id, name, description, default_provider, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ["app-1", "Test App", "A test", "engine", now, now]
    );
    const row = db.query("SELECT * FROM apps WHERE id = ?").get("app-1") as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.name).toBe("Test App");
    expect(row.default_provider).toBe("engine");
  });
});
