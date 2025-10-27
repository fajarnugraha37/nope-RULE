import { describe, expect, it } from 'bun:test';
import { applyBarrierEvent, createBarrierProgress } from '../src/engine/nodes/barrier';
import { BarrierNode, JsonObject } from '../src/types';

function makeBarrierNode(mode: 'ALL' | 'ANY' | 'QUORUM', extra?: Partial<BarrierNode['barrier']>): BarrierNode {
  return {
    id: 'barrier-1',
    type: 'BARRIER',
    barrier: {
      mode,
      correlateBy: '$.user.id',
      inputs: [
        { topic: 'topic.a' },
        { topic: 'topic.b' },
        { topic: 'topic.c' }
      ],
      emitMerged: true,
      ...extra
    }
  };
}

const context: JsonObject = { user: { id: 'u-1' } };

describe('barrier node progression', () => {
  it('requires all topics for ALL mode', async () => {
    const node = makeBarrierNode('ALL');
    const progress = createBarrierProgress(node, 'inst-1', 'key-1');

    const first = await applyBarrierEvent(
      {
        node,
        key: 'key-1',
        topic: 'topic.a',
        payload: { a: true },
        context,
        endedAt: 20
      },
      progress
    );

    expect(first.completed).toBe(false);
    expect(first.progress.received['topic.a'].pass).toBe(true);

    const second = await applyBarrierEvent(
      {
        node,
        key: 'key-1',
        topic: 'topic.b',
        payload: { b: true },
        context,
        endedAt: 40
      },
      progress
    );
    expect(second.completed).toBe(false);

    const third = await applyBarrierEvent(
      {
        node,
        key: 'key-1',
        topic: 'topic.c',
        payload: { c: true },
        context,
        endedAt: 60
      },
      progress
    );
    expect(third.completed).toBe(true);
    expect(third.passed).toBe(true);
    expect(third.mergedContext).toEqual({ a: true, b: true, c: true });
  });

  it('completes when any topic passes in ANY mode', async () => {
    const node = makeBarrierNode('ANY');
    const progress = createBarrierProgress(node, 'inst-1', 'key-2');

    const outcome = await applyBarrierEvent(
      {
        node,
        key: 'key-2',
        topic: 'topic.b',
        payload: { b: false },
        context,
        endedAt: 10
      },
      progress
    );

    expect(outcome.completed).toBe(true);
    expect(outcome.passed).toBe(true);
  });

  it('supports quorum threshold', async () => {
    const node = makeBarrierNode('QUORUM', { quorum: 2 });
    const progress = createBarrierProgress(node, 'inst-1', 'key-3');

    const first = await applyBarrierEvent(
      { node, key: 'key-3', topic: 'topic.a', payload: { a: true }, context, endedAt: 10 },
      progress
    );
    expect(first.completed).toBe(false);

    const second = await applyBarrierEvent(
      { node, key: 'key-3', topic: 'topic.b', payload: { b: true }, context, endedAt: 20 },
      progress
    );
    expect(second.completed).toBe(true);
    expect(second.passed).toBe(true);
  });

  it('fails when passExpr evaluates to false', async () => {
    const node = makeBarrierNode('ALL', {
      inputs: [
        {
          topic: 'topic.a',
          passExpr: { '==': [{ var: 'event.status' }, 'PASS'] }
        }
      ]
    });
    const progress = createBarrierProgress(node, 'inst-1', 'key-4');

    const outcome = await applyBarrierEvent(
      {
        node,
        key: 'key-4',
        topic: 'topic.a',
        payload: { status: 'FAIL' },
        context,
        endedAt: 30
      },
      progress
    );

    expect(outcome.completed).toBe(true);
    expect(outcome.passed).toBe(false);
  });

  it('omits merged context when emitMerged is false', async () => {
    const node = makeBarrierNode('ALL', { emitMerged: false });
    const progress = createBarrierProgress(node, 'inst-1', 'key-merge');
    const outcome = await applyBarrierEvent(
      {
        node,
        key: 'key-merge',
        topic: 'topic.a',
        payload: { value: 1 },
        context,
        endedAt: 5
      },
      progress
    );
    expect(outcome.completed).toBe(false);
    expect(outcome.mergedContext).toBeUndefined();
  });

  it('captures timeout metadata when defined', () => {
    const node = makeBarrierNode('ALL', { timeoutMs: 5000 });
    const progress = createBarrierProgress(node, 'inst-1', 'key-timeout');
    expect(progress.timeoutAt).toBeGreaterThan(Date.now());
  });
});
