import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { registerRoutes } from '../src/http/routes';
import { createTestEngine } from './helpers/factory';

function setupApp() {
  const { engine } = createTestEngine();
  const app = new Hono();
  registerRoutes(app, engine);
  return { app, engine };
}

async function postJson(
  app: Hono,
  path: string,
  body: unknown,
  idempotencyKey: string
): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify(body)
  });
}

describe('HTTP routes', () => {
  it('runs onboarding workflow via HTTP with idempotency', async () => {
    const { app } = setupApp();

    const startRes = await postJson(
      app,
      '/workflows/onboarding_v1/start',
      { user: { id: 'api-1' }, flags: { optionalFormRequired: true } },
      'start-1'
    );
    expect(startRes.status).toBe(200);
    const startJson = await startRes.json();
    expect(startJson.pendingTask.nodeId).toBe('submit');
    expect(startJson.pendingTask.context).toBeUndefined();

    const dupRes = await postJson(
      app,
      '/workflows/onboarding_v1/start',
      { user: { id: 'api-1' }, flags: { optionalFormRequired: true } },
      'start-1'
    );
    expect(await dupRes.json()).toEqual(startJson);

    const submitRes = await postJson(
      app,
      `/tasks/${startJson.pendingTask.id}/submit`,
      { fullName: 'Api User', email: 'api@example.com' },
      'form-1'
    );
    const submitJson = await submitRes.json();
    expect(submitJson.waitingFor.type).toBe('BARRIER');

    const checks = [
      ['check.kyc', { userId: 'api-1', status: 'PASS' }],
      ['check.sanction', { userId: 'api-1', status: 'PASS' }],
      ['check.device', { userId: 'api-1', status: 'PASS' }],
      ['check.credit', { userId: 'api-1', status: 'PASS', score: 730 }],
      ['check.risk', { userId: 'api-1', status: 'PASS' }]
    ] as const;

    let barrierJson: any;
    for (const [index, [topic, payload]] of checks.entries()) {
      const eventRes = await postJson(
        app,
        `/events/${topic}/api-1`,
        payload,
        `event-${index}`
      );
      if (eventRes.status === 200) {
        barrierJson = await eventRes.json();
      }
    }
    expect(barrierJson.pendingTask.nodeId).toBe('entity_form');

    const entityRes = await postJson(
      app,
      `/tasks/${barrierJson.pendingTask.id}/submit`,
      { entityType: 'PERSONAL', documents: ['doc.pdf'] },
      'entity-1'
    );
    const entityJson = await entityRes.json();
    expect(entityJson.waitingFor.topic).toBe('payment.confirmed');

    const paymentRes = await postJson(
      app,
      '/events/payment.confirmed/api-1',
      { userId: 'api-1', paymentId: 'pay-1', amount: 10000 },
      'payment-1'
    );
    const finalJson = await paymentRes.json();
    expect(finalJson.status).toBe('COMPLETED');

    const instanceRes = await app.request(`/instances/${finalJson.instanceId}`);
    const instanceJson = await instanceRes.json();
    expect(instanceJson.summary.forms.submit.status).toBe('SUBMITTED');
    expect(instanceJson.summary.barriers.pending_checks.pendingTopics).toHaveLength(0);
    expect(instanceJson.summary.forms.submit).not.toHaveProperty('payload');
  });

  it('rejects missing Idempotency-Key', async () => {
    const { app } = setupApp();
    const res = await app.request('/workflows/onboarding_v1/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(409);
  });
});
