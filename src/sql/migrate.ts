import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';

function normalizeBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

async function runMigrations(): Promise<void> {
  const shouldRun = normalizeBoolean(process.env.RUN_MIGRATIONS_ON_BOOT, false);
  if (!shouldRun) {
    console.log('[migrate] skipped (RUN_MIGRATIONS_ON_BOOT=false)');
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('[migrate] DATABASE_URL must be set to run migrations');
  }

  const migrationPath = resolve(
    process.cwd(),
    process.env.MIGRATION_PATH ?? 'src/sql/001_tables.sql'
  );

  const sqlText = await readFile(migrationPath, 'utf8');
  if (!sqlText.trim()) {
    console.log(`[migrate] no SQL statements found in ${migrationPath}`);
    return;
  }

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql.unsafe(sqlText);
    console.log(`[migrate] executed ${migrationPath}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
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
