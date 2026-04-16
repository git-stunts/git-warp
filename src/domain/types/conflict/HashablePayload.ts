/**
 * HashablePayload — structural value tree accepted by the conflict
 * analyzer's canonical-JSON hasher.
 *
 * The hasher canonicalizes a value tree (object with sorted keys,
 * arrays in order, primitive leaves) and digests the canonical
 * string. This type documents the legal shape of values that may
 * travel through `_hash`: primitives, nested arrays, nested plain
 * objects, and already-constructed domain classes whose enumerable
 * readonly fields satisfy the same constraint.
 *
 * This is an intentionally structural type rather than a runtime-
 * backed class: a hashable payload has no identity, no invariants
 * beyond structural shape, and no behavior. It is a wire-side
 * description of what the hasher can consume.
 *
 * The `HashableObject` shape uses `object` (non-primitive, non-null)
 * rather than an index signature so that class instances with
 * declared `readonly` fields (e.g. `ConflictAnchor`,
 * `ConflictReceiptRef`, `ConflictResolvedCoordinate`) satisfy the
 * constraint structurally. `canonicalStringify` walks enumerable
 * own keys regardless of whether the value is a class instance or
 * a plain object.
 *
 * @module domain/types/conflict/HashablePayload
 */

/**
 * Primitive leaves accepted by the canonical JSON hasher.
 */
export type HashablePrimitive = string | number | boolean | null;

/**
 * Any non-primitive, non-null object whose enumerable fields
 * canonicalize to JSON. This admits plain records as well as
 * frozen domain class instances.
 */
export type HashableObject = object;

/**
 * An array of hashable payloads.
 */
export type HashableArray = readonly HashablePayload[];

/**
 * A value acceptable as input to the conflict-analyzer hash.
 *
 * Matches the strict JSON data model: primitive leaves, arrays,
 * and objects (plain or class-instance). `undefined` is not
 * hashable at the top level — `canonicalStringify` elides it from
 * object values and normalizes it to `null` at the array position.
 */
export type HashablePayload = HashablePrimitive | HashableObject | HashableArray;
