import WarpError from '../errors/WarpError.ts';
import { CheckpointArtifact } from './CheckpointArtifact.ts';
import type { WarpStateV5 } from '../services/JoinReducer.js';

/** Carries the full CRDT state for checkpoint recovery. */
export class StateArtifact extends CheckpointArtifact {
  readonly state: WarpStateV5;

  constructor({ schemaVersion, state }: { schemaVersion: number; state: WarpStateV5 }) {
    super({ schemaVersion });
    if (state === null || state === undefined) {
      throw new WarpError('StateArtifact requires a state', 'E_INVALID_ARTIFACT');
    }
    this.state = state;
    Object.freeze(this);
  }
}
