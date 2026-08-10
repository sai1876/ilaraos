/**
 * Checks if a value is a plain JavaScript object.
 * This ensures we don't accidentally mutate or destroy class instances 
 * like Firestore Timestamp, FieldValue, DocumentReference, Date, Buffer, etc.
 */
export function isPlainObject(value: any): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

/**
 * Recursively removes `undefined` properties from plain objects and arrays.
 * Preserves `false`, `0`, `""`, and `null`.
 * Leaves non-plain objects (like Firestore Timestamps) untouched.
 */
export function stripUndefinedDeep<T>(obj: T): T {
  if (Array.isArray(obj)) {
    const arr: any[] = [];
    for (let i = 0; i < obj.length; i++) {
      if (obj[i] !== undefined) {
        arr.push(stripUndefinedDeep(obj[i]));
      }
    }
    return arr as unknown as T;
  }

  if (isPlainObject(obj)) {
    const res: any = {};
    for (const key of Object.keys(obj as any)) {
      const val = (obj as any)[key];
      if (val !== undefined) {
        res[key] = stripUndefinedDeep(val);
      }
    }
    return res as T;
  }

  // Primitives, null, and non-plain objects (e.g. Timestamp, Buffer) pass through
  return obj;
}
