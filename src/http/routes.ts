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
import { ExecutionMetrics, Task } from '../types';

const MAX_BODY_BYTES = 256 * 1024;

type PublicTask = {
  id: string;
  nodeId: string;
  formSchemaRef: string;
  status: Task['status'];
  assignees: string[];
  expiresAt?: string;
};

type PublicEngineResult = {
  instanceId: string;
  status: EngineResult['status'];
  metrics: ExecutionMetrics;
  pendingTask?: PublicTask;
  waitingFor?: EngineResult['waitingFor'];
};

type InstanceSummary = {
  id: string;
  status: EngineResult['status'];
  metrics: ExecutionMetrics;
  summary: {
    forms?: Record<string, { status: string; taskId?: string }>;
    barriers?: Record<
      string,
      {
        completed: boolean;
        passed: boolean;
        receivedTopics: string[];
        pendingTopics: string[];
      }
    >;
    events?: Array<{ topic: string; receivedAt?: number }>;
    decisions?: string[];
  };
};

const startCache = new IdempotencyCache<PublicEngineResult>();
const submitCache = new IdempotencyCache<PublicEngineResult>();
const eventCache = new IdempotencyCache<PublicEngineResult | undefined>();

export function registerRoutes(app: Hono, engine: Engine): Hono {
  app.post('/workflows/:name/start', async (c) => {
    const idempotencyKey = requireIdempotencyKey(c);
    if (typeof idempotencyKey !== 'string') return idempotencyKey;
    const name = c.req.param('name');
    const body = await readJson(c, StartWorkflowBody);

    const result = await startCache.execute(idempotencyKey, async () =>
      toPublicEngineResult(await engine.startInstance(name, (body as any) ?? {}))
    );
    return c.json(result);
  });

  app.get('/tasks', async (c) => {
    const query = TaskQuery.parse(c.req.query());
    const tasks = await storage.listTasksByAssignee(query.assignee);
    return c.json({
      tasks: tasks.map((task) => ({
        id: task.id,
        nodeId: task.nodeId,
        status: task.status,
        formSchemaRef: task.formSchemaRef,
        assignees: task.assignees,
        expiresAt: task.expiresAt
      }))
    });
  });

  app.post('/tasks/:id/submit', async (c) => {
    const idempotencyKey = requireIdempotencyKey(c);
    if (typeof idempotencyKey !== 'string') return idempotencyKey;
    const { id } = PathWithId.parse({ id: c.req.param('id') });
    const body = await readJson(c, TaskSubmitBody);
    const result = await submitCache.execute(idempotencyKey, async () =>
      toPublicEngineResult(await engine.resumeWithForm(id, (body as any) ?? {}))
    );
    return c.json(result);
  });

  app.post('/events/:topic/:key', async (c) => {
    const idempotencyKey = requireIdempotencyKey(c);
    if (typeof idempotencyKey !== 'string') return idempotencyKey;
    const params = EventPath.parse({ topic: c.req.param('topic'), key: c.req.param('key') });
    const body = await readJson(c, EventBody);
    const result = await eventCache.execute(idempotencyKey, async () =>
      engine.notifyEvent(params.topic, params.key, (body as any) ?? {})
    );
    if (!result) {
      return c.json({ status: 'IGNORED' }, 202);
    }
    return c.json(toPublicEngineResult(result));
  });

  app.get('/instances/:id', async (c) => {
    const { id } = PathWithId.parse({ id: c.req.param('id') });
    try {
      const snapshot = await engine.getInstanceStatus(id);
      return c.json(toInstanceSummary(snapshot));
    } catch {
      return c.json({ message: 'Not Found' }, 404);
    }
  });

  return app;
}

function requireIdempotencyKey(c: Context): string | Response {
  const key = c.req.header('idempotency-key');
  if (!key) {
    return c.json({ message: 'Idempotency-Key header required' }, 409);
  }
  return key;
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

function toPublicEngineResult(result: EngineResult): PublicEngineResult {
  return {
    instanceId: result.instanceId,
    status: result.status,
    metrics: result.metrics,
    pendingTask: toPublicTask(result.pendingTask),
    waitingFor: result.waitingFor
  };
}

function toPublicTask(task?: Task): PublicTask | undefined {
  if (!task) return undefined;
  return {
    id: task.id,
    nodeId: task.nodeId,
    formSchemaRef: task.formSchemaRef,
    status: task.status,
    assignees: task.assignees,
    expiresAt: task.expiresAt
  };
}

function toInstanceSummary(snapshot: Awaited<ReturnType<Engine['getInstanceStatus']>>): InstanceSummary {
  const { context } = snapshot;
  const summary: InstanceSummary['summary'] = {};
  const forms = summarizeForms(context);
  if (forms) summary.forms = forms;
  const barriers = summarizeBarriers(context);
  if (barriers) summary.barriers = barriers;
  const events = summarizeEvents(context);
  if (events) summary.events = events;
  const decisions = summarizeDecisions(context);
  if (decisions) summary.decisions = decisions;

  return {
    id: snapshot.id,
    status: snapshot.status,
    metrics: snapshot.metrics,
    summary
  };
}

function summarizeForms(context: any) {
  if (!context?.forms || typeof context.forms !== 'object') return undefined;
  const entries = Object.entries(context.forms as Record<string, any>).map(([nodeId, data]) => [
    nodeId,
    {
      status: data.status,
      taskId: data.taskId
    }
  ]);
  return Object.fromEntries(entries);
}

function summarizeBarriers(context: any) {
  if (!context?.barriers || typeof context.barriers !== 'object') return undefined;
  const entries = Object.entries(context.barriers as Record<string, any>).map(([nodeId, data]) => {
    const progress = data.progress ?? {};
    const receivedTopics = Object.keys(progress.received ?? {});
    const expected = progress.expectedTopics ?? [];
    const pending = expected.filter((topic: string) => !receivedTopics.includes(topic));
    return [
      nodeId,
      {
        completed: Boolean(progress.completed),
        passed: Boolean(progress.passed),
        receivedTopics,
        pendingTopics: pending
      }
    ];
  });
  return Object.fromEntries(entries);
}

function summarizeEvents(context: any) {
  if (!context?.events || typeof context.events !== 'object') return undefined;
  return Object.entries(context.events as Record<string, any>).map(([topic, payload]) => ({
    topic,
    receivedAt: payload?.receivedAt
  }));
}

function summarizeDecisions(context: any) {
  if (!context?.decisions || typeof context.decisions !== 'object') return undefined;
  return Object.keys(context.decisions as Record<string, unknown>);
}
