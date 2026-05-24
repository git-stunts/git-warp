import V17GoldenGraphFixtureManifest, {
  V17GoldenContentFact,
  V17GoldenEdgeFact,
  V17GoldenGraphFixtureWriterChain,
  V17GoldenMultiWriterFact,
  V17GoldenNodeFact,
  V17GoldenPropertyFact,
  V17GoldenRemovalFact,
  V17_GOLDEN_CONTENT_FACT,
  V17_GOLDEN_EDGE_FACT,
  V17_GOLDEN_MULTI_WRITER_FACT,
  V17_GOLDEN_NODE_FACT,
  V17_GOLDEN_PROPERTY_FACT,
  V17_GOLDEN_REMOVAL_FACT,
  v17GoldenGraphFixtureFactKindFromString,
  type V17GoldenGraphFixtureFactKind,
  type V17GoldenGraphFixtureTypedFactFields,
  type V17GoldenGraphFixtureVisibleFact,
} from '../../domain/migrations/V17GoldenGraphFixtureManifest.ts';
import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';
import type { JsonObject } from './JsonObject.ts';

const MANIFEST_KEYS = Object.freeze([
  'fixtureId',
  'graphId',
  'sourceVersion',
  'generator',
  'bundlePath',
  'writerChains',
  'visibleFacts',
]);

type VisibleFactFactory = {
  readonly kind: V17GoldenGraphFixtureFactKind;
  readonly create: (fields: V17GoldenGraphFixtureTypedFactFields) => V17GoldenGraphFixtureVisibleFact;
};

const VISIBLE_FACT_FACTORIES: readonly VisibleFactFactory[] = Object.freeze([
  Object.freeze({
    kind: V17_GOLDEN_NODE_FACT,
    create: (fields: V17GoldenGraphFixtureTypedFactFields) => new V17GoldenNodeFact(fields),
  }),
  Object.freeze({
    kind: V17_GOLDEN_EDGE_FACT,
    create: (fields: V17GoldenGraphFixtureTypedFactFields) => new V17GoldenEdgeFact(fields),
  }),
  Object.freeze({
    kind: V17_GOLDEN_PROPERTY_FACT,
    create: (fields: V17GoldenGraphFixtureTypedFactFields) => new V17GoldenPropertyFact(fields),
  }),
  Object.freeze({
    kind: V17_GOLDEN_CONTENT_FACT,
    create: (fields: V17GoldenGraphFixtureTypedFactFields) => new V17GoldenContentFact(fields),
  }),
  Object.freeze({
    kind: V17_GOLDEN_REMOVAL_FACT,
    create: (fields: V17GoldenGraphFixtureTypedFactFields) => new V17GoldenRemovalFact(fields),
  }),
  Object.freeze({
    kind: V17_GOLDEN_MULTI_WRITER_FACT,
    create: (fields: V17GoldenGraphFixtureTypedFactFields) => new V17GoldenMultiWriterFact(fields),
  }),
]);

/** Parses a v17 golden graph-history fixture manifest from JSON. */
export function parseV17GoldenGraphFixtureManifestJson(
  raw: string,
): V17GoldenGraphFixtureManifest {
  return manifestFromJson(parseJson(raw));
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new AdapterValidationError('V17 golden graph fixture manifest must be valid JSON');
  }
}

function manifestFromJson(value: unknown): V17GoldenGraphFixtureManifest {
  const source = requireJsonObject(value, 'manifest');
  rejectUnknownKeys(source, MANIFEST_KEYS, 'manifest');
  return new V17GoldenGraphFixtureManifest({
    fixtureId: readRequiredString(source, 'manifest.fixtureId', 'fixtureId'),
    graphId: readRequiredString(source, 'manifest.graphId', 'graphId'),
    sourceVersion: readRequiredString(source, 'manifest.sourceVersion', 'sourceVersion'),
    generator: readRequiredString(source, 'manifest.generator', 'generator'),
    bundlePath: readRequiredString(source, 'manifest.bundlePath', 'bundlePath'),
    writerChains: readWriterChains(source),
    visibleFacts: readVisibleFacts(source),
  });
}

function readWriterChains(source: JsonObject): readonly V17GoldenGraphFixtureWriterChain[] {
  return readObjectArray(source, 'writerChains').map((chain, index) => {
    const label = `writerChains[${index}]`;
    rejectUnknownKeys(chain, ['writerId', 'refName', 'expectedHead', 'patchCount'], label);
    return new V17GoldenGraphFixtureWriterChain({
      writerId: readRequiredString(chain, `${label}.writerId`, 'writerId'),
      refName: readRequiredString(chain, `${label}.refName`, 'refName'),
      expectedHead: readRequiredString(chain, `${label}.expectedHead`, 'expectedHead'),
      patchCount: readRequiredNumber(chain, `${label}.patchCount`, 'patchCount'),
    });
  });
}

function readVisibleFacts(source: JsonObject): readonly V17GoldenGraphFixtureVisibleFact[] {
  return readObjectArray(source, 'visibleFacts').map((fact, index) => {
    const label = `visibleFacts[${index}]`;
    rejectUnknownKeys(fact, ['kind', 'key', 'description'], label);
    return readVisibleFact(
      readFactKind(fact, `${label}.kind`, 'kind'),
      readRequiredString(fact, `${label}.key`, 'key'),
      readRequiredString(fact, `${label}.description`, 'description'),
    );
  });
}

function readVisibleFact(
  kind: V17GoldenGraphFixtureFactKind,
  key: string,
  description: string,
): V17GoldenGraphFixtureVisibleFact {
  for (const factory of VISIBLE_FACT_FACTORIES) {
    if (factory.kind === kind) {
      return factory.create({ key, description });
    }
  }
  throw new AdapterValidationError(
    'V17 golden graph fixture manifest field "visibleFacts.kind" must be a supported fact kind',
  );
}

function readObjectArray(source: JsonObject, key: string): readonly JsonObject[] {
  const value = readRequiredValue(source, key);
  if (!Array.isArray(value)) {
    throw new AdapterValidationError(`V17 golden graph fixture manifest field "${key}" must be an array`);
  }
  const objects: JsonObject[] = [];
  value.forEach((entry, index) => {
    objects.push(requireJsonObject(entry, `${key}[${index}]`));
  });
  return Object.freeze(objects);
}

function readRequiredString(source: JsonObject, label: string, key: string): string {
  const value = readRequiredValue(source, key);
  if (typeof value !== 'string' || value.length === 0) {
    throw new AdapterValidationError(
      `V17 golden graph fixture manifest field "${label}" must be a non-empty string`,
    );
  }
  return value;
}

function readRequiredNumber(source: JsonObject, label: string, key: string): number {
  const value = readRequiredValue(source, key);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AdapterValidationError(
      `V17 golden graph fixture manifest field "${label}" must be a finite number`,
    );
  }
  return value;
}

function readFactKind(source: JsonObject, label: string, key: string): V17GoldenGraphFixtureFactKind {
  const value = readRequiredValue(source, key);
  if (typeof value === 'string') {
    return v17GoldenGraphFixtureFactKindFromString(value);
  }
  throw new AdapterValidationError(
    `V17 golden graph fixture manifest field "${label}" must be a supported fact kind`,
  );
}

function readRequiredValue(source: JsonObject, key: string): unknown {
  const value = source[key];
  if (value === undefined) {
    throw new AdapterValidationError(`V17 golden graph fixture manifest field "${key}" is required`);
  }
  return value;
}

function requireJsonObject(value: unknown, label: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new AdapterValidationError(`V17 golden graph fixture manifest field "${label}" must be an object`);
  }
  return value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rejectUnknownKeys(source: JsonObject, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(source)) {
    if (!allowed.includes(key)) {
      throw new AdapterValidationError(
        `V17 golden graph fixture manifest field "${label}.${key}" is not allowed`,
      );
    }
  }
}
