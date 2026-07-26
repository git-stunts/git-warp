import type { WarpStrandOpticBasis } from '../WarpStrandOpticBasis.ts';
import type WarpWorldlineCoordinate from '../WarpWorldlineCoordinate.ts';
import WarpError from '../errors/WarpError.ts';
import type DraftTimeline from './DraftTimeline.ts';
import {
  joinDraftTimeline,
  requireDraftStateForReading,
  type DraftTimelineState,
} from './DraftTimelineRuntime.ts';
import type {
  SettlementPromotion,
  SettlementSourceSnapshot,
  SettlementSourceStatus,
} from './LaneSettlementRuntime.ts';
import {
  createSettlementDigest,
  createSettlementFrontierRef,
  createSettlementSourceFrontierRef,
} from './SettlementIdentityRuntime.ts';

type SettlementSnapshotOptions = Readonly<{
  readonly basis: WarpStrandOpticBasis;
  readonly coordinate: WarpWorldlineCoordinate;
  readonly draft: DraftTimeline;
  readonly state: DraftTimelineState;
  readonly targetCoordinate: WarpWorldlineCoordinate;
}>;

export async function captureDraftSettlementSnapshot(
  draft: DraftTimeline,
): Promise<SettlementSourceSnapshot> {
  const state = requireDraftStateForReading(draft);
  const coordinate = requireSettlementCoordinate(state);
  const basis = await state.runtime.prepareStrandOptic(
    draft.name,
    coordinate.checkpointSha,
  );
  await state.runtime.prepareOpticBasis();
  const targetCoordinate = await state.runtime.coordinate();
  return await createDraftSettlementSnapshot({
    basis,
    coordinate,
    draft,
    state,
    targetCoordinate,
  });
}

async function createDraftSettlementSnapshot(
  options: SettlementSnapshotOptions,
): Promise<SettlementSourceSnapshot> {
  const { basis, coordinate, draft, state, targetCoordinate } = options;
  const [
    baseTargetFrontierRef,
    frontierRef,
    proposalDigest,
    targetFrontierRef,
  ] = await Promise.all([
    settlementTargetFrontierRef(state, coordinate),
    settlementSourceFrontierRef(state, draft, basis),
    settlementProposalDigest(state, draft),
    settlementTargetFrontierRef(state, targetCoordinate),
  ]);
  return Object.freeze({
    baseTargetFrontierRef,
    frontierRef,
    proposalDigest,
    status: settlementSourceStatus(state),
    targetFrontierRef,
  });
}

async function settlementTargetFrontierRef(
  state: DraftTimelineState,
  coordinate: WarpWorldlineCoordinate,
): Promise<string> {
  return await createSettlementFrontierRef({
    checkpointSha: coordinate.checkpointSha,
    context: state.context,
    entries: coordinate.frontierEntries,
    worldlineName: state.runtime.worldlineName,
  });
}

async function settlementSourceFrontierRef(
  state: DraftTimelineState,
  draft: DraftTimeline,
  basis: WarpStrandOpticBasis,
): Promise<string> {
  return await createSettlementSourceFrontierRef({
    checkpointSha: basis.checkpointSha,
    context: state.context,
    entries: basis.frontierEntries,
    strandName: draft.name,
    worldlineName: state.runtime.worldlineName,
  });
}

async function settlementProposalDigest(
  state: DraftTimelineState,
  draft: DraftTimeline,
): Promise<string> {
  return await createSettlementDigest(state.context, [
    'proposal',
    state.runtime.worldlineName,
    draft.name,
    ...state.draftPatchShas,
  ]);
}

export async function createDraftSettlementDigest(
  draft: DraftTimeline,
  parts: readonly string[],
): Promise<string> {
  const state = requireDraftStateForReading(draft);
  return await createSettlementDigest(state.context, parts);
}

export async function promoteDraftSettlement(
  draft: DraftTimeline,
): Promise<SettlementPromotion> {
  const state = requireDraftStateForReading(draft);
  const result = await joinDraftTimeline(state.runtime, draft, {});
  const { receipt } = result;
  return Object.freeze({
    accepted: receipt.outcome === 'accepted',
    evidence: receipt.evidence,
    reason: receipt.reason,
  });
}

function requireSettlementCoordinate(
  state: DraftTimelineState,
): WarpWorldlineCoordinate {
  if (state.forkedAt === null) {
    throw new WarpError(
      'DraftTimeline was not forked from a captured Runtime coordinate',
      'E_DRAFT_SETTLEMENT_BASIS_UNAVAILABLE',
    );
  }
  return state.forkedAt;
}

function settlementSourceStatus(
  state: DraftTimelineState,
): SettlementSourceStatus {
  if (state.joined) {
    return 'settled';
  }
  if (state.joining) {
    return 'settling';
  }
  if (state.joinFailed) {
    return 'failed';
  }
  return state.intents.length === 0 ? 'empty' : 'ready';
}
