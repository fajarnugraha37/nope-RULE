import { DecisionTable, JsonObject, TableCondition, TableRule } from '../../types';

export interface TableEvaluation {
  result: JsonObject | undefined;
  matchedRules: TableRule[];
}

export function evaluateDecisionTable(table: DecisionTable, context: JsonObject): TableEvaluation {
  const matched = table.rules.filter((rule) => rule.when.every((condition) => evaluateCondition(condition, context)));

  if (matched.length === 0) {
    return { result: undefined, matchedRules: [] };
  }

  switch (table.hitPolicy) {
    case 'FIRST': {
      const rule = matched[0];
      return { result: rule.result, matchedRules: [rule] };
    }
    case 'PRIORITY': {
      const sorted = matched.slice().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
      const rule = sorted[0];
      return { result: rule.result, matchedRules: [rule] };
    }
    case 'MERGE': {
      const merged: JsonObject = {};
      for (const rule of matched) {
        Object.assign(merged, rule.result);
      }
      return { result: merged, matchedRules: matched };
    }
    default:
      throw new Error(`Unsupported hit policy ${(table as any).hitPolicy}`);
  }
}

function evaluateCondition(condition: TableCondition, context: JsonObject): boolean {
  const actual = getValueByPath(context, condition.path);
  switch (condition.op) {
    case 'EXISTS':
      return actual !== undefined && actual !== null;
    case 'MATCHES':
      if (typeof actual !== 'string' || typeof condition.value !== 'string') return false;
      return new RegExp(condition.value).test(actual);
    case 'IN':
      return Array.isArray(condition.value) && condition.value.includes(actual as never);
    case 'NOT_IN':
      return Array.isArray(condition.value) && !condition.value.includes(actual as never);
    case '==':
      return actual === condition.value;
    case '!=':
      return actual !== condition.value;
    case '>':
      return typeof actual === 'number' && typeof condition.value === 'number' && actual > condition.value;
    case '>=':
      return typeof actual === 'number' && typeof condition.value === 'number' && actual >= condition.value;
    case '<':
      return typeof actual === 'number' && typeof condition.value === 'number' && actual < condition.value;
    case '<=':
      return typeof actual === 'number' && typeof condition.value === 'number' && actual <= condition.value;
    default:
      throw new Error(`Unsupported operator ${condition.op}`);
  }
}

function getValueByPath(source: JsonObject, path: string): unknown {
  if (!path.startsWith('$.')) return undefined;
  const segments = path.slice(2).split('.');
  let current: any = source;
  for (const segment of segments) {
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}
