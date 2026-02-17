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
  LoggerPort,
  ClockPort,
  CryptoPort,
  SeekCachePort,
  QueryBuilder,
  ObserverView,
  PatchBuilderV2,
  PatchSession,
  PatchV2,
  Writer,
  ProvenancePayload,
  ProvenanceIndex,
  GitGraphAdapter,
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
  checkAborted,
  createTimeoutSignal,
  createNodeAdd,
  createTickReceipt,
  createBTR,
  verifyBTR,
  computeTranslationCost,
  encodeEdgePropKey,
  decodeEdgePropKey,
  isEdgePropKey,
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
  GCPolicyConfig,
  GCExecuteResult,
  MaybeGCResult,
  JoinReceipt,
  BTR,
  WormholeEdge,
} from '../../index.js';

// ---------------------------------------------------------------------------
// Positive tests -- must compile
// ---------------------------------------------------------------------------

declare const persistence: GraphPersistencePort;
declare const logger: LoggerPort;
declare const clock: ClockPort;

// WarpGraph.open()
const graph: WarpGraph = await WarpGraph.open({
  graphName: 'test',
  persistence,
  writerId: 'w1',
  logger,
  clock,
});

// createPatch -> PatchBuilderV2
const pb: PatchBuilderV2 = await graph.createPatch();
const _chain: PatchBuilderV2 = pb.addNode('n1').addEdge('n1', 'n2', 'knows').setProperty('n1', 'name', 'Alice');
const patch: PatchV2 = pb.build();
const _sha: string = await pb.commit();

// patch() convenience
const sha2: string = await graph.patch((p: PatchBuilderV2) => {
  p.addNode('n3');
});

// materialize overloads
const state: WarpStateV5 = await graph.materialize();
const withReceipts: { state: WarpStateV5; receipts: TickReceipt[] } = await graph.materialize({ receipts: true });

// materializeAt
const atState: WarpStateV5 = await graph.materializeAt('abc123');

// query methods
const nodes: string[] = await graph.getNodes();
const hasIt: boolean = await graph.hasNode('n1');
const props: Map<string, unknown> | null = await graph.getNodeProps('n1');
const edgeProps: Record<string, unknown> | null = await graph.getEdgeProps('n1', 'n2', 'knows');
const neighbors: Array<{ nodeId: string; label: string; direction: 'outgoing' | 'incoming' }> = await graph.neighbors('n1');
const propCount: number = await graph.getPropertyCount();
const snapshot: WarpStateV5 | null = await graph.getStateSnapshot();
const edges: Array<{ from: string; to: string; label: string; props: Record<string, unknown> }> = await graph.getEdges();

// query builder
const qb: QueryBuilder = graph.query();

// observer
const obs: ObserverView = await graph.observer('obs1', { match: '*' });
const obsNodes: string[] = await obs.getNodes();

// writer
const w: Writer = await graph.writer();
const wSha: string = await w.commitPatch((p) => { p.addNode('n10'); });

// sync
const frontier: Map<string, string> = await graph.getFrontier();
const changed: boolean = await graph.hasFrontierChanged();

// status
const status: WarpGraphStatus = await graph.status();

// GC
const gcResult: MaybeGCResult = graph.maybeRunGC();

// provenance
const patchesFor: string[] = await graph.patchesFor('n1');

// join
const joinResult: { state: WarpStateV5; receipt: JoinReceipt } = graph.join(state);

// subscribe
const sub = graph.subscribe({ onChange: (diff: StateDiffResult) => {} });
sub.unsubscribe();

// utilities
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
