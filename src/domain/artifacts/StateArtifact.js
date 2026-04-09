import WarpError from '../errors/WarpError.ts';
import { CheckpointArtifact } from './CheckpointArtifact.js';

/**
 * Carries the full CRDT state for checkpoint recovery.
 */
export class StateArtifact extends CheckpointArtifact {
  /** Creates an instance.
   * @param {{ schemaVersion: number, state: import('../services/JoinReducer.js').WarpStateV5 }} fields
   */
  constructor({ schemaVersion, state }) {
    super({ schemaVersion });
    if (state === null || state === undefined) {
      throw new WarpError('StateArtifact requires a state', 'E_INVALID_ARTIFACT');
    }
    /** @type {import('../services/JoinReducer.js').WarpStateV5} */
    this.state = state;
    Object.freeze(this);
  }
}
