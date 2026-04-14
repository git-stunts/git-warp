import type { WarpState } from '../../src/domain/services/JoinReducer.ts';
import type { TickReceipt } from '../../src/domain/types/TickReceipt.ts';
import type { ConflictAnalyzeOptions } from '../../src/domain/services/strand/ConflictAnalysisRequest.ts';
import type ConflictAnalysis from '../../src/domain/types/conflict/ConflictAnalysis.ts';
import type { StrandCreateOptions, StrandBraidOptions, StrandDescriptor } from '../../src/domain/types/StrandDescriptor.ts';
import type { CoordinateComparisonV1, CoordinateTransferPlanV1, CoordinateComparisonSelectorV1, CoordinateTransferPlanSelectorV1 } from '../../src/domain/types/CoordinateComparison.ts';
import type Patch from '../../src/domain/types/Patch.ts';
import type SeekCachePort from '../../src/ports/SeekCachePort.ts';

export type Persistence = {
  listRefs: (prefix: string) => Promise<string[]>;
  readRef: (ref: string) => Promise<string | null>;
  updateRef: (ref: string, oid: string) => Promise<void>;
  deleteRef: (ref: string) => Promise<void>;
  readBlob: (oid: string) => Promise<Uint8Array>;
  writeBlob: (buf: Uint8Array) => Promise<string>;
  getNodeInfo: (sha: string) => Promise<{ date?: string | null }>;
  nodeExists: (sha: string) => Promise<boolean>;
  isAncestor: (sha: string, coverageSha: string) => Promise<boolean>;
  ping: () => Promise<{ ok: boolean }>;
  plumbing: unknown;
};

export type WarpGraphInstance = {
  materialize: (opts?: { ceiling?: number }) => Promise<WarpState>;
  materializeCoordinate: (opts: { frontier: Map<string, string> | Record<string, string>; ceiling?: number | null; receipts?: boolean }) => Promise<WarpState | { state: WarpState; receipts: TickReceipt[] }>;
  getNodes: () => Promise<Array<{ id: string }>>;
  getEdges: () => Promise<Array<{ from: string; to: string; label?: string }>>;
  createCheckpoint: () => Promise<string | null>;
  query: () => QueryBuilderLike;
  traverse: { shortestPath: Function };
  getWriterPatches: (writerId: string) => Promise<Array<{ patch: { schema?: number; lamport: number; ops?: Array<{ type: string; node?: string; from?: string; to?: string }> }; sha: string }>>;
  status: () => Promise<{ frontier: Record<string, string> }>;
  discoverWriters: () => Promise<string[]>;
  getFrontier: () => Promise<Map<string, string>>;
  patchesFor: (entityId: string) => Promise<string[]>;
  getGCMetrics: () => { totalTombstones: number; tombstoneRatio: number };
  getPropertyCount: () => Promise<number>;
  getStateSnapshot: () => Promise<WarpState | null>;
  analyzeConflicts: (options?: ConflictAnalyzeOptions) => Promise<ConflictAnalysis>;
  createStrand: (options?: StrandCreateOptions) => Promise<StrandDescriptor>;
  braidStrand: (strandId: string, options?: StrandBraidOptions) => Promise<StrandDescriptor>;
  getStrand: (strandId: string) => Promise<StrandDescriptor | null>;
  listStrands: () => Promise<StrandDescriptor[]>;
  dropStrand: (strandId: string) => Promise<boolean>;
  materializeStrand: (strandId: string, options?: { receipts?: boolean; ceiling?: number | null }) => Promise<WarpState | { state: WarpState; receipts: TickReceipt[] }>;
  getStrandPatches: (strandId: string, options?: { ceiling?: number | null }) => Promise<Array<{ patch: Patch; sha: string }>>;
  patchesForStrand: (strandId: string, entityId: string, options?: { ceiling?: number | null }) => Promise<string[]>;
  compareStrand: (strandId: string, options?: { against?: 'base' | 'live' | { kind: 'strand'; strandId: string }; ceiling?: number | null; againstCeiling?: number | null; targetId?: string | null }) => Promise<CoordinateComparisonV1>;
  planStrandTransfer: (strandId: string, options?: { into?: 'base' | 'live' | { kind: 'strand'; strandId: string }; ceiling?: number | null; intoCeiling?: number | null }) => Promise<CoordinateTransferPlanV1>;
  compareCoordinates: (options: { left: CoordinateComparisonSelectorV1; right: CoordinateComparisonSelectorV1; targetId?: string | null }) => Promise<CoordinateComparisonV1>;
  planCoordinateTransfer: (options: { source: CoordinateTransferPlanSelectorV1; target: CoordinateTransferPlanSelectorV1 }) => Promise<CoordinateTransferPlanV1>;
  discoverTicks: () => Promise<{ ticks: number[]; maxTick: number; perWriter: Map<string, WriterTickInfo> }>;
  loadPatchBySha: (sha: string) => Promise<Patch>;
  setSeekCache: (cache: SeekCachePort) => void;
  seekCache: { clear: () => Promise<void> } | null;
  _seekCeiling?: number;
  _provenanceDegraded?: boolean;
  verifyIndex: (options?: { seed?: number; sampleRate?: number }) => Promise<{ passed: number; failed: number; errors: Array<{ nodeId: string; direction: string; error: string }> }>;
  invalidateIndex: () => void;
};

export type WriterTickInfo = {
  ticks: number[];
  tipSha: string | null;
  tickShas?: Record<number, string>;
};

export type CursorBlob = {
  tick: number;
  mode?: string;
  nodes?: number;
  edges?: number;
  frontierHash?: string;
};

export type CliOptions = {
  repo: string;
  json: boolean;
  ndjson: boolean;
  view: string | null;
  graph: string | null;
  writer: string;
  help: boolean;
};

export type GraphInfoResult = {
  name: string;
  writers: { count: number; ids?: string[] };
  checkpoint?: { ref: string; sha: string | null; date?: string | null };
  coverage?: { ref: string; sha: string | null };
  writerPatches?: Record<string, number>;
  cursor?: { active: boolean; tick?: number; mode?: string };
};

export type SeekSpec = {
  action: string;
  tickValue: string | null;
  name: string | null;
  noPersistentCache: boolean;
  diff: boolean;
  diffLimit: number;
};

export type QueryBuilderLike = {
  outgoing: (label?: string) => QueryBuilderLike;
  incoming: (label?: string) => QueryBuilderLike;
  where: (fn: Function) => QueryBuilderLike;
  match: (pattern: string) => QueryBuilderLike;
  select: (fields: string[]) => QueryBuilderLike;
  run: () => Promise<{ nodes: Array<{ id: string; props?: Record<string, unknown> }>; stateHash?: string }>;
};
