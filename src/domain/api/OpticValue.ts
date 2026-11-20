import type ImmutableBytes from '../services/snapshot/ImmutableBytes.ts';

/** A property value as a reading carries it: immutable, and never a graph object. */
export type OpticValue =
  | string
  | number
  | boolean
  | null
  | ImmutableBytes
  | readonly OpticValue[]
  | { readonly [key: string]: OpticValue };
