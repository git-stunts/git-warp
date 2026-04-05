import WarpError from '../errors/WarpError.js';

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

/**
 * Carries the full CRDT state for checkpoint recovery.
 */
export class StateArtifact extends CheckpointArtifact {
  /**
   * Creates a StateArtifact.
   *
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

/**
 * Carries the writer frontier for checkpoint recovery.
 */
export class FrontierArtifact extends CheckpointArtifact {
  /**
   * Creates a FrontierArtifact.
   *
   * @param {{ schemaVersion: number, frontier: Map<string, string> }} fields
   */
  constructor({ schemaVersion, frontier }) {
    super({ schemaVersion });
    if (!(frontier instanceof Map)) {
      throw new WarpError('FrontierArtifact requires a Map frontier', 'E_INVALID_ARTIFACT');
    }
    /** @type {Map<string, string>} */
    this.frontier = frontier;
    Object.freeze(this);
  }
}

/**
 * Carries the applied version vector for checkpoint recovery.
 */
export class AppliedVVArtifact extends CheckpointArtifact {
  /**
   * Creates an AppliedVVArtifact.
   *
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
