import { Hono } from 'hono';
import type { Context } from 'hono';
import { Engine, EngineResult } from '../engine/engine';
import {
  EventBody,
  EventPath,
  PathWithId,
  StartWorkflowBody,
  TaskQuery,
  TaskSubmitBody
} from './dto';
import { IdempotencyCache } from '../util/idempotency';
import { storage } from '../engine/storage';
const MAX_BODY_BYTES = 256 * 1024;

const startCache = new IdempotencyCache<EngineResult>();
const submitCache = new IdempotencyCache<EngineResult>();
const eventCache = new IdempotencyCache<EngineResult | undefined>();

export function registerRoutes(app: Hono, engine: Engine): Hono {
  app.post('/workflows/:name/start', async (c) => {
    const name = c.req.param('name');
    const body = await readJson(c, StartWorkflowBody);
    const key = c.req.header('idempotency-key');
    const result = await startCache.execute(key, async () =>
      engine.startInstance(name, (body as any) ?? {})
    );
    return c.json(result);
  });

  app.get('/tasks', async (c) => {
    const query = TaskQuery.parse(c.req.query());
    const tasks = await storage.listTasksByAssignee(query.assignee);
    return c.json({ tasks });
  });

  app.post('/tasks/:id/submit', async (c) => {
    const { id } = PathWithId.parse({ id: c.req.param('id') });
    const body = await readJson(c, TaskSubmitBody);
    const key = c.req.header('idempotency-key');
    const result = await submitCache.execute(key, async () =>
      engine.resumeWithForm(id, (body as any) ?? {})
    );
    return c.json(result);
  });

  app.post('/events/:topic/:key', async (c) => {
    const params = EventPath.parse({ topic: c.req.param('topic'), key: c.req.param('key') });
    const body = await readJson(c, EventBody);
    const key = c.req.header('idempotency-key');
    const result = await eventCache.execute(key, async () =>
      engine.notifyEvent(params.topic, params.key, (body as any) ?? {})
    );
    if (!result) {
      return c.json({ status: 'IGNORED' }, 202);
    }
    return c.json(result);
  });

  app.get('/instances/:id', async (c) => {
    const { id } = PathWithId.parse({ id: c.req.param('id') });
    try {
      const snapshot = await engine.getInstanceStatus(id);
      return c.json(snapshot);
    } catch {
      return c.json({ message: 'Not Found' }, 404);
    }
  });

  return app;
}

async function readJson<T>(c: Context, schema: any): Promise<T> {
  const lengthHeader = c.req.header('content-length');
  if (lengthHeader && Number(lengthHeader) > MAX_BODY_BYTES) {
    throw new Error('Payload too large');
  }
  const arrayBuffer = await c.req.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BODY_BYTES) {
    throw new Error('Payload too large');
  }
  if (arrayBuffer.byteLength === 0) {
    return schema.parse({});
  }
  const decoded = Buffer.from(arrayBuffer).toString('utf8');
  const parsed = JSON.parse(decoded);
  return schema.parse(parsed);
}
