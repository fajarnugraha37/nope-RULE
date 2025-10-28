import { promisify } from "util";

export function flattenObject(obj: any, parentKey = "", result: any = {}): any {
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const newKey = parentKey ? `${parentKey}.${key}` : key;
      if (typeof obj[key] === "object" && obj[key] !== null) {
        flattenObject(obj[key], newKey, result);
      } else {
        result[newKey] = obj[key];
      }
    }
  }
  return result;
}

export async function* flattenObjectStream(
  obj: any
): AsyncGenerator<{ key: string; value: any }> {
  async function* helper(
    currentObj: any,
    parentKey = ""
  ): AsyncGenerator<{ key: string; value: any }> {
    for (const key in currentObj) {
      if (currentObj.hasOwnProperty(key)) {
        const newKey = parentKey ? `${parentKey}.${key}` : key;
        if (typeof currentObj[key] === "object" && currentObj[key] !== null) {
          yield* helper(currentObj[key], newKey);
        } else {
          yield { key: newKey, value: currentObj[key] };
        }
      }
    }
  }
  yield* helper(obj);
}

export function unflattenObject(flatObj: any): any {
  const result: any = {};
  for (const key in flatObj) {
    if (flatObj.hasOwnProperty(key)) {
      const keys = key.split(".");
      keys.reduce((acc, curr, index) => {
        if (index === keys.length - 1) {
          acc[curr] = flatObj[key];
        } else {
          acc[curr] = acc[curr] || {};
        }
        return acc[curr];
      }, result);
    }
  }
  return result;
}

export function* unflattenObjectStream(
  flatObj: any
): Generator<{ path: string; value: any; isComplete: boolean }> {
  const result: any = {};
  const keys = Object.keys(flatObj);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key && flatObj.hasOwnProperty(key)) {
      const pathKeys = key.split(".");
      pathKeys.reduce((acc, curr, index) => {
        if (index === pathKeys.length - 1) {
          acc[curr] = flatObj[key];
        } else {
          acc[curr] = acc[curr] || {};
        }
        return acc[curr];
      }, result);

      yield {
        path: key,
        value: flatObj[key],
        isComplete: i === keys.length - 1,
      };
    }
  }

  return result;
}

export function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((current, key) => current?.[key], obj);
}

export function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  const lastKey = keys.pop()!;
  const target = keys.reduce((current, key) => {
    if (!(key in current) || typeof current[key] !== "object") {
      current[key] = {};
    }
    return current[key];
  }, obj);
  target[lastKey] = value;
}

export function hasNestedProperty(obj: any, path: string): boolean {
  return path.split(".").every((_, index, keys) => {
    const currentPath = keys.slice(0, index + 1).join(".");
    const value = getNestedValue(obj, currentPath);
    return value !== undefined;
  });
}

export function deleteNestedProperty(obj: any, path: string): boolean {
  const keys = path.split(".");
  const lastKey = keys.pop()!;
  const parent = keys.reduce((current, key) => current?.[key], obj);

  if (parent && typeof parent === "object" && lastKey in parent) {
    delete parent[lastKey];
    return true;
  }
  return false;
}

export function shallowClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return [...obj] as T;
  }
  return { ...obj } as T;
}

export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }
  if (obj instanceof RegExp) {
    return new RegExp(obj) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as T;
  }
  const cloned = {} as T;
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

export function structuredClone<T>(obj: T): T {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(obj);
  }
  return deepClone(obj);
}

export function merge<T extends Record<string, any>>(
  target: T,
  ...sources: Partial<T>[]
): T {
  const result = { ...target };
  for (const source of sources) {
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        const sourceValue = source[key];
        if (sourceValue !== undefined) {
          if (
            typeof sourceValue === "object" &&
            sourceValue !== null &&
            !Array.isArray(sourceValue) &&
            typeof result[key] === "object" &&
            result[key] !== null &&
            !Array.isArray(result[key])
          ) {
            result[key] = merge(result[key] as any, sourceValue);
          } else {
            result[key] = sourceValue as any;
          }
        }
      }
    }
  }
  return result;
}
