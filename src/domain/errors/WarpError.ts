/**
 * Base error class for all WARP domain errors.
 *
 * Provides shared constructor logic: name (from constructor), code,
 * context, and stack trace capture. Subclasses reduce to a one-line
 * constructor calling super(message, defaultCode, options).
 */

export interface WarpErrorOptions {
  readonly code?: string;
  readonly context?: Record<string, unknown>;
}

export default class WarpError extends Error {
  readonly code: string;
  readonly context: Record<string, unknown>;

  constructor(message: string, defaultCode: string, options: WarpErrorOptions | null = {}) {
    super(message);
    const opts = options ?? {};
    this.name = this.constructor.name;
    this.code = resolveCode(opts.code, defaultCode);
    this.context = opts.context ?? {};
    Error.captureStackTrace?.(this, this.constructor);
  }
}

function resolveCode(code: string | undefined, defaultCode: string): string {
  if (typeof code === 'string' && code.length > 0) {
    return code;
  }
  return defaultCode;
}
