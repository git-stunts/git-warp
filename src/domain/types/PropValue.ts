/**
 * PropValue — the set of values that can be stored in a CRDT property register.
 *
 * This is exactly what CBOR decode produces: JavaScript primitives,
 * binary data, and recursive compositions of the same. No domain
 * class instances live here — those are hydrated at decode boundaries.
 */
export type PropValue =
  | string
  | number
  | boolean
  | null
  | Uint8Array
  | PropValue[]
  | { [key: string]: PropValue };
