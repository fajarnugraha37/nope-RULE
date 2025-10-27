import { describe, expect, it, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveStorageFromEnv, MemoryStorage, PgliteStorage } from '../src/engine/storage';

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

describe('resolveStorageFromEnv', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('returns memory storage by default', async () => {
    delete process.env.WORKFLOW_STORAGE;
    delete process.env.DATABASE_URL;
    const storage = await resolveStorageFromEnv();
    expect(storage).toBeInstanceOf(MemoryStorage);
  });

  it('creates pglite storage when configured', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'pglite-storage-'));
    process.env.WORKFLOW_STORAGE = 'pglite';
    process.env.PGLITE_DATA_PATH = tempDir;
    const storage = await resolveStorageFromEnv();
    expect(storage).toBeInstanceOf(PgliteStorage);
    await rm(tempDir, { recursive: true, force: true });
  });
});
