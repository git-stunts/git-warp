import type WarpWorldlineCoordinate from '../WarpWorldlineCoordinate.ts';
import type Lane from './Lane.ts';
import { requireLaneTimeline } from './LaneRuntime.ts';
import { requireTimelineRuntime } from './TimelineRuntime.ts';

/** Captures one bounded formal coordinate from a public Lane handle. */
export default async function captureCoordinate(
  lane: Lane
): Promise<WarpWorldlineCoordinate> {
  const timeline = requireLaneTimeline(lane);
  const runtime = requireTimelineRuntime(timeline);
  await runtime.prepareOpticBasis();
  return await runtime.coordinate();
}
