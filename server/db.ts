import 'dotenv/config';
import pg from 'pg';
export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString)
    throw new Error('DATABASE_URL is required. Copy .env.example and configure PostgreSQL.');
  return new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}
