import WarpError from '../errors/WarpError.ts';

const GENERATED_ARTIFACT_AUTHORITY = 'generated-artifact';
const GENERATED_FIXTURE_AUTHORITY = 'generated-fixture';
const LOCAL_MIRROR_AUTHORITY = 'local-mirror';
const HANDWRITTEN_MIRROR_AUTHORITY = 'handwritten-mirror';

export type ContinuumArtifactAuthorityValue =
  | typeof GENERATED_ARTIFACT_AUTHORITY
  | typeof GENERATED_FIXTURE_AUTHORITY
  | typeof LOCAL_MIRROR_AUTHORITY
  | typeof HANDWRITTEN_MIRROR_AUTHORITY;

export const CONTINUUM_ARTIFACT_AUTHORITIES: readonly ContinuumArtifactAuthorityValue[] = Object.freeze([
  GENERATED_ARTIFACT_AUTHORITY,
  GENERATED_FIXTURE_AUTHORITY,
  LOCAL_MIRROR_AUTHORITY,
  HANDWRITTEN_MIRROR_AUTHORITY,
]);

/** Runtime-backed authority posture for an ingested Continuum artifact. */
export default class ContinuumArtifactAuthority {
  readonly value: ContinuumArtifactAuthorityValue;

  constructor(value: string) {
    this.value = requireContinuumArtifactAuthority(value);
    Object.freeze(this);
  }

  /** Returns true for Wesley-generated artifacts and documented fixtures. */
  isGeneratedAuthority(): boolean {
    return (
      this.value === GENERATED_ARTIFACT_AUTHORITY ||
      this.value === GENERATED_FIXTURE_AUTHORITY
    );
  }

  /** Returns the stable authority string. */
  toString(): string {
    return this.value;
  }
}

/** Validates a raw authority posture string. */
export function requireContinuumArtifactAuthority(value: string): ContinuumArtifactAuthorityValue {
  switch (value) {
    case GENERATED_ARTIFACT_AUTHORITY:
      return GENERATED_ARTIFACT_AUTHORITY;
    case GENERATED_FIXTURE_AUTHORITY:
      return GENERATED_FIXTURE_AUTHORITY;
    case LOCAL_MIRROR_AUTHORITY:
      return LOCAL_MIRROR_AUTHORITY;
    case HANDWRITTEN_MIRROR_AUTHORITY:
      return HANDWRITTEN_MIRROR_AUTHORITY;
    default:
      throw new WarpError(
        `Continuum artifact authority must be one of: ${CONTINUUM_ARTIFACT_AUTHORITIES.join(', ')}`,
        'E_VALIDATION',
      );
  }
}
