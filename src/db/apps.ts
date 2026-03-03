/**
 * Apps persistence layer.
 * CRUD operations for apps in SQLite.
 */

import type { Database } from "bun:sqlite";
import { getDb } from "./init";

export interface AppRow {
  id: string;
  name: string;
  description: string | null;
  default_provider: string | null;
  created_at: number;
  updated_at: number;
}

export interface CreateAppInput {
  name: string;
  description?: string;
  defaultProvider?: string;
}

export interface UpdateAppInput {
  name?: string;
  description?: string;
  defaultProvider?: string;
}

export interface App {
  id: string;
  name: string;
  description: string | null;
  defaultProvider: string | null;
  createdAt: number;
  updatedAt: number;
}

function rowToApp(row: AppRow): App {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    defaultProvider: row.default_provider,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a new app.
 */
export function createApp(input: CreateAppInput): App {
  const id = crypto.randomUUID();
  const now = Date.now();

  const db = getDb();
  db.run(
    `INSERT INTO apps (id, name, description, default_provider, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.description ?? null,
      input.defaultProvider ?? null,
      now,
      now,
    ]
  );
  db.close();

  return {
    id,
    name: input.name,
    description: input.description ?? null,
    defaultProvider: input.defaultProvider ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * List all apps.
 */
export function listApps(): App[] {
  const db = getDb();
  const rows = db
    .query(
      `SELECT id, name, description, default_provider, created_at, updated_at
       FROM apps ORDER BY created_at DESC`
    )
    .all() as AppRow[];
  db.close();

  return rows.map(rowToApp);
}

/**
 * Get a single app by ID.
 */
export function getApp(id: string): App | null {
  const db = getDb();
  const row = db
    .query(
      `SELECT id, name, description, default_provider, created_at, updated_at
       FROM apps WHERE id = ?`
    )
    .get(id) as AppRow | undefined;
  db.close();

  return row ? rowToApp(row) : null;
}

/**
 * Update an app.
 */
export function updateApp(id: string, input: UpdateAppInput): App | null {
  const existing = getApp(id);
  if (!existing) return null;

  const now = Date.now();
  const name = input.name ?? existing.name;
  const description = input.description ?? existing.description;
  const defaultProvider = input.defaultProvider ?? existing.defaultProvider;

  const db = getDb();
  db.run(
    `UPDATE apps 
     SET name = ?, description = ?, default_provider = ?, updated_at = ?
     WHERE id = ?`,
    [name, description, defaultProvider, now, id]
  );
  db.close();

  return {
    ...existing,
    name,
    description,
    defaultProvider,
    updatedAt: now,
  };
}

/**
 * Delete an app and all its associated data.
 */
export function deleteApp(id: string): boolean {
  const db = getDb();
  
  // Delete associated data first
  db.run("DELETE FROM api_keys WHERE app_id = ?", [id]);
  db.run("DELETE FROM provider_keys WHERE app_id = ?", [id]);
  
  // Delete the app
  const result = db.run("DELETE FROM apps WHERE id = ?", [id]);
  db.close();

  return result.changes > 0;
}
