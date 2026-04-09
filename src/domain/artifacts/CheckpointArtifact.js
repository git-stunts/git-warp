import WarpError from '../errors/WarpError.ts';

/**
 * Abstract base class for checkpoint artifacts.
 *
 * A checkpoint is one domain event with multiple persistence artifacts.
 * Each artifact carries a domain payload. The adapter maps artifacts to
 * Git tree paths at the last responsible moment.
 *
 * Subclasses: StateArtifact, FrontierArtifact, AppliedVVArtifact.
 *
 * @abstract
 */
export class CheckpointArtifact {
  /**
   * Creates a CheckpointArtifact.
   *
   * @param {{ schemaVersion: number }} fields
   */
  constructor({ schemaVersion }) {
    if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
      throw new WarpError(
        `CheckpointArtifact schemaVersion must be a positive integer, got ${JSON.stringify(schemaVersion)}`,
        'E_INVALID_ARTIFACT',
      );
    }
    /** @type {number} */
    this.schemaVersion = schemaVersion;
  }
}
