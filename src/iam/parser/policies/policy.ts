import { type Statement, StatementImpl } from "../statements";
import type { Policy } from "./policy.interface";

export class PolicyImpl<T = undefined> implements Policy<T> {
  constructor(
    private readonly policyObject: any,
    private readonly theMetadata?: T
  ) {}

  public version(): string | undefined {
    return this.policyObject.Version;
  }

  public id(): string | undefined {
    return this.policyObject.Id;
  }

  public statements(): Statement[] {
    return this.newStatements();
  }

  private newStatements(): Statement[] {
    if (!this.statementIsArray()) {
      return [
        new StatementImpl(this.policyObject.Statement, 1, {
          path: "Statement",
        }),
      ];
    }
    return [this.policyObject.Statement].flat().map((statement: any, index) => {
      return new StatementImpl(statement, index + 1, {
        path: `Statement[${index}]`,
      });
    });
  }

  public statementIsArray(): boolean {
    return Array.isArray(this.policyObject.Statement);
  }

  public toJSON(): any {
    return this.policyObject;
  }

  public metadata(): T {
    return this.theMetadata as T;
  }
}
