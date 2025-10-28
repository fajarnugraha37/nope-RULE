import type { Statement } from "../statements";

export interface Policy<T = undefined> {
  /**
   * The version of the policy
   */
  version(): string | undefined;

  /**
   * The ID of the policy
   */
  id(): string | undefined;

  /**
   * The statements in the policy
   */
  statements(): Statement[];

  /**
   * Whether the statement is an array
   */
  statementIsArray(): boolean;

  /**
   * The raw policy object as JSON
   */
  toJSON(): any;

  /**
   * Metadata is any object to store additional information about the policy.
   * Up to you as a user to define the type of the metadata and is optional.
   */
  metadata(): T;
}
