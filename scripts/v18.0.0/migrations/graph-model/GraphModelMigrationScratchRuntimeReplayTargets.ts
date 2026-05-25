import {
  CONTENT_PROPERTY_KEY,
  decodeLegacyEdgePropNode,
} from '../../../../src/domain/services/KeyCodec.ts';
import {
  GraphModelMigrationScratchRuntimeReplayerError,
  GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_INVALID_OPERATION_TARGET,
} from './GraphModelMigrationScratchRuntimeReplayErrors.ts';

const PROPERTY_TARGET_PREFIX = 'property-target-key:length-prefixed-v1:';
const CONTENT_ATTACHMENT_PREFIX = 'content-attachment:';
const NODE_CONTENT_SUFFIX = `:${CONTENT_PROPERTY_KEY}`;

export type GraphModelMigrationScratchEdgeTarget = {
  readonly from: string;
  readonly to: string;
  readonly label: string;
};

export type GraphModelMigrationScratchPropertyTarget = {
  readonly ownerId: string;
  readonly propertyKey: string;
};

export function parseGraphModelMigrationScratchEdgeTarget(targetKey: string): GraphModelMigrationScratchEdgeTarget {
  const arrowIndex = targetKey.indexOf('->');
  const labelIndex = targetKey.lastIndexOf(':');
  if (arrowIndex <= 0 || labelIndex <= arrowIndex + 2 || labelIndex === targetKey.length - 1) {
    throw invalidGraphModelMigrationScratchRuntimeReplayTarget(
      `edge target ${targetKey} must use from->to:label format`,
    );
  }
  return Object.freeze({
    from: targetKey.slice(0, arrowIndex),
    to: targetKey.slice(arrowIndex + 2, labelIndex),
    label: targetKey.slice(labelIndex + 1),
  });
}

export function parseGraphModelMigrationScratchPropertyTarget(
  targetKey: string,
): GraphModelMigrationScratchPropertyTarget {
  if (!targetKey.startsWith(PROPERTY_TARGET_PREFIX)) {
    throw invalidGraphModelMigrationScratchRuntimeReplayTarget(
      `property target ${targetKey} must use length-prefixed target format`,
    );
  }
  let cursor = PROPERTY_TARGET_PREFIX.length;
  const ownerLength = readLength(targetKey, cursor);
  cursor = ownerLength.nextCursor;
  const ownerId = readSizedField(targetKey, cursor, ownerLength.value, 'ownerId', true);
  cursor = ownerId.nextCursor;
  const propertyLength = readLength(targetKey, cursor);
  cursor = propertyLength.nextCursor;
  const propertyKey = readSizedField(targetKey, cursor, propertyLength.value, 'propertyKey', false);
  if (propertyKey.nextCursor !== targetKey.length) {
    throw invalidGraphModelMigrationScratchRuntimeReplayTarget('property target has trailing data');
  }
  return Object.freeze({
    ownerId: requireNonEmptyTargetField(ownerId.value, 'ownerId'),
    propertyKey: requireNonEmptyTargetField(propertyKey.value, 'propertyKey'),
  });
}

export function parseGraphModelMigrationScratchNodeContentTarget(targetKey: string): string {
  if (!targetKey.startsWith(CONTENT_ATTACHMENT_PREFIX) || !targetKey.endsWith(NODE_CONTENT_SUFFIX)) {
    throw invalidGraphModelMigrationScratchRuntimeReplayTarget(
      `content target ${targetKey} must identify a node ${CONTENT_PROPERTY_KEY} attachment`,
    );
  }
  const legacyKey = targetKey.slice(CONTENT_ATTACHMENT_PREFIX.length);
  return requireNonEmptyTargetField(
    legacyKey.slice(0, legacyKey.length - NODE_CONTENT_SUFFIX.length),
    'content ownerId',
  );
}

export function decodeGraphModelMigrationScratchEdgePropertyOwner(ownerId: string): GraphModelMigrationScratchEdgeTarget {
  try {
    return decodeLegacyEdgePropNode(ownerId);
  } catch {
    throw invalidGraphModelMigrationScratchRuntimeReplayTarget('edge property owner target is malformed');
  }
}

export function invalidGraphModelMigrationScratchRuntimeReplayTarget(
  message: string,
): GraphModelMigrationScratchRuntimeReplayerError {
  return new GraphModelMigrationScratchRuntimeReplayerError(
    GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_INVALID_OPERATION_TARGET,
    message,
  );
}

function readLength(text: string, cursor: number): { readonly value: number; readonly nextCursor: number } {
  const separator = text.indexOf(':', cursor);
  if (separator <= cursor) {
    throw invalidGraphModelMigrationScratchRuntimeReplayTarget('length-prefixed field is malformed');
  }
  const raw = text.slice(cursor, separator);
  if (!/^[0-9]+$/u.test(raw)) {
    throw invalidGraphModelMigrationScratchRuntimeReplayTarget('length-prefixed field length is invalid');
  }
  return Object.freeze({ value: Number(raw), nextCursor: separator + 1 });
}

function readSizedField(
  text: string,
  cursor: number,
  length: number,
  label: string,
  separatorRequired: boolean,
): { readonly value: string; readonly nextCursor: number } {
  const value = text.slice(cursor, cursor + length);
  if (value.length !== length) {
    throw invalidGraphModelMigrationScratchRuntimeReplayTarget(`${label} field is truncated`);
  }
  const nextCursor = cursor + length;
  if (!separatorRequired) {
    return Object.freeze({ value, nextCursor });
  }
  if (text[nextCursor] !== ':') {
    throw invalidGraphModelMigrationScratchRuntimeReplayTarget(`${label} field is missing separator`);
  }
  return Object.freeze({ value, nextCursor: nextCursor + 1 });
}

function requireNonEmptyTargetField(value: string, label: string): string {
  if (value.length === 0) {
    throw invalidGraphModelMigrationScratchRuntimeReplayTarget(`${label} field must not be empty`);
  }
  return value;
}
