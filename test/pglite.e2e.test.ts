import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { ulid } from 'ulid';
import { createTestEngine } from './helpers/factory';
import { EngineStorage, BarrierRecord } from '../src/engine/storage';
import {
  BarrierProgress,
  BarrierProgressTopic,
  ExecutionMetrics,
  Task
} from '../src/types';

class PGliteStorage implements EngineStorage {
  constructor(private db: PGlite) {}

  async onWorkflowStart(instanceId: string, flowName: string, context: unknown): Promise<void> {
    await this.db.query(
      `INSERT INTO workflow_instances (id, flow_name, status, context)
       VALUES ($1, $2, 'RUNNING', $3::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [instanceId, flowName, JSON.stringify(context ?? {})]
    );
  }

  async onWorkflowEnd(
    instanceId: string,
    status: string,
    metrics: ExecutionMetrics,
    context: unknown
  ): Promise<void> {
    await this.db.query(
      `UPDATE workflow_instances
         SET status = $2,
             wall_ms_total = $3,
             active_ms_total = $4,
             waiting_ms_total = $5,
             context = $6::jsonb,
             completed_at = NOW()
       WHERE id = $1`,
      [
        instanceId,
        status,
        metrics.wallMsTotal,
        metrics.activeMsTotal,
        metrics.waitingMsTotal,
        JSON.stringify(context ?? {})
      ]
    );
  }

  async enterNodeRun(
    instanceId: string,
    nodeId: string,
    attempt: number,
    waiting: boolean
  ) {
    const runId = ulid();
    await this.db.query(
      `INSERT INTO workflow_state_runs (id, instance_id, node_id, attempt, waiting, status, started_at)
       VALUES ($1, $2, $3, $4, $5, 'RUNNING', NOW())`,
      [runId, instanceId, nodeId, attempt, waiting]
    );
    return { runId, nodeId, attempt, waiting };
  }

  async leaveNodeRun(
    instanceId: string,
    handle: { runId: string; nodeId: string; attempt: number; waiting: boolean },
    status: string,
    metrics: { durationMs: number; activeMs: number; waitingMs: number },
    context: unknown
  ): Promise<void> {
    await this.db.query(
      `UPDATE workflow_state_runs
         SET status = $2,
             duration_ms = $3,
             active_ms = $4,
             waiting_ms = $5,
             ended_at = NOW()
       WHERE id = $1`,
      [handle.runId, status, metrics.durationMs, metrics.activeMs, metrics.waitingMs]
    );
    await this.db.query(
      `UPDATE workflow_instances SET context = $2::jsonb WHERE id = $1`,
      [instanceId, JSON.stringify(context ?? {})]
    );
  }

  async createTask(task: Omit<Task, 'id' | 'createdAt'>): Promise<Task> {
    const id = ulid();
    const createdAt = new Date().toISOString();
    await this.db.query(
      `INSERT INTO tasks (id, instance_id, node_id, schema_ref, status, assignees, context, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz)` ,
      [
        id,
        task.workflowInstanceId,
        task.nodeId,
        task.formSchemaRef,
        task.status,
        task.assignees,
        JSON.stringify(task.context ?? {}),
        task.expiresAt ? new Date(task.expiresAt).toISOString() : null
      ]
    );
    return { ...task, id, createdAt };
  }

  async getTask(taskId: string): Promise<Task | undefined> {
    const result = await this.db.query(
      `SELECT id,
              instance_id AS "workflowInstanceId",
              node_id AS "nodeId",
              schema_ref AS "formSchemaRef",
              status,
              assignees,
              context,
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt",
              to_char(submitted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "submittedAt",
              to_char(expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "expiresAt"
       FROM tasks WHERE id = $1`,
      [taskId]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return this.normalizeTask(row as any);
  }

  async markTaskSubmitted(taskId: string, payload: unknown): Promise<Task | undefined> {
    const result = await this.db.query(
      `UPDATE tasks
         SET status = 'SUBMITTED',
             submitted_at = NOW(),
             payload = $2::jsonb
       WHERE id = $1
       RETURNING id,
                 instance_id AS "workflowInstanceId",
                 node_id AS "nodeId",
                 schema_ref AS "formSchemaRef",
                 status,
                 assignees,
                 context,
                 to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt",
                 to_char(submitted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "submittedAt",
                 to_char(expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "expiresAt"`,
      [taskId, JSON.stringify(payload ?? {})]
    );
    const row = result.rows[0];
    return row ? this.normalizeTask(row as any) : undefined;
  }

  async expireTask(taskId: string): Promise<void> {
    await this.db.query(
      `UPDATE tasks SET status = 'EXPIRED', submitted_at = NOW() WHERE id = $1`,
      [taskId]
    );
  }

  async listTasksByAssignee(assignee: string): Promise<Task[]> {
    const result = await this.db.query(
      `SELECT id,
              instance_id AS "workflowInstanceId",
              node_id AS "nodeId",
              schema_ref AS "formSchemaRef",
              status,
              assignees,
              context,
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt",
              to_char(submitted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "submittedAt",
              to_char(expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "expiresAt"
         FROM tasks
         WHERE status = 'OPEN' AND $1 = ANY(assignees)`,
      [assignee]
    );
    return result.rows.map((row) => this.normalizeTask(row as any));
  }

  async saveBarrier(
    instanceId: string,
    nodeId: string,
    key: string,
    progress: BarrierProgress
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO workflow_barriers (instance_id, node_id, correlate_key, progress, mode, quorum, expected_topics, emit_merged, expires_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9::timestamptz)
       ON CONFLICT (node_id, correlate_key)
       DO UPDATE SET progress = EXCLUDED.progress,
                     updated_at = NOW(),
                     expires_at = EXCLUDED.expires_at`,
      [
        instanceId,
        nodeId,
        key,
        JSON.stringify(progress),
        progress.mode,
        progress.quorum ?? null,
        progress.expectedTopics,
        progress.emitMerged,
        progress.timeoutAt ? new Date(progress.timeoutAt) : null
      ]
    );
  }

  async loadBarrierByKey(_topic: string, key: string): Promise<BarrierRecord | undefined> {
    const result = await this.db.query(
      `SELECT instance_id AS "instanceId",
              node_id AS "nodeId",
              correlate_key AS "key",
              progress,
              extract(epoch FROM expires_at) * 1000 AS "timeoutAt"
         FROM workflow_barriers
         WHERE correlate_key = $1`,
      [key]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      instanceId: row.instanceId,
      nodeId: row.nodeId,
      key: row.key,
      progress: typeof row.progress === 'string' ? JSON.parse(row.progress) : row.progress,
      timeoutAt: row.timeoutAt ?? undefined
    } as BarrierRecord;
  }

  async recordBarrierTopic(
    instanceId: string,
    nodeId: string,
    topic: string,
    data: BarrierProgressTopic
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO workflow_barrier_topics (id, instance_id, node_id, topic, status, payload, started_at, ended_at, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, to_timestamp($7 / 1000.0), to_timestamp($8 / 1000.0), $9)` ,
      [
        ulid(),
        instanceId,
        nodeId,
        topic,
        data.pass ? 'PASS' : 'FAIL',
        JSON.stringify(data.payload ?? null),
        data.startedAt,
        data.endedAt,
        data.endedAt - data.startedAt
      ]
    );
  }

  async findExpiredBarriers(now: number): Promise<BarrierRecord[]> {
    const result = await this.db.query(
      `SELECT instance_id AS "instanceId",
              node_id AS "nodeId",
              correlate_key AS "key",
              progress,
              extract(epoch FROM expires_at) * 1000 AS "timeoutAt"
         FROM workflow_barriers
         WHERE expires_at IS NOT NULL
           AND expires_at <= to_timestamp($1 / 1000.0)`,
      [now]
    );
    return result.rows.map((row) => ({
      instanceId: row.instanceId,
      nodeId: row.nodeId,
      key: row.key,
      progress: typeof row.progress === 'string' ? JSON.parse(row.progress) : row.progress,
      timeoutAt: row.timeoutAt ?? undefined
    }));
  }

  async findExpiredTasks(now: number): Promise<Task[]> {
    const result = await this.db.query(
      `SELECT id,
              instance_id AS "workflowInstanceId",
              node_id AS "nodeId",
              schema_ref AS "formSchemaRef",
              status,
              assignees,
              context,
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt",
              to_char(submitted_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "submittedAt",
              to_char(expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "expiresAt"
         FROM tasks
         WHERE expires_at IS NOT NULL
           AND expires_at <= to_timestamp($1 / 1000.0)
           AND status = 'OPEN'`,
      [now]
    );
    return result.rows.map((row) => this.normalizeTask(row as any));
  }

  private normalizeTask(row: any): Task {
    return {
      id: row.id,
      workflowInstanceId: row.workflowInstanceId,
      nodeId: row.nodeId,
      formSchemaRef: row.formSchemaRef,
      status: row.status,
      assignees: Array.isArray(row.assignees) ? row.assignees : [],
      context: typeof row.context === 'string' ? JSON.parse(row.context) : row.context ?? {},
      createdAt: row.createdAt,
      submittedAt: row.submittedAt ?? undefined,
      expiresAt: row.expiresAt ?? undefined
    };
  }
}

async function applyMigrations(db: PGlite) {
  const sqlPath = resolve(process.cwd(), 'src/sql/001_tables.sql');
  const raw = await readFile(sqlPath, 'utf8');
  const statements = raw
    .split(/;\s*\n/)
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

    const storage = new PGliteStorage(db);
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
