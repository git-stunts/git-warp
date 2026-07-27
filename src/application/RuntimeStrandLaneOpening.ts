import type DraftTimeline from '../domain/api/DraftTimeline.ts';
import {
  createDraftTimeline,
  openDraftTimeline,
} from '../domain/api/DraftTimelineRuntime.ts';
import type Lane from '../domain/api/Lane.ts';
import type Timeline from '../domain/api/Timeline.ts';
import {
  requireTimelineContext,
  requireTimelineRuntime,
} from '../domain/api/TimelineRuntime.ts';
import {
  createForkTick,
  createTickFromCoordinate,
  requireTickCoordinate,
} from '../domain/api/TickRuntime.ts';
import type RuntimeActivity from './RuntimeActivity.ts';
import type RuntimeMutationGate from './RuntimeMutationGate.ts';

export type WorldlineLaneSource = Readonly<{
  readonly activity: RuntimeActivity;
  readonly mutations: RuntimeMutationGate;
  readonly owner: object;
  readonly parent: Readonly<{
    readonly kind: 'worldline';
    readonly name: string;
  }>;
  readonly timeline: Timeline;
}>;

export type StrandLaneOptions = Readonly<{
  readonly activity: RuntimeActivity;
  readonly draft: DraftTimeline;
  readonly forkedAt: Readonly<{
    readonly id: string;
    readonly lane: Readonly<{
      readonly kind: 'worldline';
      readonly name: string;
    }>;
  }>;
  readonly mutations: RuntimeMutationGate;
  readonly owner: object;
  readonly parent: Readonly<{
    readonly kind: 'worldline';
    readonly name: string;
  }>;
}>;

type StrandLaneFactory = (options: StrandLaneOptions) => Lane;

export async function forkWorldlineLane(
  options: WorldlineLaneSource,
  name: string,
  createLane: StrandLaneFactory,
): Promise<Lane> {
  return await options.activity.run(async () =>
    await options.mutations.run(async () => {
      const runtime = requireTimelineRuntime(options.timeline);
      const context = requireTimelineContext(options.timeline);
      const tick = await createForkTick(runtime, context);
      const draft = await createDraftTimeline({
        runtime,
        context,
        timelineName: options.timeline.name,
        draftName: name,
        forkedAt: requireTickCoordinate(runtime, tick),
      });
      return createLane(strandOptions(options, draft, tick.id));
    })
  );
}

export async function openWorldlineStrandLane(
  options: WorldlineLaneSource,
  name: string,
  createLane: StrandLaneFactory,
): Promise<Lane> {
  return await options.activity.run(async () => {
    const runtime = requireTimelineRuntime(options.timeline);
    const context = requireTimelineContext(options.timeline);
    const coordinate = await runtime.openDraftCoordinate(name);
    const tick = await createTickFromCoordinate(runtime, context, coordinate);
    const draft = await openDraftTimeline({
      runtime,
      context,
      timelineName: options.timeline.name,
      draftName: name,
      forkedAt: coordinate,
    });
    return createLane(strandOptions(options, draft, tick.id));
  });
}

function strandOptions(
  source: WorldlineLaneSource,
  draft: DraftTimeline,
  tickId: string,
): StrandLaneOptions {
  return {
    activity: source.activity,
    draft,
    forkedAt: Object.freeze({ id: tickId, lane: source.parent }),
    mutations: source.mutations,
    owner: source.owner,
    parent: source.parent,
  };
}
