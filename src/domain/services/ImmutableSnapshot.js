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

import VersionVector from '../crdt/VersionVector.ts';

/** @typedef {import('./JoinReducer.ts').WarpStateV5} WarpStateV5 */

const MAP_MUTATORS = new Set(['set', 'delete', 'clear']);
const SET_MUTATORS = new Set(['add', 'delete', 'clear']);

/**
 * Build a TypeError for attempts to mutate a read-only collection snapshot.
 * @param {'Map'|'Set'} kind
 * @param {string} method
 * @returns {TypeError}
 */
function createReadonlyMutationError(kind, method) {
  return new TypeError(`${kind} snapshot is read-only; ${method}() is not allowed`);
}

/**
 * Wrap a Map or Set in a Proxy that throws on any mutation attempt.
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

      const val = /** @type {unknown} */ (Reflect.get(innerTarget, prop, innerTarget));
      return /** @type {unknown} */ (typeof val === 'function' ? /** @type {Function} */ (val).bind(innerTarget) : val);
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
 * Deep-clone a Map into a read-only snapshot with immutable entries.
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
 * Deep-clone a Set into a read-only snapshot with immutable entries.
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
 * Deep-clone an array into a frozen snapshot with immutable entries.
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
 * Deep-clone a plain object into a frozen snapshot with immutable properties.
 * @template T
 * @param {object} value
 * @param {WeakMap<object, unknown>} seen
 * @returns {T}
 */
function cloneImmutableObject(value, seen) {
  /** @type {unknown} */
  const rawProto = Object.getPrototypeOf(value);
  const proto = /** @type {object | null} */ (rawProto);
  /** @type {unknown} */
  const rawCloned = Object.create(proto ?? Object.prototype);
  const cloned = /** @type {Record<string | symbol, unknown>} */ (rawCloned);
  seen.set(value, cloned);

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) {
      continue;
    }

    if ('value' in descriptor) {
      /** @type {PropertyDescriptor} */ (descriptor).value = cloneImmutableValue(/** @type {unknown} */ (descriptor.value), seen);
    }

    Object.defineProperty(cloned, key, descriptor);
  }

  return /** @type {T} */ (/** @type {unknown} */ (Object.freeze(cloned)));
}

/**
 * Dispatch an object value to the appropriate collection-specific cloner.
 * @template T
 * @param {T & object} value - Non-null object value
 * @param {WeakMap<object, unknown>} seen - Cycle-detection cache
 * @returns {T}
 */
function cloneImmutableObjectValue(value, seen) {
  // VersionVector uses private fields that Object.create cannot replicate.
  // Clone via its own method and freeze the result.
  if (value instanceof VersionVector) {
    const cloned = value.clone();
    seen.set(value, cloned);
    return /** @type {typeof value} */ (Object.freeze(cloned));
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
 * Recursively clone a value into a deeply frozen immutable snapshot.
 * @template T
 * @param {T} value
 * @param {WeakMap<object, unknown>} seen
 * @returns {T}
 */
function cloneImmutableValue(value, seen) {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return /** @type {T} */ (seen.get(value));
  }

  return cloneImmutableObjectValue(value, seen);
}

/**
 * Create a deeply frozen immutable clone of the given value.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function createImmutableValue(value) {
  return cloneImmutableValue(value, new WeakMap());
}

/**
 * Create a deeply frozen immutable clone of a WarpStateV5 instance.
 * @param {WarpStateV5} state
 * @returns {WarpStateV5}
 */
export function createImmutableWarpStateV5(state) {
  return createImmutableValue(state);
}
