import { isAllWildcards } from "../../../utils";
import type {
  AccountPrincipal,
  AwsPrincipal,
  CanonicalUserPrincipal,
  FederatedPrincipal,
  Principal,
  PrincipalType,
  ServicePrincipal,
  UniqueIdPrincipal,
  WildcardPrincipal,
} from "./principal.interface";

const accountIdRegex = /^[0-9]{12}$/;
const accountArnRegex = /^arn:.*?:iam::[0-9]{12}:root$/;
const uniqueIdRegex = /^A[0-9A-Z]+$/;

export class PrincipalImpl
  implements
    Principal,
    WildcardPrincipal,
    AccountPrincipal,
    UniqueIdPrincipal,
    AwsPrincipal,
    ServicePrincipal,
    FederatedPrincipal,
    CanonicalUserPrincipal
{
  constructor(
    private readonly principalType: PrincipalType,
    private readonly principalId: string
  ) {}

  public value(): string {
    return this.principalId;
  }

  public type(): PrincipalType {
    return this.principalType;
  }

  public isWildcardPrincipal(): this is WildcardPrincipal {
    return this.principalType === "AWS" && isAllWildcards(this.principalId);
  }

  public isAccountPrincipal(): this is AccountPrincipal {
    if (this.principalType !== "AWS") {
      return false;
    }
    return (
      accountIdRegex.test(this.principalId) ||
      accountArnRegex.test(this.principalId)
    );
  }

  public isUniqueIdPrincipal(): this is UniqueIdPrincipal {
    if (this.principalType !== "AWS") {
      return false;
    }
    return uniqueIdRegex.test(this.principalId);
  }

  public isAwsPrincipal(): this is AwsPrincipal {
    if (this.principalType !== "AWS") {
      return false;
    }
    const anyThis: any = this;
    return (
      !isAllWildcards(anyThis.principalId) &&
      !anyThis.isAccountPrincipal() &&
      !anyThis.isUniqueIdPrincipal()
    );
  }

  public isServicePrincipal(): this is ServicePrincipal {
    return this.principalType === "Service";
  }

  public isFederatedPrincipal(): this is FederatedPrincipal {
    return this.principalType === "Federated";
  }

  public isCanonicalUserPrincipal(): this is CanonicalUserPrincipal {
    return this.principalType === "CanonicalUser";
  }

  public wildcard(): "*" {
    if (!this.isWildcardPrincipal()) {
      throw new Error(
        "Principal is not a wildcard principal, call isWildcardPrincipal() before calling wildcard()"
      );
    }
    return "*";
  }

  public accountId(): string | undefined {
    if (!this.isAccountPrincipal()) {
      throw new Error(
        "Principal is not an account principal, call isAccountPrincipal() before calling accountId()"
      );
    }
    if (accountArnRegex.test(this.principalId)) {
      return this.principalId.split(":")[4];
    }
    return this.principalId;
  }

  public uniqueId(): string {
    if (!this.isUniqueIdPrincipal()) {
      throw new Error(
        "Principal is not a unique id principal, call isUniqueIdPrincipal() before calling uniqueId()"
      );
    }
    return this.principalId;
  }

  public arn(): string {
    if (!this.isAwsPrincipal()) {
      throw new Error(
        "Principal is not an AWS principal, call isAwsPrincipal() before calling arn()"
      );
    }
    return this.principalId;
  }

  public service(): string {
    if (!this.isServicePrincipal()) {
      throw new Error(
        "Principal is not a service principal, call isServicePrincipal() before calling service()"
      );
    }
    return this.principalId;
  }

  public federated(): string {
    if (this.principalType !== "Federated") {
      throw new Error(
        "Principal is not a federated principal, call isFederatedPrincipal() before calling federated()"
      );
    }
    return this.principalId;
  }

  public canonicalUser(): string {
    if (this.principalType !== "CanonicalUser") {
      throw new Error(
        "Principal is not a canonical user principal, call isCanonicalUserPrincipal() before calling canonicalUser()"
      );
    }
    return this.principalId;
  }
}
