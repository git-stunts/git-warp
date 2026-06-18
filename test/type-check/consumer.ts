/**
 * Consumer smoke test -- compile-only.
 *
 * Exercises the current package-root API surface of @git-stunts/git-warp.
 * This file is not executed; the TypeScript compiler is the test.
 */

import WarpAppDefault, {
  GitGraphAdapter,
  InMemoryGraphAdapter,
  GraphNode,
  BitmapIndexBuilder,
  BitmapIndexReader,
  IndexRebuildService,
  HealthCheckService,
  HealthStatus,
  CommitDagTraversalService,
  BisectService,
  GraphPersistencePort,
  IndexStoragePort,
  LoggerPort,
  NoOpLogger,
  ConsoleLogger,
  LogLevel,
  SeekCachePort,
  BlobStoragePort,
  InMemoryBlobStorageAdapter,
  CryptoPort,
  HttpServerPort,
  NodeCryptoAdapter,
  WebCryptoAdapter,
  BunHttpAdapter,
  DenoHttpAdapter,
  AuditError,
  EncryptionError,
  PatchError,
  ForkError,
  IndexError,
  QueryError,
  SchemaUnsupportedError,
  ShardLoadError,
  ShardCorruptionError,
  ShardValidationError,
  StorageError,
  TraversalError,
  OperationAbortedError,
  SyncError,
  StrandError,
  WormholeError,
  WriterError,
  checkAborted,
  createTimeoutSignal,
  openWarpWorldline,
  openWarpGraph,
  WarpApp,
  WarpCore,
  WarpWorldline,
  WarpWorldlineCoordinate,
  WarpWorldlineOpticBasis,
  Worldline,
  WorldlineSelector,
  LiveSelector,
  CoordinateSelector,
  StrandSelector,
  QueryBuilder,
  Observer,
  PatchBuilder,
  PatchSession,
  Writer,
  ProvenanceIndex,
  computeTranslationCost,
  createNodeAdd,
  createNodeTombstone,
  createEdgeAdd,
  createEdgeTombstone,
  createPropSet,
  createInlineValue,
  createBlobValue,
  encodeEdgePropKey,
  decodeEdgePropKey,
  isEdgePropKey,
  CONTENT_PROPERTY_KEY,
  WarpStateIndexBuilder,
  buildWarpStateIndex,
  computeStateHash,
  projectState,
  createStateReader,
  compareVisibleState,
  ImmutableBytes,
  SnapshotORSet,
  SnapshotVersionVector,
  SnapshotWarpState,
  SyncSecret,
  normalizeVisibleStateScope,
  scopeMaterializedState,
  exportCoordinateComparisonFact,
  exportCoordinateTransferPlanFact,
  createTickReceipt,
  tickReceiptCanonicalJson,
  TICK_RECEIPT_OP_TYPES,
  TICK_RECEIPT_RESULT_TYPES,
  ProvenancePayload,
  BTR,
  createBTR,
  verifyBTR,
  replayBTR,
  createWormhole,
  composeWormholes,
  replayWormhole,
  serializeWormhole,
  deserializeWormhole,
  EffectSinkPort,
  MultiplexSink,
  EffectPipeline,
  createEffectEmission,
  canonicalEmissionJson,
  createDeliveryObservation,
  canonicalObservationJson,
  createExternalizationPolicy,
  DELIVERY_MODES,
  DELIVERY_OUTCOMES,
  LIVE_LENS,
  REPLAY_LENS,
  INSPECT_LENS,
  NoOpEffectSink,
  ConsoleEffectSink,
  ChunkEffectSink,
  type Aperture,
  type ObserverConfig,
  type PropValue,
  type SnapshotPropValue,
  type SyncRateLimitConfig,
  type WarpWorldlineOpenOptions,
  type WarpWorldlinePatchBuild,
  type WarpWorldlineCoordinateFrontierEntry,
} from '../../index.ts';

import {
  WarpError as BrowserWarpError,
  VersionVector as BrowserVersionVector,
  generateWriterId as browserGenerateWriterId,
} from '../../browser.ts';

type PublicPropBag = Readonly<{ [key: string]: SnapshotPropValue }>;
type PublicVisibleEdge = Readonly<{
  from: string;
  to: string;
  label: string;
  props: PublicPropBag;
}>;

declare const persistence: GraphPersistencePort;
declare const indexStorage: IndexStoragePort;
declare const logger: LoggerPort;
declare const crypto: CryptoPort;
declare const seekCache: SeekCachePort;
declare const httpPort: HttpServerPort;
declare const liveState: Parameters<typeof createBTR>[0];
declare const btrCodecOptions: Parameters<typeof createBTR>[2];
declare const btrVerifyOptions: Parameters<typeof verifyBTR>[2];

const sameAppCtor: typeof WarpAppDefault = WarpApp;

const exportedRuntimeSurface = [
  GitGraphAdapter,
  InMemoryGraphAdapter,
  GraphNode,
  BitmapIndexBuilder,
  BitmapIndexReader,
  IndexRebuildService,
  HealthCheckService,
  HealthStatus,
  CommitDagTraversalService,
  BisectService,
  GraphPersistencePort,
  IndexStoragePort,
  LoggerPort,
  NoOpLogger,
  ConsoleLogger,
  LogLevel,
  SeekCachePort,
  BlobStoragePort,
  InMemoryBlobStorageAdapter,
  CryptoPort,
  HttpServerPort,
  NodeCryptoAdapter,
  WebCryptoAdapter,
  BunHttpAdapter,
  DenoHttpAdapter,
  AuditError,
  EncryptionError,
  PatchError,
  ForkError,
  IndexError,
  QueryError,
  SchemaUnsupportedError,
  ShardLoadError,
  ShardCorruptionError,
  ShardValidationError,
  StorageError,
  TraversalError,
  OperationAbortedError,
  SyncError,
  StrandError,
  WormholeError,
  WriterError,
  WarpWorldline,
  openWarpGraph,
  WarpApp,
  WarpCore,
  Worldline,
  WorldlineSelector,
  LiveSelector,
  CoordinateSelector,
  StrandSelector,
  QueryBuilder,
  Observer,
  PatchBuilder,
  PatchSession,
  Writer,
  ProvenanceIndex,
  WarpStateIndexBuilder,
  ImmutableBytes,
  SnapshotORSet,
  SnapshotVersionVector,
  SnapshotWarpState,
  WarpWorldlineCoordinate,
  WarpWorldlineOpticBasis,
  ProvenancePayload,
  BTR,
  EffectSinkPort,
  MultiplexSink,
  EffectPipeline,
  NoOpEffectSink,
  ConsoleEffectSink,
  ChunkEffectSink,
] as const;

const exportedFunctionSurface = [
  checkAborted,
  createTimeoutSignal,
  openWarpWorldline,
  computeTranslationCost,
  createNodeAdd,
  createNodeTombstone,
  createEdgeAdd,
  createEdgeTombstone,
  createPropSet,
  createInlineValue,
  createBlobValue,
  encodeEdgePropKey,
  decodeEdgePropKey,
  isEdgePropKey,
  buildWarpStateIndex,
  computeStateHash,
  projectState,
  createStateReader,
  compareVisibleState,
  normalizeVisibleStateScope,
  scopeMaterializedState,
  exportCoordinateComparisonFact,
  exportCoordinateTransferPlanFact,
  createTickReceipt,
  tickReceiptCanonicalJson,
  createBTR,
  verifyBTR,
  replayBTR,
  createWormhole,
  composeWormholes,
  replayWormhole,
  serializeWormhole,
  deserializeWormhole,
  createEffectEmission,
  canonicalEmissionJson,
  createDeliveryObservation,
  canonicalObservationJson,
  createExternalizationPolicy,
] as const;

const exportedConstantSurface = [
  CONTENT_PROPERTY_KEY,
  TICK_RECEIPT_OP_TYPES,
  TICK_RECEIPT_RESULT_TYPES,
  DELIVERY_MODES,
  DELIVERY_OUTCOMES,
  LIVE_LENS,
  REPLAY_LENS,
  INSPECT_LENS,
] as const;

void sameAppCtor;
void exportedRuntimeSurface;
void exportedFunctionSurface;
void exportedConstantSurface;

const app: WarpApp = await WarpApp.open({
  graphName: 'consumer-test',
  persistence,
  writerId: 'writer-1',
  logger,
  crypto,
  seekCache,
  autoMaterialize: true,
  onDeleteWithData: 'reject',
  trust: { mode: 'off' },
});

const graph: WarpCore = app.core();
const graphBag = await openWarpGraph({
  persistence,
  graphName: 'consumer-test',
  writerId: 'writer-2',
  logger,
  crypto,
  seekCache,
  trust: { mode: 'off' },
});

const graphName: string = graph.graphName;
const writerId: string = graph.writerId;
const graphBagName: string = graphBag.graphName;
const graphBagWriter: string = graphBag.writerId;
void graphName;
void writerId;
void graphBagName;
void graphBagWriter;

const worldlineOptions: WarpWorldlineOpenOptions = {
  persistence,
  worldlineName: 'consumer-worldline',
  writerId: 'writer-worldline',
  logger,
  crypto,
  seekCache,
  trust: { mode: 'off' },
};
const warpWorldline: WarpWorldline = await openWarpWorldline(worldlineOptions);
const worldlinePatchBuild: WarpWorldlinePatchBuild = (patch) => {
  patch.addNode('worldline-node');
};
const publicUsersAperture: Aperture = {
  match: 'user:*',
  expose: ['name'],
  redact: ['secret'],
};
const publicUsersObserverConfig: ObserverConfig = publicUsersAperture;
const worldlinePatchSha: string = await warpWorldline.commit(worldlinePatchBuild);
const worldlineOpticBasis: WarpWorldlineOpticBasis = await warpWorldline.prepareOpticBasis();
const worldlineCoordinate: WarpWorldlineCoordinate = await warpWorldline.coordinate();
const worldlineLive: Worldline = warpWorldline.live();
const worldlineHistorical: Worldline = await warpWorldline.seek({
  source: { kind: 'live', ceiling: 1 },
});
const appObserver: Observer = await app.observer(publicUsersAperture);
const appNamedApertureObserver: Observer = await app.observer('public-users', publicUsersAperture);
const appAliasApertureObserver: Observer = await app.observer(publicUsersObserverConfig);
const worldlineObserver: Observer = await warpWorldline.observer({ match: '*' });
const namedApertureObserver: Observer = await warpWorldline.observer('public-users', publicUsersAperture);
const aliasApertureObserver: Observer = await warpWorldline.observer(publicUsersObserverConfig);
const coordinateFrontierEntries: readonly WarpWorldlineCoordinateFrontierEntry[] =
  worldlineCoordinate.frontierEntries;
const coordinateSource = worldlineCoordinate.source();
const coordinateOpticNode = await worldlineCoordinate.optic().node('worldline-node').read();
const coordinateOpticAlive: boolean = coordinateOpticNode.alive;

void worldlinePatchSha;
void worldlineOpticBasis;
void coordinateFrontierEntries;
void coordinateSource;
void coordinateOpticAlive;
void worldlineLive;
void worldlineHistorical;
void appObserver;
void appNamedApertureObserver;
void appAliasApertureObserver;
void worldlineObserver;
void namedApertureObserver;
void aliasApertureObserver;

const materialized: SnapshotWarpState = await graph.materialize();
const materializedWithReceipts: { state: SnapshotWarpState; receipts: readonly ReturnType<typeof createTickReceipt>[] } =
  await graph.materialize({ receipts: true });
const stateSnapshot: SnapshotWarpState | null = await graph.getStateSnapshot();
const graphBagStateSnapshot: SnapshotWarpState | null = await graphBag.query.getStateSnapshot();
const graphBagNodeProps: PublicPropBag | null = await graphBag.query.getNodeProps('node-a');
const graphBagQueryBuilder: QueryBuilder = graphBag.query.query();
const graphBagWorldline: Worldline = graphBag.query.worldline();
const graphBagObserver: Observer = await graphBag.query.observer({ match: '*' });
const nodeAlive: SnapshotORSet = materialized.nodeAlive;
const observedFrontier: SnapshotVersionVector = materialized.observedFrontier;
const snapshotValue: SnapshotPropValue | undefined = [...materialized.prop.values()][0]?.value;
const propValue: PropValue = new Uint8Array([1, 2, 3]);

if (snapshotValue instanceof ImmutableBytes) {
  const bytes: Uint8Array = snapshotValue.toUint8Array();
  const byteArray: readonly number[] = snapshotValue.toArray();
  const byteLength: number = snapshotValue.length;
  const firstByte: number | undefined = snapshotValue.at(0);
  void bytes;
  void byteArray;
  void byteLength;
  void firstByte;
}

void materializedWithReceipts;
void stateSnapshot;
void graphBagStateSnapshot;
void graphBagNodeProps;
void graphBagQueryBuilder;
void graphBagWorldline;
void graphBagObserver;
void nodeAlive;
void observedFrontier;
void propValue;

const nodeProps: PublicPropBag | null = await graph.getNodeProps('node-a');
const edgeProps: PublicPropBag | null = await graph.getEdgeProps('node-a', 'node-b', 'knows');
const edges: PublicVisibleEdge[] = await graph.getEdges();
const neighbors: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }> =
  await graph.neighbors('node-a');
const propertyCount: number = await graph.getPropertyCount();
const queryBuilder: QueryBuilder = graph.query();
const observer: Observer = await graph.observer({ match: '*' });
const worldline: Worldline = graph.worldline();

void nodeProps;
void edgeProps;
void edges;
void neighbors;
void propertyCount;
void queryBuilder;
void observer;
void worldline;

const patchBuilder: PatchBuilder = await graph.createPatch();
const chainedPatchBuilder: PatchBuilder = patchBuilder
  .addNode('node-a')
  .addEdge('node-a', 'node-b', 'knows')
  .setProperty('node-a', 'name', 'Alice');
const builtPatch = patchBuilder.build();
const committedSha: string = await patchBuilder.commit();
const patchSha: string = await graph.patch((patch) => {
  patch.addNode('node-c');
});
const writer: Writer = await graph.writer();
const patchSession: PatchSession = await writer.beginPatch();
const patchSessionSha: string = await patchSession.addNode('node-d').commit();

void chainedPatchBuilder;
void builtPatch;
void committedSha;
void patchSha;
void patchSessionSha;

const inlineValue = createInlineValue('value');
const blobValue = createBlobValue('oid');
const nodeAdd = createNodeAdd('node-a');
const nodeTombstone = createNodeTombstone('node-a');
const edgeAdd = createEdgeAdd('node-a', 'node-b', 'knows');
const edgeTombstone = createEdgeTombstone('node-a', 'node-b', 'knows');
const propSet = createPropSet('node-a', 'name', inlineValue);

void blobValue;
void nodeAdd;
void nodeTombstone;
void edgeAdd;
void edgeTombstone;
void propSet;

const receipt = createTickReceipt({
  patchSha: 'abc123',
  writer: 'writer-1',
  lamport: 1,
  ops: [{ op: 'NodeAdd', target: 'node-a', result: 'applied' }],
});
const receiptJson: string = tickReceiptCanonicalJson(receipt);
void receiptJson;

const payload = ProvenancePayload.identity();
const payloadEntries = payload.entries();
const payloadBack: ProvenancePayload = ProvenancePayload.fromEntries(payloadEntries);
const btrRecord = await createBTR(liveState, payloadBack, btrCodecOptions);
const btrVerified: Awaited<ReturnType<typeof verifyBTR>> = await verifyBTR(btrRecord, 'secret', btrVerifyOptions);
const btrReplayed: Awaited<ReturnType<typeof replayBTR>> = await replayBTR(btrRecord, {
  crypto,
});

void btrVerified;
void btrReplayed;

const wormhole = await createWormhole({
  persistence,
  graphName: 'consumer-test',
  fromSha: 'source-sha',
  toSha: 'target-sha',
});
const composedWormhole = await composeWormholes(wormhole, wormhole);
const wormholeState = replayWormhole(composedWormhole);
const serializedWormhole = serializeWormhole(composedWormhole);
const deserializedWormhole = deserializeWormhole(serializedWormhole);

void wormholeState;
void deserializedWormhole;

const encodedEdgePropKey: string = encodeEdgePropKey('node-a', 'node-b', 'knows', 'weight');
const decodedEdgePropKey = decodeEdgePropKey(encodedEdgePropKey);
const edgePropKeyCheck: boolean = isEdgePropKey(encodedEdgePropKey);

void decodedEdgePropKey;
void edgePropKeyCheck;

const reader = createStateReader(liveState);
const snapshotReader = createStateReader(materialized);
const readerProps: PublicPropBag | null = reader.getNodeProps('node-a');
const readerEdges: PublicVisibleEdge[] = reader.getEdges();
const comparison = compareVisibleState(liveState, liveState, { targetId: 'node-a' });

void snapshotReader;
void readerProps;
void readerEdges;
void comparison;

const indexBuilder = new BitmapIndexBuilder();
const nodeId: number = indexBuilder.registerNode('sha-a');
indexBuilder.addEdge('sha-a', 'sha-b');
const serializedIndex: Record<string, Uint8Array> = indexBuilder.serialize();
const indexReader = new BitmapIndexReader({ storage: indexStorage, strict: true, logger });
indexReader.setup({ 'meta_ab.cbor': '0123456789012345678901234567890123456789' });
const indexedId: Promise<number | undefined> = indexReader.lookupId('sha-a');
const parents: Promise<string[]> = indexReader.getParents('sha-a');
const children: Promise<string[]> = indexReader.getChildren('sha-a');

void nodeId;
void serializedIndex;
void indexedId;
void parents;
void children;

const timeoutSignal: AbortSignal = createTimeoutSignal(1000);
checkAborted(timeoutSignal, 'consumer-test');
const server = await graph.serve({
  port: 3000,
  httpPort,
  unsafeAllowUnauthenticatedLocalhost: true,
});
const serverUrl: string = server.url;
await server.close();
const syncSecret: SyncSecret = SyncSecret.fromString('shared-secret');
const syncRateLimit: SyncRateLimitConfig = {
  capacity: 20,
  refillTokensPerSecond: 5,
  clock: () => 0,
};
const authedServer = await graph.serve({
  port: 3001,
  httpPort,
  auth: { keys: { default: syncSecret }, mode: 'enforce', rateLimit: syncRateLimit },
});
await graph.syncWith(authedServer.url, {
  auth: { secret: syncSecret, keyId: 'default' },
});
await authedServer.close();

void serverUrl;
void syncSecret;
void syncRateLimit;

const browserError: BrowserWarpError = new BrowserWarpError('browser smoke', 'E_BROWSER_SMOKE');
const browserVector: BrowserVersionVector = BrowserVersionVector.empty();
const browserWriterId: string = browserGenerateWriterId();

void browserError;
void browserVector;
void browserWriterId;

// Negative checks.

// @ts-expect-error materialize capability bag is not public on v17 WarpGraph.
const badGraphBagMaterialize = graphBag.materialize;

// @ts-expect-error nested materialize frontdoor is not public on v17 WarpGraph.
const badGraphBagNestedMaterialize = graphBag.materialize.materialize;

// @ts-expect-error query readings do not expose materialization.
const badGraphBagQueryMaterialize = graphBag.query.materialize;

const badWorldlineGraphAlias: WarpWorldlineOpenOptions = {
  persistence,
  worldlineName: 'consumer-worldline',
  writerId: 'writer-worldline',
  // @ts-expect-error WarpWorldline open options do not accept graphName.
  graphName: 'legacy-graph',
};

// @ts-expect-error WarpWorldline open options require worldlineName.
const badWorldlineMissingName: WarpWorldlineOpenOptions = {
  persistence,
  writerId: 'writer-worldline',
};

// @ts-expect-error WarpWorldline does not expose materialization.
const badWarpWorldlineMaterialize = warpWorldline.materialize;

// @ts-expect-error WarpWorldline does not expose graphName.
const badWarpWorldlineGraphName = warpWorldline.graphName;

// @ts-expect-error sync auth secrets must be explicit SyncSecret values.
await graph.syncWith(serverUrl, { auth: { secret: 'shared-secret', keyId: 'default' } });

// @ts-expect-error sync auth key maps must carry SyncSecret values.
await graph.serve({ port: 3002, httpPort, auth: { keys: { default: 'shared-secret' } } });

// @ts-expect-error materialize() does not return a string.
const badMaterialized: string = await graph.materialize();

// @ts-expect-error hasNode requires a string node id.
const badHasNode: boolean = await graph.hasNode(42);

// @ts-expect-error getEdgeProps requires from, to, and label.
await graph.getEdgeProps('node-a', 'node-b');

// @ts-expect-error createNodeAdd requires a string node id.
createNodeAdd(42);

void badGraphBagMaterialize;
void badGraphBagNestedMaterialize;
void badGraphBagQueryMaterialize;
void badWorldlineGraphAlias;
void badWorldlineMissingName;
void badWarpWorldlineMaterialize;
void badWarpWorldlineGraphName;
void badMaterialized;
void badHasNode;
