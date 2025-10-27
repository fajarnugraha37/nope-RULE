import jsonLogic from 'json-logic-js';
import { callRegistryFunction } from './registry';

type AsyncSentinel = {
  __asyncCall__: {
    name: string;
    args: unknown[];
  };
};

function isAsyncSentinel(value: unknown): value is AsyncSentinel {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__asyncCall__' in value &&
    typeof (value as any).__asyncCall__?.name === 'string'
  );
}

let callOpRegistered = false;

function registerCallOp() {
  if (callOpRegistered) return;
  jsonLogic.add_operation('call', (name: unknown, ...args: unknown[]) => {
    if (typeof name !== 'string') {
      throw new Error('call operator requires a function name');
    }
    return {
      __asyncCall__: {
        name,
        args
      }
    } satisfies AsyncSentinel;
  });
  callOpRegistered = true;
}

export async function evalJsonLogicAsync(rule: unknown, data: unknown): Promise<unknown> {
  registerCallOp();
  const raw = jsonLogic.apply(rule as any, data);
  return resolveAsyncValue(raw, data);
}

export async function matches(rule: unknown, data: unknown): Promise<boolean> {
  const result = await evalJsonLogicAsync(rule, data);
  return Boolean(result);
}

async function resolveAsyncValue(value: unknown, context: unknown): Promise<unknown> {
  if (value instanceof Promise) {
    return resolveAsyncValue(await value, context);
  }

  if (isAsyncSentinel(value)) {
    const { name, args } = value.__asyncCall__;
    const resolvedArgs = await Promise.all(args.map((arg) => resolveAsyncValue(arg, context)));
    const ctx = typeof context === 'object' && context !== null ? (context as any) : {};
    return callRegistryFunction(name, ctx ?? {}, ...resolvedArgs);
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => resolveAsyncValue(item, context)));
  }

  if (value && typeof value === 'object') {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, val]) => [key, await resolveAsyncValue(val, context)])
    );
    return Object.fromEntries(entries);
  }

  return value;
}
