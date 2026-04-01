/**
 * Calls an inherited internal WarpRuntime method even when a public facade
 * prototype shadows the same legacy name with a removal shim.
 *
 * This keeps `WarpCore` free to reject old public `Strand*` calls while
 * still letting the substrate internals route through the underlying runtime
 * implementation.
 *
 * @param {object} target
 * @param {string} methodName
 * @param {...unknown} args
 * @returns {Promise<unknown>}
 */
export async function callInternalRuntimeMethod(target, methodName, ...args) {
  const candidate = resolveCandidate(target, methodName);

  if (typeof candidate !== 'function') {
    throw new TypeError(`missing internal runtime method: ${methodName}`);
  }

  /** @type {unknown} */
  const result = await candidate.call(target, ...args);
  return result;
}

/**
 * Safely retrieves Object.getPrototypeOf as a typed record or null.
 *
 * @param {object|null} obj
 * @returns {Record<string, unknown>|null}
 */
function safeProto(obj) {
  if (obj === null || obj === undefined) {
    return null;
  }
  /** @type {unknown} */
  const raw = Object.getPrototypeOf(obj);
  if (raw === null || raw === undefined) {
    return null;
  }
  return /** @type {Record<string, unknown>} */ (raw);
}

/**
 * Checks whether a prototype record owns the given method name.
 *
 * @param {Record<string, unknown>|null} proto
 * @param {string} name
 * @returns {boolean}
 */
function protoOwns(proto, name) {
  return proto !== null && Object.prototype.hasOwnProperty.call(proto, name);
}

/**
 * Resolves the method candidate by walking the prototype chain.
 *
 * If the immediate prototype owns `methodName` AND the grandparent also owns it,
 * the grandparent version is preferred (skipping a facade shim).
 *
 * @param {object} target
 * @param {string} methodName
 * @returns {unknown}
 */
function resolveCandidate(target, methodName) {
  const targetRecord = /** @type {Record<string, unknown>} */ (target);
  const proto = safeProto(target);
  const grandparent = proto !== null ? safeProto(/** @type {object} */ (proto)) : null;

  if (protoOwns(proto, methodName) && protoOwns(grandparent, methodName)) {
    return /** @type {Record<string, unknown>} */ (grandparent)[methodName];
  }
  return targetRecord[methodName];
}
