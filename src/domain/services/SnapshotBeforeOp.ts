/** Pre-op snapshot bag used to compute post-op diffs. */
import type { PropValue } from '../types/PropValue.ts';

export type SnapshotBeforeOp = {
  nodeWasAlive?: boolean;
  edgeWasAlive?: boolean;
  edgeKey?: string;
  prevPropValue?: PropValue | undefined;
  propKey?: string;
  aliveBeforeNodes?: Set<string>;
  aliveBeforeEdges?: Set<string>;
};
