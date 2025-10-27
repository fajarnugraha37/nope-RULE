import { JsonLogicRule, JsonObject } from '../../types';
import { matches } from '../../expr-jsonlogic';

export async function runExprNode(exprJson: JsonLogicRule, input: JsonObject): Promise<boolean> {
  return matches(exprJson, input);
}
