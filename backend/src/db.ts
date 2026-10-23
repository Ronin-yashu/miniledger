import { Pool, types } from "pg";

// Return DATE columns as plain 'YYYY-MM-DD' strings (avoids timezone shifts).
types.setTypeParser(1082, (v: string) => v);

export type Db = Pick<Pool, "query">;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS otps (
  phone TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS loans (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  friend_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  due_date DATE NOT NULL,
  repaid_at TIMESTAMPTZ,
  receipt_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loans_user_idx ON loans(user_id);
`;

export async function migrate(db: Db) {
  for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.query(stmt);
  }
}

export function createPool(url: string) {
  return new Pool({ connectionString: url });
}