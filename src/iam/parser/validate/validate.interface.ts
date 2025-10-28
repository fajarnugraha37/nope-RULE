export interface ValidationError {
  message: string;
  path: string;
}

export type PolicyDataType = "string" | "object";

export interface ValidationCallbacks {
  validateVersion?: (version: any, path: string) => ValidationError[];
  validateStatement?: (statement: any, path: string) => ValidationError[];
  validateAction?: (action: string, path: string) => ValidationError[];
  validateNotAction?: (notAction: string, path: string) => ValidationError[];
  validatePrincipal?: (principal: any, path: string) => ValidationError[];
  validateNotPrincipal?: (notPrincipal: any, path: string) => ValidationError[];
  validateResource?: (resource: string, path: string) => ValidationError[];
  validateNotResource?: (
    notResource: string,
    path: string
  ) => ValidationError[];
}
