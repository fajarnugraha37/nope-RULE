import postgres from 'postgres';
import { ulid } from 'ulid';
import { Task, ExecutionMetrics, BarrierProgress, BarrierProgressTopic } from '../types';

export interface NodeRunHandle {
  runId: string;
  nodeId: string;
  attempt: number;
  waiting: boolean;
}

export interface BarrierRecord {
  instanceId: string;
  nodeId: string;
  key: string;
  progress: BarrierProgress;
  timeoutAt?: number;
}

export interface EngineStorage {
  onWorkflowStart(instanceId: string, flowName: string, context: unknown): Promise<void>;
  onWorkflowEnd(
    instanceId: string,
    status: string,
    metrics: ExecutionMetrics,
    context: unknown
  ): Promise<void>;
  enterNodeRun(
    instanceId: string,
    nodeId: string,
    attempt: number,
    waiting: boolean
  ): Promise<NodeRunHandle>;
  leaveNodeRun(
    instanceId: string,
    handle: NodeRunHandle,
    status: string,
    metrics: { durationMs: number; activeMs: number; waitingMs: number },
    context: unknown
  ): Promise<void>;
  createTask(task: Omit<Task, 'id' | 'createdAt'>): Promise<Task>;
  getTask(taskId: string): Promise<Task | undefined>;
  markTaskSubmitted(taskId: string, payload: unknown): Promise<Task | undefined>;
  expireTask(taskId: string): Promise<void>;
  listTasksByAssignee(assignee: string): Promise<Task[]>;
  saveBarrier(instanceId: string, nodeId: string, key: string, progress: BarrierProgress): Promise<void>;
  loadBarrierByKey(topic: string, key: string): Promise<BarrierRecord | undefined>;
  recordBarrierTopic(
    instanceId: string,
    nodeId: string,
    topic: string,
    data: BarrierProgressTopic
  ): Promise<void>;
  findExpiredBarriers(now: number): Promise<BarrierRecord[]>;
  findExpiredTasks(now: number): Promise<Task[]>;
}

export class MemoryStorage implements EngineStorage {
  private instances = new Map<string, { flowName: string; context: unknown; status: string; metrics: ExecutionMetrics }>();
  private nodeRuns = new Map<string, any>();
  private tasks = new Map<string, Task>();
  private barriers = new Map<string, BarrierRecord>();
  private barrierTopics: BarrierProgressTopic[] = [];

  async onWorkflowStart(instanceId: string, flowName: string, context: unknown): Promise<void> {
    this.instances.set(instanceId, {
      flowName,
      context,
      status: 'RUNNING',
      metrics: { wallMsTotal: 0, activeMsTotal: 0, waitingMsTotal: 0 }
    });
  }

  async onWorkflowEnd(
    instanceId: string,
    status: string,
    metrics: ExecutionMetrics,
    context: unknown
  ): Promise<void> {
    const entry = this.instances.get(instanceId);
    if (entry) {
      entry.status = status;
      entry.metrics = metrics;
      entry.context = context;
    }
  }

  async enterNodeRun(
    instanceId: string,
    nodeId: string,
    attempt: number,
    waiting: boolean
  ): Promise<NodeRunHandle> {
    const runId = ulid();
    this.nodeRuns.set(runId, { instanceId, nodeId, attempt, waiting, metrics: null });
    return { runId, nodeId, attempt, waiting };
  }

  async leaveNodeRun(
    instanceId: string,
    handle: NodeRunHandle,
    status: string,
    metrics: { durationMs: number; activeMs: number; waitingMs: number },
    context: unknown
  ): Promise<void> {
    const entry = this.nodeRuns.get(handle.runId);
    if (entry) {
      entry.status = status;
      entry.metrics = metrics;
    }
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.context = context;
    }
  }

  async createTask(task: Omit<Task, 'id' | 'createdAt'>): Promise<Task> {
    const id = ulid();
    const createdAt = new Date().toISOString();
    const record: Task = { ...task, id, createdAt };
    this.tasks.set(id, record);
    return record;
  }

  async getTask(taskId: string): Promise<Task | undefined> {
    return this.tasks.get(taskId);
  }

  async markTaskSubmitted(taskId: string, payload: unknown): Promise<Task | undefined> {
    const entry = this.tasks.get(taskId);
    if (!entry) return undefined;
    entry.status = 'SUBMITTED';
    entry.submittedAt = new Date().toISOString();
    entry.context = { ...entry.context, submittedPayload: payload as any };
    this.tasks.set(taskId, entry);
    return entry;
  }

  async expireTask(taskId: string): Promise<void> {
    const entry = this.tasks.get(taskId);
    if (!entry) return;
    entry.status = 'EXPIRED';
    entry.submittedAt = new Date().toISOString();
    this.tasks.set(taskId, entry);
  }

  async listTasksByAssignee(assignee: string): Promise<Task[]> {
    return [...this.tasks.values()].filter(
      (task) => task.assignees.includes(assignee) && task.status === 'OPEN'
    );
  }

  async saveBarrier(instanceId: string, nodeId: string, key: string, progress: BarrierProgress): Promise<void> {
    const record: BarrierRecord = {
      instanceId,
      nodeId,
      key,
      progress
    };
    this.barriers.set(this.barrierKey(nodeId, key), record);
  }

  async loadBarrierByKey(_topic: string, key: string): Promise<BarrierRecord | undefined> {
    for (const record of this.barriers.values()) {
      if (record.key === key) return record;
    }
    return undefined;
  }

  async recordBarrierTopic(
    _instanceId: string,
    _nodeId: string,
    _topic: string,
    data: BarrierProgressTopic
  ): Promise<void> {
    this.barrierTopics.push(data);
  }

  async findExpiredBarriers(_now: number): Promise<BarrierRecord[]> {
    const expired: BarrierRecord[] = [];
    for (const record of this.barriers.values()) {
      const timeout = record.progress.timeoutAt;
      if (timeout != null && timeout <= _now && !record.progress.completed) {
        expired.push(JSON.parse(JSON.stringify(record)));
      }
    }
    return expired;
  }

  async findExpiredTasks(_now: number): Promise<Task[]> {
    return [...this.tasks.values()].filter((task) => {
      if (task.status !== 'OPEN') return false;
      if (!task.expiresAt) return false;
      return Date.parse(task.expiresAt) <= _now;
    });
  }

  getBarrierTopics(): BarrierProgressTopic[] {
    return this.barrierTopics;
  }

  private barrierKey(nodeId: string, key: string): string {
    return `${nodeId}:${key}`;
  }
}

class PostgresStorage implements EngineStorage {
  private sql;

  constructor(url: string) {
    this.sql = postgres(url, {
      max: 5,
      prepare: true,
      idle_timeout: 20
    });
  }

  async onWorkflowStart(instanceId: string, flowName: string, context: unknown): Promise<void> {
    await this.sql`
      INSERT INTO workflow_instances (id, flow_name, status, context)
      VALUES (${instanceId}, ${flowName}, 'RUNNING', ${this.sql.json(context)})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  async onWorkflowEnd(
    instanceId: string,
    status: string,
    metrics: ExecutionMetrics,
    context: unknown
  ): Promise<void> {
    await this.sql`
      UPDATE workflow_instances
      SET status = ${status},
          wall_ms_total = ${metrics.wallMsTotal},
          active_ms_total = ${metrics.activeMsTotal},
          waiting_ms_total = ${metrics.waitingMsTotal},
          context = ${this.sql.json(context)},
          completed_at = NOW()
      WHERE id = ${instanceId}
    `;
  }

  async enterNodeRun(
    instanceId: string,
    nodeId: string,
    attempt: number,
    waiting: boolean
  ): Promise<NodeRunHandle> {
    const runId = ulid();
    await this.sql`
      INSERT INTO workflow_state_runs (id, instance_id, node_id, attempt, waiting, status, started_at)
      VALUES (${runId}, ${instanceId}, ${nodeId}, ${attempt}, ${waiting}, 'RUNNING', NOW())
    `;
    return { runId, nodeId, attempt, waiting };
  }

  async leaveNodeRun(
    instanceId: string,
    handle: NodeRunHandle,
    status: string,
    metrics: { durationMs: number; activeMs: number; waitingMs: number },
    context: unknown
  ): Promise<void> {
    await this.sql.begin(async (sql) => {
      await sql`
        UPDATE workflow_state_runs
        SET status = ${status},
            duration_ms = ${metrics.durationMs},
            active_ms = ${metrics.activeMs},
            waiting_ms = ${metrics.waitingMs},
            ended_at = NOW()
        WHERE id = ${handle.runId}
      `;
      await sql`
        UPDATE workflow_instances
        SET context = ${sql.json(context)}
        WHERE id = ${instanceId}
      `;
    });
  }

  async createTask(task: Omit<Task, 'id' | 'createdAt'>): Promise<Task> {
    const id = ulid();
    const createdAt = new Date().toISOString();
    await this.sql`
      INSERT INTO tasks (id, instance_id, node_id, schema_ref, status, assignees, context, created_at, expires_at)
      VALUES (
        ${id},
        ${task.workflowInstanceId},
        ${task.nodeId},
        ${task.formSchemaRef},
        ${task.status},
        ${task.assignees},
        ${this.sql.json(task.context)},
        to_timestamp(${Date.parse(createdAt)} / 1000.0),
        ${task.expiresAt ? this.sql`to_timestamp(${Date.parse(task.expiresAt)} / 1000.0)` : null}
      )
    `;
    return { ...task, id, createdAt };
  }

  async getTask(taskId: string): Promise<Task | undefined> {
    const rows = await this.sql<Task[]>`
      SELECT id,
             instance_id as "workflowInstanceId",
             node_id as "nodeId",
             schema_ref as "formSchemaRef",
             status,
             assignees,
             context,
             to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
             to_char(submitted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "submittedAt",
             to_char(expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "expiresAt"
      FROM tasks
      WHERE id = ${taskId}
    `;
    return rows[0];
  }

  async markTaskSubmitted(taskId: string, payload: unknown): Promise<Task | undefined> {
    const rows = await this.sql<Task[]>`
      UPDATE tasks
      SET status = 'SUBMITTED',
          submitted_at = NOW(),
          payload = ${this.sql.json(payload)}
      WHERE id = ${taskId}
      RETURNING id,
                instance_id as "workflowInstanceId",
                node_id as "nodeId",
                schema_ref as "formSchemaRef",
                status,
                assignees,
                context,
                to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
                to_char(submitted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "submittedAt",
                to_char(expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "expiresAt"
    `;
    return rows[0];
  }

  async expireTask(taskId: string): Promise<void> {
    await this.sql`
      UPDATE tasks
      SET status = 'EXPIRED',
          submitted_at = NOW()
      WHERE id = ${taskId}
    `;
  }

  async listTasksByAssignee(assignee: string): Promise<Task[]> {
    const rows = await this.sql<Task[]>`
      SELECT id,
             instance_id as "workflowInstanceId",
             node_id as "nodeId",
             schema_ref as "formSchemaRef",
             status,
             assignees,
             context,
             to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
             to_char(submitted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "submittedAt",
             to_char(expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "expiresAt"
      FROM tasks
      WHERE ${assignee} = ANY(assignees) AND status = 'OPEN'
    `;
    return rows;
  }

  async saveBarrier(
    instanceId: string,
    nodeId: string,
    key: string,
    progress: BarrierProgress
  ): Promise<void> {
    await this.sql`
      INSERT INTO workflow_barriers (instance_id, node_id, correlate_key, progress, mode, quorum, expected_topics, emit_merged, expires_at)
      VALUES (
        ${instanceId},
        ${nodeId},
        ${key},
        ${this.sql.json(progress)},
        ${progress.mode},
        ${progress.quorum ?? null},
        ${progress.expectedTopics},
        ${progress.emitMerged},
        ${progress.timeoutAt != null ? this.sql`to_timestamp(${progress.timeoutAt} / 1000.0)` : null}
      )
      ON CONFLICT (node_id, correlate_key)
      DO UPDATE SET progress = EXCLUDED.progress,
                    updated_at = NOW(),
                    expires_at = EXCLUDED.expires_at
    `;
  }

  async loadBarrierByKey(_topic: string, key: string): Promise<BarrierRecord | undefined> {
    const rows = await this.sql<any[]>`
      SELECT instance_id as "instanceId",
             node_id as "nodeId",
             correlate_key as "key",
             progress,
             extract(epoch from expires_at) * 1000 as "timeoutAt"
      FROM workflow_barriers
      WHERE correlate_key = ${key}
    `;
    if (!rows[0]) return undefined;
    return {
      instanceId: rows[0].instanceId,
      nodeId: rows[0].nodeId,
      key: rows[0].key,
      progress: { ...rows[0].progress, timeoutAt: rows[0].timeoutAt }
    };
  }

  async recordBarrierTopic(
    instanceId: string,
    nodeId: string,
    topic: string,
    data: BarrierProgressTopic
  ): Promise<void> {
    await this.sql`
      INSERT INTO workflow_barrier_topics (id, instance_id, node_id, topic, status, payload, started_at, ended_at, duration_ms)
      VALUES (
        ${ulid()},
        ${instanceId},
        ${nodeId},
        ${topic},
        ${data.pass ? 'PASS' : 'FAIL'},
        ${this.sql.json(data.payload ?? null)},
        to_timestamp(${data.startedAt} / 1000.0),
        to_timestamp(${data.endedAt} / 1000.0),
        ${data.endedAt - data.startedAt}
      )
    `;
  }

  async findExpiredBarriers(now: number): Promise<BarrierRecord[]> {
    const rows = await this.sql<any[]>`
      SELECT instance_id as "instanceId",
             node_id as "nodeId",
             correlate_key as "key",
             progress,
             extract(epoch from expires_at) * 1000 as "timeoutAt"
      FROM workflow_barriers
      WHERE expires_at IS NOT NULL AND expires_at <= to_timestamp(${now} / 1000.0)
    `;
    return rows.map((row) => ({
      instanceId: row.instanceId,
      nodeId: row.nodeId,
      key: row.key,
      progress: { ...(row.progress as BarrierProgress), timeoutAt: row.timeoutAt ?? undefined }
    }));
  }

  async findExpiredTasks(now: number): Promise<Task[]> {
    const rows = await this.sql<Task[]>`
      SELECT id,
             instance_id as "workflowInstanceId",
             node_id as "nodeId",
             schema_ref as "formSchemaRef",
             status,
             assignees,
             context,
             to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
             to_char(submitted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "submittedAt",
             to_char(expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "expiresAt"
      FROM tasks
      WHERE expires_at IS NOT NULL AND expires_at <= to_timestamp(${now} / 1000.0)
    `;
    return rows;
  }
}

const storage: EngineStorage =
  process.env.DATABASE_URL != null && process.env.DATABASE_URL !== ''
    ? new PostgresStorage(process.env.DATABASE_URL)
    : new MemoryStorage();

export function createMemoryStorage(): MemoryStorage {
  return new MemoryStorage();
}

export { storage };
