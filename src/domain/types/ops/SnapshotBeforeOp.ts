/** Pre-op snapshot bag used to compute post-op diffs. */
export type SnapshotBeforeOp = {
  nodeWasAlive?: boolean;
  edgeWasAlive?: boolean;
  edgeKey?: string;
  prevPropValue?: unknown;
  propKey?: string;
  aliveBeforeNodes?: Set<string>;
  aliveBeforeEdges?: Set<string>;
};
