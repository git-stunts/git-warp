import type WarpWorldlineCoordinate from '../WarpWorldlineCoordinate.ts';
import type Lane from './Lane.ts';
import { requireLaneRuntime } from './LaneRuntime.ts';

/** Captures one bounded formal coordinate from a public Lane handle. */
export default async function captureCoordinate(
  lane: Lane
): Promise<WarpWorldlineCoordinate> {
  return await requireLaneRuntime(lane).captureCoordinate();
}
