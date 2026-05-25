import ContinuumArtifactDescriptor from './ContinuumArtifactDescriptor.ts';
import V17GoldenGraphFixtureManifest, {
  V17_GOLDEN_CONTENT_FACT,
  V17_GOLDEN_EDGE_FACT,
  V17_GOLDEN_MULTI_WRITER_FACT,
  V17_GOLDEN_NODE_FACT,
  V17_GOLDEN_PROPERTY_FACT,
  V17_GOLDEN_REMOVAL_FACT,
  type V17GoldenGraphFixtureFactKind,
} from '../migrations/V17GoldenGraphFixtureManifest.ts';
import WarpError from '../errors/WarpError.ts';

const RUNTIME_BOUNDARY_FAMILY_ID = 'runtime-boundary-family';
const RUNTIME_BOUNDARY_SCHEMA_BASENAME = 'continuum-runtime-boundary-family.graphql';
const CONTINUUM_FIXTURE_ARTIFACT_KIND = 'continuum.family.fixture';
const CONTINUUM_FIXTURE_TARGET = 'continuum-fixture';
const WARP_TTD_TARGET = 'warp-ttd';

const GRAPH_MODEL_CONFORMANCE_PASSED = 'passed';
const GRAPH_MODEL_CONFORMANCE_FAILED = 'failed';

type GraphModelConformanceStatus =
  | typeof GRAPH_MODEL_CONFORMANCE_PASSED
  | typeof GRAPH_MODEL_CONFORMANCE_FAILED;

type GitWarpGraphModelContractConformanceCheckFields = {
  readonly name: string;
  readonly status: GraphModelConformanceStatus;
  readonly detail: string;
};

type GitWarpGraphModelContractConformanceResultFields = {
  readonly descriptor: ContinuumArtifactDescriptor;
  readonly manifest: V17GoldenGraphFixtureManifest;
  readonly checks: readonly GitWarpGraphModelContractConformanceCheck[];
};

/** A single generated-contract conformance check for graph-model migration evidence. */
export class GitWarpGraphModelContractConformanceCheck {
  readonly name: string;
  readonly status: GraphModelConformanceStatus;
  readonly detail: string;

  constructor(fields: GitWarpGraphModelContractConformanceCheckFields) {
    this.name = requireNonEmptyString(fields.name, 'name');
    this.status = requireStatus(fields.status);
    this.detail = requireNonEmptyString(fields.detail, 'detail');
    Object.freeze(this);
  }

  /** Returns true when this check passed. */
  passed(): boolean {
    return this.status === GRAPH_MODEL_CONFORMANCE_PASSED;
  }
}

/** Result value for graph-model conformance against an admitted Continuum contract descriptor. */
export class GitWarpGraphModelContractConformanceResult {
  readonly descriptor: ContinuumArtifactDescriptor;
  readonly manifest: V17GoldenGraphFixtureManifest;
  readonly checks: readonly GitWarpGraphModelContractConformanceCheck[];

  constructor(fields: GitWarpGraphModelContractConformanceResultFields) {
    this.descriptor = requireDescriptor(fields.descriptor);
    this.manifest = requireManifest(fields.manifest);
    this.checks = freezeChecks(fields.checks);
    Object.freeze(this);
  }

  /** Returns true when every required conformance check passed. */
  passed(): boolean {
    return this.checks.every((check) => check.passed());
  }

  /** Returns failed checks for operator-facing release evidence. */
  failedChecks(): readonly GitWarpGraphModelContractConformanceCheck[] {
    return Object.freeze(this.checks.filter((check) => !check.passed()));
  }

  /** Returns a compact deterministic evidence summary for release packets. */
  evidenceLines(): readonly string[] {
    return Object.freeze([
      `contract-family=${this.descriptor.familyId.toString()}`,
      `source-schema=${this.descriptor.sourceSchemaPath}`,
      `contract-targets=${this.descriptor.targets.join(',')}`,
      `fixture-id=${this.manifest.fixtureId}`,
      `graph-id=${this.manifest.graphId}`,
      `visible-fact-count=${this.manifest.visibleFacts.length.toString()}`,
      `writer-chain-count=${this.manifest.writerChains.length.toString()}`,
      `status=${this.passed() ? GRAPH_MODEL_CONFORMANCE_PASSED : GRAPH_MODEL_CONFORMANCE_FAILED}`,
    ]);
  }
}

/** Checks that v18 graph-model migration evidence is backed by generated Continuum contract shape. */
export default class GitWarpGraphModelContractConformance {
  /** Evaluates a descriptor and v17 fixture manifest as generated-contract evidence. */
  evaluate(
    descriptor: ContinuumArtifactDescriptor,
    manifest: V17GoldenGraphFixtureManifest,
  ): GitWarpGraphModelContractConformanceResult {
    const checkedDescriptor = requireDescriptor(descriptor);
    const checkedManifest = requireManifest(manifest);
    return new GitWarpGraphModelContractConformanceResult({
      descriptor: checkedDescriptor,
      manifest: checkedManifest,
      checks: [
        checkEquals(
          'runtime-boundary-family',
          checkedDescriptor.familyId.toString(),
          RUNTIME_BOUNDARY_FAMILY_ID,
        ),
        checkEquals(
          'runtime-boundary-artifact-kind',
          checkedDescriptor.artifactKind,
          CONTINUUM_FIXTURE_ARTIFACT_KIND,
        ),
        checkIncludes(
          'runtime-boundary-schema',
          checkedDescriptor.sourceSchemaPath,
          RUNTIME_BOUNDARY_SCHEMA_BASENAME,
        ),
        checkTarget(checkedDescriptor, CONTINUUM_FIXTURE_TARGET),
        checkTarget(checkedDescriptor, WARP_TTD_TARGET),
        checkGeneratedAuthority(checkedDescriptor),
        checkFactKind(checkedManifest, V17_GOLDEN_NODE_FACT),
        checkFactKind(checkedManifest, V17_GOLDEN_EDGE_FACT),
        checkFactKind(checkedManifest, V17_GOLDEN_PROPERTY_FACT),
        checkFactKind(checkedManifest, V17_GOLDEN_CONTENT_FACT),
        checkFactKind(checkedManifest, V17_GOLDEN_REMOVAL_FACT),
        checkFactKind(checkedManifest, V17_GOLDEN_MULTI_WRITER_FACT),
      ],
    });
  }
}

function checkEquals(
  name: string,
  actual: string,
  expected: string,
): GitWarpGraphModelContractConformanceCheck {
  if (actual === expected) {
    return passedCheck(name, `${actual} matches generated contract evidence`);
  }
  return failedCheck(name, `${actual} does not match ${expected}`);
}

function checkIncludes(
  name: string,
  actual: string,
  expectedFragment: string,
): GitWarpGraphModelContractConformanceCheck {
  if (actual.includes(expectedFragment)) {
    return passedCheck(name, `${actual} includes ${expectedFragment}`);
  }
  return failedCheck(name, `${actual} does not include ${expectedFragment}`);
}

function checkTarget(
  descriptor: ContinuumArtifactDescriptor,
  target: string,
): GitWarpGraphModelContractConformanceCheck {
  if (descriptor.hasTarget(target)) {
    return passedCheck(`target:${target}`, `descriptor includes ${target}`);
  }
  return failedCheck(`target:${target}`, `descriptor does not include ${target}`);
}

function checkGeneratedAuthority(
  descriptor: ContinuumArtifactDescriptor,
): GitWarpGraphModelContractConformanceCheck {
  if (descriptor.hasGeneratedAuthority()) {
    return passedCheck('generated-authority', 'descriptor authority is generated');
  }
  return failedCheck('generated-authority', 'descriptor authority is not generated');
}

function checkFactKind(
  manifest: V17GoldenGraphFixtureManifest,
  kind: V17GoldenGraphFixtureFactKind,
): GitWarpGraphModelContractConformanceCheck {
  if (manifest.hasVisibleFactKind(kind)) {
    return passedCheck(`fixture-fact:${kind}`, `fixture includes ${kind} facts`);
  }
  return failedCheck(`fixture-fact:${kind}`, `fixture does not include ${kind} facts`);
}

function passedCheck(name: string, detail: string): GitWarpGraphModelContractConformanceCheck {
  return new GitWarpGraphModelContractConformanceCheck({
    name,
    status: GRAPH_MODEL_CONFORMANCE_PASSED,
    detail,
  });
}

function failedCheck(name: string, detail: string): GitWarpGraphModelContractConformanceCheck {
  return new GitWarpGraphModelContractConformanceCheck({
    name,
    status: GRAPH_MODEL_CONFORMANCE_FAILED,
    detail,
  });
}

function requireDescriptor(descriptor: ContinuumArtifactDescriptor): ContinuumArtifactDescriptor {
  if (!(descriptor instanceof ContinuumArtifactDescriptor)) {
    throw new WarpError('descriptor must be a ContinuumArtifactDescriptor', 'E_VALIDATION');
  }
  return descriptor;
}

function requireManifest(manifest: V17GoldenGraphFixtureManifest): V17GoldenGraphFixtureManifest {
  if (!(manifest instanceof V17GoldenGraphFixtureManifest)) {
    throw new WarpError('manifest must be a V17GoldenGraphFixtureManifest', 'E_VALIDATION');
  }
  return manifest;
}

function freezeChecks(
  checks: readonly GitWarpGraphModelContractConformanceCheck[],
): readonly GitWarpGraphModelContractConformanceCheck[] {
  if (!Array.isArray(checks) || checks.length === 0) {
    throw new WarpError('checks must contain at least one conformance check', 'E_VALIDATION');
  }
  return Object.freeze(checks.map(requireCheck));
}

function requireCheck(
  check: GitWarpGraphModelContractConformanceCheck,
): GitWarpGraphModelContractConformanceCheck {
  if (!(check instanceof GitWarpGraphModelContractConformanceCheck)) {
    throw new WarpError('checks must contain GitWarpGraphModelContractConformanceCheck values', 'E_VALIDATION');
  }
  return check;
}

function requireStatus(status: GraphModelConformanceStatus): GraphModelConformanceStatus {
  if (status === GRAPH_MODEL_CONFORMANCE_PASSED || status === GRAPH_MODEL_CONFORMANCE_FAILED) {
    return status;
  }
  throw new WarpError('status must be a graph-model conformance status', 'E_VALIDATION');
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}
