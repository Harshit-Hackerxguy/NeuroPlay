import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL. Copy backend/.env.example to backend/.env and set a valid PostgreSQL connection string.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function runQuery(text, params = []) {
  return pool.query(text, params);
}
