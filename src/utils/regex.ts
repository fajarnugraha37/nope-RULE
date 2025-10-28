export function isAllWildcards(value: string): boolean {
  return value.match(/^\*+$/) !== null;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function wildcardToRegExp(value: string): RegExp {
  const escaped = escapeRegExp(value).replace(/\\\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export function extractNamedGroups(
  regex: RegExp,
  value: string
): Record<string, string> | null {
  const match = regex.exec(value);
  if (match && match.groups) {
    return match.groups;
  }
  return null;
}
