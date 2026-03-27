/**
 * Immutable snapshot helpers for public read-side returns.
 *
 * Public materialization APIs should return detached snapshots that behave as
 * read-only values for normal callers. Plain `Object.freeze()` is insufficient
 * for `Map` and `Set`, so these helpers clone nested structures and wrap
 * collection mutators with throwing facades.
 *
 * @module domain/services/ImmutableSnapshot
 */

/** @typedef {import('./JoinReducer.js').WarpStateV5} WarpStateV5 */

const MAP_MUTATORS = new Set(['set', 'delete', 'clear']);
const SET_MUTATORS = new Set(['add', 'delete', 'clear']);

/**
 * @param {'Map'|'Set'} kind
 * @param {string} method
 * @returns {TypeError}
 */
function createReadonlyMutationError(kind, method) {
  return new TypeError(`${kind} snapshot is read-only; ${method}() is not allowed`);
}

/**
 * @template {Map<unknown, unknown>|Set<unknown>} T
 * @param {T} target
 * @param {Set<string>} mutators
 * @param {'Map'|'Set'} kind
 * @returns {T}
 */
function createReadonlyCollectionProxy(target, mutators, kind) {
  const proxy = new Proxy(target, {
    get(innerTarget, prop) {
      if (typeof prop === 'string' && mutators.has(prop)) {
        return () => {
          throw createReadonlyMutationError(kind, prop);
        };
      }

      const value = Reflect.get(innerTarget, prop, innerTarget);
      return typeof value === 'function' ? value.bind(innerTarget) : value;
    },
    set() {
      throw createReadonlyMutationError(kind, 'set');
    },
    defineProperty() {
      throw createReadonlyMutationError(kind, 'defineProperty');
    },
    deleteProperty() {
      throw createReadonlyMutationError(kind, 'deleteProperty');
    },
  });

  return /** @type {T} */ (Object.freeze(proxy));
}

/**
 * @template T
 * @param {Map<unknown, unknown>} value
 * @param {WeakMap<object, unknown>} seen
 * @returns {T}
 */
function cloneImmutableMap(value, seen) {
  const cloned = new Map();
  const proxy = createReadonlyCollectionProxy(cloned, MAP_MUTATORS, 'Map');
  seen.set(value, proxy);
  for (const [key, entryValue] of value.entries()) {
    cloned.set(
      cloneImmutableValue(key, seen),
      cloneImmutableValue(entryValue, seen),
    );
  }
  return /** @type {T} */ (proxy);
}

/**
 * @template T
 * @param {Set<unknown>} value
 * @param {WeakMap<object, unknown>} seen
 * @returns {T}
 */
function cloneImmutableSet(value, seen) {
  const cloned = new Set();
  const proxy = createReadonlyCollectionProxy(cloned, SET_MUTATORS, 'Set');
  seen.set(value, proxy);
  for (const entryValue of value.values()) {
    cloned.add(cloneImmutableValue(entryValue, seen));
  }
  return /** @type {T} */ (proxy);
}

/**
 * @template T
 * @param {unknown[]} value
 * @param {WeakMap<object, unknown>} seen
 * @returns {T}
 */
function cloneImmutableArray(value, seen) {
  const cloned = /** @type {unknown[]} */ ([]);
  seen.set(value, cloned);
  for (const entryValue of value) {
    cloned.push(cloneImmutableValue(entryValue, seen));
  }
  return /** @type {T} */ (Object.freeze(cloned));
}

/**
 * @template T
 * @param {object} value
 * @param {WeakMap<object, unknown>} seen
 * @returns {T}
 */
function cloneImmutableObject(value, seen) {
  const cloned = Object.create(Object.getPrototypeOf(value) || Object.prototype);
  seen.set(value, cloned);

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) {
      continue;
    }

    if ('value' in descriptor) {
      descriptor.value = cloneImmutableValue(descriptor.value, seen);
    }

    Object.defineProperty(cloned, key, descriptor);
  }

  return /** @type {T} */ (Object.freeze(cloned));
}

/**
 * @template T
 * @param {T} value
 * @param {WeakMap<object, unknown>} seen
 * @returns {T}
 */
function cloneImmutableValue(value, seen) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return /** @type {T} */ (seen.get(value));
  }

  if (value instanceof Map) {
    return cloneImmutableMap(value, seen);
  }

  if (value instanceof Set) {
    return cloneImmutableSet(value, seen);
  }

  if (Array.isArray(value)) {
    return cloneImmutableArray(value, seen);
  }

  return cloneImmutableObject(value, seen);
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function createImmutableValue(value) {
  return cloneImmutableValue(value, new WeakMap());
}

/**
 * @param {WarpStateV5} state
 * @returns {WarpStateV5}
 */
export function createImmutableWarpStateV5(state) {
  return createImmutableValue(state);
}
