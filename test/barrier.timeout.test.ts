import { describe, expect, it } from 'bun:test';
import { createTestEngine } from './helpers/factory';

describe('barrier timeout', () => {
  it('falls back on timeout', async () => {
    const { engine } = createTestEngine();
    const start = await engine.startInstance('onboarding_v1', {
      user: { id: 'u-timeout' },
      flags: { optionalFormRequired: false }
    });

    expect(start.status).toBe('WAITING');
    expect(start.waitingFor?.type).toBe('BARRIER');

    const future = Date.now() + 900_000 + 1;
    await engine.processTimeouts(future);

    const snapshot = await engine.getInstanceStatus(start.instanceId);
    expect(snapshot.status).toBe('COMPLETED');
    expect(
      (snapshot.context as any).barriers.pending_checks.progress.passed
    ).toBe(false);
  });
});
