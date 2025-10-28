import type { ConditionOperation } from "./condition-operation.interface";

export interface Condition {
  /**
   * Returns the operation of the condition. For example "StringEquals" or "StringLike".
   *
   * @returns the operation of the condition.
   */
  operation(): ConditionOperation;

  /**
   * Returns the key of the condition. For example "aws:PrincipalOrgID".
   *
   * @returns the condition key of the action
   */
  conditionKey(): string;

  /**
   * Returns the values of the condition. For example ["o-1234567890abcdef0"].
   *
   * @returns the values of the condition.
   */
  conditionValues(): string[];

  /**
   * Checks if the the condition values are an array.
   *
   * @returns true if the condition values are an array, false otherwise.
   */
  valueIsArray(): boolean;

  /**
   * Returns the path to the operator key in the policy.
   */
  operatorKeyPath(): string;

  /**
   * Returns the path to the operator value in the policy.
   */
  operatorValuePath(): string;

  /**
   * Returns the path to the condition key for the policy.
   */
  keyPath(): string;

  /**
   * Returns the path to the condition values in the policy.
   */
  valuesPath(): string;
}
