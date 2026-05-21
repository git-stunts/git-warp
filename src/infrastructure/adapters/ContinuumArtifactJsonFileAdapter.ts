import { readFile } from 'node:fs/promises';

import type ContinuumArtifactAuthority from '../../domain/continuum/ContinuumArtifactAuthority.ts';
import ContinuumArtifactDescriptor, {
  type ContinuumArtifactDescriptorFields,
} from '../../domain/continuum/ContinuumArtifactDescriptor.ts';
import ContinuumArtifactIngestionPolicy from '../../domain/continuum/ContinuumArtifactIngestionPolicy.ts';
import type ContinuumFamilyId from '../../domain/continuum/ContinuumFamilyId.ts';
import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';

const WESLEY_REALIZATION_MANIFEST_KIND = 'wesley.realization.manifest.v1';
const CONTINUUM_FIXTURE_KIND = 'continuum.family.fixture';
const CONTINUUM_FIXTURE_GENERATOR = 'continuum/wesley fixture';
const CONTINUUM_FIXTURE_TARGET = 'continuum-fixture';

type JsonObject = Readonly<Record<string, unknown>>;

export type ContinuumArtifactJsonLoadContext = {
  readonly familyId: string | ContinuumFamilyId;
  readonly authority: string | ContinuumArtifactAuthority;
  readonly sourceSchemaPath?: string;
  readonly generatedBy?: string;
  readonly artifactKind?: string;
  readonly version?: string;
  readonly targets?: readonly string[];
  readonly witnessScope?: string;
  readonly artifactDigest?: string;
};

type DescriptorFieldSource = {
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

/** Loads Continuum artifact descriptors from JSON files at the adapter edge. */
export default class ContinuumArtifactJsonFileAdapter {
  private readonly policy: ContinuumArtifactIngestionPolicy;

  constructor(policy: ContinuumArtifactIngestionPolicy = new ContinuumArtifactIngestionPolicy()) {
    this.policy = policy;
  }

  /** Reads and ingests a generated artifact descriptor from disk. */
  async loadFile(
    path: string,
    context: ContinuumArtifactJsonLoadContext,
  ): Promise<ContinuumArtifactDescriptor> {
    const raw = await readFile(path, 'utf8');
    return this.loadString(raw, context);
  }

  /** Ingests a generated artifact descriptor from JSON text. */
  loadString(raw: string, context: ContinuumArtifactJsonLoadContext): ContinuumArtifactDescriptor {
    const parsed = parseJson(raw);
    const fields = parseDescriptorFields(parsed, context);
    return this.policy.ingest(new ContinuumArtifactDescriptor(fields));
  }
}

/** Parses untrusted descriptor JSON without leaking platform SyntaxError. */
function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new AdapterValidationError('Continuum artifact descriptor JSON must be valid JSON');
  }
}

/** Converts untrusted JSON into descriptor fields. */
function parseDescriptorFields(
  value: unknown,
  context: ContinuumArtifactJsonLoadContext,
): ContinuumArtifactDescriptorFields {
  const source = requireJsonObject(value, 'Continuum artifact descriptor JSON');
  if (source['kind'] === WESLEY_REALIZATION_MANIFEST_KIND) {
    return parseWesleyRealizationManifest(source, context);
  }
  if (isContinuumFamilyFixture(source)) {
    return parseContinuumFamilyFixture(source, context);
  }
  throw new AdapterValidationError(
    'Continuum artifact descriptor JSON must be a Wesley realization manifest or Continuum family fixture',
  );
}

/** Converts a Wesley realization manifest into descriptor fields. */
function parseWesleyRealizationManifest(
  source: JsonObject,
  context: ContinuumArtifactJsonLoadContext,
): ContinuumArtifactDescriptorFields {
  validateWesleyManifestEnvelope(source);
  const integrity = readSealedIntegrity(source);
  const legs = readGeneratedLegs(source);
  return descriptorFields(context, {
    ...wesleyManifestFields(source, context),
    ...integrity,
    generatedLegs: legs.names,
    generatedFiles: legs.files,
  });
}

/** Validates the non-semantic envelope fields on a Wesley manifest. */
function validateWesleyManifestEnvelope(source: JsonObject): void {
  rejectUnknownKeys(
    source,
    ['kind', 'schemaPath', 'canonicalSchemaPath', 'schemaHash', 'sourceHash', 'outDir', 'targets', 'integrity', 'generatedLegs', 'proves', 'doesNotProve'],
    'Wesley realization manifest',
  );
  readOptionalString(source, 'canonicalSchemaPath');
  readOptionalString(source, 'outDir');
  readOptionalStringArray(source, 'proves');
  readOptionalStringArray(source, 'doesNotProve');
}

/** Reads the descriptor-facing fields from a Wesley realization manifest. */
function wesleyManifestFields(
  source: JsonObject,
  context: ContinuumArtifactJsonLoadContext,
): DescriptorFieldSource {
  return {
    sourceSchemaPath: readRequiredString(source, 'schemaPath'),
    generatedBy: context.generatedBy ?? 'wesley compile',
    artifactKind: context.artifactKind ?? WESLEY_REALIZATION_MANIFEST_KIND,
    targets: readStringArray(source, 'targets'),
    schemaHash: readRequiredString(source, 'schemaHash'),
    sourceHash: readRequiredString(source, 'sourceHash'),
  };
}

/** Converts a Continuum family fixture into descriptor fields. */
function parseContinuumFamilyFixture(
  source: JsonObject,
  context: ContinuumArtifactJsonLoadContext,
): ContinuumArtifactDescriptorFields {
  rejectUnknownKeys(
    source,
    ['objectTypes', 'enumTypes', 'ops', 'invariants', 'footprints', 'types'],
    'Continuum family fixture',
  );
  readOptionalStringArray(source, 'objectTypes');
  readOptionalStringArray(source, 'enumTypes');
  readOperations(source);
  readOptionalStringArray(source, 'invariants');
  readOptionalFootprints(source);
  readOptionalTypeMap(source);

  return descriptorFields(context, {
    sourceSchemaPath: readContextString(context.sourceSchemaPath, 'sourceSchemaPath'),
    generatedBy: context.generatedBy ?? CONTINUUM_FIXTURE_GENERATOR,
    artifactKind: context.artifactKind ?? CONTINUUM_FIXTURE_KIND,
    targets: context.targets ?? [CONTINUUM_FIXTURE_TARGET],
  });
}

/** Builds descriptor fields without trusting authority from the untrusted JSON. */
function descriptorFields(
  context: ContinuumArtifactJsonLoadContext,
  required: DescriptorFieldSource,
): ContinuumArtifactDescriptorFields {
  return {
    familyId: context.familyId,
    sourceSchemaPath: required.sourceSchemaPath,
    generatedBy: required.generatedBy,
    artifactKind: required.artifactKind,
    authority: context.authority,
    targets: required.targets,
    ...contextDescriptorFields(context),
    ...sourceHashFields(required),
    ...integrityDescriptorFields(required),
    ...signatureDescriptorFields(required),
    ...generatedInventoryFields(required),
  };
}

/** Selects optional descriptor fields provided by load context. */
function contextDescriptorFields(
  context: ContinuumArtifactJsonLoadContext,
): Partial<ContinuumArtifactDescriptorFields> {
  return {
    ...(context.version !== undefined ? { version: context.version } : {}),
    ...(context.witnessScope !== undefined ? { witnessScope: context.witnessScope } : {}),
    ...(context.artifactDigest !== undefined ? { artifactDigest: context.artifactDigest } : {}),
  };
}

/** Selects optional schema hash fields from source evidence. */
function sourceHashFields(required: DescriptorFieldSource): Partial<ContinuumArtifactDescriptorFields> {
  return {
    ...(required.schemaHash !== undefined ? { schemaHash: required.schemaHash } : {}),
    ...(required.sourceHash !== undefined ? { sourceHash: required.sourceHash } : {}),
  };
}

/** Selects optional integrity fields from source evidence. */
function integrityDescriptorFields(required: DescriptorFieldSource): Partial<ContinuumArtifactDescriptorFields> {
  return {
    ...(required.integrityStatus !== undefined ? { integrityStatus: required.integrityStatus } : {}),
    ...(required.integrityScope !== undefined ? { integrityScope: required.integrityScope } : {}),
    ...(required.hashAlgorithm !== undefined ? { hashAlgorithm: required.hashAlgorithm } : {}),
  };
}

/** Selects optional signature fields from source evidence. */
function signatureDescriptorFields(required: DescriptorFieldSource): Partial<ContinuumArtifactDescriptorFields> {
  return {
    ...(required.signatureAlgorithm !== undefined ? { signatureAlgorithm: required.signatureAlgorithm } : {}),
    ...(required.signatureKeyId !== undefined ? { signatureKeyId: required.signatureKeyId } : {}),
  };
}

/** Selects optional generated inventory fields from source evidence. */
function generatedInventoryFields(required: DescriptorFieldSource): Partial<ContinuumArtifactDescriptorFields> {
  return {
    ...(required.generatedLegs !== undefined ? { generatedLegs: required.generatedLegs } : {}),
    ...(required.generatedFiles !== undefined ? { generatedFiles: required.generatedFiles } : {}),
  };
}

/** Reads and validates a Wesley integrity block. */
function readSealedIntegrity(source: JsonObject): {
  readonly integrityStatus: string;
  readonly integrityScope: string;
  readonly hashAlgorithm: string;
  readonly signatureAlgorithm: string;
  readonly signatureKeyId: string;
} {
  const integrity = requireJsonObject(source['integrity'], 'Wesley realization manifest integrity');
  rejectUnknownKeys(
    integrity,
    ['status', 'scope', 'hashAlgorithm', 'signatureAlgorithm', 'signatureKeyId'],
    'Wesley realization manifest integrity',
  );
  const status = readRequiredString(integrity, 'status');
  if (status !== 'sealed') {
    throw new AdapterValidationError('Wesley realization manifest integrity status must be sealed');
  }
  return {
    integrityStatus: status,
    integrityScope: readRequiredString(integrity, 'scope'),
    hashAlgorithm: readRequiredString(integrity, 'hashAlgorithm'),
    signatureAlgorithm: readRequiredString(integrity, 'signatureAlgorithm'),
    signatureKeyId: readRequiredString(integrity, 'signatureKeyId'),
  };
}

/** Reads and validates Wesley generated leg inventory. */
function readGeneratedLegs(source: JsonObject): {
  readonly names: readonly string[];
  readonly files: readonly string[];
} {
  const generatedLegs = requireJsonObject(source['generatedLegs'], 'Wesley realization manifest generatedLegs');
  const names = Object.freeze(Object.keys(generatedLegs).sort());
  const files: string[] = [];
  for (const name of names) {
    const leg = requireJsonObject(generatedLegs[name], `Wesley generated leg "${name}"`);
    rejectUnknownKeys(
      leg,
      ['outDir', 'schemaHash', 'sourceHash', 'targets', 'artifactCount', 'files'],
      `Wesley generated leg "${name}"`,
    );
    readRequiredString(leg, 'outDir');
    readRequiredString(leg, 'schemaHash');
    readRequiredString(leg, 'sourceHash');
    readOptionalStringArray(leg, 'targets');
    readOptionalNumber(leg, 'artifactCount');
    for (const path of readGeneratedFiles(leg, name)) {
      files.push(path);
    }
  }
  return { names, files: Object.freeze(files.sort()) };
}

/** Reads generated file entries from one Wesley generated leg. */
function readGeneratedFiles(source: JsonObject, legName: string): readonly string[] {
  const value = source['files'];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new AdapterValidationError(`Wesley generated leg "${legName}" field "files" must be an array`);
  }
  const files: string[] = [];
  for (const entry of value) {
    const file = requireJsonObject(entry, `Wesley generated leg "${legName}" file`);
    rejectUnknownKeys(file, ['path', 'size', 'contentHash', 'signature'], `Wesley generated leg "${legName}" file`);
    files.push(readRequiredString(file, 'path'));
    readRequiredNumber(file, 'size');
    readRequiredString(file, 'contentHash');
    readRequiredString(file, 'signature');
  }
  return Object.freeze(files);
}

/** Returns true when the top-level object has the Continuum fixture shape. */
function isContinuumFamilyFixture(source: JsonObject): boolean {
  return Array.isArray(source['ops']) && (
    Array.isArray(source['objectTypes']) ||
    isJsonObject(source['types'])
  );
}

/** Reads and validates Continuum fixture operations. */
function readOperations(source: JsonObject): void {
  const { ops } = source;
  if (!Array.isArray(ops) || ops.length === 0) {
    throw new AdapterValidationError('Continuum family fixture field "ops" must be a non-empty operation array');
  }
  for (const entry of ops) {
    const op = requireJsonObject(entry, 'Continuum family fixture operation');
    rejectUnknownKeys(op, ['name', 'resultType'], 'Continuum family fixture operation');
    readRequiredString(op, 'name');
    readRequiredString(op, 'resultType');
  }
}

/** Reads and validates optional Continuum fixture footprints. */
function readOptionalFootprints(source: JsonObject): void {
  const { footprints } = source;
  if (footprints === undefined) {
    return;
  }
  if (!Array.isArray(footprints)) {
    throw new AdapterValidationError('Continuum family fixture field "footprints" must be an array');
  }
  for (const entry of footprints) {
    const footprint = requireJsonObject(entry, 'Continuum family fixture footprint');
    rejectUnknownKeys(footprint, ['opName', 'reads', 'writes', 'creates', 'deletes'], 'Continuum family fixture footprint');
    readRequiredString(footprint, 'opName');
    readStringArray(footprint, 'reads');
    readStringArray(footprint, 'writes');
    readStringArray(footprint, 'creates');
    readStringArray(footprint, 'deletes');
  }
}

/** Reads and validates an optional Continuum boundary type map. */
function readOptionalTypeMap(source: JsonObject): void {
  const { types } = source;
  if (types === undefined) {
    return;
  }
  const typeMap = requireJsonObject(types, 'Continuum family fixture types');
  for (const name of Object.keys(typeMap)) {
    readStringArray(typeMap, name);
  }
}

/** Requires a non-array JSON object. */
function requireJsonObject(value: unknown, label: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new AdapterValidationError(`${label} must be an object`);
  }
  return value;
}

/** Returns true when a value is a non-array JSON object. */
function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Rejects unexpected fields at a parsed JSON boundary. */
function rejectUnknownKeys(source: JsonObject, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(source)) {
    if (!allowed.includes(key)) {
      throw new AdapterValidationError(`${label} field "${key}" is not allowed`);
    }
  }
}

/** Reads a required string field. */
function readRequiredString(source: JsonObject, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AdapterValidationError(`Continuum artifact descriptor field "${key}" must be a non-empty string`);
  }
  return value;
}

/** Reads a required context string. */
function readContextString(value: string | undefined, key: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AdapterValidationError(`Continuum artifact load context field "${key}" must be a non-empty string`);
  }
  return value;
}

/** Reads a required number field. */
function readRequiredNumber(source: JsonObject, key: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AdapterValidationError(`Continuum artifact descriptor field "${key}" must be a finite number`);
  }
  return value;
}

/** Reads an optional number field. */
function readOptionalNumber(source: JsonObject, key: string): number | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  return readRequiredNumber(source, key);
}

/** Reads an optional string array field. */
function readOptionalStringArray(source: JsonObject, key: string): readonly string[] | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  return readStringArray(source, key);
}

/** Reads an optional string field. */
function readOptionalString(source: JsonObject, key: string): string | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  return readRequiredString(source, key);
}

/** Reads a required string array field. */
function readStringArray(source: JsonObject, key: string): readonly string[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    throw new AdapterValidationError(`Continuum artifact descriptor field "${key}" must be a string array`);
  }
  const strings: string[] = [];
  for (const entry of value) {
    strings.push(readStringArrayEntry(entry, key));
  }
  return Object.freeze(strings);
}

/** Reads one string array entry. */
function readStringArrayEntry(value: unknown, key: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AdapterValidationError(`Continuum artifact descriptor field "${key}" must contain only non-empty strings`);
  }
  return value;
}
