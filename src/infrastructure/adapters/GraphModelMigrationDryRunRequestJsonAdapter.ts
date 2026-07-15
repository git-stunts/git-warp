import DryRunGraphModelMigrationPlanRequest
  from '../../domain/migrations/DryRunGraphModelMigrationPlanRequest.ts';
import GraphModelMigrationBasis from '../../domain/migrations/GraphModelMigrationBasis.ts';
import GraphModelMigrationContentSource
  from '../../domain/migrations/GraphModelMigrationContentSource.ts';
import GraphModelMigrationEdgeMapping from '../../domain/migrations/GraphModelMigrationEdgeMapping.ts';
import GraphModelMigrationNodeMapping from '../../domain/migrations/GraphModelMigrationNodeMapping.ts';
import GraphModelMigrationNotice, {
  type GraphModelMigrationNoticeKind,
} from '../../domain/migrations/GraphModelMigrationNotice.ts';
import GraphModelMigrationPatchDescriptor
  from '../../domain/migrations/GraphModelMigrationPatchDescriptor.ts';
import GraphModelMigrationPropertyMapping
  from '../../domain/migrations/GraphModelMigrationPropertyMapping.ts';
import GraphModelMigrationSourceInventory
  from '../../domain/migrations/GraphModelMigrationSourceInventory.ts';
import GraphModelMigrationStateSnapshotReference
  from '../../domain/migrations/GraphModelMigrationStateSnapshotReference.ts';
import GraphModelMigrationWriterChainDescriptor
  from '../../domain/migrations/GraphModelMigrationWriterChainDescriptor.ts';
import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';
import type { JsonObject } from './JsonObject.ts';

const REQUEST_KEYS = Object.freeze([
  'inventory',
  'requiredContentKeys',
  'nodeMappings',
  'edgeMappings',
  'propertyMappings',
]);

const INVENTORY_KEYS = Object.freeze([
  'graphId',
  'sourceBasis',
  'writerChains',
  'patchDescriptors',
  'stateSnapshot',
  'contentSources',
  'warnings',
  'fatalErrors',
]);

/** Parses dry-run request JSON into a runtime-backed planner request. */
export function parseGraphModelMigrationDryRunRequest(
  raw: string,
): DryRunGraphModelMigrationPlanRequest {
  return requestFromJson(parseJson(raw));
}

/** Converts parsed JSON into a dry-run planner request. */
function requestFromJson(value: unknown): DryRunGraphModelMigrationPlanRequest {
  const source = requireJsonObject(value, 'dryRunRequest');
  rejectUnknownKeys(source, REQUEST_KEYS, 'dryRunRequest');
  return new DryRunGraphModelMigrationPlanRequest({
    inventory: readInventory(source),
    requiredContentKeys: readStringArray(source, 'requiredContentKeys'),
    nodeMappings: readNodeMappings(source),
    edgeMappings: readEdgeMappings(source),
    propertyMappings: readPropertyMappings(source),
  });
}

/** Parses untrusted JSON text without leaking platform SyntaxError. */
function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new AdapterValidationError('Graph model migration dry-run request JSON must be valid JSON');
  }
}

/** Reads the source inventory envelope. */
function readInventory(source: JsonObject): GraphModelMigrationSourceInventory {
  const inventory = readRequiredObject(source, 'inventory');
  rejectUnknownKeys(inventory, INVENTORY_KEYS, 'inventory');
  return new GraphModelMigrationSourceInventory({
    graphId: readRequiredString(inventory, 'inventory.graphId', 'graphId'),
    sourceBasis: readNullableBasis(inventory, 'sourceBasis'),
    writerChains: readWriterChains(inventory),
    patchDescriptors: readPatchDescriptors(inventory),
    stateSnapshot: readNullableStateSnapshot(inventory, 'stateSnapshot'),
    contentSources: readContentSources(inventory),
    warnings: readNotices(inventory, 'warnings'),
    fatalErrors: readNotices(inventory, 'fatalErrors'),
  });
}

/** Reads an explicit nullable basis field. */
function readNullableBasis(source: JsonObject, key: string): GraphModelMigrationBasis | null {
  const value = readRequiredValue(source, key);
  if (value === null) {
    return null;
  }
  const basis = requireJsonObject(value, `inventory.${key}`);
  rejectUnknownKeys(basis, ['graphId', 'basisId'], `inventory.${key}`);
  return new GraphModelMigrationBasis({
    graphId: readRequiredString(basis, `inventory.${key}.graphId`, 'graphId'),
    basisId: readRequiredString(basis, `inventory.${key}.basisId`, 'basisId'),
  });
}

/** Reads an explicit nullable state snapshot field. */
function readNullableStateSnapshot(
  source: JsonObject,
  key: string,
): GraphModelMigrationStateSnapshotReference | null {
  const value = readRequiredValue(source, key);
  if (value === null) {
    return null;
  }
  const snapshot = requireJsonObject(value, `inventory.${key}`);
  rejectUnknownKeys(snapshot, ['snapshotId'], `inventory.${key}`);
  return new GraphModelMigrationStateSnapshotReference({
    snapshotId: readRequiredString(snapshot, `inventory.${key}.snapshotId`, 'snapshotId'),
  });
}

/** Reads writer chain descriptors. */
function readWriterChains(source: JsonObject): readonly GraphModelMigrationWriterChainDescriptor[] {
  return readObjectArray(source, 'writerChains').map((chain, index) => {
    const label = `writerChains[${index}]`;
    rejectUnknownKeys(chain, ['writerId', 'patchIds'], label);
    return new GraphModelMigrationWriterChainDescriptor({
      writerId: readRequiredString(chain, `${label}.writerId`, 'writerId'),
      patchIds: readStringArray(chain, 'patchIds'),
    });
  });
}

/** Reads patch descriptors. */
function readPatchDescriptors(source: JsonObject): readonly GraphModelMigrationPatchDescriptor[] {
  return readObjectArray(source, 'patchDescriptors').map((patch, index) => {
    const label = `patchDescriptors[${index}]`;
    rejectUnknownKeys(patch, ['patchId', 'writerId', 'writerSequence'], label);
    return new GraphModelMigrationPatchDescriptor({
      patchId: readRequiredString(patch, `${label}.patchId`, 'patchId'),
      writerId: readRequiredString(patch, `${label}.writerId`, 'writerId'),
      writerSequence: readRequiredNumber(patch, `${label}.writerSequence`, 'writerSequence'),
    });
  });
}

/** Reads source content facts. */
function readContentSources(source: JsonObject): readonly GraphModelMigrationContentSource[] {
  return readObjectArray(source, 'contentSources').map((content, index) => {
    const label = `contentSources[${index}]`;
    rejectUnknownKeys(content, ['legacyContentKey', 'contentHandle', 'contentOid'], label);
    const contentHandle = coalesceContentHandle(content, label);
    return new GraphModelMigrationContentSource({
      legacyContentKey: readRequiredString(content, `${label}.legacyContentKey`, 'legacyContentKey'),
      contentHandle: readRequiredString(
        { contentHandle },
        `${label}.contentHandle`,
        'contentHandle',
      ),
    });
  });
}

function coalesceContentHandle(content: JsonObject, label: string): unknown {
  const { contentHandle, contentOid } = content;
  if (contentHandle !== undefined && contentOid !== undefined && contentHandle !== contentOid) {
    throw new AdapterValidationError(
      `${label}.contentHandle and ${label}.contentOid must match when both are present`,
    );
  }
  return contentHandle ?? contentOid;
}

/** Reads node mappings from the request envelope. */
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

/** Reads edge mappings from the request envelope. */
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

/** Reads property mappings from the request envelope. */
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

/** Reads warning or fatal notices. */
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

/** Reads a required object field. */
function readRequiredObject(source: JsonObject, key: string): JsonObject {
  return requireJsonObject(readRequiredValue(source, key), key);
}

/** Reads an object array field. */
function readObjectArray(source: JsonObject, key: string): readonly JsonObject[] {
  const value = readRequiredValue(source, key);
  if (!Array.isArray(value)) {
    throw new AdapterValidationError(`Graph model migration dry-run request field "${key}" must be an array`);
  }
  const objects: JsonObject[] = [];
  value.forEach((entry, index) => {
    objects.push(requireJsonObject(entry, `${key}[${index}]`));
  });
  return Object.freeze(objects);
}

/** Reads a required string array field. */
function readStringArray(source: JsonObject, key: string): readonly string[] {
  const value = readRequiredValue(source, key);
  if (!Array.isArray(value)) {
    throw new AdapterValidationError(`Graph model migration dry-run request field "${key}" must be an array`);
  }
  const strings: string[] = [];
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new AdapterValidationError(
        `Graph model migration dry-run request field "${key}[${index}]" must be a non-empty string`,
      );
    }
    strings.push(entry);
  });
  return Object.freeze(strings);
}

/** Reads a required string field. */
function readRequiredString(source: JsonObject, label: string, key: string): string {
  const value = readRequiredValue(source, key);
  if (typeof value !== 'string' || value.length === 0) {
    throw new AdapterValidationError(
      `Graph model migration dry-run request field "${label}" must be a non-empty string`,
    );
  }
  return value;
}

/** Reads a required finite number field. */
function readRequiredNumber(source: JsonObject, label: string, key: string): number {
  const value = readRequiredValue(source, key);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AdapterValidationError(
      `Graph model migration dry-run request field "${label}" must be a finite number`,
    );
  }
  return value;
}

/** Reads a notice kind without string casts. */
function readNoticeKind(source: JsonObject, label: string, key: string): GraphModelMigrationNoticeKind {
  const value = readRequiredValue(source, key);
  if (value === 'warning' || value === 'fatal') {
    return value;
  }
  throw new AdapterValidationError(
    `Graph model migration dry-run request field "${label}" must be warning or fatal`,
  );
}

/** Reads a required field value. */
function readRequiredValue(source: JsonObject, key: string): unknown {
  const value = source[key];
  if (value === undefined) {
    throw new AdapterValidationError(`Graph model migration dry-run request field "${key}" is required`);
  }
  return value;
}

/** Requires a non-array JSON object. */
function requireJsonObject(value: unknown, label: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new AdapterValidationError(`Graph model migration dry-run request field "${label}" must be an object`);
  }
  return value;
}

/** Returns true for non-array JSON object values. */
function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Rejects unexpected fields at the request JSON boundary. */
function rejectUnknownKeys(source: JsonObject, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(source)) {
    if (!allowed.includes(key)) {
      throw new AdapterValidationError(
        `Graph model migration dry-run request field "${label}.${key}" is not allowed`,
      );
    }
  }
}
