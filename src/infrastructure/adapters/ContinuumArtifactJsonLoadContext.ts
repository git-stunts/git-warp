import type ContinuumArtifactAuthority from '../../domain/continuum/ContinuumArtifactAuthority.ts';
import type ContinuumFamilyId from '../../domain/continuum/ContinuumFamilyId.ts';

export type ContinuumArtifactJsonLoadContext = {
  readonly familyId: string | ContinuumFamilyId;
  readonly authority: string | ContinuumArtifactAuthority;
  readonly sourceSchemaPath?: string;
  readonly generatedBy?: string;
  readonly version?: string;
  readonly targets?: readonly string[];
  readonly witnessScope?: string;
  readonly artifactDigest?: string;
};
