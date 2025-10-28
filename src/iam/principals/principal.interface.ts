export type PrincipalType = "AWS" | "Service" | "Federated" | "CanonicalUser";

/**
 * A Principal in a policy statement
 */
export interface Principal {
  /**
   * The type of principal, such as "AWS", "Service", "Federated", "CanonicalUser"
   */
  type(): PrincipalType;

  /**
   * The raw string of the principal
   */
  value(): string;

  /**
   * Whether the principal is a wildcard principal: `"*"`
   */
  isWildcardPrincipal(): this is WildcardPrincipal;

  /**
   * Whether the principal is an AWS principal
   */
  isServicePrincipal(): this is ServicePrincipal;

  /**
   * Whether the principal is an AWS principal that is not an account or wildcard principal
   */
  isAwsPrincipal(): this is AwsPrincipal;

  /**
   * Whether the principal is a unique id principal
   */
  isUniqueIdPrincipal(): this is UniqueIdPrincipal;

  /**
   * Whether the principal is a federated principal
   */
  isFederatedPrincipal(): this is FederatedPrincipal;

  /**
   * Whether the principal is a canonical user principal
   */
  isCanonicalUserPrincipal(): this is CanonicalUserPrincipal;

  /**
   * Whether the principal is an account principal
   */
  isAccountPrincipal(): this is AccountPrincipal;
}

/**
 * A wildcard principal: `"*"`
 */
export interface WildcardPrincipal extends Principal {
  /**
   * The wildcard character `"*"`, this exists to differentiate between this interface and the Principal interface
   */
  wildcard(): "*";
}

/**
 * An AWS principal: `"arn:aws:iam::account-id:root"` or a 12 digit account id
 */
export interface AccountPrincipal extends Principal {
  /**
   * The 12 digit account id of the principal
   */
  accountId(): string | undefined;
}

/**
 * An AWS principal this is an ARN that is not an account or wildcard principal
 */
export interface AwsPrincipal extends Principal {
  arn(): string;
}

/**
 * An AWS principal that is a unique Id
 * https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_identifiers.html#identifiers-unique-ids
 */
export interface UniqueIdPrincipal extends Principal {
  uniqueId(): string;
}

/**
 * An AWS principal that is a service principal: `"service"`
 */
export interface ServicePrincipal extends Principal {
  /**
   * The service the principal represents
   */
  service(): string;
}

/**
 * A federated principal
 */
export interface FederatedPrincipal extends Principal {
  /**
   * The id of the federated principal
   */
  federated(): string;
}

/**
 * A canonical user principal
 */
export interface CanonicalUserPrincipal extends Principal {
  /**
   * The canonical user id of the principal
   */
  canonicalUser(): string;
}
