import { Hono } from 'hono';
import type { Context } from 'hono';
import { EngineManager, EngineResult } from '../engine/engine';
import {
  EventBody,
  EventPath,
  PathWithId,
  StartWorkflowBody,
  WorkflowUploadBody,
  TaskQuery,
  TaskSubmitBody
} from './dto';
import { IdempotencyCache } from '../util/idempotency';
import { ExecutionMetrics, Task } from '../types';

const MAX_BODY_BYTES = 256 * 1024;

const UI_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Workflow Engine UI</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; background: #f6f6f6; }
    section { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    textarea, input { width: 100%; font-family: monospace; margin-top: 0.5rem; box-sizing: border-box; }
    button { margin-top: 0.5rem; padding: 0.5rem 1rem; border-radius: 4px; border: 1px solid #556cd6; background: #556cd6; color: #fff; cursor: pointer; }
    button:hover { background: #4350b5; }
    h1 { margin-bottom: 1.5rem; }
    .log { white-space: pre-wrap; background: #111; color: #0f0; padding: 1rem; border-radius: 8px; min-height: 120px; overflow: auto; }
    form > label { display: block; margin-top: 0.75rem; font-weight: 600; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
  </style>
</head>
<body>
  <h1>Workflow Engine Playground</h1>

  <section>
    <h2>Upload Rule Set</h2>
    <textarea id="ruleset-input" rows="10" placeholder="Paste workflow JSON"></textarea>
    <button type="button" onclick="uploadRuleSet()">Upload / Replace</button>
  </section>

  <section>
    <h2>Start Workflow</h2>
    <label>Flow Name<input id="flow-name" value="onboarding_v1" /></label>
    <label>Payload JSON<textarea id="start-payload" rows="6">{ "user": { "id": "ui-user" }, "flags": { "optionalFormRequired": true } }</textarea></label>
    <button type="button" onclick="startWorkflow()">Start</button>
  </section>

  <section>
    <h2>Submit Task</h2>
    <label>Task ID<input id="task-id" /></label>
    <label>Payload JSON<textarea id="task-payload" rows="4">{}</textarea></label>
    <button type="button" onclick="submitTask()">Submit</button>
  </section>

  <section>
    <h2>Send Event</h2>
    <label>Topic<input id="event-topic" placeholder="check.kyc" /></label>
    <label>Key<input id="event-key" placeholder="ui-user" /></label>
    <label>Payload JSON<textarea id="event-payload" rows="4">{}</textarea></label>
    <button type="button" onclick="sendEvent()">Send Event</button>
  </section>

  <section>
    <h2>Inspect</h2>
    <div class="grid">
      <div>
        <label>Assignee<input id="tasks-assignee" placeholder="assignee" /></label>
        <button type="button" onclick="listTasks()">List Tasks</button>
      </div>
      <div>
        <label>Instance ID<input id="instance-id" /></label>
        <button type="button" onclick="describeInstance()">Describe Instance</button>
      </div>
      <div>
        <label>Flow<input id="describe-flow" placeholder="onboarding_v1" /></label>
        <button type="button" onclick="describeFlow()">Describe Flow</button>
      </div>
      <div>
        <button type="button" onclick="listFlows()">List Flows</button>
      </div>
    </div>
  </section>

  <section>
    <h2>Logs</h2>
    <div id="log" class="log"></div>
  </section>

  <script>
    const logEl = document.getElementById('log');
    function log(message) {
      const time = new Date().toISOString();
      logEl.textContent = '[' + time + ']\\n' + message + '\\n\\n' + logEl.textContent;
    }

    async function uploadRuleSet() {
      try {
        const body = JSON.parse(document.getElementById('ruleset-input').value || '{}');
        const res = await fetch('/workflows', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        });
        log(JSON.stringify(await res.json(), null, 2));
      } catch (err) {
        log(err.message);
      }
    }

    async function startWorkflow() {
      await postWithIdempotency(
        '/workflows/' + document.getElementById('flow-name').value + '/start',
        document.getElementById('start-payload').value,
        'ui-start-' + crypto.randomUUID()
      );
    }

    async function submitTask() {
      await postWithIdempotency(
        '/tasks/' + document.getElementById('task-id').value + '/submit',
        document.getElementById('task-payload').value,
        'ui-task-' + crypto.randomUUID()
      );
    }

    async function sendEvent() {
      const topic = document.getElementById('event-topic').value;
      const key = document.getElementById('event-key').value;
      await postWithIdempotency(
        '/events/' + topic + '/' + key,
        document.getElementById('event-payload').value,
        'ui-event-' + crypto.randomUUID()
      );
    }

    async function listTasks() {
      const assignee = document.getElementById('tasks-assignee').value;
      const res = await fetch('/tasks?assignee=' + encodeURIComponent(assignee));
      log(JSON.stringify(await res.json(), null, 2));
    }

    async function describeInstance() {
      const id = document.getElementById('instance-id').value;
      const res = await fetch('/instances/' + id);
      log(JSON.stringify(await res.json(), null, 2));
    }

    async function describeFlow() {
      const flow = document.getElementById('describe-flow').value;
      const res = await fetch('/workflows/' + flow);
      log(JSON.stringify(await res.json(), null, 2));
    }

    async function listFlows() {
      const res = await fetch('/workflows');
      log(JSON.stringify(await res.json(), null, 2));
    }

    async function postWithIdempotency(path, payloadText, key) {
      try {
        const body = JSON.parse(payloadText || '{}');
        const res = await fetch(path, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'Idempotency-Key': key
          },
          body: JSON.stringify(body)
        });
        log(JSON.stringify(await res.json(), null, 2));
      } catch (err) {
        log(err.message);
      }
    }
  </script>
</body>
</html>`;

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

export function registerRoutes(app: Hono, manager: EngineManager): Hono {
  app.get('/', (c) => c.html(UI_HTML));

  app.post('/workflows', async (c) => {
    const body = await readJson(c, WorkflowUploadBody);
    const summary = manager.registerRuleSet(body as any);
    return c.json(summary, 201);
  });

  app.get('/workflows', (c) => {
    return c.json({
      workflows: manager.listFlows()
    });
  });

  app.get('/workflows/:name', (c) => {
    const name = c.req.param('name');
    try {
      const description = manager.describeFlow(name);
      return c.json(description);
    } catch (err) {
      return c.json({ message: (err as Error).message }, 404);
    }
  });

  app.post('/workflows/:name/start', async (c) => {
    const idempotencyKey = requireIdempotencyKey(c);
    if (typeof idempotencyKey !== 'string') return idempotencyKey;
    const name = c.req.param('name');
    const body = await readJson(c, StartWorkflowBody);

    const result = await startCache.execute(idempotencyKey, async () =>
      toPublicEngineResult(await manager.startInstance(name, (body as any) ?? {}))
    );
    return c.json(result);
  });

  app.get('/tasks', async (c) => {
    const query = TaskQuery.parse(c.req.query());
    const tasks = await manager.listTasksByAssignee(query.assignee);
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
      toPublicEngineResult(await manager.resumeWithForm(id, (body as any) ?? {}))
    );
    return c.json(result);
  });

  app.post('/events/:topic/:key', async (c) => {
    const idempotencyKey = requireIdempotencyKey(c);
    if (typeof idempotencyKey !== 'string') return idempotencyKey;
    const params = EventPath.parse({ topic: c.req.param('topic'), key: c.req.param('key') });
    const body = await readJson(c, EventBody);
    const result = await eventCache.execute(idempotencyKey, async () =>
      manager.notifyEvent(params.topic, params.key, (body as any) ?? {})
    );
    if (!result) {
      return c.json({ status: 'IGNORED' }, 202);
    }
    return c.json(toPublicEngineResult(result));
  });

  app.get('/instances/:id', async (c) => {
    const { id } = PathWithId.parse({ id: c.req.param('id') });
    try {
      const snapshot = await manager.getInstanceStatus(id);
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

function toInstanceSummary(snapshot: Awaited<ReturnType<EngineManager['getInstanceStatus']>>): InstanceSummary {
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
