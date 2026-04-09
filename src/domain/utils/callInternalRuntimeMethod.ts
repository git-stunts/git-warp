import WarpError from '../errors/WarpError.ts';

/**
 * Calls an inherited internal WarpRuntime method even when a public facade
 * prototype shadows the same legacy name with a removal shim.
 *
 * This keeps `WarpCore` free to reject old public `Strand*` calls while
 * still letting the substrate internals route through the underlying runtime
 * implementation.
 */
export async function callInternalRuntimeMethod<T>(target: object, methodName: string, ...args: unknown[]): Promise<T> {
  const candidate = resolveCandidate(target, methodName);
  if (!isCallable<T>(candidate)) {
    throw new WarpError(`missing internal runtime method: ${methodName}`, 'E_NOT_IMPLEMENTED');
  }

  const boundCandidate = candidate.bind(target);
  return await boundCandidate(...args);
}

/**
 * Narrows an unknown method candidate to a callable shape.
 */
function isCallable<T>(value: unknown): value is (...args: unknown[]) => Promise<T> | T {
  return typeof value === 'function';
}

/**
 * Safely retrieves Object.getPrototypeOf as a typed record or null.
 */
function safeProto(obj: object | null): Record<string, unknown> | null {
  if (obj === null || obj === undefined) {
    return null;
  }
  const raw: unknown = Object.getPrototypeOf(obj);
  if (raw === null || raw === undefined) {
    return null;
  }
  return raw as Record<string, unknown>;
}

/**
 * Checks whether a prototype record owns the given method name.
 */
function protoOwns(proto: Record<string, unknown> | null, name: string): boolean {
  return proto !== null && Object.prototype.hasOwnProperty.call(proto, name);
}

/**
 * Resolves the method candidate by walking the prototype chain.
 *
 * If the immediate prototype owns `methodName` AND the grandparent also owns it,
 * the grandparent version is preferred (skipping a facade shim).
 */
function resolveCandidate(target: object, methodName: string): unknown {
  const targetRecord = target as Record<string, unknown>;
  const proto = safeProto(target);
  const grandparent = proto !== null ? safeProto(proto as object) : null;

  if (protoOwns(proto, methodName) && protoOwns(grandparent, methodName)) {
    return grandparent![methodName];
  }
  return targetRecord[methodName];
}
