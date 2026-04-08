import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/**
 * Error class for graph fork operations.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_FORK_INVALID_ARGS` | Required fork parameters are missing or invalid |
 * | `E_FORK_WRITER_NOT_FOUND` | The specified writer does not exist |
 * | `E_FORK_PATCH_NOT_FOUND` | The specified patch SHA does not exist |
 * | `E_FORK_PATCH_NOT_IN_CHAIN` | The patch SHA is not in the writer's chain |
 * | `E_FORK_NAME_INVALID` | The fork graph name is invalid |
 * | `E_FORK_WRITER_ID_INVALID` | The fork writer ID is invalid |
 * | `E_FORK_ALREADY_EXISTS` | A graph with the fork name already exists |
 * | `FORK_ERROR` | Generic/default fork error |
 */
export default class ForkError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'FORK_ERROR', options);
  }
}
