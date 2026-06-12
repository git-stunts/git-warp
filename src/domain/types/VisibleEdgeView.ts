import type { SnapshotPropValue } from '../services/snapshot/SnapshotPropValue.ts';

type VisibleEdgeProperties = Readonly<{ [key: string]: SnapshotPropValue }>;

/**
 * Edge-local view from visible state: endpoints, label, and properties.
 */
export type VisibleEdgeView = {
  from: string;
  to: string;
  label: string;
  props: VisibleEdgeProperties;
};
