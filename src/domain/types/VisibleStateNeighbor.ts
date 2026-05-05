/**
 * Neighbor entry from visible state: target node, edge label, and direction.
 */
export type VisibleStateNeighbor = {
  nodeId: string;
  label: string;
  direction: 'outgoing' | 'incoming';
};
