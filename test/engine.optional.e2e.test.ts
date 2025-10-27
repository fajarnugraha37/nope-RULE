import { describe, expect, it } from 'bun:test';
import ruleSet from '../src/dsl/onboarding_v1.json' assert { type: 'json' };
import { EngineManager } from '../src/engine/engine';

describe('workflow engine e2e (optional path)', () => {
  it('skips initial form and exits via barrier fail path', async () => {
    const engine = EngineManager.load(ruleSet);
    const start = await engine.startInstance('onboarding_v1', {
      user: { id: 'u-fail' },
      flags: { optionalFormRequired: false }
    });

    expect(start.status).toBe('WAITING');
    expect(start.waitingFor?.type).toBe('BARRIER');

    const payloads = [
      ['check.kyc', { userId: 'u-fail', status: 'PASS' }],
      ['check.device', { userId: 'u-fail', status: 'PASS' }],
      ['check.credit', { userId: 'u-fail', status: 'PASS', score: 710 }],
      ['check.risk', { userId: 'u-fail', status: 'PASS' }],
      ['check.sanction', { userId: 'u-fail', status: 'FAIL' }]
    ] as const;

    let lastResult;
    for (const [topic, payload] of payloads) {
      lastResult = await engine.notifyEvent(topic, 'u-fail', payload);
    }

    expect(lastResult).toBeDefined();
    expect(lastResult!.status).toBe('COMPLETED');

    const snapshot = await engine.getInstanceStatus(lastResult!.instanceId);
    const barrierProgress = (snapshot.context as any).barriers.pending_checks.progress;
    expect(barrierProgress.completed).toBe(true);
    expect(barrierProgress.passed).toBe(false);
  });
});
