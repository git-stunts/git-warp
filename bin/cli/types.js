/**
 * @typedef {Object} Persistence
 * @property {(prefix: string) => Promise<string[]>} listRefs
 * @property {(ref: string) => Promise<string|null>} readRef
 * @property {(ref: string, oid: string) => Promise<void>} updateRef
 * @property {(ref: string) => Promise<void>} deleteRef
 * @property {(oid: string) => Promise<Uint8Array>} readBlob
 * @property {(buf: Uint8Array) => Promise<string>} writeBlob
 * @property {(sha: string) => Promise<{date?: string|null}>} getNodeInfo
 * @property {(sha: string) => Promise<boolean>} nodeExists
 * @property {(sha: string, coverageSha: string) => Promise<boolean>} isAncestor
 * @property {() => Promise<{ok: boolean}>} ping
 * @property {unknown} plumbing
 */

/**
 * @typedef {Object} WarpGraphInstance
 * @property {(opts?: {ceiling?: number}) => Promise<import('../../src/domain/services/JoinReducer.ts').WarpState>} materialize
 * @property {(opts: {frontier: Map<string, string>|Record<string, string>, ceiling?: number|null, receipts?: boolean}) => Promise<import('../../src/domain/services/JoinReducer.ts').WarpState|{state: import('../../src/domain/services/JoinReducer.ts').WarpState, receipts: import('../../src/domain/types/TickReceipt.ts').TickReceipt[]}>} materializeCoordinate
 * @property {() => Promise<Array<{id: string}>>} getNodes
 * @property {() => Promise<Array<{from: string, to: string, label?: string}>>} getEdges
 * @property {() => Promise<string|null>} createCheckpoint
 * @property {() => QueryBuilderLike} query
 * @property {{ shortestPath: Function }} traverse
 * @property {(writerId: string) => Promise<Array<{patch: {schema?: number, lamport: number, ops?: Array<{type: string, node?: string, from?: string, to?: string}>}, sha: string}>>} getWriterPatches
 * @property {() => Promise<{frontier: Record<string, string>}>} status
 * @property {() => Promise<string[]>} discoverWriters
 * @property {() => Promise<Map<string, string>>} getFrontier
 * @property {(entityId: string) => Promise<string[]>} patchesFor
 * @property {() => {totalTombstones: number, tombstoneRatio: number}} getGCMetrics
 * @property {() => Promise<number>} getPropertyCount
 * @property {() => Promise<import('../../src/domain/services/JoinReducer.ts').WarpState | null>} getStateSnapshot
 * @property {(options?: import('../../src/domain/services/strand/ConflictAnalysisRequest.ts').ConflictAnalyzeOptions) => Promise<import('../../src/domain/types/conflict/ConflictAnalysis.ts').default>} analyzeConflicts
 * @property {(options?: import('../../index.js').StrandCreateOptions) => Promise<import('../../index.js').StrandDescriptor>} createStrand
 * @property {(strandId: string, options?: import('../../index.js').StrandBraidOptions) => Promise<import('../../index.js').StrandDescriptor>} braidStrand
 * @property {(strandId: string) => Promise<import('../../index.js').StrandDescriptor|null>} getStrand
 * @property {() => Promise<import('../../index.js').StrandDescriptor[]>} listStrands
 * @property {(strandId: string) => Promise<boolean>} dropStrand
 * @property {(strandId: string, options?: {receipts?: boolean, ceiling?: number|null}) => Promise<import('../../src/domain/services/JoinReducer.ts').WarpState|{state: import('../../src/domain/services/JoinReducer.ts').WarpState, receipts: import('../../src/domain/types/TickReceipt.ts').TickReceipt[]}>} materializeStrand
 * @property {(strandId: string, options?: {ceiling?: number|null}) => Promise<Array<{patch: import('../../src/domain/types/Patch.ts').default, sha: string}>>} getStrandPatches
 * @property {(strandId: string, entityId: string, options?: {ceiling?: number|null}) => Promise<string[]>} patchesForStrand
 * @property {(strandId: string, options?: {against?: 'base'|'live'|{kind: 'strand', strandId: string}, ceiling?: number|null, againstCeiling?: number|null, targetId?: string|null}) => Promise<import('../../index.js').CoordinateComparisonV1>} compareStrand
 * @property {(strandId: string, options?: {into?: 'base'|'live'|{kind: 'strand', strandId: string}, ceiling?: number|null, intoCeiling?: number|null}) => Promise<import('../../index.js').CoordinateTransferPlanV1>} planStrandTransfer
 * @property {(options: {left: import('../../index.js').CoordinateComparisonSelectorV1, right: import('../../index.js').CoordinateComparisonSelectorV1, targetId?: string|null}) => Promise<import('../../index.js').CoordinateComparisonV1>} compareCoordinates
 * @property {(options: {source: import('../../index.js').CoordinateTransferPlanSelectorV1, target: import('../../index.js').CoordinateTransferPlanSelectorV1}) => Promise<import('../../index.js').CoordinateTransferPlanV1>} planCoordinateTransfer
 * @property {() => Promise<{ticks: number[], maxTick: number, perWriter: Map<string, WriterTickInfo>}>} discoverTicks
 * @property {(sha: string) => Promise<import('../../src/domain/types/Patch.ts').default>} loadPatchBySha
 * @property {(cache: import('../../src/ports/SeekCachePort.js').default) => void} setSeekCache
 * @property {{clear: () => Promise<void>} | null} seekCache
 * @property {number} [_seekCeiling]
 * @property {boolean} [_provenanceDegraded]
 * @property {(options?: {seed?: number, sampleRate?: number}) => Promise<{passed: number, failed: number, errors: Array<{nodeId: string, direction: string, error: string}>}>} verifyIndex
 * @property {() => void} invalidateIndex
 */

/**
 * @typedef {Object} WriterTickInfo
 * @property {number[]} ticks
 * @property {string|null} tipSha
 * @property {Record<number, string>} [tickShas]
 */

/**
 * @typedef {Object} CursorBlob
 * @property {number} tick
 * @property {string} [mode]
 * @property {number} [nodes]
 * @property {number} [edges]
 * @property {string} [frontierHash]
 */

/**
 * @typedef {Object} CliOptions
 * @property {string} repo
 * @property {boolean} json
 * @property {boolean} ndjson
 * @property {string|null} view
 * @property {string|null} graph
 * @property {string} writer
 * @property {boolean} help
 */

/**
 * @typedef {Object} GraphInfoResult
 * @property {string} name
 * @property {{count: number, ids?: string[]}} writers
 * @property {{ref: string, sha: string|null, date?: string|null}} [checkpoint]
 * @property {{ref: string, sha: string|null}} [coverage]
 * @property {Record<string, number>} [writerPatches]
 * @property {{active: boolean, tick?: number, mode?: string}} [cursor]
 */

/**
 * @typedef {Object} SeekSpec
 * @property {string} action
 * @property {string|null} tickValue
 * @property {string|null} name
 * @property {boolean} noPersistentCache
 * @property {boolean} diff
 * @property {number} diffLimit
 */

/**
 * @typedef {Object} QueryBuilderLike
 * @property {(label?: string) => QueryBuilderLike} outgoing
 * @property {(label?: string) => QueryBuilderLike} incoming
 * @property {(fn: Function) => QueryBuilderLike} where
 * @property {(pattern: string) => QueryBuilderLike} match
 * @property {(fields: string[]) => QueryBuilderLike} select
 * @property {() => Promise<{nodes: Array<{id: string, props?: Record<string, unknown>}>, stateHash?: string}>} run
 */

export {};
