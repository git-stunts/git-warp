import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/**
 * Error class for route-key derivation and navigation.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_ROUTE_KEY_BYTES` | Route key byte array has the wrong length |
 * | `E_ROUTE_KEY_EMPTY_ELEMENT` | Element ID is empty |
 * | `E_ROUTE_KEY_DEPTH` | Depth argument is out of range |
 * | `E_ROUTE_KEY_NIBBLE_BITS` | Unsupported nibble width |
 */
export default class RouteKeyError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'E_ROUTE_KEY_BYTES', options);
  }
}
