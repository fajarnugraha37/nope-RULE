import { ulid } from 'ulid';
import { compileRuleSet, CompiledRuleSet, CompiledFlow } from '../compiler';
import {
  RuleSet,
  ExecutionResult,
  WorkflowStatus,
  FlowNode,
  FlowEdge,
  JsonObject,
  HumanFormNode,
  WaitEventNode,
  BarrierNode,
  ExecutionMetrics,
  Task
} from '../types';
import { validateRuleSet, validateBySchemaRef } from '../validation';
import { Timeline } from '../timeline';
import { storage, EngineStorage, NodeRunHandle } from './storage';
import { evaluateDecisionTable } from './nodes/table';
import { runExprNode } from './nodes/expr';
import { createHumanTask } from './nodes/human';
import { buildWaitRegistration, WaitRegistration } from './nodes/wait';
import {
  createBarrierProgress,
  applyBarrierEvent,
  BarrierEventInput,
  BarrierEventOutcome
} from './nodes/barrier';
import { nowWall } from '../time';

type WaitingState =
  | {
      kind: 'HUMAN_FORM';
      node: HumanFormNode;
      handle: NodeRunHandle;
      resumeTo?: string;
      task: Task;
    }
  | {
      kind: 'WAIT_EVENT';
      node: WaitEventNode;
      handle: NodeRunHandle;
      registration: WaitRegistration;
      resumeTo?: string;
      timeoutTo?: string;
    }
  | {
      kind: 'BARRIER';
      node: BarrierNode;
      handle: NodeRunHandle;
      key: string;
      passTo?: string;
      failTo?: string;
      timeoutTo?: string;
      progress: ReturnType<typeof createBarrierProgress>;
    };

interface InstanceState {
  id: string;
  flowName: string;
  flow: CompiledFlow;
  status: WorkflowStatus;
  context: JsonObject;
  timeline: Timeline;
  waiting?: WaitingState;
  lastEdgeTo?: string;
}

export interface EngineResult extends ExecutionResult {
  instanceId: string;
}

export class Engine {
  private readonly compiled: CompiledRuleSet;
  private readonly storage: EngineStorage;
  private readonly instances = new Map<string, InstanceState>();
  private readonly waitIndex = new Map<string, { instanceId: string; nodeId: string }>();
  private readonly barrierIndex = new Map<string, { instanceId: string; nodeId: string }>();

  constructor(compiled: CompiledRuleSet, storageImpl: EngineStorage = storage) {
    this.compiled = compiled;
    this.storage = storageImpl;
  }

  async startInstance(flowName: string, input: JsonObject): Promise<EngineResult> {
    const flow = this.getFlow(flowName);
    const instanceId = ulid();
    const context: JsonObject = deepClone(input);
    const timeline = new Timeline();
    const instance: InstanceState = {
      id: instanceId,
      flowName,
      flow,
      status: 'RUNNING',
      context,
      timeline
    };
    this.instances.set(instanceId, instance);
    await this.storage.onWorkflowStart(instanceId, flowName, context);
    return this.runUntilWaitOrComplete(instance, flow.definition.entry);
  }

  async resumeWithForm(taskId: string, payload: JsonObject): Promise<EngineResult> {
    const task = await this.storage.getTask(taskId);
    if (!task) {
      throw new Error(`Task '${taskId}' not found`);
    }
    const instance = this.getInstance(task.workflowInstanceId);
    if (!instance.waiting || instance.waiting.kind !== 'HUMAN_FORM') {
      throw new Error(`Instance '${instance.id}' is not waiting on a form`);
    }
    const waiting = instance.waiting;
    if (waiting.task.id !== taskId) {
      throw new Error(`Task '${taskId}' does not match current waiting task`);
    }
    validateBySchemaRef(waiting.node.formSchemaRef, payload);
    instance.context.forms = instance.context.forms ?? {};
    instance.context.forms[waiting.node.id] = {
      status: 'SUBMITTED',
      payload
    } as any;
    await this.storage.markTaskSubmitted(taskId, payload);
    await this.closeWaitingNode(instance, waiting.handle, 'COMPLETED');
    instance.waiting = undefined;
    return this.runUntilWaitOrComplete(instance, waiting.resumeTo);
  }

  async notifyEvent(
    topic: string,
    key: string,
    payload: JsonObject
  ): Promise<EngineResult | undefined> {
    const composite = composeKey(topic, key);
    const barrierEntry = this.barrierIndex.get(composite);
    if (barrierEntry) {
      return this.handleBarrierEvent(barrierEntry.instanceId, topic, key, payload);
    }
    const waitEntry = this.waitIndex.get(composite);
    if (waitEntry) {
      return this.handleWaitEvent(waitEntry.instanceId, topic, key, payload);
    }
    return undefined;
  }

  async getInstanceView(instanceId: string): Promise<InstanceState | undefined> {
    return this.instances.get(instanceId);
  }

  async getInstanceStatus(instanceId: string): Promise<{
    id: string;
    status: WorkflowStatus;
    context: JsonObject;
    metrics: ExecutionMetrics;
  }> {
    const instance = this.getInstance(instanceId);
    return {
      id: instance.id,
      status: instance.status,
      context: instance.context,
      metrics: this.computeMetrics(instance)
    };
  }

  async processTimeouts(now: number = Date.now()): Promise<void> {
    for (const instance of this.instances.values()) {
      const waiting = instance.waiting;
      if (!waiting) continue;

      if (waiting.kind === 'WAIT_EVENT' && waiting.registration.timeoutAt && waiting.registration.timeoutAt <= now) {
        this.waitIndex.delete(composeKey(waiting.registration.topic, waiting.registration.key));
        await this.closeWaitingNode(instance, waiting.handle, 'FAILED');
        instance.waiting = undefined;
        await this.runUntilWaitOrComplete(instance, waiting.timeoutTo);
      }

      if (waiting.kind === 'BARRIER' && waiting.progress.timeoutAt && waiting.progress.timeoutAt <= now) {
        for (const input of waiting.node.barrier.inputs) {
          this.barrierIndex.delete(composeKey(input.topic, waiting.key));
        }
        await this.closeWaitingNode(instance, waiting.handle, 'FAILED');
        instance.waiting = undefined;
        await this.runUntilWaitOrComplete(instance, waiting.timeoutTo ?? waiting.failTo);
      }
    }
  }

  private getFlow(flowName: string): CompiledFlow {
    const flow = this.compiled.flows.get(flowName);
    if (!flow) {
      throw new Error(`Flow '${flowName}' not found`);
    }
    return flow;
  }

  private getInstance(instanceId: string): InstanceState {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance '${instanceId}' is not loaded`);
    }
    return instance;
  }

  private async runUntilWaitOrComplete(
    instance: InstanceState,
    startNodeId?: string
  ): Promise<EngineResult> {
    if (!startNodeId) {
      await this.completeInstance(instance, 'COMPLETED');
      return this.buildResult(instance);
    }
    let currentNodeId: string | undefined = startNodeId;

    while (currentNodeId) {
      const node = this.getNode(instance, currentNodeId);
      const attempt = this.computeAttempt(instance, node.id);
      const isWaitingNode = node.type === 'HUMAN_FORM' || node.type === 'WAIT_EVENT' || node.type === 'BARRIER';
      const handle = await this.storage.enterNodeRun(instance.id, node.id, attempt, isWaitingNode);
      instance.timeline.enter(node.id, node.type, isWaitingNode);

      if (node.type === 'TABLE') {
        const table = this.requireDecisionTable(node.tableRef);
        const { result, matchedRules } = evaluateDecisionTable(table, instance.context);
        instance.context.decisions = instance.context.decisions ?? {};
        instance.context.decisions[node.id] = {
          result,
          matchedRules
        } as any;
        const edge = this.pickEdge(instance, node, matchedRules.length > 0 ? 'MATCH' : 'NO_MATCH');
        await this.closeRun(instance, handle, 'COMPLETED');
        currentNodeId = edge?.to ?? node.next;
        continue;
      }

      if (node.type === 'EXPR') {
        const outcome = await runExprNode(node.expr, instance.context);
        instance.context.expr = instance.context.expr ?? {};
        instance.context.expr[node.id] = outcome as any;
        const edge = this.pickEdge(instance, node, outcome ? 'TRUE' : 'FALSE');
        await this.closeRun(instance, handle, 'COMPLETED');
        currentNodeId = edge?.to ?? node.next;
        continue;
      }

      if (node.type === 'MERGE') {
        instance.context.merge = instance.context.merge ?? {};
        instance.context.merge[node.id] = { sources: node.sources } as any;
        await this.closeRun(instance, handle, 'COMPLETED');
        const edge = this.pickEdge(instance, node, 'NEXT');
        currentNodeId = edge?.to ?? node.next;
        continue;
      }

      if (node.type === 'HUMAN_FORM') {
        const task = await createHumanTask({
          storage: this.storage,
          instanceId: instance.id,
          node,
          context: instance.context
        });
        instance.context.forms = instance.context.forms ?? {};
        instance.context.forms[node.id] = { status: 'OPEN', taskId: task.id } as any;
        const resumeEdge = this.pickEdge(instance, node, 'SUBMIT');
        instance.waiting = {
          kind: 'HUMAN_FORM',
          node,
          handle,
          resumeTo: resumeEdge?.to ?? node.next,
          task
        };
        return this.waitingResult(instance, {
          status: 'WAITING',
          pendingTask: task,
          waitingFor: undefined
        });
      }

      if (node.type === 'WAIT_EVENT') {
        const registration = buildWaitRegistration(node, instance.context);
        const resumeEdge = this.pickEdge(instance, node, 'EVENT') ?? this.pickEdge(instance, node, 'RESUME');
        const timeoutEdge = this.pickEdge(instance, node, 'TIMEOUT') ?? this.pickEdge(instance, node, 'FAIL');
        instance.waiting = {
          kind: 'WAIT_EVENT',
          node,
          handle,
          registration,
          resumeTo: resumeEdge?.to ?? node.next,
          timeoutTo: timeoutEdge?.to ?? node.onTimeout
        };
        this.waitIndex.set(composeKey(registration.topic, registration.key), {
          instanceId: instance.id,
          nodeId: node.id
        });
        return this.waitingResult(instance, {
          status: 'WAITING',
          waitingFor: {
            type: 'EVENT',
            topic: registration.topic,
            key: registration.key
          }
        });
      }

      if (node.type === 'BARRIER') {
        const key = resolveKey(instance.context, node.barrier.correlateBy);
        if (typeof key !== 'string' || key.length === 0) {
          throw new Error(`Barrier node '${node.id}' cannot resolve correlate key`);
        }

        let progress = createBarrierProgress(node, instance.id, key);

        instance.context.barriers = instance.context.barriers ?? {};
        instance.context.barriers[node.id] = { progress } as any;

        const passEdge = this.pickEdge(instance, node, 'PASS');
        const failEdge = this.pickEdge(instance, node, 'FAIL');
        const timeoutEdge = this.pickEdge(instance, node, 'TIMEOUT');
        instance.waiting = {
          kind: 'BARRIER',
          node,
          handle,
          key,
          passTo: passEdge?.to ?? node.next,
          failTo: failEdge?.to ?? node.barrier.onFail,
          timeoutTo: timeoutEdge?.to ?? node.barrier.onFail,
          progress
        };

        for (const inputDef of node.barrier.inputs) {
          this.barrierIndex.set(composeKey(inputDef.topic, key), {
            instanceId: instance.id,
            nodeId: node.id
          });
        }

        await this.storage.saveBarrier(instance.id, node.id, key, progress);

        return this.waitingResult(instance, {
          status: 'WAITING',
          waitingFor: {
            type: 'BARRIER',
            topic: node.barrier.mode,
            key
          }
        });
      }

      throw new Error(`Unhandled node type ${(node as any).type}`);
    }

    await this.completeInstance(instance, 'COMPLETED');
    return this.buildResult(instance);
  }

  private async handleWaitEvent(
    instanceId: string,
    topic: string,
    key: string,
    payload: JsonObject
  ): Promise<EngineResult> {
    const instance = this.getInstance(instanceId);
    const waiting = instance.waiting;
    if (!waiting || waiting.kind !== 'WAIT_EVENT') {
      throw new Error(`Instance '${instance.id}' is not waiting on ${topic}:${key}`);
    }
    if (waiting.registration.topic !== topic || waiting.registration.key !== key) {
      throw new Error(`Event (${topic}:${key}) does not match waiting registration`);
    }
    if (waiting.registration.schemaRef) {
      validateBySchemaRef(waiting.registration.schemaRef, payload);
    }
    this.waitIndex.delete(composeKey(topic, key));
    instance.context.events = instance.context.events ?? {};
    instance.context.events[topic] = { key, payload, receivedAt: nowWall() } as any;
    await this.closeWaitingNode(instance, waiting.handle, 'COMPLETED');
    instance.waiting = undefined;
    return this.runUntilWaitOrComplete(instance, waiting.resumeTo);
  }

  private async handleBarrierEvent(
    instanceId: string,
    topic: string,
    key: string,
    payload: JsonObject
  ): Promise<EngineResult> {
    const instance = this.getInstance(instanceId);
    const waiting = instance.waiting;
    if (!waiting || waiting.kind !== 'BARRIER') {
      throw new Error(`Instance '${instance.id}' is not waiting on barrier for ${topic}:${key}`);
    }
    if (waiting.key !== key) {
      throw new Error(`Barrier key mismatch for ${key}`);
    }

    const inputDef = waiting.node.barrier.inputs.find((input) => input.topic === topic);
    if (!inputDef) {
      throw new Error(`Barrier node '${waiting.node.id}' does not expect topic '${topic}'`);
    }
    if (inputDef.schemaRef) {
      validateBySchemaRef(inputDef.schemaRef, payload);
    }

    const barrierInput: BarrierEventInput = {
      node: waiting.node,
      key,
      topic,
      payload,
      context: instance.context,
      startedAt: waiting.progress.received[topic]?.startedAt ?? waiting.progress.createdAt,
      endedAt: nowWall()
    };

    const outcome: BarrierEventOutcome = await applyBarrierEvent(barrierInput, waiting.progress);
    instance.context.barriers[waiting.node.id] = {
      progress: outcome.progress
    } as any;

    await this.storage.recordBarrierTopic(instance.id, waiting.node.id, topic, {
      topic,
      pass: outcome.progress.received[topic].pass,
      payload,
      startedAt: outcome.progress.received[topic].startedAt,
      endedAt: outcome.progress.received[topic].endedAt
    });
    await this.storage.saveBarrier(instance.id, waiting.node.id, key, outcome.progress);

    if (!outcome.completed) {
      return this.waitingResult(instance, {});
    }

    for (const input of waiting.node.barrier.inputs) {
      this.barrierIndex.delete(composeKey(input.topic, key));
    }

    if (outcome.mergedContext) {
      instance.context.barriers[waiting.node.id].merged = outcome.mergedContext as any;
    }

    await this.closeWaitingNode(instance, waiting.handle, outcome.passed ? 'COMPLETED' : 'FAILED');
    instance.waiting = undefined;
    const nextNode = outcome.passed ? waiting.passTo : waiting.failTo ?? waiting.timeoutTo;
    return this.runUntilWaitOrComplete(instance, nextNode);
  }

  private waitingResult(instance: InstanceState, result: Partial<ExecutionResult>): EngineResult {
    instance.status = 'WAITING';
    return this.buildResult(instance, result);
  }

  private buildResult(instance: InstanceState, overrides: Partial<ExecutionResult> = {}): EngineResult {
    return {
      instanceId: instance.id,
      status: instance.status,
      metrics: this.computeMetrics(instance),
      pendingTask: overrides.pendingTask,
      waitingFor: overrides.waitingFor
    };
  }

  private computeMetrics(instance: InstanceState): ExecutionMetrics {
    const totals = instance.timeline.getTotals();
    return {
      wallMsTotal: Math.round(totals.wall),
      activeMsTotal: Math.round(totals.active),
      waitingMsTotal: Math.round(totals.waiting)
    };
  }

  private async completeInstance(instance: InstanceState, status: WorkflowStatus): Promise<void> {
    instance.status = status;
    const result = this.buildResult(instance);
    await this.storage.onWorkflowEnd(instance.id, status, result.metrics, instance.context);
  }

  private getNode(instance: InstanceState, nodeId: string): FlowNode {
    const node = instance.flow.nodesById.get(nodeId);
    if (!node) {
      throw new Error(`Flow '${instance.flowName}' missing node '${nodeId}'`);
    }
    return node;
  }

  private requireDecisionTable(name: string) {
    const table = this.compiled.tables.get(name);
    if (!table) {
      throw new Error(`Decision table '${name}' not found`);
    }
    return table;
  }

  private pickEdge(instance: InstanceState, node: FlowNode, label: string): FlowEdge | undefined {
    const edges = instance.flow.adjacency.get(node.id) ?? [];
    return edges.find((edge) => (edge.on ?? '').toUpperCase() === label.toUpperCase());
  }

  private computeAttempt(instance: InstanceState, nodeId: string): number {
    instance.context.__attempts = instance.context.__attempts ?? {};
    const attempt = ((instance.context.__attempts[nodeId] as number) ?? 0) + 1;
    instance.context.__attempts[nodeId] = attempt as any;
    return attempt;
  }

  private async closeRun(instance: InstanceState, handle: NodeRunHandle, status: string): Promise<void> {
    const segment = instance.timeline.leave();
    await this.storage.leaveNodeRun(instance.id, handle, status, {
      durationMs: Math.round(segment.durationMs),
      activeMs: Math.round(segment.activeMs),
      waitingMs: Math.round(segment.waitingMs)
    }, instance.context);
  }

  private async closeWaitingNode(
    instance: InstanceState,
    handle: NodeRunHandle,
    status: 'COMPLETED' | 'FAILED'
  ): Promise<void> {
    await this.closeRun(instance, handle, status);
  }
}

export class EngineManager {
  static load(ruleSetJson: unknown): Engine {
    validateRuleSet(ruleSetJson);
    const compiled = compileRuleSet(ruleSetJson as RuleSet);
    return new Engine(compiled);
  }
}

function deepClone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function composeKey(topic: string, key: string): string {
  return `${topic}::${key}`;
}

function resolveKey(context: JsonObject, path: string): unknown {
  if (!path.startsWith('$.')) return undefined;
  const parts = path.slice(2).split('.');
  let cursor: any = context;
  for (const part of parts) {
    if (cursor == null) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

export function loadEngineFromRuleSet(ruleSet: RuleSet): Engine {
  return new Engine(compileRuleSet(ruleSet));
}
