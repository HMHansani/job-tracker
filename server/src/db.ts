import "dotenv/config";
import { Pool } from "pg";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      company TEXT NOT NULL,
      position TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'applied'
        CHECK (status IN ('applied', 'interview', 'offer', 'rejected')),
      location TEXT,
      link TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Each job now belongs to a user
  await pool.query(`
    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
  `);
}