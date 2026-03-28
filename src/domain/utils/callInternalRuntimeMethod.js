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
  const targetRecord = /** @type {Record<string, unknown>} */ (target);
  const prototype = Object.getPrototypeOf(target);
  const inheritedPrototype = prototype ? Object.getPrototypeOf(prototype) : null;
  const candidate =
    prototype
      && Object.prototype.hasOwnProperty.call(prototype, methodName)
      && inheritedPrototype
      && Object.prototype.hasOwnProperty.call(inheritedPrototype, methodName)
      ? /** @type {Record<string, unknown>} */ (inheritedPrototype)[methodName]
      : targetRecord[methodName];

  if (typeof candidate !== 'function') {
    throw new TypeError(`missing internal runtime method: ${methodName}`);
  }

  return await candidate.call(target, ...args);
}
