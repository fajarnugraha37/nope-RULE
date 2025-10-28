export type ActionType = "service" | "wildcard";

/**
 * An Action string in an IAM policy
 */
export interface Action {
  /**
   * The type of actions
   */
  type(): ActionType;

  /**
   * The raw string of the action
   */
  value(): string;

  /**
   * Whether the action is a wildcard action: `"*"`
   */
  isWildcardAction(): this is WildcardAction;

  /**
   * Whether the action is a service action: `"service:Action"`
   */
  isServiceAction(): this is ServiceAction;

  /**
   * The path to the action string in the policy
   */
  path(): string;
}

/**
 * A wildcard action: `"*"`
 */
export interface WildcardAction extends Action {
  /**
   * The wildcard character `"*"`
   *
   * This mainly exists to differentiate between this interface and the Action interface
   */
  wildcardValue(): "*";
}

/**
 * A service action: `"service:Action"`
 */
export interface ServiceAction extends Action {
  /**
   * The service of the action
   *
   * Guaranteed to be lowercase
   */
  service(): string;

  /**
   * The action within the service
   */
  action(): string | undefined;
}
