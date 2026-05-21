import ContinuumArtifactAuthority from './ContinuumArtifactAuthority.ts';
import ContinuumFamilyId from './ContinuumFamilyId.ts';
import WarpError from '../errors/WarpError.ts';

export type ContinuumArtifactDescriptorFields = {
  readonly familyId: string | ContinuumFamilyId;
  readonly sourceSchemaPath: string;
  readonly generatedBy: string;
  readonly artifactKind: string;
  readonly authority: string | ContinuumArtifactAuthority;
  readonly targets: readonly string[];
  readonly version?: string;
  readonly witnessScope?: string;
  readonly artifactDigest?: string;
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

/** Runtime-backed descriptor for a generated Continuum family artifact. */
export default class ContinuumArtifactDescriptor {
  readonly familyId: ContinuumFamilyId;
  readonly sourceSchemaPath: string;
  readonly generatedBy: string;
  readonly artifactKind: string;
  readonly authority: ContinuumArtifactAuthority;
  readonly targets: readonly string[];
  readonly version: string | undefined;
  readonly witnessScope: string | undefined;
  readonly artifactDigest: string | undefined;
  readonly schemaHash: string | undefined;
  readonly sourceHash: string | undefined;
  readonly integrityStatus: string | undefined;
  readonly integrityScope: string | undefined;
  readonly hashAlgorithm: string | undefined;
  readonly signatureAlgorithm: string | undefined;
  readonly signatureKeyId: string | undefined;
  readonly generatedLegs: readonly string[] | undefined;
  readonly generatedFiles: readonly string[] | undefined;

  constructor(fields: ContinuumArtifactDescriptorFields) {
    const { familyId, sourceSchemaPath, generatedBy, artifactKind, authority, targets } = fields;
    this.familyId = normalizeFamilyId(familyId);
    this.sourceSchemaPath = requireNonEmptyString(sourceSchemaPath, 'sourceSchemaPath');
    this.generatedBy = requireNonEmptyString(generatedBy, 'generatedBy');
    this.artifactKind = requireNonEmptyString(artifactKind, 'artifactKind');
    this.authority = normalizeAuthority(authority);
    this.targets = freezeTargets(targets);
    this.version = optionalNonEmptyString(fields.version, 'version');
    this.witnessScope = optionalNonEmptyString(fields.witnessScope, 'witnessScope');
    this.artifactDigest = optionalNonEmptyString(fields.artifactDigest, 'artifactDigest');
    this.schemaHash = optionalNonEmptyString(fields.schemaHash, 'schemaHash');
    this.sourceHash = optionalNonEmptyString(fields.sourceHash, 'sourceHash');
    this.integrityStatus = optionalNonEmptyString(fields.integrityStatus, 'integrityStatus');
    this.integrityScope = optionalNonEmptyString(fields.integrityScope, 'integrityScope');
    this.hashAlgorithm = optionalNonEmptyString(fields.hashAlgorithm, 'hashAlgorithm');
    this.signatureAlgorithm = optionalNonEmptyString(fields.signatureAlgorithm, 'signatureAlgorithm');
    this.signatureKeyId = optionalNonEmptyString(fields.signatureKeyId, 'signatureKeyId');
    this.generatedLegs = optionalStringArray(fields.generatedLegs, 'generatedLegs');
    this.generatedFiles = optionalStringArray(fields.generatedFiles, 'generatedFiles');
    Object.freeze(this);
  }

  /** Returns true when the descriptor includes the requested generation target. */
  hasTarget(target: string): boolean {
    return this.targets.includes(target);
  }

  /** Returns true when the artifact may be used as generated authority. */
  hasGeneratedAuthority(): boolean {
    return this.authority.isGeneratedAuthority();
  }
}

/** Normalizes a family id carrier. */
function normalizeFamilyId(value: string | ContinuumFamilyId): ContinuumFamilyId {
  if (value instanceof ContinuumFamilyId) {
    return value;
  }
  return new ContinuumFamilyId(value);
}

/** Normalizes an authority carrier. */
function normalizeAuthority(value: string | ContinuumArtifactAuthority): ContinuumArtifactAuthority {
  if (value instanceof ContinuumArtifactAuthority) {
    return value;
  }
  return new ContinuumArtifactAuthority(value);
}

/** Validates a required non-empty string. */
function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}

/** Validates an optional non-empty string. */
function optionalNonEmptyString(value: string | undefined, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireNonEmptyString(value, name);
}

/** Freezes and validates a generated target list. */
function freezeTargets(targets: readonly string[]): readonly string[] {
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new WarpError('targets must contain at least one generated target', 'E_VALIDATION');
  }
  return freezeStringArray(targets, 'targets[]');
}

/** Validates an optional generated string list. */
function optionalStringArray(value: readonly string[] | undefined, name: string): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new WarpError(`${name} must be a string array`, 'E_VALIDATION');
  }
  return freezeStringArray(value, `${name}[]`);
}

/** Freezes and validates a generated string list. */
function freezeStringArray(values: readonly string[], name: string): readonly string[] {
  const normalized: string[] = [];
  for (const value of values) {
    normalized.push(requireNonEmptyString(value, name));
  }
  return Object.freeze(normalized);
}
