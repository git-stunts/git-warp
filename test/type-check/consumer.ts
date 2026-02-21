/**
 * Consumer smoke test -- compile-only.
 *
 * Exercises the public type surface of @git-stunts/git-warp.
 * This file is NEVER executed; it just needs to compile.
 *
 * @see contracts/type-surface.m8.json
 */

import WarpGraph, {
  GraphPersistencePort,
  IndexStoragePort,
  LoggerPort,
  ClockPort,
  CryptoPort,
  SeekCachePort,
  HttpServerPort,
  QueryBuilder,
  ObserverView,
  PatchBuilderV2,
  PatchSession,
  PatchV2,
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
  migrateV4toV5,
  encodeEdgePropKey,
  decodeEdgePropKey,
  isEdgePropKey,
  CONTENT_PROPERTY_KEY,
} from '../../index.js';

import type {
  WarpStateV5,
  TickReceipt,
  ObserverConfig,
  TranslationCostResult,
  StateDiffResult,
  WarpGraphStatus,
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
  LogicalTraversal,
  TemporalQuery,
  SyncAuthServerOptions,
  SyncAuthClientOptions,
  OpNodeAdd,
  OpNodeTombstone,
  OpEdgeAdd,
  OpEdgeTombstone,
  OpPropSet,
  ValueRefInline,
  ValueRefBlob,
  EventId,
  CreateWormholeOptions,
  ComposeWormholesOptions,
  TickReceiptOpType,
  TickReceiptResult,
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

// Verify imported classes/ports are usable as types
declare const _idxStorage: IndexStoragePort;
declare const _schemaErr: SchemaUnsupportedError;
declare const _shardLoadErr: ShardLoadError;
declare const _shardCorruptErr: ShardCorruptionError;
declare const _shardValErr: ShardValidationError;
declare const _storageErr: StorageError;

// WarpGraph.open() — full options
const graph: WarpGraph = await WarpGraph.open({
  graphName: 'test',
  persistence,
  writerId: 'w1',
  logger,
  clock,
  crypto,
  seekCache,
  autoMaterialize: true,
  onDeleteWithData: 'reject',
});

// ---- createPatch -> PatchBuilderV2 ----
const pb: PatchBuilderV2 = await graph.createPatch();
const _chain: PatchBuilderV2 = pb.addNode('n1').addEdge('n1', 'n2', 'knows').setProperty('n1', 'name', 'Alice');
const _edgeProp: PatchBuilderV2 = pb.setEdgeProperty('n1', 'n2', 'knows', 'weight', 0.5);
const patch: PatchV2 = pb.build();
const _sha: string = await pb.commit();
const _opCount: number = pb.opCount;

// ---- patch() convenience ----
const sha2: string = await graph.patch((p: PatchBuilderV2) => {
  p.addNode('n3');
});

// ---- materialize overloads ----
const state: WarpStateV5 = await graph.materialize();
const withReceipts: { state: WarpStateV5; receipts: TickReceipt[] } = await graph.materialize({ receipts: true });

// ---- materializeAt ----
const atState: WarpStateV5 = await graph.materializeAt('abc123');

// ---- query methods ----
const nodes: string[] = await graph.getNodes();
const hasIt: boolean = await graph.hasNode('n1');
const props: Map<string, unknown> | null = await graph.getNodeProps('n1');
const edgeProps: Record<string, unknown> | null = await graph.getEdgeProps('n1', 'n2', 'knows');
const neighbors: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }> = await graph.neighbors('n1');
const propCount: number = await graph.getPropertyCount();
const snapshot: WarpStateV5 | null = await graph.getStateSnapshot();
const edges: Array<{ from: string; to: string; label: string; props: Record<string, unknown> }> = await graph.getEdges();

// ---- content attachment ----
const contentOid: string | null = await graph.getContentOid('n1');
const contentBuf: Buffer | null = await graph.getContent('n1');
const edgeContentOid: string | null = await graph.getEdgeContentOid('n1', 'n2', 'knows');
const edgeContentBuf: Buffer | null = await graph.getEdgeContent('n1', 'n2', 'knows');
const _attachResult: PatchBuilderV2 = await pb.attachContent('n1', 'hello');
const _attachEdgeResult: PatchBuilderV2 = await pb.attachEdgeContent('n1', 'n2', 'knows', Buffer.from('data'));
const _contentKey: '_content' = CONTENT_PROPERTY_KEY;

// ---- query builder ----
const qb: QueryBuilder = graph.query();

// ---- observer ----
const obs: ObserverView = await graph.observer('obs1', { match: '*' });
const obsNodes: string[] = await obs.getNodes();
const obsHas: boolean = await obs.hasNode('n1');
const obsProps: Map<string, unknown> | null = await obs.getNodeProps('n1');
const obsEdges: Array<{ from: string; to: string; label: string; props: Record<string, unknown> }> = await obs.getEdges();
const obsQb: QueryBuilder = obs.query();
const obsTraverse: LogicalTraversal = obs.traverse;
const obsName: string = obs.name;

// ---- translationCost (instance method) ----
const costResult: TranslationCostResult = await graph.translationCost({ match: 'user:*' }, { match: 'admin:*' });

// ---- writer ----
const w: Writer = await graph.writer();
const wWithId: Writer = await graph.writer('custom-writer');
const wSha: string = await w.commitPatch((p) => { p.addNode('n10'); });
const wHead: string | null = await w.head();
const wPs: PatchSession = await w.beginPatch();
const wWriterId: string = w.writerId;
const wGraphName: string = w.graphName;

// ---- createWriter (deprecated) ----
const cw: Writer = await graph.createWriter();
const cwWithOpts: Writer = await graph.createWriter({ persist: 'config', alias: 'test' });

// ---- PatchSession methods ----
const ps: PatchSession = await w.beginPatch();
const ps2: PatchSession = ps.addNode('x').removeNode('y').addEdge('a', 'b', 'c').removeEdge('a', 'b', 'c');
const ps3: PatchSession = ps.setProperty('x', 'k', 'v').setEdgeProperty('a', 'b', 'c', 'k', 'v');
const psPatch: PatchV2 = ps.build();
const psSha: string = await ps.commit();
const psOpCount: number = ps.opCount;
const psAttach: PatchSession = await ps.attachContent('x', 'content');
const psAttachEdge: PatchSession = await ps.attachEdgeContent('a', 'b', 'c', 'content');

// ---- sync protocol ----
const syncReq: SyncRequest = await graph.createSyncRequest();
const syncResp: SyncResponse = await graph.processSyncRequest(syncReq);
const applyResult: ApplySyncResult = graph.applySyncResponse(syncResp);
const frontier: Map<string, string> = await graph.getFrontier();
const changed: boolean = await graph.hasFrontierChanged();
const needed: boolean = await graph.syncNeeded(frontier);
await graph.syncCoverage();

// ---- syncWith ----
const syncResult: { applied: number; attempts: number; state?: WarpStateV5 } =
  await graph.syncWith('http://localhost:3000');
const syncWithGraph: { applied: number; attempts: number; state?: WarpStateV5 } =
  await graph.syncWith(graph, { materialize: true });

// ---- serve ----
declare const httpPort: HttpServerPort;
const server = await graph.serve({ port: 3000, httpPort });
const serverUrl: string = server.url;
await server.close();

// ---- discoverWriters / getWriterPatches ----
const writers: string[] = await graph.discoverWriters();
const writerPatches: Array<{ patch: PatchV2; sha: string }> = await graph.getWriterPatches('w1');
const writerPatchesStopped: Array<{ patch: PatchV2; sha: string }> = await graph.getWriterPatches('w1', 'abc123');

// ---- createCheckpoint ----
const cpSha: string = await graph.createCheckpoint();

// ---- provenance ----
const patchesFor: string[] = await graph.patchesFor('n1');
const slice = await graph.materializeSlice('n1');
const sliceState: WarpStateV5 = slice.state;
const slicePatchCount: number = slice.patchCount;
const sliceWithReceipts = await graph.materializeSlice('n1', { receipts: true });

// ---- fork ----
const forked: WarpGraph = await graph.fork({ from: 'w1', at: 'abc123' });
const forkedCustom: WarpGraph = await graph.fork({ from: 'w1', at: 'abc123', forkName: 'my-fork', forkWriterId: 'w2' });

// ---- createWormhole (instance method) ----
const wormhole: WormholeEdge = await graph.createWormhole('sha1', 'sha2');

// ---- watch ----
const watcher = graph.watch('user:*', { onChange: (diff: StateDiffResult) => {}, poll: 1000 });
watcher.unsubscribe();

// ---- status ----
const status: WarpGraphStatus = await graph.status();

// ---- GC ----
const gcMaybe: MaybeGCResult = graph.maybeRunGC();
const gcRun: GCExecuteResult = graph.runGC();
const gcMetrics: GCMetrics | null = graph.getGCMetrics();

// ---- join ----
const joinResult: { state: WarpStateV5; receipt: JoinReceipt } = graph.join(state);

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
declare const btrState: WarpStateV5;
const payload = new ProvenancePayload([]);
const btr: BTR = await createBTR(btrState, payload, { key: 'secret', crypto });
const verified: BTRVerificationResult = await verifyBTR(btr, 'secret', { crypto });
const replayed = await replayBTR(btr, { crypto });
const replayedState: WarpStateV5 = replayed.state;
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
const wmState: WarpStateV5 = replayWormhole(wm);
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
const migrated: WarpStateV5 = migrateV4toV5(v4State, 'migration-writer');

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
const serialized: Promise<Record<string, Buffer>> = builder.serialize();

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
const ppReplay: WarpStateV5 = pp.replay();
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
// Negative tests -- must FAIL compilation (verified via @ts-expect-error)
// ---------------------------------------------------------------------------

// @ts-expect-error -- materialize() does not return string
const bad1: string = await graph.materialize();

// @ts-expect-error -- hasNode requires string, not number
const bad2: boolean = await graph.hasNode(42);

// @ts-expect-error -- patch callback receives PatchBuilderV2, not string
await graph.patch((p: string) => {});

// @ts-expect-error -- getEdgeProps requires 3 string args
await graph.getEdgeProps('a', 'b');

// @ts-expect-error -- WarpGraph.open requires persistence (missing required option)
await WarpGraph.open({ graphName: 'test', writerId: 'w1' });

// @ts-expect-error -- createNodeAdd requires string, not number
createNodeAdd(42);

// @ts-expect-error -- getContent requires string, not number
await graph.getContent(42);
