import type WorldlineOptic from '../services/optic/WorldlineOptic.ts';
import type Lane from './Lane.ts';
import { requireLaneRuntime } from './LaneRuntime.ts';

/**
 * Opens a bounded optic over a public Lane at the live frontier.
 *
 * The optic is the read/write handle for a lane. It carries its own observer
 * geometry — coordinate, aperture, basis and evidence postures, plus a per-read
 * support rule — and materializes only the causal structure inside its
 * aperture. The default aperture is the live frontier ("now"); widen or move the
 * aperture to read the past. Callers never name a checkpoint, a coordinate, or
 * the graph itself: `Optic(lane).node(id).prop(key).read()`.
 */
export default function Optic(lane: Lane): WorldlineOptic {
  return requireLaneRuntime(lane).optic();
}
