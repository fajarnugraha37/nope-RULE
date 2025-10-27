import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { detectStorageDriver } from '../engine/storage';

function normalizeBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

async function runMigrations(): Promise<void> {
  const shouldRun = normalizeBoolean(process.env.RUN_MIGRATIONS_ON_BOOT, true);
  if (!shouldRun) {
    console.log('[migrate] skipped (RUN_MIGRATIONS_ON_BOOT=false)');
    return;
  }

  const driver = detectStorageDriver();

  const migrationPath = resolve(
    process.cwd(),
    process.env.MIGRATION_PATH ?? 'src/sql/001_tables.sql'
  );

  const sqlText = await readFile(migrationPath, 'utf8');
  if (!sqlText.trim()) {
    console.log(`[migrate] no SQL statements found in ${migrationPath}`);
    return;
  }

  if (driver === 'memory') {
    console.log('[migrate] skipped (memory storage selected)');
    return;
  }

  if (driver === 'postgres') {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('[migrate] DATABASE_URL must be set to run migrations with Postgres');
    }
    const sql = postgres(databaseUrl, { max: 1 });
    try {
      await sql.unsafe(sqlText);
      console.log(`[migrate] executed ${migrationPath}`);
    } finally {
      await sql.end({ timeout: 5 });
    }
    return;
  }

  if (driver === 'pglite') {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite(process.env.PGLITE_DATA_PATH);
    try {
      const statements = splitStatements(sqlText);
      for (const stmt of statements) {
        await db.query(stmt);
      }
      console.log(`[migrate] executed ${statements.length} statements via PGlite`);
    } finally {
      await db.close?.();
    }
    return;
  }

  throw new Error(`[migrate] unsupported storage driver '${driver}'`);
}

if (import.meta.main) {
  runMigrations().catch((err) => {
    console.error('[migrate] failed:', err);
    process.exit(1);
  });
}

export async function runMigrationsIfNeeded(): Promise<void> {
  await runMigrations();
}

function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}
