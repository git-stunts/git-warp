/**
 * Custom error classes for bitmap index operations.
 *
 * @module domain/errors
 */

export { default as IndexError } from './IndexError.js';
export { default as ShardLoadError } from './ShardLoadError.js';
export { default as ShardCorruptionError } from './ShardCorruptionError.js';
export { default as ShardValidationError } from './ShardValidationError.js';
export { default as StorageError } from './StorageError.js';
export { default as TraversalError } from './TraversalError.js';
export { default as OperationAbortedError } from './OperationAbortedError.js';
