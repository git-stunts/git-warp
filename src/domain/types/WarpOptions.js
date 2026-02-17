/**
 * Shared options types for warp methods.
 * @module domain/types/WarpOptions
 */

/**
 * @typedef {Object} ServeOptions
 * @property {number} port
 * @property {string} [host='127.0.0.1']
 * @property {string} [path='/sync']
 * @property {number} [maxRequestBytes=4194304]
 * @property {import('../../ports/HttpServerPort.js').default} httpPort
 * @property {{keys: Record<string, string>, mode?: 'enforce'|'log-only', crypto?: import('../../ports/CryptoPort.js').default, logger?: import('../../ports/LoggerPort.js').default, wallClockMs?: () => number}} [auth]
 * @property {string[]} [allowedWriters]
 */

/**
 * @typedef {Object} MaterializeOptions
 * @property {boolean} [receipts]
 * @property {number|null} [ceiling]
 */

/**
 * @typedef {Object} PatchCommitEvent
 * @property {unknown} [patch]
 * @property {string} [sha]
 */

export {};
