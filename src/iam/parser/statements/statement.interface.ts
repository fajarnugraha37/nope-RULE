/*
things to change in a statement
condition
*/

import type { Action } from "../actions";
import type { Condition } from "../conditions";
import type { Principal } from "../principals";
import type { Resource } from "../resources";

/**
 * Represents a statement in an IAM policy
 */
export interface Statement {
  /**
   * The index of the statement in the policy, starts from 1
   */
  index(): number;

  /**
   * The optional Sid (Statement ID) for a statement
   */
  sid(): string | undefined;

  /**
   * The effect of the statement, either 'Allow' or 'Deny'
   */
  effect(): string;

  /**
   * Is the statement an Allow statement
   */
  isAllow(): boolean;

  /**
   * Is the statement a Deny statement
   */
  isDeny(): boolean;

  /**
   * The conditions of the statement as a map similar to the AWS IAM policy document.
   * In this case all condition values are arrays, instead of strings or arrays.
   */
  conditionMap(): Record<string, Record<string, string[]>> | undefined;

  /**
   * The conditions for the statement
   */
  conditions(): Condition[];

  /**
   * Does the statement have a Principal
   */
  isPrincipalStatement(): this is PrincipalStatement;

  /**
   * Does the statement have a NotPrincipal
   */
  isNotPrincipalStatement(): this is NotPrincipalStatement;

  /**
   * Does the statement have an Action
   */
  isActionStatement(): this is ActionStatement;

  /**
   * Does the statement have a NotAction
   */
  isNotActionStatement(): this is NotActionStatement;

  /**
   * Does the statement have a Resource
   */
  isResourceStatement(): this is ResourceStatement;

  /**
   * Does the statement have a NotResource
   */
  isNotResourceStatement(): this is NotResourceStatement;

  /**
   * The path to the statement in the policy
   */
  path(): string;

  /**
   * Returns the raw policy object
   */
  toJSON(): any;
}

/**
 * Represents a statement in an IAM policy that has Action
 */
export interface ActionStatement extends Statement {
  /**
   * The actions for the statement
   */
  actions(): Action[];

  /**
   * Is the Action element an array of strings
   */
  actionIsArray(): boolean;
}

/**
 * Represents a statement in an IAM policy that has NotAction
 */
export interface NotActionStatement extends Statement {
  /**
   * The not actions for the statement
   */
  notActions(): Action[];

  /**
   * Is the NotAction element an array of strings
   */
  notActionIsArray(): boolean;
}

/**
 * Represents a statement in an IAM policy that has Resource
 */
export interface ResourceStatement extends Statement {
  /**
   * The resources for the statement
   */
  resources(): Resource[];

  /**
   * Is the Resource element exactly a single wildcard: `"*"`
   */
  hasSingleResourceWildcard(): boolean;

  /**
   * Is the Resource element an array of strings
   */
  resourceIsArray(): boolean;
}

/**
 * Represents a statement in an IAM policy that has NotResource
 */
export interface NotResourceStatement extends Statement {
  /**
   * The not resources for the statement
   */
  notResources(): Resource[];

  /**
   * Is the NotResource element exactly a single wildcard: `"*"`
   */
  hasSingleNotResourceWildcard(): boolean;

  /**
   * Is the resource element an array of strings
   */
  notResourceIsArray(): boolean;
}

/**
 * Represents a statement in an IAM policy that has Principal
 */
export interface PrincipalStatement extends Statement {
  /**
   * The principals for the statement
   */
  principals(): Principal[];

  /**
   * Is the Principal type is an array of strings
   *
   * @param principalType the type of the Principal such as "AWS", "Service", etc.
   * @returns true if the principal type is an array of strings in the raw policy
   */
  principalTypeIsArray(principalType: string): boolean;

  /**
   * Is the Principal element a single wildcard: `"*"`
   */
  hasSingleWildcardPrincipal(): boolean;
}

/**
 * Represents a statement in an IAM policy that has NotPrincipal
 */
export interface NotPrincipalStatement extends Statement {
  /**
   * The not principals for the statement
   */
  notPrincipals(): Principal[];

  /**
   * Is the NotPrincipal type is an array of strings
   *
   * @param notPrincipalType the type of the NotPrincipal such as "AWS", "Service", etc.
   * @returns true if the NotPrincipal type is an array of strings in the raw policy
   */
  notPrincipalTypeIsArray(notPrincipalType: string): boolean;

  /**
   * Is the NotPrincipal element a single wildcard: `"*"`
   */
  hasSingleWildcardNotPrincipal(): boolean;
}
