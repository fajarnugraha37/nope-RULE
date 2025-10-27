import { describe, expect, it, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrationsIfNeeded } from '../src/sql/migrate';
import { PGlite } from '@electric-sql/pglite';

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

describe('runMigrationsIfNeeded', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('skips when disabled', async () => {
    process.env.RUN_MIGRATIONS_ON_BOOT = 'false';
    process.env.WORKFLOW_STORAGE = 'memory';
    await expect(runMigrationsIfNeeded()).resolves.toBeUndefined();
  });

  it('executes migrations against pglite', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'pglite-migrate-'));
    process.env.RUN_MIGRATIONS_ON_BOOT = 'true';
    process.env.WORKFLOW_STORAGE = 'pglite';
    process.env.PGLITE_DATA_PATH = tempDir;
    delete process.env.DATABASE_URL;

    await runMigrationsIfNeeded();

    const db = new PGlite(tempDir);
    const result = await db.query("SELECT to_regclass('workflow_instances') AS present");
    await db.close?.();
    await rm(tempDir, { recursive: true, force: true });
    expect(result.rows[0].present).toBe('workflow_instances');
  });
});
