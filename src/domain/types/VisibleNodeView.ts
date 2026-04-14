import type { ContentMeta } from './ContentMeta.ts';
import type { VisibleStateNeighbor } from './VisibleStateNeighbor.ts';

/**
 * Node-local view from visible state: properties, neighbors, and content metadata.
 */
export type VisibleNodeView = {
  nodeId: string;
  props: Record<string, unknown>;
  outgoing: VisibleStateNeighbor[];
  incoming: VisibleStateNeighbor[];
  content: ContentMeta | null;
};
