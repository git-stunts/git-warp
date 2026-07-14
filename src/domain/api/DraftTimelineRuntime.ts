import type WarpWorldline from '../WarpWorldline.ts';
import WarpError from '../errors/WarpError.ts';
import type { ApiRuntimeContext } from './ApiRuntimeContext.ts';
import DraftTimeline from './DraftTimeline.ts';
import { createJoinEvidence } from './EvidenceRuntime.ts';
import type Intent from './Intent.ts';
import { applyIntentToPatch } from './IntentRuntime.ts';
import JoinReceipt from './JoinReceipt.ts';
import JoinResult from './JoinResult.ts';
import type { JoinOptions } from './Timeline.ts';
import type WriteReceipt from './WriteReceipt.ts';
import { executeIntentWrite } from './WriteRuntime.ts';

type DraftTimelineState = {
  readonly context: ApiRuntimeContext;
  readonly runtime: WarpWorldline;
  readonly draftPatchShas: string[];
  readonly intents: Intent[];
  readonly joinPatchShas: string[];
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
};

type JoinResultFieldsBase = {
  readonly runtime: WarpWorldline;
  readonly draft: DraftTimeline;
  readonly mode: 'preview' | 'join';
  readonly patchShas: readonly string[];
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
};

type JoinCompletionFields = {
  readonly runtime: WarpWorldline;
  readonly draft: DraftTimeline;
  readonly state: DraftTimelineState;
  readonly patchShas: readonly string[];
};

const draftStates = new WeakMap<DraftTimeline, DraftTimelineState>();

export async function createDraftTimeline(
  fields: CreateDraftTimelineFields
): Promise<DraftTimeline> {
  const { runtime, context, timelineName, draftName } = fields;
  await runtime.createDraft(draftName);
  const state = createDraftState(runtime, context);
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
  const rejected = await rejectedJoinPrecondition(runtime, draft, state);
  if (rejected !== null) {
    return rejected;
  }

  state.joining = true;
  const patchShas = await commitDraftIntents(runtime, state);
  const failed = await rejectedIncompleteJoin({ runtime, draft, state, patchShas });
  if (failed !== null) {
    state.joining = false;
    return failed;
  }
  state.joined = true;
  state.joining = false;
  return await acceptedJoin({ runtime, draft, state, patchShas });
}

async function rejectedJoinPrecondition(
  runtime: WarpWorldline,
  draft: DraftTimeline,
  state: DraftTimelineState
): Promise<JoinResult | null> {
  if (state.joined) {
    return await rejectedJoin({ runtime, draft, reason: 'Draft has already joined' });
  }
  if (state.joining) {
    return await rejectedJoin({ runtime, draft, reason: 'Draft join is already in progress' });
  }
  if (state.joinFailed) {
    return await rejectedJoin({
      runtime,
      draft,
      reason: 'Draft join already has a failed commit attempt',
      patchShas: state.joinPatchShas,
    });
  }
  if (state.intents.length === 0) {
    return await rejectedJoin({ runtime, draft, reason: 'Draft has no public intents to join' });
  }
  return null;
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
  });
}

async function acceptedJoin(fields: JoinCompletionFields): Promise<JoinResult> {
  return await joinResult({
    runtime: fields.runtime,
    draft: fields.draft,
    mode: 'join',
    outcome: 'accepted',
    patchShas: fields.patchShas,
  });
}

function createDraftState(runtime: WarpWorldline, context: ApiRuntimeContext): DraftTimelineState {
  return {
    context,
    runtime,
    draftPatchShas: [],
    intents: [],
    joinPatchShas: [],
    joinFailed: false,
    joining: false,
    joined: false,
  };
}

async function writeDraftIntent(fields: DraftWriteFields): Promise<WriteReceipt> {
  let draftPatchSha: string | undefined;
  const receipt = await executeIntentWrite({
    runtime: fields.runtime,
    context: fields.state.context,
    intent: fields.intent,
    commit: async (build) => {
      draftPatchSha = await fields.runtime.patchDraft(fields.draftName, build);
      return draftPatchSha;
    },
  });
  if (receipt.outcome !== 'accepted') {
    return receipt;
  }
  if (draftPatchSha === undefined) {
    throw new WarpError('Accepted draft write is missing its patch SHA', 'E_DRAFT_WRITE_RECEIPT');
  }
  fields.state.draftPatchShas.push(draftPatchSha);
  fields.state.intents.push(fields.intent);
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
    evidence: await createJoinEvidence(fields.runtime, context, {
      draft: fields.draft.name,
      mode: fields.mode,
      patchShas: fields.patchShas,
    }),
  });
}

async function unacceptedJoinReceipt(
  fields: UnacceptedJoinResultFields,
  context: ApiRuntimeContext
): Promise<JoinReceipt> {
  const evidence =
    fields.patchShas.length === 0
      ? undefined
      : await createJoinEvidence(fields.runtime, context, {
          draft: fields.draft.name,
          mode: fields.mode,
          patchShas: fields.patchShas,
        });
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
