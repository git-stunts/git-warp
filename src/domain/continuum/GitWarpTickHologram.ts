import GitWarpTickWitnessLadder from './GitWarpTickWitnessLadder.ts';
import ProvenancePayload from '../services/provenance/ProvenancePayload.ts';
import type WarpState from '../services/state/WarpState.ts';
import type Patch from '../types/Patch.ts';
import type { TickReceipt } from '../types/TickReceipt.ts';

export type GitWarpTickHologramFields = {
  readonly patch: Patch;
  readonly patchSha: string;
  readonly receipt: TickReceipt;
};

/** Replay-bearing hologram for one admitted git-warp tick. */
export default class GitWarpTickHologram {
  readonly witnessLadder: GitWarpTickWitnessLadder;
  readonly payload: ProvenancePayload;

  constructor(fields: GitWarpTickHologramFields) {
    this.witnessLadder = new GitWarpTickWitnessLadder(fields);
    this.payload = new ProvenancePayload([{ patch: fields.patch, sha: fields.patchSha }]);
    Object.freeze(this);
  }

  get patchSha(): string {
    return this.witnessLadder.replayCore.patchSha;
  }

  get writer(): string {
    return this.witnessLadder.replayCore.writer;
  }

  get lamport(): number {
    return this.witnessLadder.replayCore.lamport;
  }

  /** Deterministically materializes the successor state for this tick. */
  materializeFrom(initialState?: WarpState): WarpState {
    return this.payload.replay(initialState);
  }
}
