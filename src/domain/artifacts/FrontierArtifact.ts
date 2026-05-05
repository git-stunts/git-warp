import WarpError from '../errors/WarpError.ts';
import { CheckpointArtifact } from './CheckpointArtifact.ts';

/** Carries the writer frontier for checkpoint recovery. */
export class FrontierArtifact extends CheckpointArtifact {
  readonly frontier: Map<string, string>;

  constructor({ schemaVersion, frontier }: { schemaVersion: number; frontier: Map<string, string> }) {
    super({ schemaVersion });
    if (!(frontier instanceof Map)) {
      throw new WarpError('FrontierArtifact requires a Map frontier', 'E_INVALID_ARTIFACT');
    }
    this.frontier = frontier;
    Object.freeze(this);
  }
}
