import type DraftTimeline from '../domain/api/DraftTimeline.ts';
import {
  captureDraftSettlementSnapshot,
  createDraftSettlementDigest,
  promoteDraftSettlement,
} from '../domain/api/DraftSettlementRuntime.ts';
import type Lane from '../domain/api/Lane.ts';
import { captureDraftCoordinate } from '../domain/api/DraftTimelineRuntime.ts';
import { bindLaneRuntime } from '../domain/api/LaneRuntime.ts';
import type RuntimeActivity from './RuntimeActivity.ts';
import type RuntimeMutationGate from './RuntimeMutationGate.ts';

type StrandLaneBindingOptions = Readonly<{
  readonly activity: RuntimeActivity;
  readonly draft: DraftTimeline;
  readonly lane: Lane;
  readonly mutations: RuntimeMutationGate;
  readonly owner: object;
}>;

export function bindStrandLaneRuntime(
  options: StrandLaneBindingOptions,
): void {
  const { activity, draft, lane, mutations, owner } = options;
  const execution = Object.freeze({
    capture: async () => await captureDraftSettlementSnapshot(draft),
    digest: async (parts: readonly string[]) =>
      await createDraftSettlementDigest(draft, parts),
    promote: async () => await promoteDraftSettlement(draft),
  });
  bindLaneRuntime(lane, {
    captureCoordinate: async () => await activity.run(async () => await captureDraftCoordinate(draft)),
    fork: null,
    openStrand: null,
    owner,
    settlement: Object.freeze({
      kind: 'source',
      capture: async () =>
        await activity.run(async () => await execution.capture()),
      digest: async (parts) =>
        await activity.run(async () => await execution.digest(parts)),
      runExclusive: async (operation) =>
        await activity.run(async () =>
          await mutations.run(async () => await operation(execution))
        ),
    }),
  });
}
