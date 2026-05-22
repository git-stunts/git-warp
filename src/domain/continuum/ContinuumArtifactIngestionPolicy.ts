import ContinuumArtifactAuthorityError from '../errors/ContinuumArtifactAuthorityError.ts';
import type ContinuumArtifactDescriptor from './ContinuumArtifactDescriptor.ts';

const WESLEY_REALIZATION_MANIFEST_KIND = 'wesley.realization.manifest.v1';
const WESLEY_REALIZATION_MANIFEST_AUTHORITY = 'generated-artifact';
const CONTINUUM_FIXTURE_KIND = 'continuum.family.fixture';
const CONTINUUM_FIXTURE_AUTHORITY = 'generated-fixture';

/** Policy gate for admitting generated Continuum family artifacts. */
export default class ContinuumArtifactIngestionPolicy {
  /** Accepts generated artifacts and documented fixtures, rejecting mirrors. */
  ingest(descriptor: ContinuumArtifactDescriptor): ContinuumArtifactDescriptor {
    this.assertGeneratedAuthority(descriptor);
    return descriptor;
  }

  /** Rejects descriptors whose authority would make local mirrors canonical. */
  assertGeneratedAuthority(descriptor: ContinuumArtifactDescriptor): void {
    const expectedAuthority = expectedGeneratedAuthority(descriptor);
    const actualAuthority = descriptor.authority.toString();
    if (descriptor.hasGeneratedAuthority() && actualAuthority === expectedAuthority) {
      return;
    }
    throw new ContinuumArtifactAuthorityError(
      `Continuum family ${descriptor.familyId.toString()} artifact kind ${descriptor.artifactKind} must use authority ${expectedAuthority}, not ${actualAuthority}`,
    );
  }
}

/** Returns the generated authority required for the descriptor's artifact kind. */
function expectedGeneratedAuthority(descriptor: ContinuumArtifactDescriptor): string {
  if (descriptor.artifactKind === WESLEY_REALIZATION_MANIFEST_KIND) {
    return WESLEY_REALIZATION_MANIFEST_AUTHORITY;
  }
  if (descriptor.artifactKind === CONTINUUM_FIXTURE_KIND) {
    return CONTINUUM_FIXTURE_AUTHORITY;
  }
  throw new ContinuumArtifactAuthorityError(
    `Continuum family ${descriptor.familyId.toString()} artifact kind ${descriptor.artifactKind} is not a recognized generated Continuum artifact shape`,
  );
}
