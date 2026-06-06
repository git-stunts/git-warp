import QueryError from '../../errors/QueryError.ts';
import { CURRENT_CHECKPOINT_SCHEMA } from '../state/checkpointHelpers.ts';

export const CHECKPOINT_BASIS_MANIFEST_SCHEMA = 1;

const CHECKPOINT_BASIS_ROOT_FAMILIES: readonly string[] = Object.freeze([
  'node-liveness',
  'node-property',
  'outgoing-adjacency',
  'incoming-adjacency',
  'edge-fact',
]);

export type CheckpointBasisRootFamily =
  | 'node-liveness'
  | 'node-property'
  | 'outgoing-adjacency'
  | 'incoming-adjacency'
  | 'edge-fact';

export type CheckpointBasisPostureKind = 'present' | 'unavailable' | 'obstructed';
export type CheckpointBasisCompletenessKind = 'complete' | 'partial' | 'obstructed';

export type CheckpointBasisManifestOptions = {
  readonly schema?: number;
  readonly graphName: string;
  readonly checkpointSha: string;
  readonly frontier: Map<string, string>;
  readonly appliedVersionVector: Map<string, number>;
  readonly basisIdentity: string;
  readonly semanticReadingIdentity: string;
  readonly livenessRoots?: CheckpointBasisShardRootMap;
  readonly propertyRoots?: CheckpointBasisShardRootMap;
  readonly outgoingAdjacencyRoots?: CheckpointBasisShardRootMap;
  readonly incomingAdjacencyRoots?: CheckpointBasisShardRootMap;
  readonly edgeFactRoots?: CheckpointBasisShardRootMap;
  readonly provenancePosture: CheckpointBasisSupportPosture;
  readonly contentAnchorPosture: CheckpointBasisSupportPosture;
  readonly shardGeometry: CheckpointBasisShardGeometry;
  readonly chunking: CheckpointBasisChunking;
  readonly completeness: CheckpointBasisCompleteness;
  readonly retainedPayloadRefs?: readonly string[];
  readonly retainedPayloadByteHashes?: readonly string[];
  readonly commitmentFamily?: string | null;
  readonly commitmentRoot?: string | null;
  readonly proofFamily?: string | null;
  readonly proofRefs?: readonly string[];
  readonly openedAperture?: string | null;
  readonly verificationPosture?: CheckpointBasisSupportPosture | null;
};

type CheckpointBasisManifestRootMaps = {
  readonly livenessRoots: CheckpointBasisShardRootMap;
  readonly propertyRoots: CheckpointBasisShardRootMap;
  readonly outgoingAdjacencyRoots: CheckpointBasisShardRootMap;
  readonly incomingAdjacencyRoots: CheckpointBasisShardRootMap;
  readonly edgeFactRoots: CheckpointBasisShardRootMap;
};

type CheckpointBasisNullableRefs = {
  readonly commitmentFamily: string | null;
  readonly commitmentRoot: string | null;
  readonly proofFamily: string | null;
  readonly openedAperture: string | null;
};

export default class CheckpointBasisManifest {
  readonly manifestSchema: number = CHECKPOINT_BASIS_MANIFEST_SCHEMA;
  readonly schema: number;
  readonly graphName: string;
  readonly checkpointSha: string;
  private readonly _frontier: Map<string, string>;
  private readonly _appliedVersionVector: Map<string, number>;
  readonly basisIdentity: string;
  readonly semanticReadingIdentity: string;
  readonly livenessRoots: CheckpointBasisShardRootMap;
  readonly propertyRoots: CheckpointBasisShardRootMap;
  readonly outgoingAdjacencyRoots: CheckpointBasisShardRootMap;
  readonly incomingAdjacencyRoots: CheckpointBasisShardRootMap;
  readonly edgeFactRoots: CheckpointBasisShardRootMap;
  readonly provenancePosture: CheckpointBasisSupportPosture;
  readonly contentAnchorPosture: CheckpointBasisSupportPosture;
  readonly shardGeometry: CheckpointBasisShardGeometry;
  readonly chunking: CheckpointBasisChunking;
  readonly completeness: CheckpointBasisCompleteness;
  readonly retainedPayloadRefs: readonly string[];
  readonly retainedPayloadByteHashes: readonly string[];
  readonly commitmentFamily: string | null;
  readonly commitmentRoot: string | null;
  readonly proofFamily: string | null;
  readonly proofRefs: readonly string[];
  readonly openedAperture: string | null;
  readonly verificationPosture: CheckpointBasisSupportPosture;

  constructor(options: CheckpointBasisManifestOptions) {
    const schema = validateManifestOptions(options);
    const roots = manifestRootMaps(options);
    const nullableRefs = nullableManifestRefs(options);
    this.schema = schema;
    this.graphName = options.graphName; this.checkpointSha = options.checkpointSha;
    this._frontier = copyFrontier(options.frontier);
    this._appliedVersionVector = copyVersionVector(options.appliedVersionVector);
    this.basisIdentity = validateIdentity(options.basisIdentity, 'basisIdentity');
    this.semanticReadingIdentity = validateIdentity(options.semanticReadingIdentity, 'semanticReadingIdentity');
    this.livenessRoots = roots.livenessRoots; this.propertyRoots = roots.propertyRoots;
    this.outgoingAdjacencyRoots = roots.outgoingAdjacencyRoots; this.incomingAdjacencyRoots = roots.incomingAdjacencyRoots;
    this.edgeFactRoots = roots.edgeFactRoots; this.provenancePosture = options.provenancePosture;
    this.contentAnchorPosture = options.contentAnchorPosture; this.shardGeometry = options.shardGeometry;
    this.chunking = options.chunking; this.completeness = options.completeness;
    this.retainedPayloadRefs = freezeStringList(options.retainedPayloadRefs ?? [], 'retainedPayloadRefs');
    this.retainedPayloadByteHashes = freezeStringList(
      options.retainedPayloadByteHashes ?? [],
      'retainedPayloadByteHashes',
    );
    this.commitmentFamily = nullableRefs.commitmentFamily; this.commitmentRoot = nullableRefs.commitmentRoot;
    this.proofFamily = nullableRefs.proofFamily; this.openedAperture = nullableRefs.openedAperture;
    this.proofRefs = freezeStringList(options.proofRefs ?? [], 'proofRefs');
    this.verificationPosture = verificationPostureOrDefault(options.verificationPosture ?? null);
    validateManifestState(this);
    Object.freeze(this);
  }

  get frontier(): Map<string, string> {
    return copyFrontier(this._frontier);
  }

  get appliedVersionVector(): Map<string, number> {
    return copyVersionVector(this._appliedVersionVector);
  }

  rootMaps(): readonly CheckpointBasisShardRootMap[] {
    return Object.freeze([
      this.livenessRoots,
      this.propertyRoots,
      this.outgoingAdjacencyRoots,
      this.incomingAdjacencyRoots,
      this.edgeFactRoots,
    ]);
  }
}

function validateManifestOptions(options: CheckpointBasisManifestOptions): number {
  const schema = options.schema ?? CURRENT_CHECKPOINT_SCHEMA;
  validateSupportedSchema(schema);
  validateNonEmptyString(options.graphName, 'graphName');
  validateNonEmptyString(options.checkpointSha, 'checkpointSha');
  validateFrontier(options.frontier);
  validateAppliedVersionVector(options.appliedVersionVector);
  return schema;
}

function manifestRootMaps(options: CheckpointBasisManifestOptions): CheckpointBasisManifestRootMaps {
  return {
    livenessRoots: requireRoots(options.livenessRoots, 'livenessRoots', 'node-liveness'),
    propertyRoots: requireRoots(options.propertyRoots, 'propertyRoots', 'node-property'),
    outgoingAdjacencyRoots: requireRoots(
      options.outgoingAdjacencyRoots,
      'outgoingAdjacencyRoots',
      'outgoing-adjacency',
    ),
    incomingAdjacencyRoots: requireRoots(
      options.incomingAdjacencyRoots,
      'incomingAdjacencyRoots',
      'incoming-adjacency',
    ),
    edgeFactRoots: requireRoots(options.edgeFactRoots, 'edgeFactRoots', 'edge-fact'),
  };
}

function nullableManifestRefs(options: CheckpointBasisManifestOptions): CheckpointBasisNullableRefs {
  return {
    commitmentFamily: validateNullableIdentity(options.commitmentFamily ?? null, 'commitmentFamily'),
    commitmentRoot: validateNullableIdentity(options.commitmentRoot ?? null, 'commitmentRoot'),
    proofFamily: validateNullableIdentity(options.proofFamily ?? null, 'proofFamily'),
    openedAperture: validateNullableIdentity(options.openedAperture ?? null, 'openedAperture'),
  };
}

function validateManifestState(manifest: CheckpointBasisManifest): void {
  validateSupportPosture(manifest.provenancePosture, 'provenancePosture');
  validateSupportPosture(manifest.contentAnchorPosture, 'contentAnchorPosture');
  validateSupportPosture(manifest.verificationPosture, 'verificationPosture');
  validateCompleteness(manifest.completeness);
  validateShardGeometry(manifest);
  validateReadingIdentitySeparation(manifest);
}

export class CheckpointBasisShardRootMap {
  readonly family: CheckpointBasisRootFamily;
  private readonly _roots: Map<string, string>;

  constructor(options: {
    readonly family: CheckpointBasisRootFamily;
    readonly roots: Map<string, string>;
  }) {
    validateRootFamily(options.family);
    validateRoots(options.roots, options.family);
    this.family = options.family;
    this._roots = copyRoots(options.roots);
    Object.freeze(this);
  }

  get size(): number {
    return this._roots.size;
  }

  get(path: string): string | undefined {
    return this._roots.get(path);
  }

  paths(): readonly string[] {
    return Object.freeze([...this._roots.keys()].sort());
  }

  entries(): readonly (readonly [string, string])[] {
    const entries: Array<readonly [string, string]> = [];
    for (const [path, oid] of [...this._roots.entries()].sort(compareMapEntries)) {
      entries.push(Object.freeze([path, oid]));
    }
    return Object.freeze(entries);
  }
}

export class CheckpointBasisShardGeometry {
  readonly layoutFamily: string;
  readonly payloadLayout: string;
  readonly shardKeyStrategy: string;
  readonly shardCount: number;

  constructor(options: {
    readonly layoutFamily: string;
    readonly payloadLayout: string;
    readonly shardKeyStrategy: string;
    readonly shardCount: number;
  }) {
    this.layoutFamily = validateIdentity(options.layoutFamily, 'layoutFamily');
    this.payloadLayout = validateIdentity(options.payloadLayout, 'payloadLayout');
    this.shardKeyStrategy = validateIdentity(options.shardKeyStrategy, 'shardKeyStrategy');
    this.shardCount = validatePositiveInteger(options.shardCount, 'shardCount');
    Object.freeze(this);
  }
}

export class CheckpointBasisChunking {
  readonly maxFactsPerShard: number;
  readonly chunkCount: number;

  constructor(options: {
    readonly maxFactsPerShard: number;
    readonly chunkCount: number;
  }) {
    this.maxFactsPerShard = validatePositiveInteger(options.maxFactsPerShard, 'maxFactsPerShard');
    this.chunkCount = validatePositiveInteger(options.chunkCount, 'chunkCount');
    Object.freeze(this);
  }
}

export class CheckpointBasisCompleteness {
  readonly kind: CheckpointBasisCompletenessKind;
  readonly reason: string | null;

  constructor(options: {
    readonly kind: CheckpointBasisCompletenessKind;
    readonly reason?: string | null;
  }) {
    validateCompletenessKind(options.kind);
    this.kind = options.kind;
    this.reason = options.reason === undefined || options.reason === null
      ? null
      : validateIdentity(options.reason, 'completeness.reason');
    Object.freeze(this);
  }

  static complete(): CheckpointBasisCompleteness {
    return new CheckpointBasisCompleteness({ kind: 'complete' });
  }

  static partial(reason: string): CheckpointBasisCompleteness {
    return new CheckpointBasisCompleteness({ kind: 'partial', reason });
  }

  static obstructed(reason: string): CheckpointBasisCompleteness {
    return new CheckpointBasisCompleteness({ kind: 'obstructed', reason });
  }
}

export class CheckpointBasisSupportPosture {
  readonly kind: CheckpointBasisPostureKind;
  readonly ref: string | null;
  readonly reason: string | null;

  constructor(options: {
    readonly kind: CheckpointBasisPostureKind;
    readonly ref?: string | null;
    readonly reason?: string | null;
  }) {
    validatePostureKind(options.kind);
    this.kind = options.kind;
    this.ref = options.ref === undefined || options.ref === null
      ? null
      : validateIdentity(options.ref, 'posture.ref');
    this.reason = options.reason === undefined || options.reason === null
      ? null
      : validateIdentity(options.reason, 'posture.reason');
    validatePostureShape(this);
    Object.freeze(this);
  }

  static present(ref: string): CheckpointBasisSupportPosture {
    return new CheckpointBasisSupportPosture({ kind: 'present', ref });
  }

  static unavailable(reason: string): CheckpointBasisSupportPosture {
    return new CheckpointBasisSupportPosture({ kind: 'unavailable', reason });
  }

  static obstructed(reason: string): CheckpointBasisSupportPosture {
    return new CheckpointBasisSupportPosture({ kind: 'obstructed', reason });
  }
}

function verificationPostureOrDefault(
  posture: CheckpointBasisSupportPosture | null,
): CheckpointBasisSupportPosture {
  return posture ?? CheckpointBasisSupportPosture.present('verified');
}

function requireRoots(
  roots: CheckpointBasisShardRootMap | undefined,
  field: string,
  family: CheckpointBasisRootFamily,
): CheckpointBasisShardRootMap {
  if (roots === undefined) {
    throwManifestError(field, 'missing-required-root');
  }
  if (!(roots instanceof CheckpointBasisShardRootMap)) {
    throwManifestError(field, 'invalid-root-map');
  }
  if (roots.family !== family) {
    throwManifestError(field, 'wrong-root-family');
  }
  return roots;
}

function validateSupportedSchema(schema: number): void {
  if (schema !== CURRENT_CHECKPOINT_SCHEMA) {
    throwManifestError('schema', 'unsupported-schema');
  }
}

function validateRootFamily(family: string): void {
  if (!CHECKPOINT_BASIS_ROOT_FAMILIES.includes(family)) {
    throwManifestError('family', 'unsupported-root-family');
  }
}

function validateCompletenessKind(kind: string): void {
  if (kind !== 'complete' && kind !== 'partial' && kind !== 'obstructed') {
    throwManifestError('completeness.kind', 'unsupported-completeness');
  }
}

function validatePostureKind(kind: string): void {
  if (kind !== 'present' && kind !== 'unavailable' && kind !== 'obstructed') {
    throwManifestError('posture.kind', 'unsupported-posture');
  }
}

function validateFrontier(frontier: Map<string, string>): void {
  if (!(frontier instanceof Map) || frontier.size === 0) {
    throwManifestError('frontier', 'invalid-frontier');
  }
  for (const [writerId, patchSha] of frontier) {
    validateNonEmptyString(writerId, 'frontier.writerId');
    validateNonEmptyString(patchSha, 'frontier.patchSha');
  }
}

function validateAppliedVersionVector(versionVector: Map<string, number>): void {
  if (!(versionVector instanceof Map)) {
    throwManifestError('appliedVersionVector', 'invalid-version-vector');
  }
  for (const [writerId, counter] of versionVector) {
    validateNonEmptyString(writerId, 'appliedVersionVector.writerId');
    validateNonNegativeInteger(counter, 'appliedVersionVector.counter');
  }
}

function validateRoots(roots: Map<string, string>, family: string): void {
  if (!(roots instanceof Map)) {
    throwManifestError(`${family}.roots`, 'invalid-roots');
  }
  for (const [path, oid] of roots) {
    validateNonEmptyString(path, `${family}.path`);
    validateNonEmptyString(oid, `${family}.oid`);
  }
}

function validateSupportPosture(posture: CheckpointBasisSupportPosture, field: string): void {
  if (!(posture instanceof CheckpointBasisSupportPosture)) {
    throwManifestError(field, 'invalid-posture');
  }
}

function validateCompleteness(completeness: CheckpointBasisCompleteness): void {
  if (!(completeness instanceof CheckpointBasisCompleteness)) {
    throwManifestError('completeness', 'invalid-completeness');
  }
  if (completeness.kind !== 'complete' && completeness.reason === null) {
    throwManifestError('completeness.reason', 'missing-completeness-reason');
  }
}

function validateShardGeometry(manifest: CheckpointBasisManifest): void {
  validateShardGeometryObjects(manifest);
  const observed = new Set<string>();
  for (const rootMap of manifest.rootMaps()) {
    for (const path of rootMap.paths()) {
      observed.add(`${rootMap.family}:${path}`);
    }
  }
  if (observed.size > manifest.shardGeometry.shardCount) {
    throwManifestError('shardGeometry.shardCount', 'incomplete-shard-geometry');
  }
  if (manifest.chunking.chunkCount > manifest.shardGeometry.shardCount) {
    throwManifestError('chunking.chunkCount', 'incomplete-chunking-geometry');
  }
}

function validateReadingIdentitySeparation(manifest: CheckpointBasisManifest): void {
  const byteIdentityValues = initialByteIdentityValues(manifest);
  addRootIdentityValues(byteIdentityValues, manifest);
  addRetainedIdentityValues(byteIdentityValues, manifest);
  addCommitmentIdentityValues(byteIdentityValues, manifest);
  addProofIdentityValues(byteIdentityValues, manifest);
  if (byteIdentityValues.has(manifest.semanticReadingIdentity)) {
    throwManifestError('semanticReadingIdentity', 'semantic-identity-collides-with-byte-identity');
  }
}

function validateShardGeometryObjects(manifest: CheckpointBasisManifest): void {
  if (!(manifest.shardGeometry instanceof CheckpointBasisShardGeometry)) {
    throwManifestError('shardGeometry', 'invalid-shard-geometry');
  }
  if (!(manifest.chunking instanceof CheckpointBasisChunking)) {
    throwManifestError('chunking', 'invalid-chunking');
  }
}

function initialByteIdentityValues(manifest: CheckpointBasisManifest): Set<string> {
  return new Set([manifest.checkpointSha, manifest.basisIdentity]);
}

function addRootIdentityValues(values: Set<string>, manifest: CheckpointBasisManifest): void {
  for (const rootMap of manifest.rootMaps()) {
    for (const [, oid] of rootMap.entries()) {
      values.add(oid);
    }
  }
}

function addRetainedIdentityValues(values: Set<string>, manifest: CheckpointBasisManifest): void {
  for (const ref of manifest.retainedPayloadRefs) {
    values.add(ref);
  }
  for (const hash of manifest.retainedPayloadByteHashes) {
    values.add(hash);
  }
}

function addCommitmentIdentityValues(values: Set<string>, manifest: CheckpointBasisManifest): void {
  if (manifest.commitmentRoot !== null) {
    values.add(manifest.commitmentRoot);
  }
}

function addProofIdentityValues(values: Set<string>, manifest: CheckpointBasisManifest): void {
  for (const ref of manifest.proofRefs) {
    values.add(ref);
  }
}

function validatePostureShape(posture: CheckpointBasisSupportPosture): void {
  if (posture.kind === 'present' && posture.ref === null) {
    throwManifestError('posture.ref', 'missing-present-posture-ref');
  }
  if (posture.kind !== 'present' && posture.reason === null) {
    throwManifestError('posture.reason', 'missing-obstruction-reason');
  }
}

function copyFrontier(frontier: Map<string, string>): Map<string, string> {
  return new Map([...frontier.entries()].sort(compareMapEntries));
}

function copyVersionVector(versionVector: Map<string, number>): Map<string, number> {
  return new Map([...versionVector.entries()].sort(compareMapEntries));
}

function copyRoots(roots: Map<string, string>): Map<string, string> {
  return new Map([...roots.entries()].sort(compareMapEntries));
}

function compareMapEntries(
  left: readonly [string, string | number],
  right: readonly [string, string | number],
): number {
  return left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0;
}

function freezeStringList(values: readonly string[], field: string): readonly string[] {
  const copied: string[] = [];
  for (const value of values) {
    copied.push(validateIdentity(value, field));
  }
  return Object.freeze(copied);
}

function validateNullableIdentity(value: string | null, field: string): string | null {
  return value === null ? null : validateIdentity(value, field);
}

function validateIdentity(value: string, field: string): string {
  validateNonEmptyString(value, field);
  return value;
}

function validateNonEmptyString(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throwManifestError(field, 'empty-string');
  }
}

function validatePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throwManifestError(field, 'invalid-positive-integer');
  }
  return value;
}

function validateNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throwManifestError(field, 'invalid-non-negative-integer');
  }
}

function throwManifestError(field: string, reason: string): never {
  throw new QueryError('Checkpoint basis manifest is invalid.', {
    code: 'E_CHECKPOINT_BASIS_MANIFEST',
    context: { field, reason },
  });
}
