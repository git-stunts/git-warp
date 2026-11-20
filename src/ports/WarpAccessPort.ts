import WarpAccessDenied from '../domain/api/WarpAccessDenied.ts';
import type WarpReadGrant from '../domain/api/WarpReadGrant.ts';
import type WarpReadRequest from '../domain/api/WarpReadRequest.ts';
import type WarpWriteGrant from '../domain/api/WarpWriteGrant.ts';
import type WarpWriteRequest from '../domain/api/WarpWriteRequest.ts';

/**
 * The application's access boundary. Opening a Warp grants nothing: this resolves
 * the authenticated caller and decides each operation. A writer name is not a
 * credential, so an implementation must not authorize one merely by matching it, and a
 * request names no caller: capture the caller when constructing the port. It is asked
 * twice for a write that reaches publication, and with no intents before `reconcile` and `stage`.
 */
export default abstract class WarpAccessPort {
  abstract authorizeWrite(_request: WarpWriteRequest): Promise<WarpWriteGrant | WarpAccessDenied>;

  /** Decides one read before anything is read. A port that doesn't override this refuses all reads. */
  authorizeRead(_request: WarpReadRequest): Promise<WarpReadGrant | WarpAccessDenied> {
    return Promise.resolve(new WarpAccessDenied('this access boundary permits no reads'));
  }
}
