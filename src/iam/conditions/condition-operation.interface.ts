export type SetOperator = "ForAllValues" | "ForAnyValue";

/**
 * ConditionOperation is a string that represents the operation of a condition.
 */
export interface ConditionOperation {
  /**
   * Returns the set modifier if present.
   */
  setOperator(): SetOperator | undefined;

  /**
   * Returns the base operator of the condition without the set modifier or IfExists.
   */
  baseOperator(): string;

  /**
   * Returns true if the condition operation ends with IfExists.
   */
  isIfExists(): boolean;

  /**
   * Returns the raw string of the condition operation.
   */
  value(): string;
}
