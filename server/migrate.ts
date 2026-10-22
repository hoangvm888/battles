import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import { createPool } from './db.js';
export async function migrate(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':battles-migrations'))",
    );
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const directory = path.resolve(process.cwd(), 'server/migrations');
    for (const name of (await readdir(directory)).filter((n) => n.endsWith('.sql')).sort()) {
      const sql = await readFile(path.join(directory, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query('SELECT checksum FROM schema_migrations WHERE name=$1', [
        name,
      ]);
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum)
          throw new Error(`Applied migration ${name} has changed. Add a new migration instead.`);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [
        name,
        checksum,
      ]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const pool = createPool();
  migrate(pool)
    .then(() => console.log('Database migrations applied.'))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
