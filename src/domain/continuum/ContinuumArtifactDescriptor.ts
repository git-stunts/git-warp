import ContinuumArtifactAuthority from './ContinuumArtifactAuthority.ts';
import ContinuumFamilyId from './ContinuumFamilyId.ts';
import WarpError from '../errors/WarpError.ts';

export type ContinuumArtifactDescriptorFields = {
  readonly familyId: string | ContinuumFamilyId;
  readonly version: string;
  readonly sourceSchemaPath: string;
  readonly generatedBy: string;
  readonly artifactKind: string;
  readonly authority: string | ContinuumArtifactAuthority;
  readonly targets: readonly string[];
  readonly witnessScope?: string;
  readonly artifactDigest?: string;
};

/** Runtime-backed descriptor for a generated Continuum family artifact. */
export default class ContinuumArtifactDescriptor {
  readonly familyId: ContinuumFamilyId;
  readonly version: string;
  readonly sourceSchemaPath: string;
  readonly generatedBy: string;
  readonly artifactKind: string;
  readonly authority: ContinuumArtifactAuthority;
  readonly targets: readonly string[];
  readonly witnessScope: string | undefined;
  readonly artifactDigest: string | undefined;

  constructor(fields: ContinuumArtifactDescriptorFields) {
    const { familyId, version, sourceSchemaPath, generatedBy, artifactKind, authority, targets } = fields;
    this.familyId = normalizeFamilyId(familyId);
    this.version = requireNonEmptyString(version, 'version');
    this.sourceSchemaPath = requireNonEmptyString(sourceSchemaPath, 'sourceSchemaPath');
    this.generatedBy = requireNonEmptyString(generatedBy, 'generatedBy');
    this.artifactKind = requireNonEmptyString(artifactKind, 'artifactKind');
    this.authority = normalizeAuthority(authority);
    this.targets = freezeTargets(targets);
    this.witnessScope = optionalNonEmptyString(fields.witnessScope, 'witnessScope');
    this.artifactDigest = optionalNonEmptyString(fields.artifactDigest, 'artifactDigest');
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
  if (value.length === 0) {
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
  if (targets.length === 0) {
    throw new WarpError('targets must contain at least one generated target', 'E_VALIDATION');
  }
  const normalized: string[] = [];
  for (const target of targets) {
    normalized.push(requireNonEmptyString(target, 'targets[]'));
  }
  return Object.freeze(normalized);
}
