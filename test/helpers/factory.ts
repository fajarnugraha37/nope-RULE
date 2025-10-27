import ruleSet from '../../src/dsl/onboarding_v1.json' assert { type: 'json' };
import { Engine } from '../../src/engine/engine';
import { compileRuleSet } from '../../src/compiler';
import { RuleSet } from '../../src/types';
import { MemoryStorage, EngineStorage } from '../../src/engine/storage';

export function createTestEngine(options?: { ruleSet?: RuleSet; storage?: EngineStorage }) {
  const storage = options?.storage ?? new MemoryStorage();
  const rs = (options?.ruleSet ?? (ruleSet as RuleSet)) as RuleSet;
  const compiled = compileRuleSet(rs);
  const engine = new Engine(compiled, storage);
  return { engine, storage };
}
