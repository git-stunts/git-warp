import type WarpWorldline from '../WarpWorldline.ts';
import type { WarpDraftPatchEntry } from '../WarpWorldline.ts';
import type { WarpStrandOpticBasis } from '../WarpStrandOpticBasis.ts';
import type WarpWorldlineCoordinate from '../WarpWorldlineCoordinate.ts';
import WarpError from '../errors/WarpError.ts';
import type { ApiRuntimeContext } from './ApiRuntimeContext.ts';
import type { DraftReadingTarget } from './DraftReadingTarget.ts';
import DraftTimeline from './DraftTimeline.ts';
import type Evidence from './Evidence.ts';
import { createJoinEvidence, createJoinRecoveryEvidence } from './EvidenceRuntime.ts';
import type Intent from './Intent.ts';
import { applyIntentToPatch, intentFromPatch } from './IntentRuntime.ts';
import JoinReceipt from './JoinReceipt.ts';
import JoinResult from './JoinResult.ts';
import type Reading from './Reading.ts';
import { executeReading } from './ReadingRuntime.ts';
import Tick from './Tick.ts';
import type { JoinOptions } from './Timeline.ts';
import type WriteReceipt from './WriteReceipt.ts';
import { executeIntentWrite } from './WriteRuntime.ts';

export type { DraftReadingTarget } from './DraftReadingTarget.ts';

export type DraftTimelineState = {
  readonly context: ApiRuntimeContext;
  readonly runtime: WarpWorldline;
  readonly draftPatchShas: string[];
  readonly intents: Intent[];
  readonly forkedAt: WarpWorldlineCoordinate | null;
  readonly joinPatchShas: string[];
  joinRecoveryEvidence: Evidence | undefined;
  joinFailed: boolean;
  joining: boolean;
  joined: boolean;
};

type DraftWriteFields = {
  readonly runtime: WarpWorldline;
  readonly draftName: string;
  readonly state: DraftTimelineState;
  readonly intent: Intent;
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
  readonly forkedAt: WarpWorldlineCoordinate | null;
  readonly persisted: readonly WarpDraftPatchEntry[];
  readonly runtime: WarpWorldline;
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

export async function createDraftTimeline(
  fields: CreateDraftTimelineFields
): Promise<DraftTimeline> {
  await fields.runtime.createDraft(fields.draftName, fields.forkedAt);
  return await openDraftTimeline(fields);
}

export async function openDraftTimeline(fields: CreateDraftTimelineFields): Promise<DraftTimeline> {
  const { runtime, context, timelineName, draftName } = fields;
  const persisted = await runtime.loadDraftPatchEntries(draftName);
  const state = createDraftState({
    runtime,
    context,
    forkedAt: fields.forkedAt ?? null,
    persisted,
  });
  const draft = new DraftTimeline({
    name: draftName,
    timeline: timelineName,
    writer: runtime.writerId,
    writeDraft: async (intent) =>
      await writeDraftIntent({
        runtime,
        draftName,
        state,
        intent,
      }),
  });
  draftStates.set(draft, state);
  return draft;
}

export async function createDraftReadingTarget(draft: DraftTimeline): Promise<DraftReadingTarget> {
  const state = requireDraftStateForReading(draft);
  const coordinate = state.forkedAt;
  if (coordinate === null) {
    throw new WarpError(
      'DraftTimeline was not forked from a captured Runtime coordinate',
      'E_DRAFT_TIMELINE_BOUNDED_BASIS_UNAVAILABLE'
    );
  }
  const basis = await state.runtime.prepareStrandOptic(draft.name, coordinate.checkpointSha);
  const tick = await createDraftReadingTick(draft, state, basis);
  return Object.freeze({
    tick,
    read: async (reading: Reading) =>
      await executeReading({
        runtime: state.runtime,
        context: state.context,
        reading,
        basis: { optic: basis.optic, tick },
      }),
  });
}

async function createDraftReadingTick(
  draft: DraftTimeline,
  state: DraftTimelineState,
  basis: WarpStrandOpticBasis
): Promise<Tick> {
  const frontier = basis.frontierEntries.flatMap(({ writerId, patchSha }) => [writerId, patchSha]);
  return new Tick({
    timeline: draft.name,
    id: await state.context.createOpaqueId('tick', [
      state.runtime.worldlineName,
      draft.name,
      basis.checkpointSha,
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
    patchShas: await commitDraftIntents(runtime, state),
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
  if (state.intents.length === 0) {
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
  if (fields.patchShas.length === fields.state.intents.length) {
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
  const { context, forkedAt, persisted, runtime } = fields;
  return {
    context,
    runtime,
    draftPatchShas: persisted.map(({ sha }) => sha),
    forkedAt,
    intents: persisted.map(({ patch }) => intentFromPatch(patch)),
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

async function writeDraftIntent(fields: DraftWriteFields): Promise<WriteReceipt> {
  let draftPatch: WarpDraftPatchEntry | undefined;
  const receipt = await executeIntentWrite({
    runtime: fields.runtime,
    context: fields.state.context,
    intent: fields.intent,
    commit: async (build) => {
      const publication = await fields.runtime.patchDraftWithEvidence(fields.draftName, build);
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
  fields.state.intents.push(intentFromPatch(draftPatch.patch));
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

async function commitDraftIntents(
  runtime: WarpWorldline,
  state: DraftTimelineState
): Promise<readonly string[]> {
  for (const intent of state.intents) {
    try {
      const patchSha = await runtime.commit((patch) => {
        applyIntentToPatch(intent, patch);
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
