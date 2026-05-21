import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';
import type { GeneratedLegInventory } from './GeneratedLegInventory.ts';
import type { JsonObject } from './JsonObject.ts';
import type { WesleyIntegrityFields } from './WesleyIntegrityFields.ts';
import {
  readOptionalArtifactCount,
  readOptionalStringArray,
  readRequiredNumber,
  readRequiredString,
  rejectUnknownKeys,
  requireJsonObject,
} from './continuumArtifactJsonValidation.ts';

/** Reads and validates a Wesley integrity block. */
export function readSealedIntegrity(source: JsonObject): WesleyIntegrityFields {
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
export function readGeneratedLegs(source: JsonObject): GeneratedLegInventory {
  const generatedLegs = requireJsonObject(source['generatedLegs'], 'Wesley realization manifest generatedLegs');
  const names = readGeneratedLegNames(generatedLegs);
  const files: string[] = [];
  for (const name of names) {
    for (const path of readGeneratedLegFiles(generatedLegs, name)) {
      files.push(path);
    }
  }
  return { names, files: Object.freeze(files.sort()) };
}

/** Reads the sorted generated leg names from a Wesley manifest. */
function readGeneratedLegNames(generatedLegs: JsonObject): readonly string[] {
  const names = Object.freeze(Object.keys(generatedLegs).sort());
  if (names.length === 0) {
    throw new AdapterValidationError('Wesley realization manifest generatedLegs must contain at least one leg');
  }
  return names;
}

/** Reads and validates one Wesley generated leg inventory. */
function readGeneratedLegFiles(generatedLegs: JsonObject, name: string): readonly string[] {
  const leg = requireJsonObject(generatedLegs[name], `Wesley generated leg "${name}"`);
  validateGeneratedLegEnvelope(leg, name);
  const artifactCount = readOptionalArtifactCount(leg, 'artifactCount');
  const legFiles = readGeneratedFiles(leg, name);
  requireArtifactCountMatchesFiles(artifactCount, legFiles.length, name);
  return legFiles;
}

/** Validates one Wesley generated leg envelope. */
function validateGeneratedLegEnvelope(leg: JsonObject, name: string): void {
  rejectUnknownKeys(
    leg,
    ['outDir', 'schemaHash', 'sourceHash', 'targets', 'artifactCount', 'files'],
    `Wesley generated leg "${name}"`,
  );
  readRequiredString(leg, 'outDir');
  readRequiredString(leg, 'schemaHash');
  readRequiredString(leg, 'sourceHash');
  readOptionalStringArray(leg, 'targets');
}

/** Requires Wesley's artifact count to match the generated file inventory. */
function requireArtifactCountMatchesFiles(count: number | undefined, fileCount: number, legName: string): void {
  if (count !== undefined && count !== fileCount) {
    throw new AdapterValidationError(
      `Wesley generated leg "${legName}" field "artifactCount" must match generated file count`,
    );
  }
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
