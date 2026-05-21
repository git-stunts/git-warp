import ContinuumArtifactAuthorityError from '../errors/ContinuumArtifactAuthorityError.ts';
import type ContinuumArtifactDescriptor from './ContinuumArtifactDescriptor.ts';

/** Policy gate for admitting generated Continuum family artifacts. */
export default class ContinuumArtifactIngestionPolicy {
  /** Accepts generated artifacts and documented fixtures, rejecting mirrors. */
  ingest(descriptor: ContinuumArtifactDescriptor): ContinuumArtifactDescriptor {
    this.assertGeneratedAuthority(descriptor);
    return descriptor;
  }

  /** Rejects descriptors whose authority would make local mirrors canonical. */
  assertGeneratedAuthority(descriptor: ContinuumArtifactDescriptor): void {
    if (descriptor.hasGeneratedAuthority()) {
      return;
    }
    throw new ContinuumArtifactAuthorityError(
      `Continuum family ${descriptor.familyId.toString()} must be loaded from a generated artifact or fixture, not ${descriptor.authority.toString()}`,
    );
  }
}
