import ImmutableBytes from './ImmutableBytes.ts';

export type SnapshotPropValue =
  | string
  | number
  | boolean
  | null
  | ImmutableBytes
  | readonly SnapshotPropValue[]
  | { readonly [key: string]: SnapshotPropValue };
