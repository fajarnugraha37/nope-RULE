import { describe, expect, it } from 'bun:test';
import { createTestEngine } from './helpers/factory';

describe('workflow engine e2e', () => {
  it('start->submit->events->entity->payment->finish', async () => {
    const { engine, storage } = createTestEngine();
    const start = await engine.startInstance('onboarding_v1', {
      user: { id: 'u-1' },
      flags: { optionalFormRequired: true },
      blacklist: []
    });

    expect(start.status).toBe('WAITING');
    expect(start.pendingTask?.nodeId).toBe('submit');

    const afterForm = await engine.resumeWithForm(start.pendingTask!.id, {
      fullName: 'Ada Lovelace',
      email: 'ada@example.com'
    });

    expect(afterForm.status).toBe('WAITING');
    expect(afterForm.waitingFor?.type).toBe('BARRIER');

    const events: Array<[string, any]> = [
      ['check.kyc', { userId: 'u-1', status: 'PASS' }],
      ['check.sanction', { userId: 'u-1', status: 'PASS' }],
      ['check.device', { userId: 'u-1', status: 'PASS' }],
      ['check.credit', { userId: 'u-1', status: 'PASS', score: 720 }],
      ['check.risk', { userId: 'u-1', status: 'PASS', reason: 'none' }]
    ];

    let barrierResult;
    for (const [topic, payload] of events) {
      barrierResult = await engine.notifyEvent(topic, 'u-1', payload);
    }

    expect(barrierResult).toBeDefined();
    expect(barrierResult!.pendingTask?.nodeId).toBe('entity_form');

    const afterEntity = await engine.resumeWithForm(barrierResult!.pendingTask!.id, {
      entityType: 'PERSONAL',
      documents: ['doc-a.pdf']
    });

    expect(afterEntity.status).toBe('WAITING');
    expect(afterEntity.waitingFor?.type).toBe('EVENT');
    expect(afterEntity.waitingFor?.topic).toBe('payment.confirmed');

    const final = await engine.notifyEvent('payment.confirmed', 'u-1', {
      userId: 'u-1',
      paymentId: 'p-9',
      amount: 100_000
    });

    expect(final).toBeDefined();
    expect(final!.status).toBe('COMPLETED');

    const snapshot = await engine.getInstanceStatus(final!.instanceId);
    const tolerance = 5;
    expect(
      Math.abs(
        snapshot.metrics.wallMsTotal - (snapshot.metrics.activeMsTotal + snapshot.metrics.waitingMsTotal)
      )
    ).toBeLessThanOrEqual(tolerance);
    const barrierTopics = storage.getBarrierTopics?.() ?? [];
    console.log('barrierTopics', barrierTopics);
    expect(barrierTopics.length).toBeGreaterThanOrEqual(5);
  });
});
