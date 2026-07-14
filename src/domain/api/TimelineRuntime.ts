import WarpError from '../errors/WarpError.ts';
import type WarpWorldline from '../WarpWorldline.ts';
import type { ApiRuntimeContext } from './ApiRuntimeContext.ts';
import {
  createDraftTimeline,
  joinDraftTimeline,
  previewDraftJoin,
} from './DraftTimelineRuntime.ts';
import { executeReading } from './ReadingRuntime.ts';
import { createTick } from './TickRuntime.ts';
import Timeline from './Timeline.ts';
import { createTimelineView } from './TimelineViewRuntime.ts';
import { executeIntentWrite } from './WriteRuntime.ts';

const timelineRuntimes = new WeakMap<Timeline, WarpWorldline>();

export function createTimeline(runtime: WarpWorldline, context: ApiRuntimeContext): Timeline {
  const timeline = new Timeline({
    name: runtime.worldlineName,
    writer: runtime.writerId,
    captureTick: async () => await createTick(runtime, context),
    joinDraft: (draft, options) => joinDraftTimeline(runtime, draft, options),
    openDraft: (name) =>
      createDraftTimeline({
        runtime,
        context,
        timelineName: runtime.worldlineName,
        draftName: name,
      }),
    openView: (tick) => createTimelineView(runtime, context, tick),
    previewJoinDraft: (draft, options) => previewDraftJoin(runtime, draft, options),
    readReading: (reading) => executeReading({ runtime, context, reading }),
    writeIntent: async (intent) =>
      await executeIntentWrite({
        runtime,
        context,
        intent,
        commit: runtime.commit.bind(runtime),
      }),
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
