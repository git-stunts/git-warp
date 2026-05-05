import type ImmutableBytes from './ImmutableBytes.ts';

/**
 * Recursive public property-value algebra for immutable snapshots.
 *
 * The object branch is a property-value dictionary branch, not an entity
 * model and not an arbitrary domain bag. Domain entities still require
 * explicit runtime-backed classes.
 */
export type SnapshotPropValue =
  | string
  | number
  | boolean
  | null
  | ImmutableBytes
  | readonly SnapshotPropValue[]
  | { readonly [key: string]: SnapshotPropValue };
