import { describe, expect, it } from 'bun:test';
import { IdempotencyCache } from '../src/util/idempotency';

describe('IdempotencyCache', () => {
  it('returns cached value when key repeats', async () => {
    const cache = new IdempotencyCache<number>();
    let calls = 0;
    const runner = () =>
      cache.execute('abc', async () => {
        calls += 1;
        return 42;
      });

    const first = await runner();
    const second = await runner();

    expect(first).toBe(42);
    expect(second).toBe(42);
    expect(calls).toBe(1);
  });

  it('treats missing key as non-idempotent', async () => {
    const cache = new IdempotencyCache<number>();
    let calls = 0;
    const first = await cache.execute(undefined, async () => {
      calls += 1;
      return calls;
    });
    const second = await cache.execute(undefined, async () => {
      calls += 1;
      return calls;
    });

    expect(first).toBe(1);
    expect(second).toBe(2);
  });
});
