import { JsonObject, WaitEventNode } from '../../types';

export interface WaitRegistration {
  topic: string;
  key: string;
  schemaRef?: string;
  timeoutAt?: number;
  onTimeout?: string;
}

export function buildWaitRegistration(node: WaitEventNode, context: JsonObject): WaitRegistration {
  const key = resolvePath(context, node.correlateBy);
  if (typeof key !== 'string') {
    throw new Error(`WAIT_EVENT node '${node.id}' could not resolve correlate key`);
  }
  return {
    topic: node.topic,
    key,
    schemaRef: node.schemaRef,
    timeoutAt: node.timeoutMs ? Date.now() + node.timeoutMs : undefined,
    onTimeout: node.onTimeout
  };
}

function resolvePath(context: JsonObject, path: string): unknown {
  if (!path.startsWith('$.')) return undefined;
  const segments = path.slice(2).split('.');
  let value: any = context;
  for (const segment of segments) {
    if (value == null) return undefined;
    value = value[segment];
  }
  return value;
}
