import { isAllWildcards } from "../../utils";
import type {
  Action,
  ActionType,
  ServiceAction,
  WildcardAction,
} from "./action.interface";

export class ActionImpl implements Action, WildcardAction, ServiceAction {
  constructor(
    private readonly rawValue: string,
    private readonly otherProps: {
      path: string;
    }
  ) {}

  public path(): string {
    return this.otherProps.path;
  }

  public type(): ActionType {
    if (isAllWildcards(this.rawValue)) {
      return "wildcard";
    }
    return "service";
  }

  public wildcardValue(): "*" {
    return "*";
  }

  public value(): string {
    return this.rawValue;
  }

  public isWildcardAction(): this is WildcardAction {
    return this.type() === "wildcard";
  }

  public isServiceAction(): this is ServiceAction {
    return this.type() === "service";
  }

  public service(): string {
    return this.rawValue.split(":")[0]!.toLowerCase();
  }

  public action(): string | undefined {
    return this.rawValue.split(":")[1];
  }
}
