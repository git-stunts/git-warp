import WarpError from '../errors/WarpError.ts';

/**
 * Abstract base class for checkpoint artifacts.
 *
 * A checkpoint is one domain event with multiple persistence artifacts.
 * Each artifact carries a domain payload. The adapter maps artifacts to
 * Git tree paths at the last responsible moment.
 *
 * Subclasses: StateArtifact, FrontierArtifact, AppliedVVArtifact.
 */
export class CheckpointArtifact {
  /** Schema version (positive integer). */
  readonly schemaVersion: number;

  constructor({ schemaVersion }: { schemaVersion: number }) {
    if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
      throw new WarpError(
        `CheckpointArtifact schemaVersion must be a positive integer, got ${JSON.stringify(schemaVersion)}`,
        'E_INVALID_ARTIFACT',
      );
    }
    this.schemaVersion = schemaVersion;
  }
}
