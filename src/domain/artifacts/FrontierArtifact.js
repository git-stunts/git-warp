import WarpError from '../errors/WarpError.ts';
import { CheckpointArtifact } from './CheckpointArtifact.js';

/**
 * Carries the writer frontier for checkpoint recovery.
 */
export class FrontierArtifact extends CheckpointArtifact {
  /** Creates an instance.
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
