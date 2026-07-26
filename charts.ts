/**
 * Bounded graph-shaped observations.
 *
 * Charts are derived views over a Lane, never a mutable graph store or durable
 * ontology. Each builder returns a validated Observer that emits canonical
 * `Reading.value` data.
 */

export { graph } from './src/domain/api/GraphChartObservers.ts';
export type {
  GraphChartObservers,
  GraphNeighborhoodChart,
  GraphNeighborhoodEdge,
  GraphNeighborhoodOptions,
} from './src/domain/api/GraphChartObservers.ts';
