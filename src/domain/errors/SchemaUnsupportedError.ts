import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/** Error thrown when a patch contains operations unsupported by the current schema version. */
export default class SchemaUnsupportedError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'E_SCHEMA_UNSUPPORTED', options);
  }
}
