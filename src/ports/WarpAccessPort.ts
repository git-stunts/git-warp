import type WarpAccessDenied from '../domain/api/WarpAccessDenied.ts';
import type WarpWriteGrant from '../domain/api/WarpWriteGrant.ts';
import type WarpWriteRequest from '../domain/api/WarpWriteRequest.ts';

/**
 * The application's access boundary. Opening a Warp grants nothing: this resolves
 * the authenticated caller and decides each operation. A writer name is not a
 * credential, so an implementation must not authorize one merely by matching it, and a
 * request names no caller: capture the caller when constructing the port. It is asked at
 * least twice per write, and with no intents before `reconcile` and `stage`.
 * #1052 adds the read decisions.
 */
export default abstract class WarpAccessPort {
  abstract authorizeWrite(_request: WarpWriteRequest): Promise<WarpWriteGrant | WarpAccessDenied>;
}
