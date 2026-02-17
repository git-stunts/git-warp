/**
 * Prototype wiring helper for WarpGraph method extraction.
 *
 * Assigns exported functions from `*.methods.js` modules onto a class
 * prototype, with duplicate-name detection at import time.
 *
 * @module domain/warp/_wire
 */

/**
 * Wires exported functions from method modules onto a class prototype.
 *
 * Each module is expected to export named functions. The function names
 * become method names on the prototype. Duplicates across modules are
 * detected eagerly and throw at import time (not at call time).
 *
 * @param {Function} Class - The class constructor whose prototype to extend
 * @param {Array<Record<string, Function>>} methodModules - Array of method module namespace objects
 * @throws {Error} If a method name appears in more than one module
 */
export function wireWarpMethods(Class, methodModules) {
  /** @type {Map<string, string>} name → source module index (for error messages) */
  const seen = new Map();
  const existing = new Set(Object.getOwnPropertyNames(Class.prototype));

  for (let i = 0; i < methodModules.length; i++) {
    const mod = methodModules[i];
    for (const [name, fn] of Object.entries(mod)) {
      if (typeof fn !== 'function') {
        continue;
      }

      if (existing.has(name)) {
        throw new Error(
          `wireWarpMethods: method "${name}" already exists on ${Class.name}.prototype — ` +
          `attempted to overwrite from module index ${i}`
        );
      }

      if (seen.has(name)) {
        throw new Error(
          `wireWarpMethods: duplicate method "${name}" — ` +
          `already defined in module index ${seen.get(name)}, ` +
          `attempted again in module index ${i}`
        );
      }

      seen.set(name, String(i));

      Object.defineProperty(Class.prototype, name, {
        value: fn,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }
  }
}
