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

type JoinResultFields = {
  readonly runtime: WarpWorldline;
  readonly draft: DraftTimeline;
  readonly mode: 'preview' | 'join';
  readonly outcome: 'accepted' | 'rejected';
  readonly patchShas: readonly string[];
  readonly reason?: string;
};

const draftStates = new WeakMap<DraftTimeline, DraftTimelineState>();

export async function createDraftTimeline(
  runtime: WarpWorldline,
  timelineName: string,
  draftName: string,
): Promise<DraftTimeline> {
  await runtime.createDraft(draftName);
  const intents: Intent[] = [];
  const draftPatchShas: string[] = [];
  const draft = new DraftTimeline({
    name: draftName,
    timeline: timelineName,
    writer: runtime.writerId,
    writeDraft: async (intent) => {
      const patchSha = await runtime.patchDraft(draftName, (patch) => {
        applyIntentToPatch(intent, patch);
      });
      draftPatchShas.push(patchSha);
      intents.push(intent);
      return new WriteReceipt({
        timeline: timelineName,
        writer: runtime.writerId,
        intent,
        outcome: 'accepted',
        patchSha,
      });
    },
  });
  draftStates.set(draft, {
    runtime,
    draftPatchShas,
    intents,
    joinPatchShas: [],
    joinFailed: false,
    joined: false,
  });
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
  if (state.joined) {
    return rejectedJoin(runtime, draft, 'Draft has already joined');
  }
  if (state.joinFailed) {
    return rejectedJoin(
      runtime,
      draft,
      'Draft join already has a failed commit attempt',
      state.joinPatchShas,
    );
  }
  if (state.intents.length === 0) {
    return rejectedJoin(runtime, draft, 'Draft has no public intents to join');
  }

  const patchShas = await commitDraftIntents(runtime, state);
  if (patchShas.length !== state.intents.length) {
    state.joinFailed = true;
    return rejectedJoin(runtime, draft, 'Draft join failed while committing intents', patchShas);
  }
  state.joined = true;
  return joinResult({
    runtime,
    draft,
    mode: 'join',
    outcome: 'accepted',
    patchShas,
  });
}

function rejectedJoin(
  runtime: WarpWorldline,
  draft: DraftTimeline,
  reason: string,
  patchShas: readonly string[] = [],
): JoinResult {
  return joinResult({
    runtime,
    draft,
    mode: 'join',
    outcome: 'rejected',
    patchShas,
    reason,
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
