/**
 * Consumer smoke test -- compile-only.
 *
 * Exercises the public type surface of @git-stunts/git-warp.
 * This file is NEVER executed; it just needs to compile.
 *
 * @see contracts/type-surface.m8.json
 */

import WarpApp, {
  WarpApp as WarpAppNamed,
  WarpCore,
  GraphPersistencePort,
  IndexStoragePort,
  LoggerPort,
  ClockPort,
  CryptoPort,
  SeekCachePort,
  HttpServerPort,
  QueryBuilder,
  Observer,
  PatchBuilder,
  PatchSession,
  Patch,
  Writer,
  ProvenancePayload,
  ProvenanceIndex,
  GitGraphAdapter,
  InMemoryGraphAdapter,
  GraphNode,
  BitmapIndexBuilder,
  BitmapIndexReader,
  IndexRebuildService,
  HealthCheckService,
  CommitDagTraversalService,
  ContentAttachmentOptions,
  ContentMeta,
  NoOpLogger,
  ConsoleLogger,
  ClockAdapter,
  HealthStatus,
  LogLevel,
  TraversalError,
  OperationAbortedError,
  ForkError,
  QueryError,
  SyncError,
  WormholeError,
  SchemaUnsupportedError,
  ShardLoadError,
  ShardCorruptionError,
  ShardValidationError,
  StorageError,
  checkAborted,
  createTimeoutSignal,
  createNodeAdd,
  createNodeTombstone,
  createEdgeAdd,
  createEdgeTombstone,
  createPropSet,
  createInlineValue,
  createBlobValue,
  createEventId,
  createTickReceipt,
  tickReceiptCanonicalJson,
  TICK_RECEIPT_OP_TYPES,
  TICK_RECEIPT_RESULT_TYPES,
  createBTR,
  verifyBTR,
  replayBTR,
  serializeBTR,
  deserializeBTR,
  createWormhole,
  composeWormholes,
  replayWormhole,
  serializeWormhole,
  deserializeWormhole,
  computeTranslationCost,
  createStateReaderV5,
  compareVisibleStateV5,
  exportCoordinateComparisonFact,
  exportCoordinateTransferPlanFact,
  migrateV4toV5,
  encodeEdgePropKey,
  decodeEdgePropKey,
  isEdgePropKey,
  CONTENT_PROPERTY_KEY,
} from '../../index.js';

import type {
  WarpState,
  TickReceipt,
  Aperture,
  ObserverConfig,
  PingResult,
  RepositoryHealth,
  IndexHealth,
  TranslationCostResult,
  TranslationCostBreakdown,
  StateDiffResult,
  WarpStatus,
  SyncRequest,
  SyncResponse,
  ApplySyncResult,
  GCPolicyConfig,
  GCExecuteResult,
  GCMetrics,
  MaybeGCResult,
  JoinReceipt,
  BTR,
  BTRVerificationResult,
  WormholeEdge,
  PatchEntry,
  VisibleNodeViewV5,
  VisibleStateComparisonV5,
  VisibleStateNeighborV5,
  VisibleStateReaderV5,
  CoordinateComparisonSelectorV1,
  CoordinateComparisonV1,
  CoordinateComparisonFactExportV1,
  CoordinateTransferPlanV1,
  CoordinateTransferPlanFactExportV1,
  StrandBraidOptions,
  StrandDescriptor,
  LogicalTraversal,
  TraversalDirection,
  TraversalNode,
  TraversalOptions,
  PathOptions,
  PathResult,
  QueryNodeSnapshot,
  QueryResultV1,
  TemporalQuery,
  SyncAuthServerOptions,
  SyncAuthClientOptions,
  RebuildOptions,
  OpNodeAdd,
  OpNodeTombstone,
  OpEdgeAdd,
  OpEdgeTombstone,
  OpPropSet,
  PropSet,
  PropRemoved,
  ValueRefInline,
  ValueRefBlob,
  ValueRef,
  EventId,
  CreateWormholeOptions,
  ComposeWormholesOptions,
  VerifyBTROptions,
  WeightedCostSelector,
  TickReceiptOpType,
  TickReceiptResult,
  ConflictAnalysis,
  ConflictKind,
  ConflictTargetSelector,
} from '../../index.js';

// ---------------------------------------------------------------------------
// Positive tests -- must compile
// Top-level groups: ═══ banner ═══  |  Subsections: ---- label ----
// ---------------------------------------------------------------------------

declare const persistence: GraphPersistencePort;
declare const logger: LoggerPort;
declare const clock: ClockPort;
declare const crypto: CryptoPort;
declare const seekCache: SeekCachePort;

const _sameAppCtor: typeof WarpApp = WarpAppNamed;

// Verify imported classes/ports are usable as types
declare const _idxStorage: IndexStoragePort;
declare const _schemaErr: SchemaUnsupportedError;
declare const _shardLoadErr: ShardLoadError;
declare const _shardCorruptErr: ShardCorruptionError;
declare const _shardValErr: ShardValidationError;
declare const _storageErr: StorageError;

// WarpApp.open() — curated product-facing options
const app: WarpApp = await WarpApp.open({
  graphName: 'test',
  persistence,
  writerId: 'w1',
  logger,
  clock,
  crypto,
  seekCache,
  autoMaterialize: true,
  onDeleteWithData: 'reject',
  trust: { mode: 'off' },
});
const graph: WarpCore = app.core();

// ---- additional type-only surface coverage ----
const ping: PingResult = { ok: true, latencyMs: 1 };
const repoHealth: RepositoryHealth = { status: 'healthy', latencyMs: ping.latencyMs };
const indexHealth: IndexHealth = { status: 'healthy', loaded: true, shardCount: 1 };
const rebuildOptions: RebuildOptions = {
  limit: 10,
  maxMemoryBytes: 1024,
  onFlush: ({ flushedBytes, totalFlushedBytes, flushCount }) => {
    const _: [number, number, number] = [flushedBytes, totalFlushedBytes, flushCount];
    return _;
  },
  onProgress: ({ processedNodes, currentMemoryBytes }) => {
    const _: [number, number | null] = [processedNodes, currentMemoryBytes];
    return _;
  },
};
const traversalDirection: TraversalDirection = 'forward';
const traversalNode: TraversalNode = { sha: 'abc123', depth: 0, parent: null };
const traversalOptions: TraversalOptions = { start: traversalNode.sha, direction: traversalDirection, maxDepth: 2 };
const pathOptions: PathOptions = { from: 'a', to: 'b', maxDepth: 4, maxNodes: 100 };
const pathResult: PathResult = { found: true, path: ['a', 'b'], length: 1 };
const queryNodeSnapshot: QueryNodeSnapshot = {
  id: 'user:alice',
  props: { name: 'Alice' },
  edgesOut: [{ label: 'follows', to: 'user:bob' }],
  edgesIn: [],
};
const queryResultV1: QueryResultV1 = {
  stateHash: 'deadbeef',
  nodes: [{ id: queryNodeSnapshot.id, props: queryNodeSnapshot.props }],
};
const weightedCostSelector: WeightedCostSelector = { weightFn: (_from, _to, _label) => 1 };
const translationCostBreakdown: TranslationCostBreakdown = { nodeLoss: 0, edgeLoss: 0, propLoss: 0 };
const publicAperture: Aperture = { match: 'user:*', redact: ['ssn'] };
const legacyObserverConfig: ObserverConfig = publicAperture;
const propSet: PropSet = { key: 'node\0name', nodeId: 'user:alice', propKey: 'name', oldValue: 'A', newValue: 'B' };
const propRemoved: PropRemoved = { key: 'node\0age', nodeId: 'user:alice', propKey: 'age', oldValue: 42 };
const valueRef: ValueRef = Math.random() > -1 ? { type: 'inline', value: 'x' } : { type: 'blob', oid: 'abc123' };
const verifyBTROptions: VerifyBTROptions = { verifyReplay: true, crypto };
const _typeCoverageTuple: [
  RebuildOptions,
  TraversalOptions,
  PathOptions,
  PathResult,
  QueryResultV1,
  WeightedCostSelector,
  TranslationCostBreakdown,
  Aperture,
  PropSet,
  PropRemoved,
  ValueRef,
  VerifyBTROptions,
] = [
  rebuildOptions,
  traversalOptions,
  pathOptions,
  pathResult,
  queryResultV1,
  weightedCostSelector,
  translationCostBreakdown,
  publicAperture,
  propSet,
  propRemoved,
  valueRef,
  verifyBTROptions,
];

// ---- createPatch -> PatchBuilder ----
const pb: PatchBuilder = await graph.createPatch();
const _chain: PatchBuilder = pb.addNode('n1').addEdge('n1', 'n2', 'knows').setProperty('n1', 'name', 'Alice');
const _edgeProp: PatchBuilder = pb.setEdgeProperty('n1', 'n2', 'knows', 'weight', 0.5);
const patch: Patch = pb.build();
const _sha: string = await pb.commit();
const _opCount: number = pb.opCount;

// ---- patch() convenience ----
const sha2: string = await graph.patch((p: PatchBuilder) => {
  p.addNode('n3');
});

// ---- materialize overloads ----
const state: WarpState = await graph.materialize();
const stateReader: VisibleStateReaderV5 = createStateReaderV5(state);
const visibleComparison: VisibleStateComparisonV5 = compareVisibleStateV5(state, state, { targetId: 'n1' });
const readerProjection = stateReader.project();
const readerHasNode: boolean = stateReader.hasNode('n1');
const readerNodes: string[] = stateReader.getNodes();
const readerEdges: Array<{ from: string; to: string; label: string; props: Record<string, unknown> }> = stateReader.getEdges();
const readerProps: Record<string, unknown> | null = stateReader.getNodeProps('n1');
const readerEdgeProps: Record<string, unknown> | null = stateReader.getEdgeProps('n1', 'n2', 'knows');
const readerNeighbors: VisibleStateNeighborV5[] = stateReader.neighbors('n1', 'outgoing');
const readerContent: ContentMeta | null = stateReader.getNodeContentMeta('n1');
const readerEdgeContent: ContentMeta | null = stateReader.getEdgeContentMeta('n1', 'n2', 'knows');
const readerNodeView: VisibleNodeViewV5 | null = stateReader.inspectNode('n1');
const withReceipts: { state: WarpState; receipts: TickReceipt[] } = await graph.materialize({ receipts: true });
const conflictKinds: ConflictKind[] = ['supersession', 'redundancy'];
const conflictTarget: ConflictTargetSelector = { targetKind: 'node_property', entityId: 'user:alice', propertyKey: 'name' };
const conflictAnalysis: ConflictAnalysis = await graph.analyzeConflicts({
  at: { lamportCeiling: 10 },
  kind: conflictKinds,
  target: conflictTarget,
  evidence: 'standard',
  scanBudget: { maxPatches: 32 },
});
const _conflictId: string | undefined = conflictAnalysis.conflicts[0]?.conflictId;
const _conflictStrandMetadata: [boolean | undefined, string[] | undefined] = [
  conflictAnalysis.resolvedCoordinate.strand?.overlayWritable,
  conflictAnalysis.resolvedCoordinate.strand?.braid.braidedStrandIds,
];
const compareLeft: CoordinateComparisonSelectorV1 = { kind: 'live' };
const compareRight: CoordinateComparisonSelectorV1 = { kind: 'coordinate', frontier: { alice: 'abc123def456' }, ceiling: null };
const coordinateComparison: CoordinateComparisonV1 = await graph.compareCoordinates({
  left: compareLeft,
  right: compareRight,
  targetId: 'n1',
});
const braidOptions: StrandBraidOptions = {
  braidedStrandIds: ['ws_support'],
  writable: false,
};
const strandDescriptor: StrandDescriptor = await graph.createStrand({
  strandId: 'ws_demo',
});
const braidedStrandDescriptor: StrandDescriptor = await graph.braidStrand(
  'ws_demo',
  braidOptions,
);
const strandComparison: CoordinateComparisonV1 = await graph.compareStrand('ws_demo', {
  against: 'base',
  targetId: 'n1',
});
const strandTransferPlan: CoordinateTransferPlanV1 = await graph.planStrandTransfer('ws_demo', {
  into: 'live',
});
const coordinateTransferPlan: CoordinateTransferPlanV1 = await graph.planCoordinateTransfer({
  source: { kind: 'strand', strandId: 'ws_demo' },
  target: { kind: 'live' },
});
const coordinateComparisonFactExport: CoordinateComparisonFactExportV1 = exportCoordinateComparisonFact(coordinateComparison);
const coordinateTransferPlanFactExport: CoordinateTransferPlanFactExportV1 = exportCoordinateTransferPlanFact(coordinateTransferPlan);
const _comparisonDigestPair: [string, string] = [
  coordinateComparison.comparisonDigest,
  strandComparison.comparisonDigest,
];
const _transferDigestPair: [string, string] = [
  strandTransferPlan.transferDigest,
  coordinateTransferPlan.transferDigest,
];
const _factExportPair: [string, string] = [
  coordinateComparisonFactExport.factDigest,
  coordinateTransferPlanFactExport.factDigest,
];
const _strandDescriptorTuple: [boolean, string[]] = [
  braidedStrandDescriptor.overlay.writable,
  braidedStrandDescriptor.braid.readOverlays.map(({ strandId }) => strandId),
];
const _strandGraphName: string = strandDescriptor.graphName;
const _comparisonStrandMetadata: [boolean | undefined, string[] | undefined] = [
  strandComparison.left.resolved.strand?.overlayWritable,
  strandComparison.left.resolved.strand?.braid.braidedStrandIds,
];
const _transferPlanShape: [boolean, number, Uint8Array | undefined] = [
  strandTransferPlan.changed,
  coordinateTransferPlan.summary.opCount,
  coordinateTransferPlan.ops.find((op) => op.op === 'attach_node_content')?.content,
];

// ---- materializeAt ----
const atState: WarpState = await graph.materializeAt('abc123');

// ---- query methods ----
const nodes: string[] = await graph.getNodes();
const hasIt: boolean = await graph.hasNode('n1');
const props: Record<string, unknown> | null = await graph.getNodeProps('n1');
const edgeProps: Record<string, unknown> | null = await graph.getEdgeProps('n1', 'n2', 'knows');
const neighbors: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }> = await graph.neighbors('n1');
const propCount: number = await graph.getPropertyCount();
const snapshot: WarpState | null = await graph.getStateSnapshot();
const edges: Array<{ from: string; to: string; label: string; props: Record<string, unknown> }> = await graph.getEdges();

// ---- content attachment ----
const contentOid: string | null = await graph.getContentOid('n1');
const contentMeta: ContentMeta | null = await graph.getContentMeta('n1');
const contentBuf: Uint8Array | null = await graph.getContent('n1');
const edgeContentOid: string | null = await graph.getEdgeContentOid('n1', 'n2', 'knows');
const edgeContentMeta: ContentMeta | null =
  await graph.getEdgeContentMeta('n1', 'n2', 'knows');
const edgeContentBuf: Uint8Array | null = await graph.getEdgeContent('n1', 'n2', 'knows');
const contentOptions: ContentAttachmentOptions = { mime: 'text/plain', size: 5 };
const _attachResult: PatchBuilder = await pb.attachContent('n1', 'hello', contentOptions);
const _attachEdgeResult: PatchBuilder = await pb.attachEdgeContent('n1', 'n2', 'knows', new TextEncoder().encode('data'));
const _contentKey: '_content' = CONTENT_PROPERTY_KEY;

// ---- query builder ----
const qb: QueryBuilder = graph.query();

// ---- observer ----
const obs: Observer = await graph.observer('obs1', { match: '*' });
const obsDefault: Observer = await graph.observer({ match: '*' });
const obsNodes: string[] = await obs.getNodes();
const obsHas: boolean = await obs.hasNode('n1');
const obsProps: Record<string, unknown> | null = await obs.getNodeProps('n1');
const obsEdges: Array<{ from: string; to: string; label: string; props: Record<string, unknown> }> = await obs.getEdges();
const obsQb: QueryBuilder = obs.query();
const obsTraverse: LogicalTraversal = obs.traverse;
const obsName: string = obs.name;
const obsDefaultName: string = obsDefault.name;

const worldline = graph.worldline();
const worldlineObs: Observer = await worldline.observer({ match: '*' });
const worldlineObsNamed: Observer = await worldline.observer('users', { match: '*' });

// ---- translationCost (instance method) ----
const costResult: TranslationCostResult = await graph.translationCost(publicAperture, legacyObserverConfig);

// ---- writer ----
const w: Writer = await graph.writer();
const wWithId: Writer = await graph.writer('custom-writer');
const wSha: string = await w.commitPatch((p) => { p.addNode('n10'); });
const wHead: string | null = await w.head();
const wPs: PatchSession = await w.beginPatch();
const wWriterId: string = w.writerId;
const wGraphName: string = w.graphName;

// ---- PatchSession methods ----
const ps: PatchSession = await w.beginPatch();
const ps2: PatchSession = ps.addNode('x').removeNode('y').addEdge('a', 'b', 'c').removeEdge('a', 'b', 'c');
const ps3: PatchSession = ps.setProperty('x', 'k', 'v').setEdgeProperty('a', 'b', 'c', 'k', 'v');
const psPatch: Patch = ps.build();
const psSha: string = await ps.commit();
const psOpCount: number = ps.opCount;
const psAttach: PatchSession = await ps.attachContent('x', 'content', { mime: 'text/plain', size: 7 });
const psAttachEdge: PatchSession = await ps.attachEdgeContent('a', 'b', 'c', 'content', { size: 7 });

// ---- sync protocol ----
const syncReq: SyncRequest = await graph.createSyncRequest();
const syncResp: SyncResponse = await graph.processSyncRequest(syncReq);
const applyResult: ApplySyncResult = graph.applySyncResponse(syncResp);
const frontier: Map<string, string> = await graph.getFrontier();
const changed: boolean = await graph.hasFrontierChanged();
const needed: boolean = await graph.syncNeeded(frontier);
await graph.syncCoverage();

// ---- syncWith ----
const syncResult: { applied: number; attempts: number; state?: WarpState } =
  await graph.syncWith('http://localhost:3000', { trust: { mode: 'enforce', pin: 'abc123' } });
const syncWithGraph: { applied: number; attempts: number; state?: WarpState } =
  await graph.syncWith(graph, { materialize: true });

// ---- serve ----
declare const httpPort: HttpServerPort;
const server = await graph.serve({ port: 3000, httpPort });
const serverUrl: string = server.url;
await server.close();

// ---- discoverWriters / getWriterPatches ----
const writers: string[] = await graph.discoverWriters();
const writerPatches: Array<{ patch: Patch; sha: string }> = await graph.getWriterPatches('w1');
const writerPatchesStopped: Array<{ patch: Patch; sha: string }> = await graph.getWriterPatches('w1', 'abc123');

// ---- createCheckpoint ----
const cpSha: string = await graph.createCheckpoint();

// ---- provenance ----
const patchesFor: string[] = await graph.patchesFor('n1');
const slice = await graph.materializeSlice('n1');
const sliceState: WarpState = slice.state;
const slicePatchCount: number = slice.patchCount;
const sliceWithReceipts = await graph.materializeSlice('n1', { receipts: true });

// ---- fork ----
const forked: WarpCore = await graph.fork({ from: 'w1', at: 'abc123' });
const forkedCustom: WarpCore = await graph.fork({ from: 'w1', at: 'abc123', forkName: 'my-fork', forkWriterId: 'w2' });

// ---- createWormhole (instance method) ----
const wormhole: WormholeEdge = await graph.createWormhole('sha1', 'sha2');

// ---- watch ----
const watcher = graph.watch('user:*', { onChange: (diff: StateDiffResult) => {}, poll: 1000 });
watcher.unsubscribe();

// ---- status ----
const status: WarpStatus = await graph.status();

// ---- GC ----
const gcMaybe: MaybeGCResult = graph.maybeRunGC();
const gcRun: GCExecuteResult = graph.runGC();
const gcMetrics: GCMetrics | null = graph.getGCMetrics();

// ---- join ----
const joinResult: { state: WarpState; receipt: JoinReceipt } = graph.join(state);

// ---- subscribe ----
const sub = graph.subscribe({ onChange: (diff: StateDiffResult) => {} });
sub.unsubscribe();

// ---- setSeekCache ----
graph.setSeekCache(seekCache);
graph.setSeekCache(null);
const sc: SeekCachePort | null = graph.seekCache;

// ---- properties / getters ----
const gName: string = graph.graphName;
const gWriterId: string = graph.writerId;
const gPersistence: GraphPersistencePort = graph.persistence;
const gOnDelete: 'reject' | 'cascade' | 'warn' = graph.onDeleteWithData;
const gGcPolicy: GCPolicyConfig = graph.gcPolicy;
const gTemporal: TemporalQuery = graph.temporal;
const gTraverse: LogicalTraversal = graph.traverse;
const gClosureStream = gTraverse.transitiveClosureStream(['user:alice'], { dir: 'out', maxEdges: 10 });
for await (const edge of gClosureStream) {
  const _: [string, string] = [edge.from, edge.to];
  break;
}
const gProvIdx: ProvenanceIndex | null = graph.provenanceIndex;

// ---------------------------------------------------------------------------
// Standalone functions — WARP type creators
// ---------------------------------------------------------------------------
const na: OpNodeAdd = createNodeAdd('n1');
const nt: OpNodeTombstone = createNodeTombstone('n1');
const ea: OpEdgeAdd = createEdgeAdd('a', 'b', 'knows');
const et: OpEdgeTombstone = createEdgeTombstone('a', 'b', 'knows');
const pps: OpPropSet = createPropSet('n1', 'key', createInlineValue('val'));
const iv: ValueRefInline = createInlineValue('hello');
const bv: ValueRefBlob = createBlobValue('abc123');
const eid: EventId = createEventId({ lamport: 1, writerId: 'w1', patchSha: 'abc', opIndex: 0 });

// ---------------------------------------------------------------------------
// Standalone functions — Tick Receipts
// ---------------------------------------------------------------------------
const receipt = createTickReceipt({
  patchSha: 'abc',
  writer: 'w1',
  lamport: 1,
  ops: [{ op: 'NodeAdd', target: 'n1', result: 'applied' }],
});
const receiptJson: string = tickReceiptCanonicalJson(receipt);
const _opTypes: readonly TickReceiptOpType[] = TICK_RECEIPT_OP_TYPES;
const _resultTypes: readonly TickReceiptResult[] = TICK_RECEIPT_RESULT_TYPES;

// ---------------------------------------------------------------------------
// Standalone functions — BTR
// ---------------------------------------------------------------------------
declare const btrState: WarpState;
const payload = new ProvenancePayload([]);
const btr: BTR = await createBTR(btrState, payload, { key: 'secret', crypto });
const verified: BTRVerificationResult = await verifyBTR(btr, 'secret', { crypto });
const replayed = await replayBTR(btr, { crypto });
const replayedState: WarpState = replayed.state;
const replayedHash: string = replayed.h_out;
const btrBytes: Uint8Array = serializeBTR(btr);
const btrBack: BTR = deserializeBTR(btrBytes);

// ---------------------------------------------------------------------------
// Standalone functions — Wormhole
// ---------------------------------------------------------------------------
declare const wmOpts: CreateWormholeOptions;
const wm: WormholeEdge = await createWormhole(wmOpts);
declare const wm2: WormholeEdge;
const composed: WormholeEdge = await composeWormholes(wm, wm2);
const wmState: WarpState = replayWormhole(wm);
const wmSerialized = serializeWormhole(wm);
const wmBack: WormholeEdge = deserializeWormhole(wmSerialized);

// ---------------------------------------------------------------------------
// Standalone functions — Migration + TranslationCost
// ---------------------------------------------------------------------------
const costStandalone: TranslationCostResult = computeTranslationCost(
  { match: 'user:*' },
  { match: 'admin:*' },
  state,
);
declare const v4State: {
  nodeAlive: Map<string, { value: boolean }>;
  edgeAlive: Map<string, { value: boolean }>;
  prop: Map<string, unknown>;
};
const migrated: WarpState = migrateV4toV5(v4State, 'migration-writer');

// ---------------------------------------------------------------------------
// Classes — InMemoryGraphAdapter
// ---------------------------------------------------------------------------
const memAdapter = new InMemoryGraphAdapter();
const memEmptyTree: string = memAdapter.emptyTree;

// ---------------------------------------------------------------------------
// Classes — GitGraphAdapter
// ---------------------------------------------------------------------------
declare const plumbing: import('../../index.js').GitPlumbing;
const gitAdapter = new GitGraphAdapter({ plumbing });
const gitEmptyTree: string = gitAdapter.emptyTree;

// ---------------------------------------------------------------------------
// Classes — BitmapIndexBuilder + BitmapIndexReader
// ---------------------------------------------------------------------------
const builder = new BitmapIndexBuilder();
const nodeId: number = builder.registerNode('sha1');
builder.addEdge('sha1', 'sha2');
const serialized: Promise<Record<string, Uint8Array>> = builder.serialize();

const reader = new BitmapIndexReader({ storage: gitAdapter, strict: true, logger, crypto });
reader.setup({ 'meta_ab.json': 'oid1', 'shards_fwd_ab.json': 'oid2' });
const lookupResult: Promise<number | undefined> = reader.lookupId('sha1');
const parents: Promise<string[]> = reader.getParents('sha1');
const children: Promise<string[]> = reader.getChildren('sha1');

// ---------------------------------------------------------------------------
// Classes — ProvenancePayload
// ---------------------------------------------------------------------------
const emptyPayload: ProvenancePayload = ProvenancePayload.identity();
const pp = new ProvenancePayload([]);
const ppLen: number = pp.length;
const ppConcat: ProvenancePayload = pp.concat(emptyPayload);
const ppReplay: WarpState = pp.replay();
const ppAt: PatchEntry | undefined = pp.at(0);
const ppSlice: ProvenancePayload = pp.slice(0, 1);
const ppJson: PatchEntry[] = pp.toJSON();
const ppBack: ProvenancePayload = ProvenancePayload.fromJSON(ppJson);

// ---------------------------------------------------------------------------
// Classes — HealthCheckService
// ---------------------------------------------------------------------------
const health = new HealthCheckService({ persistence, clock, logger });
health.setIndexReader(reader);
const alive: Promise<boolean> = health.isAlive();
const ready: Promise<boolean> = health.isReady();

// ---------------------------------------------------------------------------
// Classes — Writer (explicit method types)
// ---------------------------------------------------------------------------
const writerHead: Promise<string | null> = w.head();
const writerBegin: Promise<PatchSession> = w.beginPatch();
const writerCommit: Promise<string> = w.commitPatch((p) => { p.addNode('test'); });

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
checkAborted(undefined, 'test');
const sig: AbortSignal = createTimeoutSignal(1000);
const encoded: string = encodeEdgePropKey('a', 'b', 'c', 'd');
const decoded = decodeEdgePropKey(encoded);
const isEdge: boolean = isEdgePropKey(encoded);

// ---------------------------------------------------------------------------
// Browser entry point — verify missing exports (#1)
// ---------------------------------------------------------------------------
import {
  WarpError as BrowserWarpError,
  VersionVector as BrowserVersionVector,
  generateWriterId as browserGenWriterId,
} from '../../browser.js';

const _browserErr: BrowserWarpError = new BrowserWarpError('test', { code: 'TEST' });
const _browserVV: BrowserVersionVector = BrowserVersionVector.empty();
const _browserWriterId: string = browserGenWriterId();

// ---------------------------------------------------------------------------
// Negative tests -- must FAIL compilation (verified via @ts-expect-error)
// ---------------------------------------------------------------------------

// @ts-expect-error -- materialize() does not return string
const bad1: string = await graph.materialize();

// @ts-expect-error -- hasNode requires string, not number
const bad2: boolean = await graph.hasNode(42);

// @ts-expect-error -- patch callback receives PatchBuilder, not string
await graph.patch((p: string) => {});

// @ts-expect-error -- getEdgeProps requires 3 string args
await graph.getEdgeProps('a', 'b');

// @ts-expect-error -- WarpCore.open requires persistence (missing required option)
await WarpCore.open({ graphName: 'test', writerId: 'w1' });

// @ts-expect-error -- createNodeAdd requires string, not number
createNodeAdd(42);

// @ts-expect-error -- getContent requires string, not number
await graph.getContent(42);
