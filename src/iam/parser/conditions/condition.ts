import {
  type Condition,
  type ConditionOperation,
  ConditionOperationImpl,
} from "./index.js";

export class ConditionImpl implements Condition {
  constructor(
    private readonly op: string,
    private readonly key: string,
    private readonly values: string | string[],
    private readonly otherProps: {
      conditionPath: string;
    }
  ) {}

  public operation(): ConditionOperation {
    return new ConditionOperationImpl(this.op);
  }

  public conditionKey(): string {
    return this.key;
  }

  public conditionValues(): string[] {
    return typeof this.values === "string" ? [this.values] : this.values;
  }

  public valueIsArray(): boolean {
    return Array.isArray(this.values);
  }

  public operatorKeyPath(): string {
    return `${this.otherProps.conditionPath}.#${this.op}`;
  }

  public operatorValuePath(): string {
    return `${this.otherProps.conditionPath}.${this.op}`;
  }

  public keyPath(): string {
    return `${this.otherProps.conditionPath}.${this.op}.#${this.key}`;
  }

  public valuesPath(): string {
    return `${this.otherProps.conditionPath}.${this.op}.${this.key}`;
  }
}
