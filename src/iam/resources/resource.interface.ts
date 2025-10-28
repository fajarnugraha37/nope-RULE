/**
 * A resource string in an IAM policy
 */
export interface Resource {
  /**
   * The raw string of the resource
   */
  value(): string;

  /**
   * Whether the resource is all resources: `"*"`
   */
  isAllResources(): boolean;

  /**
   * Whether the resource is an ARN resource
   */
  isArnResource(): this is ArnResource;

  /**
   * The path to the resource in the policy document
   */
  path(): string;
}

export interface ArnResource extends Resource {
  /**
   * The partition of the ARN
   */
  partition(): string;

  /**
   * The service of the ARN
   */
  service(): string;

  /**
   * The region of the ARN
   */
  region(): string;

  /**
   * The account of the ARN
   */
  account(): string;

  /**
   * The resource of the ARN
   */
  resource(): string;
}
