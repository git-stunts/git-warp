/**
 * Prototype wiring helper for WarpRuntime method extraction.
 *
 * Assigns exported functions from `*.methods.js` modules onto a class
 * prototype, with duplicate-name detection at import time.
 *
 * @module domain/warp/_wire
 */

/**
 * @typedef {{
 *   existing: Set<string>,
 *   seen: Map<string, string>,
 *   className: string
 * }} CollisionContext
 */

/**
 * Validates that a method name does not collide with existing prototype
 * methods or previously wired methods from another module.
 *
 * @param {string} name - Method name to validate
 * @param {CollisionContext} ctx - Collision detection context
 * @param {number} moduleIndex - Current module index for error messages
 */
function assertNoCollision(name, ctx, moduleIndex) {
  if (ctx.existing.has(name)) {
    throw new Error(
      `wireWarpMethods: method "${name}" already exists on ${ctx.className}.prototype — ` +
      `attempted to overwrite from module index ${moduleIndex}`
    );
  }

  if (ctx.seen.has(name)) {
    throw new Error(
      `wireWarpMethods: duplicate method "${name}" — ` +
      `already defined in module index ${ctx.seen.get(name)}, ` +
      `attempted again in module index ${moduleIndex}`
    );
  }
}

/**
 * Wires exported functions from method modules onto a class prototype.
 *
 * Each module is expected to export named functions. The function names
 * become method names on the prototype. Duplicates across modules are
 * detected eagerly and throw at import time (not at call time).
 *
 * @param {{ prototype: object, name: string }} Class - The class constructor whose prototype to extend
 * @param {Array<Record<string, unknown>>} methodModules - Array of method module namespace objects
 * @throws {Error} If a method name appears in more than one module
 */
export function wireWarpMethods(Class, methodModules) {
  /** @type {CollisionContext} */
  const ctx = {
    existing: new Set(Object.getOwnPropertyNames(Class.prototype)),
    seen: new Map(),
    className: Class.name,
  };

  for (let i = 0; i < methodModules.length; i++) {
    const mod = methodModules[i];
    for (const [name, fn] of Object.entries(mod)) {
      if (typeof fn !== 'function') {
        continue;
      }

      assertNoCollision(name, ctx, i);
      ctx.seen.set(name, String(i));

      Object.defineProperty(Class.prototype, name, {
        value: fn,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }
  }
}
