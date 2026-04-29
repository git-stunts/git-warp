import type { ContentMeta } from './ContentMeta.ts';
import type { SnapshotPropValue } from '../services/snapshot/SnapshotPropValue.ts';
import type { VisibleStateNeighbor } from './VisibleStateNeighbor.ts';

type VisibleNodeProperties = Readonly<{ [key: string]: SnapshotPropValue }>;

/**
 * Node-local view from visible state: properties, neighbors, and content metadata.
 */
export type VisibleNodeView = {
  nodeId: string;
  props: VisibleNodeProperties;
  outgoing: VisibleStateNeighbor[];
  incoming: VisibleStateNeighbor[];
  content: ContentMeta | null;
};
