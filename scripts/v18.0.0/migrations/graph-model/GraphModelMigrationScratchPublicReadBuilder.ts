import GenesisEquivalenceReading
  from '../../../../src/domain/migrations/GenesisEquivalenceReading.ts';
import GenesisEquivalenceReadingFact
  from '../../../../src/domain/migrations/GenesisEquivalenceReadingFact.ts';
import GraphModelMigrationRuntimeReplayRequest
  from '../../../../src/domain/migrations/GraphModelMigrationRuntimeReplayRequest.ts';
import GraphModelMigrationScratchWriteResult
  from '../../../../src/domain/migrations/GraphModelMigrationScratchWriteResult.ts';
import {
  CONTENT_PROPERTY_KEY,
  decodeEdgeKey,
  decodePropKey,
  isEdgePropKey,
} from '../../../../src/domain/services/KeyCodec.ts';
import type { SnapshotPropValue }
  from '../../../../src/domain/services/snapshot/SnapshotPropValue.ts';
import type SnapshotWarpState
  from '../../../../src/domain/services/snapshot/SnapshotWarpState.ts';
import { compareStrings } from '../../../../src/domain/utils/StringComparison.ts';
import {
  isGraphModelMigrationContentMetadataProperty,
  replayVerifiedGraphModelMigrationScratchIntoRuntime,
} from './GraphModelMigrationScratchRuntimeReplayer.ts';

export type GraphModelMigrationScratchPublicReadBuilderOptions = {
  readonly sourceRepositoryPath: string;
  readonly runtimeRepositoryPath?: string | null;
  readonly request: GraphModelMigrationRuntimeReplayRequest;
  readonly readingId: string;
};

export type GraphModelMigrationScratchPublicReadProviderOptions = {
  readonly sourceRepositoryPath: string;
  readonly graphId: string;
  readonly writerId?: string;
  readonly runtimeRepositoryPath?: string | null;
  readonly readingId?: string | null;
};

/** Builds a scratch reading by replaying scratch history and reading materialized runtime state. */
export async function buildGraphModelMigrationScratchPublicReadReading(
  options: GraphModelMigrationScratchPublicReadBuilderOptions,
): Promise<GenesisEquivalenceReading> {
  const replay = await replayVerifiedGraphModelMigrationScratchIntoRuntime({
    sourceRepositoryPath: requireNonEmptyString(options.sourceRepositoryPath, 'sourceRepositoryPath'),
    runtimeRepositoryPath: options.runtimeRepositoryPath ?? null,
    request: requireReplayRequest(options.request),
  });
  return new GenesisEquivalenceReading({
    readingId: requireNonEmptyString(options.readingId, 'readingId'),
    facts: publicFactsFromSnapshot(replay.state),
  });
}

/** Creates a command reading provider for scratch-write results. */
export function createGraphModelMigrationScratchPublicReadProvider(
  options: GraphModelMigrationScratchPublicReadProviderOptions,
): (scratchWriteResult: GraphModelMigrationScratchWriteResult) => Promise<GenesisEquivalenceReading> {
  const checked = checkedProviderOptions(options);
  return async (scratchWriteResult) => {
    const checkedScratch = requireScratchWriteResult(scratchWriteResult);
    if (checkedScratch.scratchRef === null || checkedScratch.scratchHead === null) {
      throw new GraphModelMigrationScratchPublicReadBuilderError(
        'scratchWriteResult must contain a scratch ref and scratch head',
      );
    }
    return await buildGraphModelMigrationScratchPublicReadReading({
      sourceRepositoryPath: checked.sourceRepositoryPath,
      runtimeRepositoryPath: checked.runtimeRepositoryPath,
      readingId: checked.readingId,
      request: new GraphModelMigrationRuntimeReplayRequest({
        graphId: checked.graphId,
        writerId: checked.writerId,
        scratchRef: checkedScratch.scratchRef,
        scratchHead: checkedScratch.scratchHead,
      }),
    });
  };
}

function publicFactsFromSnapshot(state: SnapshotWarpState): readonly GenesisEquivalenceReadingFact[] {
  const facts: GenesisEquivalenceReadingFact[] = [];
  for (const nodeId of sortedStrings(state.nodeAlive.elements())) {
    facts.push(publicFact('node', nodeId, 'visibility', 'visible'));
  }
  for (const edgeKey of sortedStrings(state.edgeAlive.elements())) {
    const edge = decodeEdgeKey(edgeKey);
    if (state.nodeAlive.contains(edge.from) && state.nodeAlive.contains(edge.to)) {
      facts.push(publicFact('edge', publicEdgeFactKey(edge), 'visibility', 'visible'));
    }
  }
  for (const entry of sortedPropertyEntries(state.prop)) {
    if (isEdgePropKey(entry.encodedKey)) {
      continue;
    }
    const property = decodePropKey(entry.encodedKey);
    if (!state.nodeAlive.contains(property.nodeId)) {
      continue;
    }
    if (property.propKey === CONTENT_PROPERTY_KEY) {
      facts.push(publicFact(
        'content-attachment',
        publicPropertyFactKey(property.nodeId, property.propKey),
        'payload.oid',
        requireScalarPublicValue(entry.value),
      ));
      continue;
    }
    if (isGraphModelMigrationContentMetadataProperty(property.propKey)) {
      continue;
    }
    facts.push(publicFact(
      'property',
      publicPropertyFactKey(property.nodeId, property.propKey),
      'value',
      requireScalarPublicValue(entry.value),
    ));
  }
  return Object.freeze(facts);
}

function publicFact(
  kind: 'node' | 'edge' | 'property' | 'content-attachment',
  factKey: string,
  fieldPath: string,
  value: string,
): GenesisEquivalenceReadingFact {
  return new GenesisEquivalenceReadingFact({
    kind,
    factKey,
    fieldPath,
    value,
    boundary: null,
  });
}

function publicEdgeFactKey(edge: {
  readonly from: string;
  readonly to: string;
  readonly label: string;
}): string {
  return `${edge.from}->${edge.to}:${edge.label}`;
}

function publicPropertyFactKey(ownerId: string, propertyKey: string): string {
  return `${ownerId}:${propertyKey}`;
}

function sortedStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...values].sort(compareStrings));
}

function sortedPropertyEntries(
  properties: ReadonlyMap<string, { readonly value: SnapshotPropValue }>,
): readonly { readonly encodedKey: string; readonly value: SnapshotPropValue }[] {
  return Object.freeze([...properties.entries()]
    .map(([encodedKey, register]) => Object.freeze({ encodedKey, value: register.value }))
    .sort((left, right) => compareStrings(left.encodedKey, right.encodedKey)));
}

function requireScalarPublicValue(value: SnapshotPropValue): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : invalidSnapshotValue();
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value === null) {
    return 'null';
  }
  return invalidSnapshotValue();
}

function invalidSnapshotValue(): string {
  throw new GraphModelMigrationScratchPublicReadBuilderError(
    'scratch public read only supports scalar snapshot property values',
  );
}

function checkedProviderOptions(
  options: GraphModelMigrationScratchPublicReadProviderOptions,
): {
  readonly sourceRepositoryPath: string;
  readonly graphId: string;
  readonly writerId: string;
  readonly runtimeRepositoryPath: string | null;
  readonly readingId: string;
} {
  const graphId = requireNonEmptyString(options.graphId, 'graphId');
  return Object.freeze({
    sourceRepositoryPath: requireNonEmptyString(options.sourceRepositoryPath, 'sourceRepositoryPath'),
    graphId,
    writerId: requireNonEmptyString(options.writerId ?? 'scratch-migration', 'writerId'),
    runtimeRepositoryPath: options.runtimeRepositoryPath ?? null,
    readingId: requireNonEmptyString(options.readingId ?? `scratch-public-read:${graphId}`, 'readingId'),
  });
}

function requireScratchWriteResult(
  scratchWriteResult: GraphModelMigrationScratchWriteResult,
): GraphModelMigrationScratchWriteResult {
  if (!(scratchWriteResult instanceof GraphModelMigrationScratchWriteResult)) {
    throw new GraphModelMigrationScratchPublicReadBuilderError(
      'scratchWriteResult must be a GraphModelMigrationScratchWriteResult',
    );
  }
  return scratchWriteResult;
}

function requireReplayRequest(
  request: GraphModelMigrationRuntimeReplayRequest,
): GraphModelMigrationRuntimeReplayRequest {
  if (!(request instanceof GraphModelMigrationRuntimeReplayRequest)) {
    throw new GraphModelMigrationScratchPublicReadBuilderError(
      'request must be a GraphModelMigrationRuntimeReplayRequest',
    );
  }
  return request;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GraphModelMigrationScratchPublicReadBuilderError(`${name} must be a non-empty string`);
  }
  return value;
}

export class GraphModelMigrationScratchPublicReadBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphModelMigrationScratchPublicReadBuilderError';
  }
}
