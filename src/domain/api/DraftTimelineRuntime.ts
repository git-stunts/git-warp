import type WarpWorldline from '../WarpWorldline.ts';
import type { WarpDraftPatchEntry } from '../WarpWorldline.ts';
import type WarpWorldlineCoordinate from '../WarpWorldlineCoordinate.ts';
import { captureConeCoordinate, captureRetainedConeCoordinate } from '../WarpWorldlineConeOptics.ts';
import WarpError from '../errors/WarpError.ts';
import type ConeIngestOutcome from '../services/cone/ConeIngestOutcome.ts';
import ConeSettlementFootprint from '../services/cone/ConeSettlementFootprint.ts';
import type StrandConeBasis from '../services/strand/StrandConeBasis.ts';
import type { ApiRuntimeContext } from './ApiRuntimeContext.ts';
import type { DraftReadingTarget } from './DraftReadingTarget.ts';
import DraftTimeline from './DraftTimeline.ts';
import type Evidence from './Evidence.ts';
import { createJoinEvidence, createJoinRecoveryEvidence } from './EvidenceRuntime.ts';
import type { WriteIntentInput } from './IntentSequence.ts';
import { intentSequenceFromPatch } from './IntentSequenceRuntime.ts';
import type IntentSequence from './IntentSequence.ts';
import JoinReceipt from './JoinReceipt.ts';
import JoinResult from './JoinResult.ts';
import type Reading from './Reading.ts';
import { executeReading } from './ReadingRuntime.ts';
import Tick from './Tick.ts';
import type { JoinOptions } from './Timeline.ts';
import type WriteReceipt from './WriteReceipt.ts';
import { commitSequenceOnCone, executeIntentWrite } from './WriteRuntime.ts';

export type { DraftReadingTarget } from './DraftReadingTarget.ts';

export type DraftTimelineState = {
  readonly context: ApiRuntimeContext;
  readonly runtime: WarpWorldline;
  /** The strand's pinned base and its own cone basis (#1039). */
  readonly strand: StrandConeBasis;
  readonly draftPatchShas: string[];
  readonly sequences: IntentSequence[];
  /** The nodes and edges the strand's patches name, for settlement previews. */
  footprint: ConeSettlementFootprint;
  /** The coordinate the strand was forked at: its base frontier and pinned base basis. */
  readonly forkedAt: WarpWorldlineCoordinate;
  readonly joinPatchShas: string[];
  joinRecoveryEvidence: Evidence | undefined;
  joinFailed: boolean;
  joining: boolean;
  joined: boolean;
};

type DraftWriteFields = {
  readonly runtime: WarpWorldline;
  readonly state: DraftTimelineState;
  readonly intent: WriteIntentInput;
};

type CreateDraftTimelineFields = {
  readonly runtime: WarpWorldline;
  readonly context: ApiRuntimeContext;
  readonly timelineName: string;
  readonly draftName: string;
  readonly forkedAt?: WarpWorldlineCoordinate;
};

type DraftStateFields = Readonly<{
  readonly context: ApiRuntimeContext;
  readonly forkedAt: WarpWorldlineCoordinate;
  readonly persisted: readonly WarpDraftPatchEntry[];
  readonly runtime: WarpWorldline;
  readonly strand: StrandConeBasis;
}>;

type JoinResultFieldsBase = {
  readonly runtime: WarpWorldline;
  readonly draft: DraftTimeline;
  readonly mode: 'preview' | 'join';
  readonly patchShas: readonly string[];
  readonly recoveryEvidence?: Evidence;
};

type JoinResultFields = JoinResultFieldsBase &
  (
    | { readonly outcome: 'accepted'; readonly reason?: never }
    | { readonly outcome: 'rejected'; readonly reason: string }
  );

type AcceptedJoinResultFields = JoinResultFieldsBase & {
  readonly outcome: 'accepted';
  readonly reason?: never;
};

type UnacceptedJoinResultFields = JoinResultFieldsBase & {
  readonly outcome: 'rejected';
  readonly reason: string;
};

type RejectedJoinFields = {
  readonly runtime: WarpWorldline;
  readonly draft: DraftTimeline;
  readonly reason: string;
  readonly patchShas?: readonly string[];
  readonly recoveryEvidence?: Evidence;
};

type JoinPreconditionRejection = Omit<RejectedJoinFields, 'runtime' | 'draft'>;

type JoinCompletionFields = {
  readonly runtime: WarpWorldline;
  readonly draft: DraftTimeline;
  readonly state: DraftTimelineState;
  readonly patchShas: readonly string[];
  readonly recoveryEvidence: Evidence;
};

const draftStates = new WeakMap<DraftTimeline, DraftTimelineState>();

/**
 * Creates a strand forked at `forkedAt` (#1039), or at a coordinate captured
 * now, and opens it. Forking pins the lane cone basis of that coordinate as
 * the strand's base; it never materializes or checkpoints.
 */
export async function createDraftTimeline(
  fields: CreateDraftTimelineFields
): Promise<DraftTimeline> {
  const forkedAt = fields.forkedAt ?? await fields.runtime.captureReadCoordinate();
  await fields.runtime.createDraft(fields.draftName, forkedAt);
  return await openDraftTimeline({ ...fields, forkedAt });
}

/** Opens a strand Lane over its cone bases; a reopened strand's coordinate is its pinned base. */
export async function openDraftTimeline(fields: CreateDraftTimelineFields): Promise<DraftTimeline> {
  const { runtime, context, timelineName, draftName } = fields;
  const strand = await runtime.openDraft(draftName);
  const forkedAt = fields.forkedAt ?? await captureConeCoordinate(runtime.worldlineName, strand.base);
  const persisted = await runtime.loadDraftPatchEntries(strand.strandId);
  const state = createDraftState({ runtime, context, forkedAt, persisted, strand });
  const draft = new DraftTimeline({
    name: draftName,
    timeline: timelineName,
    writer: runtime.writerId,
    writeDraft: async (intent) => await writeDraftIntent({ runtime, state, intent }),
  });
  draftStates.set(draft, state);
  return draft;
}

/** The Readings of one strand Observation: one coordinate over the strand's cone basis. */
export async function createDraftReadingTarget(draft: DraftTimeline): Promise<DraftReadingTarget> {
  const state = requireDraftStateForReading(draft);
  const coordinate = await captureConeCoordinate(state.runtime.worldlineName, state.strand.strand);
  const tick = await createDraftReadingTick(draft, state, coordinate);
  const optic = coordinate.optic();
  return Object.freeze({
    tick,
    read: async (reading: Reading) =>
      await executeReading({
        runtime: state.runtime,
        context: state.context,
        reading,
        basis: { optic, tick },
      }),
  });
}

/** Advances a strand's cone basis and answers what the advance did (#1039). */
export async function refreshDraftBasis(draft: DraftTimeline): Promise<ConeIngestOutcome> {
  return await requireDraftStateForReading(draft).strand.strand.refresh();
}

/** The coordinate a strand was forked at: its base frontier over its pinned base basis. */
export function draftForkCoordinate(draft: DraftTimeline): WarpWorldlineCoordinate {
  return requireDraftStateForReading(draft).forkedAt;
}

/** A coordinate over a strand's cone basis that an application may keep (#1039). */
export async function captureDraftCoordinate(draft: DraftTimeline): Promise<WarpWorldlineCoordinate> {
  const state = requireDraftStateForReading(draft);
  return await captureRetainedConeCoordinate(state.runtime.worldlineName, state.strand.strand);
}

async function createDraftReadingTick(
  draft: DraftTimeline,
  state: DraftTimelineState,
  coordinate: WarpWorldlineCoordinate,
): Promise<Tick> {
  const frontier = coordinate.frontierEntries.flatMap(({ writerId, patchSha }) => [writerId, patchSha]);
  return new Tick({
    timeline: draft.name,
    id: await state.context.createOpaqueId('tick', [
      state.runtime.worldlineName,
      draft.name,
      ...coordinate.basisIdentity(),
      ...frontier,
    ]),
  });
}

export async function previewDraftJoin(
  runtime: WarpWorldline,
  draft: DraftTimeline,
  options: JoinOptions
): Promise<JoinResult> {
  void options;
  requireDraftState(runtime, draft);
  const patchShas = await runtime.previewDraftJoin(draft.name);
  return await joinResult({
    runtime,
    draft,
    mode: 'preview',
    outcome: 'accepted',
    patchShas,
  });
}

export async function joinDraftTimeline(
  runtime: WarpWorldline,
  draft: DraftTimeline,
  options: JoinOptions
): Promise<JoinResult> {
  void options;
  const state = requireDraftState(runtime, draft);
  const rejected = rejectedJoinPrecondition(state);
  if (rejected !== null) {
    return await rejectedJoin({ runtime, draft, ...rejected });
  }

  state.joining = true;
  try {
    return await performDraftJoin(runtime, draft, state);
  } finally {
    state.joining = false;
  }
}

async function performDraftJoin(
  runtime: WarpWorldline,
  draft: DraftTimeline,
  state: DraftTimelineState
): Promise<JoinResult> {
  const recoveryEvidence = await createJoinRecoveryEvidence(runtime, state.context, {
    draft: draft.name,
    mode: 'join',
  });
  state.joinRecoveryEvidence = recoveryEvidence;
  const fields = {
    runtime,
    draft,
    state,
    patchShas: await commitDraftSequences(runtime, state),
    recoveryEvidence,
  };
  const failed = await rejectedIncompleteJoin(fields);
  if (failed !== null) {
    return failed;
  }
  state.joined = true;
  return await acceptedJoin(fields);
}

function rejectedJoinPrecondition(state: DraftTimelineState): JoinPreconditionRejection | null {
  if (state.joined) {
    return { reason: 'Draft has already joined' };
  }
  if (state.joining) {
    return { reason: 'Draft join is already in progress' };
  }
  if (state.joinFailed) {
    return failedJoinPrecondition(state);
  }
  if (state.sequences.length === 0) {
    return { reason: 'Draft has no public intents to join' };
  }
  return null;
}

function failedJoinPrecondition(state: DraftTimelineState): JoinPreconditionRejection {
  const rejection: JoinPreconditionRejection = {
    reason: 'Draft join already has a failed commit attempt',
    patchShas: state.joinPatchShas,
  };
  return state.joinRecoveryEvidence === undefined
    ? rejection
    : { ...rejection, recoveryEvidence: state.joinRecoveryEvidence };
}

async function rejectedIncompleteJoin(fields: JoinCompletionFields): Promise<JoinResult | null> {
  if (fields.patchShas.length === fields.state.sequences.length) {
    return null;
  }
  fields.state.joinFailed = true;
  return await rejectedJoin({
    runtime: fields.runtime,
    draft: fields.draft,
    reason: 'Draft join failed while committing intents',
    patchShas: fields.patchShas,
    recoveryEvidence: fields.recoveryEvidence,
  });
}

async function acceptedJoin(fields: JoinCompletionFields): Promise<JoinResult> {
  return await joinResult({
    runtime: fields.runtime,
    draft: fields.draft,
    mode: 'join',
    outcome: 'accepted',
    patchShas: fields.patchShas,
    recoveryEvidence: fields.recoveryEvidence,
  });
}

function createDraftState(fields: DraftStateFields): DraftTimelineState {
  const { context, forkedAt, persisted, runtime, strand } = fields;
  return {
    context,
    runtime,
    strand,
    draftPatchShas: persisted.map(({ sha }) => sha),
    footprint: persisted.reduce((footprint, { patch }) => footprint.including(patch), ConeSettlementFootprint.empty()),
    forkedAt,
    sequences: persisted.map(({ patch }) => intentSequenceFromPatch(patch)),
    joinPatchShas: [],
    joinRecoveryEvidence: undefined,
    joinFailed: false,
    joining: false,
    joined: false,
  };
}

export function requireDraftStateForReading(draft: DraftTimeline): DraftTimelineState {
  const state = draftStates.get(draft);
  if (state === undefined) {
    throw new WarpError(
      'DraftTimeline does not belong to this runtime',
      'E_DRAFT_TIMELINE_RUNTIME_MISMATCH'
    );
  }
  return state;
}

async function writeDraftIntent(
  fields: DraftWriteFields,
): Promise<WriteReceipt<WriteIntentInput>> {
  let draftPatch: WarpDraftPatchEntry | undefined;
  const { strand } = fields.state;
  const receipt = await executeIntentWrite({
    runtime: fields.runtime,
    context: fields.state.context,
    intent: fields.intent,
    cone: strand.strand,
    commit: async (build) => {
      const publication = await fields.runtime.patchDraftWithEvidence(strand.strandId, build);
      draftPatch = publication;
      return publication;
    },
  });
  if (receipt.outcome.kind === 'conflict' || receipt.outcome.kind === 'obstruction') {
    return receipt;
  }
  if (draftPatch === undefined) {
    throw new WarpError('Admitted draft write is missing its patch SHA', 'E_DRAFT_WRITE_RECEIPT');
  }
  fields.state.draftPatchShas.push(draftPatch.sha);
  fields.state.sequences.push(intentSequenceFromPatch(draftPatch.patch));
  fields.state.footprint = fields.state.footprint.including(draftPatch.patch);
  return receipt;
}

async function rejectedJoin(fields: RejectedJoinFields): Promise<JoinResult> {
  return await joinResult({
    runtime: fields.runtime,
    draft: fields.draft,
    mode: 'join',
    outcome: 'rejected',
    patchShas: fields.patchShas ?? [],
    reason: fields.reason,
    ...(fields.recoveryEvidence === undefined ? {} : { recoveryEvidence: fields.recoveryEvidence }),
  });
}

async function commitDraftSequences(
  runtime: WarpWorldline,
  state: DraftTimelineState
): Promise<readonly string[]> {
  for (const sequence of state.sequences) {
    try {
      const patchSha = await commitSequenceOnCone({
        commit: runtime.commitWithEvidence.bind(runtime),
        cone: runtime.coneBasis(),
        sequence,
      });
      state.joinPatchShas.push(patchSha);
    } catch {
      return Object.freeze([...state.joinPatchShas]);
    }
  }
  return Object.freeze([...state.joinPatchShas]);
}

function requireDraftState(runtime: WarpWorldline, draft: DraftTimeline): DraftTimelineState {
  const state = draftStates.get(draft);
  if (state === undefined || state.runtime !== runtime) {
    throw new WarpError(
      'DraftTimeline was not opened by this Timeline',
      'E_DRAFT_RUNTIME_UNAVAILABLE'
    );
  }
  return state;
}

async function joinResult(fields: JoinResultFields): Promise<JoinResult> {
  const { context } = requireDraftState(fields.runtime, fields.draft);
  const receipt =
    fields.outcome === 'accepted'
      ? await acceptedJoinReceipt(fields, context)
      : await unacceptedJoinReceipt(fields, context);
  context.bindReceipt(receipt, {
    operation: 'join',
    patchShas: fields.patchShas,
  });
  return new JoinResult({
    receipt,
  });
}

async function acceptedJoinReceipt(
  fields: AcceptedJoinResultFields,
  context: ApiRuntimeContext
): Promise<JoinReceipt> {
  return new JoinReceipt({
    timeline: fields.runtime.worldlineName,
    writer: fields.runtime.writerId,
    draft: fields.draft,
    mode: fields.mode,
    outcome: fields.outcome,
    evidence: await resolvedJoinEvidence(fields, context),
  });
}

async function unacceptedJoinReceipt(
  fields: UnacceptedJoinResultFields,
  context: ApiRuntimeContext
): Promise<JoinReceipt> {
  const evidence =
    fields.patchShas.length === 0 ? undefined : await resolvedJoinEvidence(fields, context);
  return new JoinReceipt({
    timeline: fields.runtime.worldlineName,
    writer: fields.runtime.writerId,
    draft: fields.draft,
    mode: fields.mode,
    outcome: fields.outcome,
    ...(evidence === undefined ? {} : { evidence }),
    reason: fields.reason,
  });
}

async function resolvedJoinEvidence(
  fields: JoinResultFieldsBase,
  context: ApiRuntimeContext
): Promise<Evidence> {
  try {
    return await createJoinEvidence(fields.runtime, context, {
      draft: fields.draft.name,
      mode: fields.mode,
      patchShas: fields.patchShas,
    });
  } catch (error) {
    if (fields.recoveryEvidence === undefined) {
      throw error;
    }
    // At least one patch may be durable; retain a receipt without inventing support.
    return fields.recoveryEvidence;
  }
}
