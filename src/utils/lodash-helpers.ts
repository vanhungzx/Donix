

export function omitBy<T extends Record<string, unknown>>(
  obj: T,
  predicate: (value: unknown, key: string) => boolean
): Partial<T> {
  const result: Partial<T> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (!predicate(obj[key], key)) {
        result[key] = obj[key];
      }
    }
  }
  return result;
}

export function isUndefined(value: unknown): boolean {
  return value === undefined;
}

export function isPlainObject(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  if (Object.getPrototypeOf(value) === null) return true;
  let proto = value;
  while (Object.getPrototypeOf(proto) !== null) {
    proto = Object.getPrototypeOf(proto);
  }
  return Object.getPrototypeOf(value) === proto;
}
