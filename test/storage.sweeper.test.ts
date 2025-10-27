import { describe, expect, it } from 'bun:test';
import { storage } from '../src/engine/storage';
import { createBarrierProgress } from '../src/engine/nodes/barrier';
import { BarrierNode } from '../src/types';

const barrierNode: BarrierNode = {
  id: 'sweeper-barrier',
  type: 'BARRIER',
  barrier: {
    mode: 'ALL',
    correlateBy: '$.id',
    inputs: [{ topic: 'topic.a' }],
    timeoutMs: 1000
  }
};

describe('storage sweepers', () => {
  it('detects expired barrier progress', async () => {
    const progress = createBarrierProgress(barrierNode, 'inst-sweeper', 'key-a');
    progress.timeoutAt = Date.now() - 10;
    await storage.saveBarrier('inst-sweeper', barrierNode.id, 'key-a', progress);

    const expired = await storage.findExpiredBarriers(Date.now());
    const match = expired.find(
      (record) => record.instanceId === 'inst-sweeper' && record.nodeId === barrierNode.id
    );
    expect(match).toBeDefined();

    // cleanup to avoid cross-test interference
    progress.completed = true;
    progress.timeoutAt = Date.now() + 60_000;
    await storage.saveBarrier('inst-sweeper', barrierNode.id, 'key-a', progress);
  });

  it('detects expired tasks', async () => {
    const task = await storage.createTask({
      workflowInstanceId: 'inst-task',
      nodeId: 'human-node',
      formSchemaRef: 'schema-ref',
      status: 'OPEN',
      assignees: ['user'],
      context: {},
      expiresAt: new Date(Date.now() - 1000).toISOString()
    });

    const expiredTasks = await storage.findExpiredTasks(Date.now());
    expect(expiredTasks.some((item) => item.id === task.id)).toBe(true);

    await storage.expireTask(task.id);
  });
});
