import { performance } from 'node:perf_hooks';

type RegistryFn = (
  input: { ctx: Record<string, unknown>; signal: AbortSignal },
  ...args: unknown[]
) => unknown | Promise<unknown>;

interface RegistryEntry {
  name: string;
  fn: RegistryFn;
  budgetMs: number;
}

class Registry {
  private readonly entries = new Map<string, RegistryEntry>();

  register(name: string, fn: RegistryFn, budgetMs = 50) {
    if (this.entries.has(name)) {
      throw new Error(`Function '${name}' already registered`);
    }
    this.entries.set(name, { name, fn, budgetMs });
  }

  async call(name: string, ctx: Record<string, unknown>, ...args: unknown[]): Promise<unknown> {
    const entry = this.entries.get(name);
    if (!entry) {
      throw new Error(`Function '${name}' is not allowed`);
    }

    const controller = new AbortController();
    const { fn, budgetMs } = entry;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new Error(`Function '${name}' timed out after ${budgetMs}ms`));
      }, budgetMs).unref?.();
    });

    const started = performance.now();

    try {
      const result = fn({ ctx, signal: controller.signal }, ...args);
      if (result instanceof Promise) {
        return await Promise.race([result, timeoutPromise]);
      }
      const elapsed = performance.now() - started;
      if (elapsed > budgetMs) {
        throw new Error(`Function '${name}' exceeded budget (${elapsed.toFixed(2)}ms)`);
      }
      return result;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }
}

export const FunctionRegistry = new Registry();

FunctionRegistry.register(
  'distanceRisk',
  ({ ctx }, userLat?: number, userLon?: number) => {
    if (
      typeof userLat !== 'number' ||
      typeof userLon !== 'number' ||
      typeof ctx?.lastKnownLat !== 'number' ||
      typeof ctx?.lastKnownLon !== 'number'
    ) {
      return 0.5;
    }

    const deltaLat = Math.abs(userLat - (ctx.lastKnownLat as number));
    const deltaLon = Math.abs(userLon - (ctx.lastKnownLon as number));
    const distance = Math.sqrt(deltaLat ** 2 + deltaLon ** 2);
    return Math.min(1, distance / 0.5);
  }
);

FunctionRegistry.register(
  'deviceVelocity',
  ({ ctx }, currentTimestamp?: number) => {
    if (typeof currentTimestamp !== 'number' || typeof ctx?.lastSeenAt !== 'number') {
      return 0;
    }
    const deltaSeconds = (currentTimestamp - (ctx.lastSeenAt as number)) / 1000;
    return deltaSeconds <= 0 ? 0 : Math.min(1, deltaSeconds / 3600);
  }
);

FunctionRegistry.register(
  'blacklistCheck',
  async ({ ctx, signal }, userId?: string) => {
    if (signal.aborted) throw new Error('aborted');
    const blacklist = (ctx.blacklist as string[]) ?? [];
    await new Promise((resolve) => setTimeout(resolve, 5));
    return blacklist.includes(userId ?? '');
  },
  100
);

export async function callRegistryFunction(
  name: string,
  ctx: Record<string, unknown>,
  ...args: unknown[]
): Promise<unknown> {
  return FunctionRegistry.call(name, ctx, ...args);
}
