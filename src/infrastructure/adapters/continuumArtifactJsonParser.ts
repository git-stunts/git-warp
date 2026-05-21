import type {
  ContinuumArtifactJsonLoadContext,
  DescriptorFieldSource,
  JsonObject,
} from './continuumArtifactJsonTypes.ts';
import type { ContinuumArtifactDescriptorFields } from '../../domain/continuum/ContinuumArtifactDescriptor.ts';
import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';
import { readGeneratedLegs, readSealedIntegrity } from './continuumWesleyManifestInventory.ts';
import {
  isJsonObject,
  readContextString,
  readOptionalStringArray,
  readOptionalString,
  readRequiredString,
  readStringArray,
  rejectUnknownKeys,
  requireContextAuthority,
  requireJsonObject,
} from './continuumArtifactJsonValidation.ts';
import { readOptionalFootprints } from './continuumFamilyFixtureValidation.ts';

const WESLEY_REALIZATION_MANIFEST_KIND = 'wesley.realization.manifest.v1';
const WESLEY_REALIZATION_MANIFEST_AUTHORITY = 'generated-artifact';
const CONTINUUM_FIXTURE_KIND = 'continuum.family.fixture';
const CONTINUUM_FIXTURE_AUTHORITY = 'generated-fixture';
const CONTINUUM_FIXTURE_GENERATOR = 'continuum/wesley fixture';
const CONTINUUM_FIXTURE_TARGET = 'continuum-fixture';

/** Converts untrusted JSON text into descriptor fields. */
export function parseContinuumArtifactDescriptorFields(
  raw: string,
  context: ContinuumArtifactJsonLoadContext,
): ContinuumArtifactDescriptorFields {
  return parseDescriptorFields(parseJson(raw), context);
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
  requireContextAuthority(context, WESLEY_REALIZATION_MANIFEST_AUTHORITY, 'Wesley realization manifest');
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
    [
      'kind',
      'schemaPath',
      'canonicalSchemaPath',
      'schemaHash',
      'sourceHash',
      'outDir',
      'targets',
      'integrity',
      'generatedLegs',
      'proves',
      'doesNotProve',
    ],
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
    artifactKind: WESLEY_REALIZATION_MANIFEST_KIND,
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
  requireContextAuthority(context, CONTINUUM_FIXTURE_AUTHORITY, 'Continuum family fixture');
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
    artifactKind: CONTINUUM_FIXTURE_KIND,
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
