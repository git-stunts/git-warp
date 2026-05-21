import type ContinuumArtifactAuthority from '../../domain/continuum/ContinuumArtifactAuthority.ts';
import type ContinuumFamilyId from '../../domain/continuum/ContinuumFamilyId.ts';

export type JsonObject = Readonly<Record<string, unknown>>;

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

export type DescriptorFieldSource = {
  readonly sourceSchemaPath: string;
  readonly generatedBy: string;
  readonly artifactKind: string;
  readonly targets: readonly string[];
  readonly schemaHash?: string;
  readonly sourceHash?: string;
  readonly integrityStatus?: string;
  readonly integrityScope?: string;
  readonly hashAlgorithm?: string;
  readonly signatureAlgorithm?: string;
  readonly signatureKeyId?: string;
  readonly generatedLegs?: readonly string[];
  readonly generatedFiles?: readonly string[];
};

export type WesleyIntegrityFields = {
  readonly integrityStatus: string;
  readonly integrityScope: string;
  readonly hashAlgorithm: string;
  readonly signatureAlgorithm: string;
  readonly signatureKeyId: string;
};

export type GeneratedLegInventory = {
  readonly names: readonly string[];
  readonly files: readonly string[];
};
