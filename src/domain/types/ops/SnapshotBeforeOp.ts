/** Pre-op snapshot bag used to compute post-op diffs. */
export type SnapshotBeforeOp = {
  nodeWasAlive?: boolean;
  edgeWasAlive?: boolean;
  edgeKey?: string;
  prevPropValue?: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  propKey?: string;
  aliveBeforeNodes?: Set<string>;
  aliveBeforeEdges?: Set<string>;
};
