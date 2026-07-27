import WarpError from '../errors/WarpError.ts';
import type WarpWorldline from '../WarpWorldline.ts';
import type { ApiRuntimeContext } from './ApiRuntimeContext.ts';
import {
  createDraftTimeline,
  joinDraftTimeline,
  previewDraftJoin,
} from './DraftTimelineRuntime.ts';
import { executeReading } from './ReadingRuntime.ts';
import { createTick, createTickFromCoordinate } from './TickRuntime.ts';
import type Tick from './Tick.ts';
import Timeline from './Timeline.ts';
import { createTimelineView } from './TimelineViewRuntime.ts';
import { executeIntentWrite } from './WriteRuntime.ts';

type TimelineRuntimeBinding = Readonly<{
  readonly context: ApiRuntimeContext;
  readonly runtime: WarpWorldline;
}>;

const timelineRuntimes = new WeakMap<Timeline, TimelineRuntimeBinding>();

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
        commit: runtime.commitWithEvidence.bind(runtime),
      }),
  });
  timelineRuntimes.set(timeline, Object.freeze({ context, runtime }));
  return timeline;
}

export function requireTimelineRuntime(timeline: Timeline): WarpWorldline {
  return requireTimelineBinding(timeline).runtime;
}

export function requireTimelineContext(timeline: Timeline): ApiRuntimeContext {
  return requireTimelineBinding(timeline).context;
}

export async function capturePreparedTimelineTick(
  timeline: Timeline,
): Promise<Tick> {
  const binding = requireTimelineBinding(timeline);
  return await createTickFromCoordinate(
    binding.runtime,
    binding.context,
    await binding.runtime.coordinate(),
  );
}

function requireTimelineBinding(timeline: Timeline): TimelineRuntimeBinding {
  const binding = timelineRuntimes.get(timeline);
  if (binding === undefined) {
    throw new WarpError('Timeline was not opened by openWarp', 'E_TIMELINE_RUNTIME_UNAVAILABLE');
  }
  return binding;
}
