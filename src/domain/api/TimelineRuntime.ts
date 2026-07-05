import WarpError from '../errors/WarpError.ts';
import type WarpWorldline from '../WarpWorldline.ts';
import Timeline from './Timeline.ts';

const timelineRuntimes = new WeakMap<Timeline, WarpWorldline>();

export function createTimeline(runtime: WarpWorldline): Timeline {
  const timeline = new Timeline({
    name: runtime.worldlineName,
    writer: runtime.writerId,
  });
  timelineRuntimes.set(timeline, runtime);
  return timeline;
}

export function requireTimelineRuntime(timeline: Timeline): WarpWorldline {
  const runtime = timelineRuntimes.get(timeline);
  if (runtime === undefined) {
    throw new WarpError('Timeline was not opened by openWarp', 'E_TIMELINE_RUNTIME_UNAVAILABLE');
  }
  return runtime;
}
