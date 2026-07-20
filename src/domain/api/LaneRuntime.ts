import WarpError from '../errors/WarpError.ts';
import type Lane from './Lane.ts';
import type Timeline from './Timeline.ts';

const LANE_TIMELINES = new WeakMap<Lane, Timeline>();

export function bindLaneTimeline(lane: Lane, timeline: Timeline): void {
  if (LANE_TIMELINES.has(lane)) {
    throw new WarpError('Lane runtime is already bound', 'E_LANE_RUNTIME_BOUND');
  }
  LANE_TIMELINES.set(lane, timeline);
}

export function requireLaneTimeline(lane: Lane): Timeline {
  const timeline = LANE_TIMELINES.get(lane);
  if (timeline === undefined) {
    throw new WarpError(
      'Lane was not opened by a Runtime',
      'E_LANE_RUNTIME_UNAVAILABLE',
    );
  }
  return timeline;
}
