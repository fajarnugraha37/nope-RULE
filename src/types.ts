export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

export type JsonObject = { [key: string]: JsonValue | undefined };

export type JsonLogicRule = JsonValue;

export interface TableCondition {
  path: string;
  op:
    | '=='
    | '!='
    | '>'
    | '>='
    | '<'
    | '<='
    | 'IN'
    | 'NOT_IN'
    | 'MATCHES'
    | 'EXISTS';
  value?: JsonValue;
}

export interface TableRule {
  when: TableCondition[];
  result: JsonObject;
  priority?: number;
}

export interface DecisionTable {
  name: string;
  hitPolicy: 'FIRST' | 'PRIORITY' | 'MERGE';
  rules: TableRule[];
}

export type FlowNodeType =
  | 'TABLE'
  | 'EXPR'
  | 'MERGE'
  | 'HUMAN_FORM'
  | 'WAIT_EVENT'
  | 'BARRIER';

export interface BaseNode<T extends FlowNodeType = FlowNodeType> {
  id: string;
  type: T;
  name?: string;
  next?: string;
}

export interface TableNode extends BaseNode<'TABLE'> {
  tableRef: string;
  onFail?: string;
}

export interface ExprNode extends BaseNode<'EXPR'> {
  expr: JsonLogicRule;
  onTrue?: string;
  onFalse?: string;
}

export interface MergeNode extends BaseNode<'MERGE'> {
  sources: string[];
}

export interface HumanFormNode extends BaseNode<'HUMAN_FORM'> {
  formSchemaRef: string;
  assignees: string[];
  timeoutMs?: number;
}

export interface WaitEventNode extends BaseNode<'WAIT_EVENT'> {
  topic: string;
  correlateBy: string;
  schemaRef?: string;
  timeoutMs?: number;
  onTimeout?: string;
}

export interface BarrierInput {
  topic: string;
  schemaRef?: string;
  passExpr?: JsonLogicRule;
}

export interface BarrierDef {
  mode: 'ALL' | 'ANY' | 'QUORUM';
  quorum?: number;
  inputs: BarrierInput[];
  correlateBy: string;
  timeoutMs?: number;
  onFail?: string;
  emitMerged?: boolean;
}

export interface BarrierNode extends BaseNode<'BARRIER'> {
  barrier: BarrierDef;
}

export type FlowNode =
  | TableNode
  | ExprNode
  | MergeNode
  | HumanFormNode
  | WaitEventNode
  | BarrierNode;

export interface FlowEdge {
  from: string;
  to: string;
  on?: string;
}

export interface FlowDefinition {
  name: string;
  entry: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface RuleSet {
  name: string;
  version: string;
  schemas?: JsonObject;
  tables?: Record<string, DecisionTable>;
  flows: Record<string, FlowDefinition>;
}

export type WorkflowStatus = 'RUNNING' | 'WAITING' | 'COMPLETED' | 'FAILED';

export interface ExecutionMetrics {
  wallMsTotal: number;
  activeMsTotal: number;
  waitingMsTotal: number;
}

export interface NodeRunRecord {
  nodeId: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'WAITING';
  durationMs: number;
  activeMs: number;
  waitingMs: number;
  attempt: number;
}

export interface Task {
  id: string;
  workflowInstanceId: string;
  nodeId: string;
  formSchemaRef: string;
  status: 'OPEN' | 'SUBMITTED' | 'EXPIRED';
  assignees: string[];
  context: JsonObject;
  createdAt: string;
  submittedAt?: string;
}

export interface ExecutionResult {
  status: WorkflowStatus;
  pendingTask?: Task;
  waitingFor?: { type: 'EVENT' | 'BARRIER'; topic: string; key: string };
  metrics: ExecutionMetrics;
}

export interface BarrierProgressTopic {
  topic: string;
  pass: boolean;
  payload?: JsonObject;
  startedAt: number;
  endedAt: number;
}

export interface BarrierProgress {
  nodeId: string;
  instanceId: string;
  key: string;
  mode: BarrierDef['mode'];
  quorum?: number;
  expectedTopics: string[];
  received: Record<string, BarrierProgressTopic>;
  completed: boolean;
  passed: boolean;
  emitMerged: boolean;
  timeoutAt?: number;
  createdAt: number;
}
