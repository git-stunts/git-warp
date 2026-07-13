import type WarpWorldlineCoordinate from '../WarpWorldlineCoordinate.ts';
import type Timeline from './Timeline.ts';
import { requireTimelineRuntime } from './TimelineRuntime.ts';

/** Captures one bounded formal coordinate from a public timeline handle. */
export default async function captureCoordinate(
  timeline: Timeline
): Promise<WarpWorldlineCoordinate> {
  const runtime = requireTimelineRuntime(timeline);
  await runtime.prepareOpticBasis();
  return await runtime.coordinate();
}
