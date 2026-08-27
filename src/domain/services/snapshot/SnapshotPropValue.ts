import type ImmutableBytes from './ImmutableBytes.ts';

export type SnapshotPropRecord<TDomainValue = never> = Readonly<{
  readonly [key: string]: SnapshotPropValue<TDomainValue>;
}>;

/**
 * Recursive public property-value algebra for immutable snapshots.
 *
 * The object branch is a property-value dictionary branch, not an entity
 * model and not an arbitrary domain bag. Domain entities still require
 * explicit runtime-backed classes.
 */
export type SnapshotPropValue<TDomainValue = never> =
  | string
  | number
  | boolean
  | null
  | ImmutableBytes
  | TDomainValue
  | readonly SnapshotPropValue<TDomainValue>[]
  | SnapshotPropRecord<TDomainValue>;
