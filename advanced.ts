/**
 * Formal bounded-reading API for expert consumers.
 *
 * Capture a `Coordinate` from a public `Lane` with `captureCoordinate()`,
 * then lower reads through its executable `Optic`. A successful read carries
 * a type-only `Witness` through the root receipt evidence contract.
 */

export { default as captureCoordinate } from './src/domain/api/captureCoordinate.ts';
export { default as Coordinate } from './src/domain/WarpWorldlineCoordinate.ts';
export { default as Optic } from './src/domain/services/optic/WorldlineOptic.ts';
export type { WarpWorldlineCoordinateFrontierEntry } from './src/domain/WarpWorldlineCoordinate.ts';
export type { NeighborhoodOpticReadOptions } from './src/domain/services/optic/NeighborhoodOptic.ts';
export type {
  NeighborhoodOpticCompleteness,
  NeighborhoodOpticEdge,
  NeighborhoodOpticReadDirection,
} from './src/domain/services/optic/NeighborhoodOpticReadResult.ts';
export type {
  default as Witness,
  ReadIdentityFrontierEntry,
  ReadIdentityIndexShard,
  ReadIdentityOptions,
  ReadIdentityTailWitness,
} from './src/domain/services/optic/ReadIdentity.ts';
