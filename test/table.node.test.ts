import { describe, expect, it } from 'bun:test';
import { evaluateDecisionTable } from '../src/engine/nodes/table';
import { DecisionTable, JsonObject } from '../src/types';

const tableBase: DecisionTable = {
  name: 'risk',
  hitPolicy: 'FIRST',
  rules: [
    {
      when: [
        { path: '$.user.country', op: '==', value: 'DE' },
        { path: '$.user.age', op: '>=', value: 18 }
      ],
      result: { risk: 'MEDIUM' }
    },
    {
      when: [{ path: '$.user.age', op: '<', value: 18 }],
      result: { risk: 'HIGH' },
      priority: 5
    }
  ]
};

const context: JsonObject = {
  user: {
    country: 'DE',
    age: 21
  }
};

describe('decision table evaluator', () => {
  it('returns first matching rule with FIRST policy', () => {
    const evaluation = evaluateDecisionTable(tableBase, context);
    expect(evaluation.result).toEqual({ risk: 'MEDIUM' });
    expect(evaluation.matchedRules).toHaveLength(1);
  });

  it('uses priority ordering when policy is PRIORITY', () => {
    const table: DecisionTable = {
      ...tableBase,
      hitPolicy: 'PRIORITY',
      rules: [
        {
          when: [{ path: '$.user.segment', op: 'EXISTS' }],
          result: { risk: 'LOW' },
          priority: 1
        },
        {
          when: [{ path: '$.user.segment', op: 'EXISTS' }],
          result: { risk: 'CRITICAL' },
          priority: 10
        }
      ]
    };
    const evaluation = evaluateDecisionTable(table, {
      user: { segment: 'VIP' }
    });
    expect(evaluation.result).toEqual({ risk: 'CRITICAL' });
    expect(evaluation.matchedRules[0]?.priority).toBe(10);
  });

  it('merges results when policy is MERGE', () => {
    const table: DecisionTable = {
      name: 'merge',
      hitPolicy: 'MERGE',
      rules: [
        {
          when: [{ path: '$.flags.a', op: '==', value: true }],
          result: { a: 1 }
        },
        {
          when: [{ path: '$.flags.b', op: '==', value: true }],
          result: { b: 2 }
        }
      ]
    };
    const evaluation = evaluateDecisionTable(table, {
      flags: { a: true, b: true }
    });
    expect(evaluation.result).toEqual({ a: 1, b: 2 });
    expect(evaluation.matchedRules).toHaveLength(2);
  });

  it('evaluates comparison operators', () => {
    const table: DecisionTable = {
      name: 'compare',
      hitPolicy: 'FIRST',
      rules: [
        {
          when: [{ path: '$.order.total', op: '>', value: 500 }],
          result: { tier: 'GOLD' }
        },
        {
          when: [{ path: '$.order.total', op: '<=', value: 500 }],
          result: { tier: 'SILVER' }
        }
      ]
    };
    const evaluation = evaluateDecisionTable(table, { order: { total: 650 } });
    expect(evaluation.result).toEqual({ tier: 'GOLD' });
  });

  it('returns undefined when no rule matches', () => {
    const evaluation = evaluateDecisionTable(tableBase, {
      user: { country: 'FR', age: 25 }
    });
    expect(evaluation.result).toBeUndefined();
    expect(evaluation.matchedRules).toHaveLength(0);
  });
});
