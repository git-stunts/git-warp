import { coordinateConeBasis } from '../WarpWorldlineConeOptics.ts';
import ConeObstructedError from '../errors/ConeObstructedError.ts';
import ConeBasis from '../services/cone/ConeBasis.ts';
import type ConeLaneBasis from '../services/cone/ConeLaneBasis.ts';
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
  SettlementTargetBasis,
} from './LaneSettlementRuntime.ts';
import {
  createSettlementDigest,
  createSettlementFrontierRef,
  createSettlementSourceFrontierRef,
  type SettlementFrontierEntry,
} from './SettlementIdentityRuntime.ts';

/**
 * Captures what a settlement preview and its settle compare (#1039). Identity
 * binds frontiers only: the strand's base frontier, the strand's own frontier
 * and the target's current frontier. The cone roots behind them are evidence.
 * When the target moved since the fork, the strand still settles if every
 * node and edge its patches name has the same record at the target's current
 * basis as at the strand's base; only those records are read.
 */
export async function captureDraftSettlementSnapshot(
  draft: DraftTimeline,
): Promise<SettlementSourceSnapshot> {
  const state = requireDraftStateForReading(draft);
  const base = coordinateConeBasis(state.forkedAt);
  const source = await advancedBasis(state.strand.strand);
  const target = await advancedBasis(state.runtime.coneBasis());
  const [baseTargetFrontierRef, frontierRef, proposalDigest, targetFrontierRef, basisEvidenceRefs] = await Promise.all([
    settlementTargetFrontierRef(state, frontierEntries(base)),
    createSettlementSourceFrontierRef({
      context: state.context,
      entries: frontierEntries(source),
      strandName: draft.name,
      worldlineName: state.runtime.worldlineName,
    }),
    settlementProposalDigest(state, draft),
    settlementTargetFrontierRef(state, frontierEntries(target)),
    coneEvidenceRefs(state, [base, source, target]),
  ]);
  return Object.freeze({
    baseTargetFrontierRef,
    basisEvidenceRefs,
    frontierRef,
    proposalDigest,
    status: settlementSourceStatus(state),
    targetBasis: await settlementTargetBasis(state, { base, target }),
    targetFrontierRef,
  });
}

async function advancedBasis(cone: ConeLaneBasis): Promise<ConeBasis> {
  const basis = await cone.advance();
  if (!(basis instanceof ConeBasis)) {
    throw new ConeObstructedError(cone.lane, basis);
  }
  return basis;
}

/** How the target's current basis relates to the strand's base, judged on the strand's footprint. */
async function settlementTargetBasis(
  state: DraftTimelineState,
  bases: { readonly base: ConeBasis; readonly target: ConeBasis },
): Promise<SettlementTargetBasis> {
  if (bases.base.frontier.equals(bases.target.frontier)) {
    return 'base';
  }
  const unchanged = await state.footprint.unchangedBetween(state.runtime.coneBasis().reader, {
    base: bases.base.root, target: bases.target.root,
  });
  return unchanged ? 'footprint-unchanged' : 'footprint-advanced';
}

function frontierEntries(basis: ConeBasis): readonly SettlementFrontierEntry[] {
  return [...basis.writerHeads()].map(([writerId, patchSha]) => Object.freeze({ writerId, patchSha }));
}

async function settlementTargetFrontierRef(
  state: DraftTimelineState,
  entries: readonly SettlementFrontierEntry[],
): Promise<string> {
  return await createSettlementFrontierRef({
    context: state.context,
    entries,
    worldlineName: state.runtime.worldlineName,
  });
}

/** Evidence handles for the cone roots the snapshot compared: base, strand and target. */
async function coneEvidenceRefs(state: DraftTimelineState, bases: readonly ConeBasis[]): Promise<readonly string[]> {
  return Object.freeze(await Promise.all(bases.map(async (basis) =>
    await state.context.createOpaqueId('evidence', ['settlement-cone-root', state.runtime.worldlineName, basis.root.toString()])
  )));
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
  return state.sequences.length === 0 ? 'empty' : 'ready';
}
