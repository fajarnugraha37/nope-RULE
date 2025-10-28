import { type Action, ActionImpl } from "../actions/index.js";
import { type Condition, ConditionImpl } from "../conditions/index.js";
import {
  type Principal,
  type PrincipalType,
  PrincipalImpl,
} from "../principals/index.js";
import { type Resource, ResourceImpl } from "../resources/index.js";
import type {
  ActionStatement,
  NotActionStatement,
  NotPrincipalStatement,
  NotResourceStatement,
  PrincipalStatement,
  ResourceStatement,
  Statement,
} from "./statement.interface";

/**
 * Implementation of the Statement interface and all its sub-interfaces
 */
export class StatementImpl
  implements
    Statement,
    ActionStatement,
    NotActionStatement,
    ResourceStatement,
    NotResourceStatement,
    PrincipalStatement
{
  constructor(
    private readonly statementObject: any,
    private readonly _index: number,
    private readonly otherProps: {
      path: string;
    }
  ) {}

  public index(): number {
    return this._index;
  }

  public path(): string {
    return this.otherProps.path;
  }

  public sid(): string | undefined {
    return this.statementObject.Sid;
  }

  public effect(): string {
    return this.statementObject.Effect;
  }

  public isAllow(): boolean {
    return this.effect() === "Allow";
  }

  public isDeny(): boolean {
    return this.effect() === "Deny";
  }

  public isPrincipalStatement(): this is PrincipalStatement {
    return this.statementObject.Principal !== undefined;
  }

  public isNotPrincipalStatement(): this is NotPrincipalStatement {
    return this.statementObject.NotPrincipal !== undefined;
  }

  public principals(): Principal[] {
    if (!this.isPrincipalStatement()) {
      throw new Error(
        "Called principals on a statement without Principal, use isPrincipalStatement before calling principals"
      );
    }
    return this.parsePrincipalObject(this.statementObject.Principal);
  }

  public principalTypeIsArray(principalType: string): boolean {
    if (!this.isPrincipalStatement()) {
      throw new Error(
        "Called principalTypeIsArray on a statement without Principal, use isPrincipalStatement before calling principalTypeIsArray"
      );
    }
    return (
      typeof this.statementObject.Principal === "object" &&
      Array.isArray(this.statementObject.Principal[principalType])
    );
  }

  public hasSingleWildcardPrincipal(): boolean {
    if (!this.isPrincipalStatement()) {
      throw new Error(
        "Called hasSingleWildcardPrincipal on a statement without Principal, use isPrincipalStatement before calling hasSingleWildcardPrincipal"
      );
    }
    return this.statementObject.Principal === "*";
  }

  public notPrincipals(): Principal[] {
    if (!this.isNotPrincipalStatement()) {
      throw new Error(
        "Called notPrincipals on a statement without NotPrincipal, use isNotPrincipalStatement before calling notPrincipals"
      );
    }
    return this.parsePrincipalObject(this.statementObject.NotPrincipal);
  }

  public notPrincipalTypeIsArray(notPrincipalType: string): boolean {
    if (!this.isNotPrincipalStatement()) {
      throw new Error(
        "Called notPrincipalTypeIsArray on a statement without NotPrincipal, use isNotPrincipalStatement before calling notPrincipalTypeIsArray"
      );
    }
    return (
      typeof this.statementObject.NotPrincipal === "object" &&
      Array.isArray(this.statementObject.NotPrincipal[notPrincipalType])
    );
  }

  public hasSingleWildcardNotPrincipal(): boolean {
    if (!this.isNotPrincipalStatement()) {
      throw new Error(
        "Called hasSingleWildcardNotPrincipal on a statement without NotPrincipal, use isNotPrincipalStatement before calling hasSingleWildcardNotPrincipal"
      );
    }
    return this.statementObject.NotPrincipal === "*";
  }

  public toJSON(): any {
    return this.statementObject;
  }

  /**
   * Parse the principal object into PrincipalImpl objects.
   *
   * This is non trivial and we don't want to implement this in each function.
   *
   * @param principals the Principal or NotPrincipal object ot parse
   * @returns the backing principals for a Principal or NotPrincipal object
   */
  private parsePrincipalObject(principals: any): PrincipalImpl[] {
    if (typeof principals === "string") {
      return [new PrincipalImpl("AWS", principals)];
    }
    return Object.entries(principals)
      .map(([principalType, principalValue]) => {
        if (typeof principalValue === "string") {
          return new PrincipalImpl(
            principalType as PrincipalType,
            principalValue
          );
        }
        return Object.entries(principalValue as any).map(([key, value]) => {
          return new PrincipalImpl(
            principalType as PrincipalType,
            value as string
          );
        });
      })
      .flat();
  }

  public isActionStatement(): this is ActionStatement {
    return this.statementObject.Action !== undefined;
  }

  public isNotActionStatement(): this is NotActionStatement {
    return this.statementObject.NotAction !== undefined;
  }

  public actions(): Action[] {
    if (!this.isActionStatement()) {
      throw new Error(
        "Called actions on a statement without Action, use isActionStatement before calling actions"
      );
    }
    return this.createNewActions();
  }

  private createNewActions(): Action[] {
    if (!this.actionIsArray()) {
      return [
        new ActionImpl(this.statementObject.Action, {
          path: `${this.path()}.Action`,
        }),
      ];
    }
    return [this.statementObject.Action].flat().map((action: any, index) => {
      return new ActionImpl(action, {
        path: `${this.path()}.Action[${index}]`,
      });
    });
  }

  public actionIsArray(): boolean {
    return Array.isArray(this.statementObject.Action);
  }

  public notActions(): Action[] {
    if (!this.isNotActionStatement()) {
      throw new Error(
        "Called notActions on a statement without NotAction, use isNotActionStatement before calling notActions"
      );
    }
    return this.createNewNotActions();
  }

  private createNewNotActions(): Action[] {
    if (!this.notActionIsArray()) {
      return [
        new ActionImpl(this.statementObject.NotAction, {
          path: `${this.path()}.NotAction`,
        }),
      ];
    }
    return [this.statementObject.NotAction].flat().map((action: any, index) => {
      return new ActionImpl(action, {
        path: `${this.path()}.NotAction[${index}]`,
      });
    });
  }

  public notActionIsArray(): boolean {
    return Array.isArray(this.statementObject.NotAction);
  }

  public isResourceStatement(): this is ResourceStatement {
    return this.statementObject.Resource !== undefined;
  }

  public isNotResourceStatement(): this is NotResourceStatement {
    return this.statementObject.NotResource !== undefined;
  }

  public resources(): Resource[] {
    if (!this.isResourceStatement()) {
      throw new Error(
        "Called resources on a statement without Resource, use isResourceStatement before calling resources"
      );
    }
    return this.createNewResources();
  }

  private createNewResources(): Resource[] {
    if (!this.resourceIsArray()) {
      return [
        new ResourceImpl(this.statementObject.Resource, {
          path: `${this.path()}.Resource`,
        }),
      ];
    }

    return [this.statementObject.Resource]
      .flat()
      .map((resource: any, index) => {
        return new ResourceImpl(resource, {
          path: `${this.path()}.Resource[${index}]`,
        });
      });
  }

  public hasSingleResourceWildcard(): boolean {
    if (!this.isResourceStatement()) {
      throw new Error(
        "Called hasSingleResourceWildcard on a statement without Resource, use isResourceStatement before calling hasSingleResourceWildcard"
      );
    }
    return this.statementObject.Resource === "*";
  }

  public resourceIsArray(): boolean {
    return Array.isArray(this.statementObject.Resource);
  }

  public notResources(): Resource[] {
    if (!this.isNotResourceStatement()) {
      throw new Error(
        "Called notResources on a statement without NotResource, use isNotResourceStatement before calling notResources"
      );
    }
    return this.createNewNotResources();
  }

  private createNewNotResources(): Resource[] {
    if (!this.notResourceIsArray()) {
      return [
        new ResourceImpl(this.statementObject.NotResource, {
          path: `${this.path()}.NotResource`,
        }),
      ];
    }

    return [this.statementObject.NotResource]
      .flat()
      .map((resource: any, index) => {
        return new ResourceImpl(resource, {
          path: `${this.path()}.NotResource[${index}]`,
        });
      });
  }

  public notResourceIsArray(): boolean {
    return Array.isArray(this.statementObject.NotResource);
  }

  public hasSingleNotResourceWildcard(): boolean {
    if (!this.isNotResourceStatement()) {
      throw new Error(
        "Called hasSingleNotResourceWildcard on a statement without NotResource, use isNotResourceStatement before calling hasSingleNotResourceWildcard"
      );
    }
    return this.statementObject.NotResource === "*";
  }

  public conditionMap(): Record<string, Record<string, string[]>> | undefined {
    if (!this.statementObject.Condition) {
      return undefined;
    }
    const result = {} as Record<string, Record<string, string[]>>;
    for (const key of Object.keys(this.statementObject.Condition)) {
      const value = this.statementObject.Condition[key];
      result[key] = {};
      for (const subKey of Object.keys(value)) {
        const subValue = value[subKey];
        result[key][subKey] = Array.isArray(subValue) ? subValue : [subValue];
      }
    }
    return result;
  }

  public conditions(): Condition[] {
    return this.createNewConditions();
  }

  private createNewConditions(): Condition[] {
    if (!this.statementObject.Condition) {
      return [];
    }

    return Object.entries(this.statementObject.Condition)
      .map(([opKey, opValue]) => {
        return Object.entries(opValue as any).map(([condKey, condValue]) => {
          return new ConditionImpl(
            opKey,
            condKey,
            condValue as string | string[],
            {
              conditionPath: `${this.path()}.Condition`,
            }
          );
        });
      })
      .flat();
  }
}
