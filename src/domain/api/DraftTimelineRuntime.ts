import type WarpWorldline from '../WarpWorldline.ts';
import WarpError from '../errors/WarpError.ts';
import DraftTimeline from './DraftTimeline.ts';
import type Intent from './Intent.ts';
import { applyIntentToPatch } from './IntentRuntime.ts';
import JoinReceipt from './JoinReceipt.ts';
import JoinResult from './JoinResult.ts';
import type { JoinOptions } from './Timeline.ts';
import WriteReceipt from './WriteReceipt.ts';

type DraftTimelineState = {
  readonly runtime: WarpWorldline;
  readonly draftPatchShas: string[];
  readonly intents: Intent[];
  readonly joinPatchShas: string[];
  joinFailed: boolean;
  joined: boolean;
};

type DraftWriteFields = {
  readonly runtime: WarpWorldline;
  readonly timelineName: string;
  readonly draftName: string;
  readonly state: DraftTimelineState;
  readonly intent: Intent;
};

type JoinResultFields = {
  readonly runtime: WarpWorldline;
  readonly draft: DraftTimeline;
  readonly mode: 'preview' | 'join';
  readonly outcome: 'accepted' | 'rejected';
  readonly patchShas: readonly string[];
  readonly reason?: string;
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
  runtime: WarpWorldline,
  timelineName: string,
  draftName: string,
): Promise<DraftTimeline> {
  await runtime.createDraft(draftName);
  const state = createDraftState(runtime);
  const draft = new DraftTimeline({
    name: draftName,
    timeline: timelineName,
    writer: runtime.writerId,
    writeDraft: async (intent) => await writeDraftIntent({
      runtime,
      timelineName,
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
  options: JoinOptions,
): Promise<JoinResult> {
  void options;
  requireDraftState(runtime, draft);
  const patchShas = await runtime.previewDraftJoin(draft.name);
  return joinResult({
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
  options: JoinOptions,
): Promise<JoinResult> {
  void options;
  const state = requireDraftState(runtime, draft);
  const rejected = rejectedJoinPrecondition(runtime, draft, state);
  if (rejected !== null) {
    return rejected;
  }

  const patchShas = await commitDraftIntents(runtime, state);
  const failed = rejectedIncompleteJoin({ runtime, draft, state, patchShas });
  if (failed !== null) {
    return failed;
  }
  state.joined = true;
  return acceptedJoin({ runtime, draft, state, patchShas });
}

function rejectedJoinPrecondition(
  runtime: WarpWorldline,
  draft: DraftTimeline,
  state: DraftTimelineState,
): JoinResult | null {
  if (state.joined) {
    return rejectedJoin({ runtime, draft, reason: 'Draft has already joined' });
  }
  if (state.joinFailed) {
    return rejectedJoin({
      runtime,
      draft,
      reason: 'Draft join already has a failed commit attempt',
      patchShas: state.joinPatchShas,
    });
  }
  if (state.intents.length === 0) {
    return rejectedJoin({ runtime, draft, reason: 'Draft has no public intents to join' });
  }
  return null;
}

function rejectedIncompleteJoin(fields: JoinCompletionFields): JoinResult | null {
  if (fields.patchShas.length === fields.state.intents.length) {
    return null;
  }
  fields.state.joinFailed = true;
  return rejectedJoin({
    runtime: fields.runtime,
    draft: fields.draft,
    reason: 'Draft join failed while committing intents',
    patchShas: fields.patchShas,
  });
}

function acceptedJoin(fields: JoinCompletionFields): JoinResult {
  return joinResult({
    runtime: fields.runtime,
    draft: fields.draft,
    mode: 'join',
    outcome: 'accepted',
    patchShas: fields.patchShas,
  });
}

function createDraftState(runtime: WarpWorldline): DraftTimelineState {
  return {
    runtime,
    draftPatchShas: [],
    intents: [],
    joinPatchShas: [],
    joinFailed: false,
    joined: false,
  };
}

async function writeDraftIntent(fields: DraftWriteFields): Promise<WriteReceipt> {
  const patchSha = await fields.runtime.patchDraft(fields.draftName, (patch) => {
    applyIntentToPatch(fields.intent, patch);
  });
  fields.state.draftPatchShas.push(patchSha);
  fields.state.intents.push(fields.intent);
  return new WriteReceipt({
    timeline: fields.timelineName,
    writer: fields.runtime.writerId,
    intent: fields.intent,
    outcome: 'accepted',
    patchSha,
  });
}

function rejectedJoin(fields: RejectedJoinFields): JoinResult {
  return joinResult({
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
  state: DraftTimelineState,
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
    throw new WarpError('DraftTimeline was not opened by this Timeline', 'E_DRAFT_RUNTIME_UNAVAILABLE');
  }
  return state;
}

function joinResult(fields: JoinResultFields): JoinResult {
  const receipt = fields.reason === undefined
    ? new JoinReceipt({
      timeline: fields.runtime.worldlineName,
      writer: fields.runtime.writerId,
      draft: fields.draft,
      mode: fields.mode,
      outcome: fields.outcome,
      patchShas: fields.patchShas,
    })
    : new JoinReceipt({
      timeline: fields.runtime.worldlineName,
      writer: fields.runtime.writerId,
      draft: fields.draft,
      mode: fields.mode,
      outcome: fields.outcome,
      patchShas: fields.patchShas,
      reason: fields.reason,
    });
  return new JoinResult({
    receipt,
  });
}
