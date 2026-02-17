/**
 * @typedef {Object} Persistence
 * @property {(prefix: string) => Promise<string[]>} listRefs
 * @property {(ref: string) => Promise<string|null>} readRef
 * @property {(ref: string, oid: string) => Promise<void>} updateRef
 * @property {(ref: string) => Promise<void>} deleteRef
 * @property {(oid: string) => Promise<Buffer>} readBlob
 * @property {(buf: Buffer) => Promise<string>} writeBlob
 * @property {(sha: string) => Promise<{date?: string|null}>} getNodeInfo
 * @property {(sha: string) => Promise<boolean>} nodeExists
 * @property {(sha: string, coverageSha: string) => Promise<boolean>} isAncestor
 * @property {() => Promise<{ok: boolean}>} ping
 * @property {unknown} plumbing
 */

/**
 * @typedef {Object} WarpGraphInstance
 * @property {(opts?: {ceiling?: number}) => Promise<void>} materialize
 * @property {() => Promise<Array<{id: string}>>} getNodes
 * @property {() => Promise<Array<{from: string, to: string, label?: string}>>} getEdges
 * @property {() => Promise<string|null>} createCheckpoint
 * @property {() => QueryBuilderLike} query
 * @property {{ shortestPath: Function }} traverse
 * @property {(writerId: string) => Promise<Array<{patch: {schema?: number, lamport: number, ops?: Array<{type: string, node?: string, from?: string, to?: string}>}, sha: string}>>} getWriterPatches
 * @property {() => Promise<{frontier: Record<string, string>}>} status
 * @property {() => Promise<string[]>} discoverWriters
 * @property {() => Promise<Map<string, string>>} getFrontier
 * @property {() => {totalTombstones: number, tombstoneRatio: number}} getGCMetrics
 * @property {() => Promise<number>} getPropertyCount
 * @property {() => Promise<import('../../src/domain/services/JoinReducer.js').WarpStateV5 | null>} getStateSnapshot
 * @property {() => Promise<{ticks: number[], maxTick: number, perWriter: Map<string, WriterTickInfo>}>} discoverTicks
 * @property {(sha: string) => Promise<{ops?: Array<{type: string, node?: string, from?: string, to?: string}>}>} loadPatchBySha
 * @property {(cache: import('../../src/ports/SeekCachePort.js').default) => void} setSeekCache
 * @property {{clear: () => Promise<void>} | null} seekCache
 * @property {number} [_seekCeiling]
 * @property {boolean} [_provenanceDegraded]
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
