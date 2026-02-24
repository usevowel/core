/**
 * Initialize SQLite database and schema
 */

import { Database } from "bun:sqlite";
import { SCHEMA } from "./schema";

const dbPath = process.env.DB_PATH || "./data/core.db";

export function getDb(): Database {
  return new Database(dbPath);
}

export function initDb(): void {
  const db = getDb();
  db.exec(SCHEMA);
  db.close();
  console.log(`Database initialized at ${dbPath}`);
}

// Run when executed directly
if (import.meta.main) {
  initDb();
}
