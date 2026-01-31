import IndexError from './IndexError.js';

/**
 * Error thrown when a message is empty or contains only whitespace.
 *
 * This error indicates that an operation received an empty message
 * where content was required.
 *
 * @class EmptyMessageError
 * @extends IndexError
 *
 * @property {string} name - The error name ('EmptyMessageError')
 * @property {string} code - Error code ('EMPTY_MESSAGE')
 * @property {string} operation - The operation that failed due to empty message
 * @property {Object} context - Serializable context object for debugging
 *
 * @example
 * if (!message || message.trim() === '') {
 *   throw new EmptyMessageError('Message cannot be empty', {
 *     operation: 'createNode',
 *     context: { nodeType: 'commit' }
 *   });
 * }
 */
export default class EmptyMessageError extends IndexError {
  /**
   * Creates a new EmptyMessageError.
   *
   * @param {string} message - Human-readable error message
   * @param {Object} [options={}] - Error options
   * @param {string} [options.operation] - The operation that failed
   * @param {Object} [options.context={}] - Additional context for debugging
   */
  constructor(message, options = {}) {
    const context = {
      ...options.context,
      operation: options.operation,
    };

    super(message, {
      code: 'EMPTY_MESSAGE',
      context,
    });

    this.name = 'EmptyMessageError';
    this.operation = options.operation;
  }
}
