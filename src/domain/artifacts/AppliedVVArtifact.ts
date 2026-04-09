import WarpError from '../errors/WarpError.ts';
import { CheckpointArtifact } from './CheckpointArtifact.ts';
import type VersionVector from '../crdt/VersionVector.ts';

/** Carries the applied version vector for checkpoint recovery. */
export class AppliedVVArtifact extends CheckpointArtifact {
  readonly appliedVV: VersionVector;

  constructor({ schemaVersion, appliedVV }: { schemaVersion: number; appliedVV: VersionVector }) {
    super({ schemaVersion });
    if (appliedVV === null || appliedVV === undefined) {
      throw new WarpError('AppliedVVArtifact requires an appliedVV', 'E_INVALID_ARTIFACT');
    }
    this.appliedVV = appliedVV;
    Object.freeze(this);
  }
}
