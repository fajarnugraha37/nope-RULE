import { isAllWildcards } from "../../../utils";
import type { ArnResource, Resource } from "./resource.interface";

export class ResourceImpl implements Resource, ArnResource {
  constructor(
    private readonly rawValue: string,
    private readonly otherProps: {
      path: string;
    }
  ) {}

  path(): string {
    return this.otherProps.path;
  }

  partition(): string {
    if (!this.isArnResource()) {
      throw new Error(
        "Called partition on a resource without an ARN, use isArnResource before calling partition"
      );
    }
    return this.value().split(":").at(1)!;
  }

  service(): string {
    if (!this.isArnResource()) {
      throw new Error(
        "Called service on a resource without an ARN, use isArnResource before calling service"
      );
    }
    return this.value().split(":").at(2)!;
  }

  region(): string {
    if (!this.isArnResource()) {
      throw new Error(
        "Called region on a resource without an ARN, use isArnResource before calling region"
      );
    }
    return this.value().split(":").at(3)!;
  }

  account(): string {
    if (!this.isArnResource()) {
      throw new Error(
        "Called account on a resource without an ARN, use isArnResource before calling account"
      );
    }
    return this.value().split(":").at(4)!;
  }

  resource(): string {
    if (!this.isArnResource()) {
      throw new Error(
        "Called resource on a resource without an ARN, use isArnResource before calling resource"
      );
    }
    return this.value().split(":").slice(5).join(":");
  }

  value(): string {
    return this.rawValue;
  }

  isAllResources(): boolean {
    return isAllWildcards(this.rawValue);
  }

  isArnResource(): this is ArnResource {
    return !this.isAllResources();
  }
}
