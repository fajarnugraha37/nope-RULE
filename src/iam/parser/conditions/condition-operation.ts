import type {
  ConditionOperation,
  SetOperator,
} from "./condition-operation.interface";

const ifExistsSlice = "IfExists".length * -1;

export class ConditionOperationImpl implements ConditionOperation {
  constructor(private readonly op: string) {}

  public setOperator(): SetOperator | undefined {
    if (!this.op.includes(":")) {
      return undefined;
    }
    const setOp = this.op.split(":").at(0)?.toLowerCase();
    if (setOp === "forallvalues") {
      return "ForAllValues";
    } else if (setOp === "foranyvalue") {
      return "ForAnyValue";
    }
    throw new Error(`Unknown set operator: ${setOp}`);
  }

  public isIfExists(): boolean {
    return this.op.toLowerCase().endsWith("ifexists");
  }

  public baseOperator(): string {
    const base = this.op.split(":").at(-1)!;
    if (base?.toLowerCase().endsWith("ifexists")) {
      return base.slice(0, ifExistsSlice);
    }
    return base;
  }

  public value(): string {
    return this.op;
  }
}
