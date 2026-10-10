import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const tables = [
  "companies",
  "contacts",
  "evidence",
  "facts",
  "conversations",
  "messages",
  "outreach",
  "reviews",
  "audit",
] as const;
export type EntityTable = (typeof tables)[number];
export interface Entity {
  id: string;
  sellerId: string;
  companyId: string;
  [key: string]: unknown;
}

export function openDatabase(
  path = process.env.TRACKER_DATABASE_PATH || "./data/tracker.sqlite",
) {
  if (path !== ":memory:")
    mkdirSync(dirname(resolve(/* turbopackIgnore: true */ path)), {
      recursive: true,
    });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  db.exec(
    "CREATE TABLE IF NOT EXISTS sellers (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data))); CREATE TABLE IF NOT EXISTS schema_versions (version INTEGER PRIMARY KEY); INSERT OR IGNORE INTO schema_versions VALUES (1);",
  );
  for (const table of tables)
    db.exec(
      `CREATE TABLE IF NOT EXISTS ${table} (id TEXT NOT NULL, seller_id TEXT NOT NULL REFERENCES sellers(id), company_id TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(seller_id, id)); CREATE INDEX IF NOT EXISTS ${table}_scope ON ${table}(seller_id, company_id);`,
    );
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS messages_ingestion ON messages(seller_id, json_extract(data, '$.ingestionId'));",
  );
  return db;
}
export function transaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function insertEntity(
  db: DatabaseSync,
  table: EntityTable,
  entity: Entity,
) {
  if (!tables.includes(table)) throw new Error("Unknown entity table");
  db.prepare(
    `INSERT INTO ${table}(id,seller_id,company_id,data) VALUES(?,?,?,?)`,
  ).run(entity.id, entity.sellerId, entity.companyId, JSON.stringify(entity));
}
export function listEntities(
  db: DatabaseSync,
  table: EntityTable,
  sellerId: string,
  companyId: string,
): Entity[] {
  if (!tables.includes(table)) throw new Error("Unknown entity table");
  return db
    .prepare(
      `SELECT data FROM ${table} WHERE seller_id=? AND company_id=? ORDER BY rowid`,
    )
    .all(sellerId, companyId)
    .map((row) => JSON.parse(String(row.data)) as Entity);
}
