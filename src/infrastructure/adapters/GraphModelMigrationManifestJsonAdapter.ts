import GraphModelMigrationBasis from '../../domain/migrations/GraphModelMigrationBasis.ts';
import GraphModelMigrationContentMapping from '../../domain/migrations/GraphModelMigrationContentMapping.ts';
import GraphModelMigrationEdgeMapping from '../../domain/migrations/GraphModelMigrationEdgeMapping.ts';
import GraphModelMigrationManifest from '../../domain/migrations/GraphModelMigrationManifest.ts';
import GraphModelMigrationManifestVersion from '../../domain/migrations/GraphModelMigrationManifestVersion.ts';
import GraphModelMigrationNodeMapping from '../../domain/migrations/GraphModelMigrationNodeMapping.ts';
import GraphModelMigrationNotice, {
  type GraphModelMigrationNoticeKind,
} from '../../domain/migrations/GraphModelMigrationNotice.ts';
import GraphModelMigrationPropertyMapping from '../../domain/migrations/GraphModelMigrationPropertyMapping.ts';
import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';
import type { JsonObject } from './JsonObject.ts';

const MANIFEST_KEYS = Object.freeze([
  'version',
  'sourceBasis',
  'targetBasis',
  'nodeMappings',
  'edgeMappings',
  'propertyMappings',
  'contentMappings',
  'warnings',
  'fatalErrors',
]);

/** Serializes a migration manifest as deterministic JSON text. */
export function serializeGraphModelMigrationManifest(
  manifest: GraphModelMigrationManifest,
): string {
  return `${JSON.stringify(manifestToJson(requireManifest(manifest)), null, 2)}\n`;
}

/** Parses migration manifest JSON into runtime-backed domain nouns. */
export function parseGraphModelMigrationManifest(raw: string): GraphModelMigrationManifest {
  return manifestFromJson(parseJson(raw));
}

/** Converts a manifest into its adapter-boundary JSON object. */
function manifestToJson(manifest: GraphModelMigrationManifest): JsonObject {
  return {
    version: manifest.version.value,
    sourceBasis: basisToJson(manifest.sourceBasis),
    targetBasis: basisToJson(manifest.targetBasis),
    nodeMappings: manifest.nodeMappings.map(nodeMappingToJson),
    edgeMappings: manifest.edgeMappings.map(edgeMappingToJson),
    propertyMappings: manifest.propertyMappings.map(propertyMappingToJson),
    contentMappings: manifest.contentMappings.map(contentMappingToJson),
    warnings: manifest.warnings.map(noticeToJson),
    fatalErrors: manifest.fatalErrors.map(noticeToJson),
  };
}

/** Converts parsed JSON into a migration manifest. */
function manifestFromJson(value: unknown): GraphModelMigrationManifest {
  const source = requireJsonObject(value, 'manifest');
  rejectUnknownKeys(source, MANIFEST_KEYS, 'manifest');
  return new GraphModelMigrationManifest({
    version: new GraphModelMigrationManifestVersion(readRequiredNumber(source, 'version')),
    sourceBasis: readBasis(source, 'sourceBasis'),
    targetBasis: readBasis(source, 'targetBasis'),
    nodeMappings: readNodeMappings(source),
    edgeMappings: readEdgeMappings(source),
    propertyMappings: readPropertyMappings(source),
    contentMappings: readContentMappings(source),
    warnings: readNotices(source, 'warnings'),
    fatalErrors: readNotices(source, 'fatalErrors'),
  });
}

/** Parses untrusted JSON text without leaking platform SyntaxError. */
function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new AdapterValidationError('Graph model migration manifest JSON must be valid JSON');
  }
}

/** Requires a manifest instance before serialization. */
function requireManifest(manifest: GraphModelMigrationManifest): GraphModelMigrationManifest {
  if (!(manifest instanceof GraphModelMigrationManifest)) {
    throw new AdapterValidationError('Graph model migration manifest must be a manifest instance');
  }
  return manifest;
}

/** Serializes a basis value. */
function basisToJson(basis: GraphModelMigrationBasis): JsonObject {
  return {
    graphId: basis.graphId,
    basisId: basis.basisId,
  };
}

/** Serializes a node mapping. */
function nodeMappingToJson(mapping: GraphModelMigrationNodeMapping): JsonObject {
  return {
    legacyNodeId: mapping.legacyNodeId,
    targetNodeId: mapping.targetNodeId,
  };
}

/** Serializes an edge mapping. */
function edgeMappingToJson(mapping: GraphModelMigrationEdgeMapping): JsonObject {
  return {
    legacyEdgeId: mapping.legacyEdgeId,
    targetEdgeId: mapping.targetEdgeId,
  };
}

/** Serializes a property mapping. */
function propertyMappingToJson(mapping: GraphModelMigrationPropertyMapping): JsonObject {
  return {
    legacyOwnerId: mapping.legacyOwnerId,
    legacyPropertyKey: mapping.legacyPropertyKey,
    targetOwnerId: mapping.targetOwnerId,
    targetPropertyKey: mapping.targetPropertyKey,
  };
}

/** Serializes a content mapping. */
function contentMappingToJson(mapping: GraphModelMigrationContentMapping): JsonObject {
  return {
    legacyContentKey: mapping.legacyContentKey,
    targetAttachmentKey: mapping.targetAttachmentKey,
  };
}

/** Serializes a migration notice. */
function noticeToJson(notice: GraphModelMigrationNotice): JsonObject {
  return {
    kind: notice.kind,
    code: notice.code,
    message: notice.message,
  };
}

/** Reads a basis object from the manifest envelope. */
function readBasis(source: JsonObject, key: string): GraphModelMigrationBasis {
  const basis = requireJsonObject(source[key], key);
  rejectUnknownKeys(basis, ['graphId', 'basisId'], key);
  return new GraphModelMigrationBasis({
    graphId: readRequiredString(basis, `${key}.graphId`, 'graphId'),
    basisId: readRequiredString(basis, `${key}.basisId`, 'basisId'),
  });
}

/** Reads node mappings from the manifest envelope. */
function readNodeMappings(source: JsonObject): readonly GraphModelMigrationNodeMapping[] {
  return readObjectArray(source, 'nodeMappings').map((mapping, index) => {
    const label = `nodeMappings[${index}]`;
    rejectUnknownKeys(mapping, ['legacyNodeId', 'targetNodeId'], label);
    return new GraphModelMigrationNodeMapping({
      legacyNodeId: readRequiredString(mapping, `${label}.legacyNodeId`, 'legacyNodeId'),
      targetNodeId: readRequiredString(mapping, `${label}.targetNodeId`, 'targetNodeId'),
    });
  });
}

/** Reads edge mappings from the manifest envelope. */
function readEdgeMappings(source: JsonObject): readonly GraphModelMigrationEdgeMapping[] {
  return readObjectArray(source, 'edgeMappings').map((mapping, index) => {
    const label = `edgeMappings[${index}]`;
    rejectUnknownKeys(mapping, ['legacyEdgeId', 'targetEdgeId'], label);
    return new GraphModelMigrationEdgeMapping({
      legacyEdgeId: readRequiredString(mapping, `${label}.legacyEdgeId`, 'legacyEdgeId'),
      targetEdgeId: readRequiredString(mapping, `${label}.targetEdgeId`, 'targetEdgeId'),
    });
  });
}

/** Reads property mappings from the manifest envelope. */
function readPropertyMappings(source: JsonObject): readonly GraphModelMigrationPropertyMapping[] {
  return readObjectArray(source, 'propertyMappings').map((mapping, index) => {
    const label = `propertyMappings[${index}]`;
    rejectUnknownKeys(
      mapping,
      ['legacyOwnerId', 'legacyPropertyKey', 'targetOwnerId', 'targetPropertyKey'],
      label,
    );
    return new GraphModelMigrationPropertyMapping({
      legacyOwnerId: readRequiredString(mapping, `${label}.legacyOwnerId`, 'legacyOwnerId'),
      legacyPropertyKey: readRequiredString(mapping, `${label}.legacyPropertyKey`, 'legacyPropertyKey'),
      targetOwnerId: readRequiredString(mapping, `${label}.targetOwnerId`, 'targetOwnerId'),
      targetPropertyKey: readRequiredString(mapping, `${label}.targetPropertyKey`, 'targetPropertyKey'),
    });
  });
}

/** Reads content mappings from the manifest envelope. */
function readContentMappings(source: JsonObject): readonly GraphModelMigrationContentMapping[] {
  return readObjectArray(source, 'contentMappings').map((mapping, index) => {
    const label = `contentMappings[${index}]`;
    rejectUnknownKeys(mapping, ['legacyContentKey', 'targetAttachmentKey'], label);
    return new GraphModelMigrationContentMapping({
      legacyContentKey: readRequiredString(mapping, `${label}.legacyContentKey`, 'legacyContentKey'),
      targetAttachmentKey: readRequiredString(mapping, `${label}.targetAttachmentKey`, 'targetAttachmentKey'),
    });
  });
}

/** Reads notice arrays from the manifest envelope. */
function readNotices(source: JsonObject, key: string): readonly GraphModelMigrationNotice[] {
  return readObjectArray(source, key).map((notice, index) => {
    const label = `${key}[${index}]`;
    rejectUnknownKeys(notice, ['kind', 'code', 'message'], label);
    return new GraphModelMigrationNotice({
      kind: readNoticeKind(notice, `${label}.kind`, 'kind'),
      code: readRequiredString(notice, `${label}.code`, 'code'),
      message: readRequiredString(notice, `${label}.message`, 'message'),
    });
  });
}

/** Requires an object array field. */
function readObjectArray(source: JsonObject, key: string): readonly JsonObject[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    throw new AdapterValidationError(`Graph model migration manifest field "${key}" must be an array`);
  }
  const objects: JsonObject[] = [];
  value.forEach((entry, index) => {
    objects.push(requireJsonObject(entry, `${key}[${index}]`));
  });
  return Object.freeze(objects);
}

/** Reads a required string field. */
function readRequiredString(source: JsonObject, label: string, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AdapterValidationError(`Graph model migration manifest field "${label}" must be a non-empty string`);
  }
  return value;
}

/** Reads a required finite number field. */
function readRequiredNumber(source: JsonObject, key: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AdapterValidationError(`Graph model migration manifest field "${key}" must be a finite number`);
  }
  return value;
}

/** Reads a notice kind without string casts. */
function readNoticeKind(source: JsonObject, label: string, key: string): GraphModelMigrationNoticeKind {
  const value = source[key];
  if (value === 'warning' || value === 'fatal') {
    return value;
  }
  throw new AdapterValidationError(
    `Graph model migration manifest field "${label}" must be warning or fatal`,
  );
}

/** Requires a non-array JSON object. */
function requireJsonObject(value: unknown, label: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new AdapterValidationError(`Graph model migration manifest field "${label}" must be an object`);
  }
  return value;
}

/** Returns true for non-array JSON object values. */
function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Rejects unexpected fields at the manifest JSON boundary. */
function rejectUnknownKeys(source: JsonObject, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(source)) {
    if (!allowed.includes(key)) {
      throw new AdapterValidationError(
        `Graph model migration manifest field "${label}.${key}" is not allowed`,
      );
    }
  }
}
