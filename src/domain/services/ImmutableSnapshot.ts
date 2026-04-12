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
import WarpError from '../errors/WarpError.ts';
import type WarpState from './state/WarpState.ts';

const MAP_MUTATORS = new Set(['set', 'delete', 'clear']);
const SET_MUTATORS = new Set(['add', 'delete', 'clear']);

/**
 * Build a domain error for attempts to mutate a read-only collection snapshot.
 */
function createReadonlyMutationError(kind: 'Map' | 'Set', method: string): WarpError {
  return new WarpError(
    `${kind} snapshot is read-only; ${method}() is not allowed`,
    'E_IMMUTABLE_SNAPSHOT_MUTATION',
    { context: { kind, method } },
  );
}

/**
 * Wrap a Map or Set in a Proxy that throws on any mutation attempt.
 */
function createReadonlyCollectionProxy<T extends Map<unknown, unknown> | Set<unknown>>(
  target: T,
  mutators: Set<string>,
  kind: 'Map' | 'Set',
): T {
  const proxy = new Proxy(target, {
    get(innerTarget, prop) {
      if (typeof prop === 'string' && mutators.has(prop)) {
        return () => {
          throw createReadonlyMutationError(kind, prop);
        };
      }

      const val = Reflect.get(innerTarget, prop, innerTarget) as unknown;
      return typeof val === 'function' ? (val as (...args: unknown[]) => unknown).bind(innerTarget) : val;
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

  return Object.freeze(proxy) as T;
}

/**
 * Deep-clone a Map into a read-only snapshot with immutable entries.
 */
function cloneImmutableMap<T>(value: Map<unknown, unknown>, seen: WeakMap<object, unknown>): T {
  const cloned = new Map<unknown, unknown>();
  const proxy = createReadonlyCollectionProxy(cloned, MAP_MUTATORS, 'Map');
  seen.set(value, proxy);
  for (const [key, entryValue] of value.entries()) {
    cloned.set(
      cloneImmutableValue(key, seen),
      cloneImmutableValue(entryValue, seen),
    );
  }
  return proxy as T;
}

/**
 * Deep-clone a Set into a read-only snapshot with immutable entries.
 */
function cloneImmutableSet<T>(value: Set<unknown>, seen: WeakMap<object, unknown>): T {
  const cloned = new Set<unknown>();
  const proxy = createReadonlyCollectionProxy(cloned, SET_MUTATORS, 'Set');
  seen.set(value, proxy);
  for (const entryValue of value.values()) {
    cloned.add(cloneImmutableValue(entryValue, seen));
  }
  return proxy as T;
}

/**
 * Deep-clone an array into a frozen snapshot with immutable entries.
 */
function cloneImmutableArray<T>(value: unknown[], seen: WeakMap<object, unknown>): T {
  const cloned: unknown[] = [];
  seen.set(value, cloned);
  for (const entryValue of value) {
    cloned.push(cloneImmutableValue(entryValue, seen));
  }
  return Object.freeze(cloned) as T;
}

/**
 * Deep-clone a plain object into a frozen snapshot with immutable properties.
 */
function cloneImmutableObject<T>(value: object, seen: WeakMap<object, unknown>): T {
  const proto = Object.getPrototypeOf(value) as object | null;
  const cloned = Object.create(proto ?? Object.prototype) as Record<string | symbol, unknown>;
  seen.set(value, cloned);

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) {
      continue;
    }

    if ('value' in descriptor) {
      descriptor.value = cloneImmutableValue(descriptor.value as unknown, seen);
    }

    Object.defineProperty(cloned, key, descriptor);
  }

  return Object.freeze(cloned) as unknown as T;
}

/**
 * Dispatch an object value to the appropriate collection-specific cloner.
 */
function cloneImmutableObjectValue<T extends object>(value: T, seen: WeakMap<object, unknown>): T {
  // VersionVector uses private fields that Object.create cannot replicate.
  // Clone via its own method and freeze the result.
  if (value instanceof VersionVector) {
    const cloned = value.clone();
    seen.set(value, cloned);
    return Object.freeze(cloned) as typeof value;
  }

  if (value instanceof Map) {
    return cloneImmutableMap(value, seen);
  }

  if (value instanceof Set) {
    return cloneImmutableSet(value, seen);
  }

  if (Array.isArray(value)) {
    return cloneImmutableArray(value as unknown[], seen);
  }

  return cloneImmutableObject(value, seen);
}

/**
 * Recursively clone a value into a deeply frozen immutable snapshot.
 */
function cloneImmutableValue<T>(value: T, seen: WeakMap<object, unknown>): T {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value as object)) {
    return seen.get(value as object) as T;
  }

  // After the typeof guard above, value is narrowed to T & object
  return cloneImmutableObjectValue(value, seen);
}

/**
 * Create a deeply frozen immutable clone of the given value.
 */
export function createImmutableValue<T>(value: T): T {
  return cloneImmutableValue(value, new WeakMap());
}

/**
 * Create a deeply frozen immutable clone of a WarpState instance.
 */
export function createImmutableWarpState(state: WarpState): WarpState {
  return createImmutableValue(state);
}
