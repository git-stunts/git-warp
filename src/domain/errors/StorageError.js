import IndexError from './IndexError.js';

/**
 * Error thrown when a storage operation fails.
 *
 * This error indicates that a read or write operation to storage failed,
 * typically due to I/O errors, permission issues, or storage unavailability.
 *
 * @class StorageError
 * @extends IndexError
 *
 * @property {string} name - The error name ('StorageError')
 * @property {string} code - Error code ('STORAGE_ERROR')
 * @property {string} operation - The operation that failed ('read' or 'write')
 * @property {string} oid - Object ID associated with the operation
 * @property {Error} cause - The original error that caused the failure
 * @property {Object} context - Serializable context object for debugging
 *
 * @example
 * try {
 *   await storage.write(oid, data);
 * } catch (err) {
 *   throw new StorageError('Failed to write to storage', {
 *     operation: 'write',
 *     oid: 'abc123',
 *     cause: err
 *   });
 * }
 */
export default class StorageError extends IndexError {
  /**
   * Creates a new StorageError.
   *
   * @param {string} message - Human-readable error message
   * @param {Object} [options={}] - Error options
   * @param {string} [options.operation] - The operation that failed ('read' or 'write')
   * @param {string} [options.oid] - Object ID associated with the operation
   * @param {Error} [options.cause] - The original error that caused the failure
   * @param {Object} [options.context={}] - Additional context for debugging
   */
  constructor(message, options = {}) {
    const context = {
      ...options.context,
      operation: options.operation,
      oid: options.oid,
    };

    super(message, {
      code: 'STORAGE_ERROR',
      context,
    });

    this.name = 'StorageError';
    this.operation = options.operation;
    this.oid = options.oid;
    this.cause = options.cause;

    Error.captureStackTrace?.(this, this.constructor);
  }
}
