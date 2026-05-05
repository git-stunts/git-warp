import IndexError from './IndexError.ts';

interface EmptyMessageErrorOptions {
  readonly operation?: string;
  readonly context?: Record<string, unknown>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}

/**
 * Error thrown when a message is empty or contains only whitespace.
 *
 * This error indicates that an operation received an empty message
 * where content was required.
 */
export default class EmptyMessageError extends IndexError {
  readonly operation: string | undefined;

  constructor(message: string, options: EmptyMessageErrorOptions = {}) {
    const context = {
      ...options.context,
      operation: options.operation,
    };

    super(message, {
      code: 'EMPTY_MESSAGE',
      context,
    });

    this.operation = options.operation;
  }
}
