import {
  GitWarpGraphModelContractConformanceResult,
} from './GitWarpGraphModelContractConformance.ts';
import WarpError from '../errors/WarpError.ts';

const WARP_TTD_PRESENT_POSTURE = 'PRESENT';
const WARP_TTD_OBSTRUCTED_POSTURE = 'OBSTRUCTED';
const WARP_TTD_SOURCE_FAMILY = 'git-warp';
const WARP_TTD_ARTIFACT = 'runtime-boundary-family.graph-model-conformance';
const WARP_TTD_ORIGIN = 'TRANSLATED_SUBSTRATE';
const WARP_TTD_SCOPE = 'SESSION';
const WARP_TTD_TARGET = 'warp-ttd';

type GitWarpWarpTtdGeneratedFamilySmokePosture =
  | typeof WARP_TTD_PRESENT_POSTURE
  | typeof WARP_TTD_OBSTRUCTED_POSTURE;

type GitWarpWarpTtdGeneratedFamilySmokeFactFields = {
  readonly posture: GitWarpWarpTtdGeneratedFamilySmokePosture;
  readonly sourceFamily: string;
  readonly artifact: string;
  readonly origin: string;
  readonly scope: string;
  readonly target: string;
  readonly payloadLines: readonly string[];
  readonly reason?: string;
};

/** `warp-ttd`-shaped generated-family fact proving git-warp graph-model evidence is consumable. */
export class GitWarpWarpTtdGeneratedFamilySmokeFact {
  readonly posture: GitWarpWarpTtdGeneratedFamilySmokePosture;
  readonly sourceFamily: string;
  readonly artifact: string;
  readonly origin: string;
  readonly scope: string;
  readonly target: string;
  readonly payloadLines: readonly string[];
  readonly reason: string | undefined;

  constructor(fields: GitWarpWarpTtdGeneratedFamilySmokeFactFields) {
    this.posture = requirePosture(fields.posture);
    this.sourceFamily = requireNonEmptyString(fields.sourceFamily, 'sourceFamily');
    this.artifact = requireNonEmptyString(fields.artifact, 'artifact');
    this.origin = requireNonEmptyString(fields.origin, 'origin');
    this.scope = requireNonEmptyString(fields.scope, 'scope');
    this.target = requireNonEmptyString(fields.target, 'target');
    this.payloadLines = freezePayloadLines(fields.payloadLines);
    this.reason = optionalReason(fields.reason, this.posture);
    Object.freeze(this);
  }

  /** Returns true when the generated-family fact is present for `warp-ttd`. */
  passed(): boolean {
    return this.posture === WARP_TTD_PRESENT_POSTURE;
  }
}

/** Builds a `warp-ttd` generated-family smoke fact from graph-model conformance evidence. */
export default class GitWarpWarpTtdGeneratedFamilySmoke {
  /** Converts conformance evidence into a `warp-ttd` generated-family smoke fact. */
  evaluate(
    conformance: GitWarpGraphModelContractConformanceResult,
  ): GitWarpWarpTtdGeneratedFamilySmokeFact {
    const checkedConformance = requireConformance(conformance);
    if (checkedConformance.passed() && checkedConformance.descriptor.hasTarget(WARP_TTD_TARGET)) {
      return new GitWarpWarpTtdGeneratedFamilySmokeFact({
        posture: WARP_TTD_PRESENT_POSTURE,
        sourceFamily: WARP_TTD_SOURCE_FAMILY,
        artifact: WARP_TTD_ARTIFACT,
        origin: WARP_TTD_ORIGIN,
        scope: WARP_TTD_SCOPE,
        target: WARP_TTD_TARGET,
        payloadLines: checkedConformance.evidenceLines(),
      });
    }
    return new GitWarpWarpTtdGeneratedFamilySmokeFact({
      posture: WARP_TTD_OBSTRUCTED_POSTURE,
      sourceFamily: WARP_TTD_SOURCE_FAMILY,
      artifact: WARP_TTD_ARTIFACT,
      origin: WARP_TTD_ORIGIN,
      scope: WARP_TTD_SCOPE,
      target: WARP_TTD_TARGET,
      payloadLines: checkedConformance.evidenceLines(),
      reason: obstructionReason(checkedConformance),
    });
  }
}

function obstructionReason(conformance: GitWarpGraphModelContractConformanceResult): string {
  const failedNames = conformance.failedChecks().map((check) => check.name);
  if (failedNames.length === 0 && !conformance.descriptor.hasTarget(WARP_TTD_TARGET)) {
    return 'generated-family conformance did not expose the warp-ttd target';
  }
  return `generated-family conformance failed: ${failedNames.join(', ')}`;
}

function requireConformance(
  value: GitWarpGraphModelContractConformanceResult,
): GitWarpGraphModelContractConformanceResult {
  if (!(value instanceof GitWarpGraphModelContractConformanceResult)) {
    throw new WarpError('conformance must be a GitWarpGraphModelContractConformanceResult', 'E_VALIDATION');
  }
  return value;
}

function requirePosture(
  value: GitWarpWarpTtdGeneratedFamilySmokePosture,
): GitWarpWarpTtdGeneratedFamilySmokePosture {
  if (value === WARP_TTD_PRESENT_POSTURE || value === WARP_TTD_OBSTRUCTED_POSTURE) {
    return value;
  }
  throw new WarpError('posture must be a warp-ttd generated-family smoke posture', 'E_VALIDATION');
}

function freezePayloadLines(lines: readonly string[]): readonly string[] {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new WarpError('payloadLines must contain at least one evidence line', 'E_VALIDATION');
  }
  const checkedLines: string[] = [];
  for (const line of lines) {
    checkedLines.push(requireNonEmptyString(line, 'payloadLines[]'));
  }
  return Object.freeze(checkedLines);
}

function optionalReason(
  value: string | undefined,
  posture: GitWarpWarpTtdGeneratedFamilySmokePosture,
): string | undefined {
  if (posture === WARP_TTD_PRESENT_POSTURE) {
    if (value !== undefined) {
      throw new WarpError('present warp-ttd generated-family facts must not carry an obstruction reason', 'E_VALIDATION');
    }
    return undefined;
  }
  return requireNonEmptyString(value, 'reason');
}

function requireNonEmptyString(value: string | undefined, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}
