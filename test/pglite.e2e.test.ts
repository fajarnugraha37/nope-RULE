import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createTestEngine } from './helpers/factory';
import { PgliteStorage } from '../src/engine/storage';

async function applyMigrations(db: PGlite) {
  const sqlPath = resolve(process.cwd(), 'src/sql/001_tables.sql');
  const raw = await readFile(sqlPath, 'utf8');
  const statements = raw
    .split(/;\s*(?:\r?\n|$)/)
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);
  for (const stmt of statements) {
    await db.query(stmt);
  }
}

describe('PostgresStorage with PGlite', () => {
  it('runs workflow end-to-end using PGlite backend', async () => {
    const db = new PGlite();
    await applyMigrations(db);

    const storage = new PgliteStorage(db);
    const { engine } = createTestEngine({ storage });

    const start = await engine.startInstance('onboarding_v1', {
      user: { id: 'pg-1' },
      flags: { optionalFormRequired: true }
    });
    expect(start.status).toBe('WAITING');

    const afterForm = await engine.resumeWithForm(start.pendingTask!.id, {
      fullName: 'PGlite Tester',
      email: 'pg@example.com'
    });
    expect(afterForm.waitingFor?.type).toBe('BARRIER');

    const topics = [
      ['check.kyc', { userId: 'pg-1', status: 'PASS' }],
      ['check.sanction', { userId: 'pg-1', status: 'PASS' }],
      ['check.device', { userId: 'pg-1', status: 'PASS' }],
      ['check.credit', { userId: 'pg-1', status: 'PASS', score: 715 }],
      ['check.risk', { userId: 'pg-1', status: 'PASS' }]
    ] as const;

    let barrierResult;
    for (const [topic, payload] of topics) {
      barrierResult = await engine.notifyEvent(topic, 'pg-1', payload as any);
    }
    expect(barrierResult?.pendingTask?.nodeId).toBe('entity_form');

    const afterEntity = await engine.resumeWithForm(barrierResult!.pendingTask!.id, {
      entityType: 'PERSONAL',
      documents: ['doc.pdf']
    });
    expect(afterEntity.waitingFor?.type).toBe('EVENT');

    const final = await engine.notifyEvent('payment.confirmed', 'pg-1', {
      userId: 'pg-1',
      paymentId: 'pay-123',
      amount: 5000
    });

    expect(final?.status).toBe('COMPLETED');

    await db.close?.();
  });
});
