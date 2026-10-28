import type ConeIngestOutcome from '../services/cone/ConeIngestOutcome.ts';
import type Lane from './Lane.ts';
import { requireLaneRuntime } from './LaneRuntime.ts';

/**
 * Advances a Lane's cone basis to its writers' tips (#1039) and answers what
 * the advance did: the patches it folded, that the basis was current, or
 * the obstruction that stopped it. Reads and writes advance on their own;
 * the bounded basis repair calls this to make the cost explicit.
 */
export default async function refreshLaneBasis(lane: Lane): Promise<ConeIngestOutcome> {
  return await requireLaneRuntime(lane).refreshBasis();
}
