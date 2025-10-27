import { BarrierNode, BarrierProgress, JsonObject } from '../../types';
import { evalJsonLogicAsync } from '../../expr-jsonlogic';

export interface BarrierEventInput {
  node: BarrierNode;
  key: string;
  topic: string;
  payload: JsonObject;
  context: JsonObject;
  startedAt?: number;
  endedAt: number;
}

export interface BarrierEventOutcome {
  progress: BarrierProgress;
  completed: boolean;
  passed: boolean;
  mergedContext?: JsonObject;
}

export function createBarrierProgress(
  node: BarrierNode,
  instanceId: string,
  key: string
): BarrierProgress {
  const expectedTopics = node.barrier.inputs.map((input) => input.topic);
  return {
    nodeId: node.id,
    instanceId,
    key,
    mode: node.barrier.mode,
    quorum: node.barrier.quorum,
    expectedTopics,
    received: {},
    completed: false,
    passed: false,
    emitMerged: Boolean(node.barrier.emitMerged),
    timeoutAt: node.barrier.timeoutMs ? Date.now() + node.barrier.timeoutMs : undefined,
    createdAt: Date.now()
  };
}

export async function applyBarrierEvent(
  input: BarrierEventInput,
  progress: BarrierProgress
): Promise<BarrierEventOutcome> {
  const barrierInput = input.node.barrier.inputs.find((b) => b.topic === input.topic);
  if (!barrierInput) {
    throw new Error(`Barrier node '${input.node.id}' received unexpected topic '${input.topic}'`);
  }

  const pass = await evaluatePassExpression(barrierInput.passExpr, {
    context: input.context,
    event: input.payload
  });

  progress.received[input.topic] = {
    topic: input.topic,
    pass,
    payload: input.payload,
    startedAt: input.startedAt ?? progress.createdAt,
    endedAt: input.endedAt
  };

  const { completed, passed } = determineBarrierState(progress, input.node.barrier.mode);
  progress.completed = completed;
  progress.passed = passed;

  let mergedContext: JsonObject | undefined;
  if (progress.emitMerged) {
    mergedContext = mergePayloads(progress);
  }

  return { progress, completed, passed, mergedContext };
}

function mergePayloads(progress: BarrierProgress): JsonObject {
  const merged: JsonObject = {};
  for (const record of Object.values(progress.received)) {
    if (record.pass && record.payload) {
      Object.assign(merged, record.payload);
    }
  }
  return merged;
}

function determineBarrierState(progress: BarrierProgress, mode: BarrierProgress['mode']): {
  completed: boolean;
  passed: boolean;
} {
  const receivedTopics = Object.values(progress.received);
  const passCount = receivedTopics.filter((topic) => topic.pass).length;
  const totalExpected = progress.expectedTopics.length;
  const receivedAll = receivedTopics.length >= totalExpected;

  switch (mode) {
    case 'ALL':
      if (!receivedAll) {
        return { completed: false, passed: false };
      }
      return {
        completed: true,
        passed: passCount === totalExpected
      };
    case 'ANY':
      if (passCount > 0) {
        return { completed: true, passed: true };
      }
      if (receivedAll) {
        return { completed: true, passed: false };
      }
      return { completed: false, passed: false };
    case 'QUORUM':
      if ((progress.quorum ?? 0) <= 0) {
        throw new Error(`Barrier node '${progress.nodeId}' quorum must be > 0`);
      }
      if (passCount >= (progress.quorum ?? 0)) {
        return { completed: true, passed: true };
      }
      if (receivedAll) {
        return { completed: true, passed: false };
      }
      return { completed: false, passed: false };
    default:
      throw new Error(`Unsupported barrier mode ${mode}`);
  }
}

async function evaluatePassExpression(rule: unknown, data: JsonObject): Promise<boolean> {
  if (!rule) return true;
  const result = await evalJsonLogicAsync(rule, data);
  return Boolean(result);
}
