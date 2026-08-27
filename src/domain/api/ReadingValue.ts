import type {
  SnapshotPropRecord,
  SnapshotPropValue,
} from '../services/snapshot/SnapshotPropValue.ts';
import type EntityAdmission from './EntityAdmission.ts';
import type GraphNeighborhoodChart from './GraphNeighborhoodChart.ts';
import type GraphNeighborhoodEdge from './GraphNeighborhoodEdge.ts';

export type ReadingDomainObject = EntityAdmission | GraphNeighborhoodChart | GraphNeighborhoodEdge;

export type ReadingValueObject = SnapshotPropRecord<ReadingDomainObject> | ReadingDomainObject;

/**
 * Public immutable values that an Observer may emit.
 *
 * Runtime-backed domain readings are named explicitly. They do not impersonate
 * property dictionaries merely to satisfy the recursive snapshot algebra.
 */
export type ReadingValue = SnapshotPropValue<ReadingDomainObject>;
