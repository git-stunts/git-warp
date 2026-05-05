import WarpError from '../errors/WarpError.ts';

/**
 * Calls an inherited internal WarpRuntime method even when a public facade
 * prototype shadows the same legacy name with a removal shim.
 *
 * This keeps `WarpCore` free to reject old public `Strand*` calls while
 * still letting the substrate internals route through the underlying runtime
 * implementation.
 */
export async function callInternalRuntimeMethod<T>(target: object, methodName: string, ...args: unknown[]): Promise<T> { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  const candidate = resolveCandidate(target, methodName);
  if (!isCallable<T>(candidate)) {
    throw new WarpError(`missing internal runtime method: ${methodName}`, 'E_NOT_IMPLEMENTED');
  }

  const boundCandidate = candidate.bind(target);
  return await boundCandidate(...args);
}

/**
 * Narrows an unknown method candidate to a callable shape. // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
 */
function isCallable<T>(value: unknown): value is (...args: unknown[]) => Promise<T> | T { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return typeof value === 'function';
}

/**
 * Safely retrieves Object.getPrototypeOf as a typed record or null.
 */
function safeProto(obj: object | null): Record<string, unknown> | null { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (obj === null || obj === undefined) {
    return null;
  }
  const raw: unknown = Object.getPrototypeOf(obj); // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (raw === null || raw === undefined) {
    return null;
  }
  return raw as Record<string, unknown>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}

/**
 * Checks whether a prototype record owns the given method name.
 */
function protoOwns(proto: Record<string, unknown> | null, name: string): boolean { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return proto !== null && Object.prototype.hasOwnProperty.call(proto, name);
}

/**
 * Resolves the method candidate by walking the prototype chain.
 *
 * If the immediate prototype owns `methodName` AND the grandparent also owns it,
 * the grandparent version is preferred (skipping a facade shim).
 */
function resolveCandidate(target: object, methodName: string): unknown { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  const targetRecord = target as Record<string, unknown>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  const proto = safeProto(target);
  const grandparent = proto !== null ? safeProto(proto as object) : null;

  if (protoOwns(proto, methodName) && protoOwns(grandparent, methodName)) {
    return grandparent![methodName];
  }
  return targetRecord[methodName];
}
