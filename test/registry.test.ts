import { describe, expect, it } from 'bun:test';
import { callRegistryFunction, FunctionRegistry } from '../src/registry';

describe('FunctionRegistry', () => {
  it('invokes registered functions', async () => {
    const risk = await callRegistryFunction('distanceRisk', { lastKnownLat: 0, lastKnownLon: 0 }, 0.2, 0.1);
    expect(typeof risk).toBe('number');
  });

  it('throws for unknown functions', async () => {
    await expect(callRegistryFunction('not-allowed', {})).rejects.toThrow();
  });

  it('enforces execution timeout', async () => {
    const fnName = `slow-${Date.now()}`;
    FunctionRegistry.register(
      fnName,
      async ({ signal }) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (signal.aborted) {
          throw new Error('aborted');
        }
        return 'done';
      },
      10
    );
    await expect(callRegistryFunction(fnName, {})).rejects.toThrow(/timed out|exceeded/i);
  });
});
