import { readFile } from 'node:fs/promises';

import ContinuumArtifactDescriptor, {
  type ContinuumArtifactDescriptorFields,
} from '../../domain/continuum/ContinuumArtifactDescriptor.ts';
import ContinuumArtifactIngestionPolicy from '../../domain/continuum/ContinuumArtifactIngestionPolicy.ts';
import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';

type JsonObject = Readonly<Record<string, unknown>>;

/** Loads Continuum artifact descriptors from JSON files at the adapter edge. */
export default class ContinuumArtifactJsonFileAdapter {
  private readonly policy: ContinuumArtifactIngestionPolicy;

  constructor(policy: ContinuumArtifactIngestionPolicy = new ContinuumArtifactIngestionPolicy()) {
    this.policy = policy;
  }

  /** Reads and ingests a generated artifact descriptor from disk. */
  async loadFile(path: string): Promise<ContinuumArtifactDescriptor> {
    const raw = await readFile(path, 'utf8');
    return this.loadString(raw);
  }

  /** Ingests a generated artifact descriptor from JSON text. */
  loadString(raw: string): ContinuumArtifactDescriptor {
    const parsed: unknown = JSON.parse(raw);
    const fields = parseDescriptorFields(parsed);
    return this.policy.ingest(new ContinuumArtifactDescriptor(fields));
  }
}

/** Converts untrusted JSON into descriptor fields. */
function parseDescriptorFields(value: unknown): ContinuumArtifactDescriptorFields {
  const source = requireJsonObject(value);
  const base = {
    familyId: readRequiredString(source, 'familyId'),
    version: readRequiredString(source, 'version'),
    sourceSchemaPath: readRequiredString(source, 'sourceSchemaPath'),
    generatedBy: readRequiredString(source, 'generatedBy'),
    artifactKind: readRequiredString(source, 'artifactKind'),
    authority: readRequiredString(source, 'authority'),
    targets: readStringArray(source, 'targets'),
  };
  return withOptionalFields(base, source);
}

/** Adds optional descriptor fields when present. */
function withOptionalFields(
  base: ContinuumArtifactDescriptorFields,
  source: JsonObject,
): ContinuumArtifactDescriptorFields {
  const witnessScope = readOptionalString(source, 'witnessScope');
  const artifactDigest = readOptionalString(source, 'artifactDigest');
  return {
    ...base,
    ...(witnessScope !== undefined ? { witnessScope } : {}),
    ...(artifactDigest !== undefined ? { artifactDigest } : {}),
  };
}

/** Requires a non-array JSON object. */
function requireJsonObject(value: unknown): JsonObject {
  if (!isJsonObject(value)) {
    throw new AdapterValidationError('Continuum artifact descriptor JSON must be an object');
  }
  return value;
}

/** Returns true when a value is a non-array JSON object. */
function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Reads a required string field. */
function readRequiredString(source: JsonObject, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AdapterValidationError(`Continuum artifact descriptor field "${key}" must be a non-empty string`);
  }
  return value;
}

/** Reads an optional string field. */
function readOptionalString(source: JsonObject, key: string): string | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new AdapterValidationError(`Continuum artifact descriptor field "${key}" must be a non-empty string when present`);
  }
  return value;
}

/** Reads a required string array field. */
function readStringArray(source: JsonObject, key: string): readonly string[] {
  const value = source[key];
  if (!Array.isArray(value) || value.length === 0) {
    throw new AdapterValidationError(`Continuum artifact descriptor field "${key}" must be a non-empty string array`);
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
