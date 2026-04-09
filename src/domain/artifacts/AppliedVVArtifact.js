import WarpError from '../errors/WarpError.ts';
import { CheckpointArtifact } from './CheckpointArtifact.js';

/**
 * Carries the applied version vector for checkpoint recovery.
 */
export class AppliedVVArtifact extends CheckpointArtifact {
  /** Creates an instance.
   * @param {{ schemaVersion: number, appliedVV: import('../crdt/VersionVector.js').default }} fields
   */
  constructor({ schemaVersion, appliedVV }) {
    super({ schemaVersion });
    if (appliedVV === null || appliedVV === undefined) {
      throw new WarpError('AppliedVVArtifact requires an appliedVV', 'E_INVALID_ARTIFACT');
    }
    /** @type {import('../crdt/VersionVector.js').default} */
    this.appliedVV = appliedVV;
    Object.freeze(this);
  }
}
