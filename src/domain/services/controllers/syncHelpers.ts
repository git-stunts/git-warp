/**
 * Module-level helpers for SyncController.
 *
 * Pure utility functions extracted from SyncController to keep the class
 * file within the 500 LOC ceiling.
 *
 * @module domain/services/controllers/syncHelpers
 */

import SyncError from '../../errors/SyncError.ts';
import { signSyncRequest, canonicalizePath } from '../sync/SyncAuthService.ts';
import SyncTrustGate from '../sync/SyncTrustGate.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type { SyncHost } from './SyncController.ts';

// ── Exports ─────────────────────────────────────────────────────────────────

/**
 * Compares two string→string Maps for value equality without allocating.
 *
 * @param a - First map
 * @param b - Second map
 * @returns True if every key in `a` has the same value in `b`
 */
export function mapsEqual(a: Map<string, string>, b: Map<string, string>): boolean {
  for (const [k, v] of a) {
    if (b.get(k) !== v) {
      return false;
    }
  }
  return true;
}

/**
 * Normalizes a sync endpoint path to ensure it starts with '/'.
 * Returns '/sync' if no path is provided.
 *
 * @param path - The sync path to normalize
 * @returns Normalized path starting with '/'
 */
export function normalizeSyncPath(path: string | undefined | null): string {
  if (path === undefined || path === null || path === '') {
    return '/sync';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * Resolves a sync remote into either a direct peer or an HTTP URL target.
 *
 * @param remote - URL string, URL object, or a peer graph instance
 * @param path - Sync endpoint path
 * @param hasPathOverride - Whether `path` was explicitly provided by the caller
 * @returns An object indicating peer type and resolved URL
 */
export function resolveSyncTarget(
  remote: string | object,
  path: string,
  hasPathOverride: boolean,
): { isDirectPeer: boolean; targetUrl: URL | null } {
  const isDirectPeer =
    remote !== null &&
    remote !== undefined &&
    typeof remote === 'object' &&
    typeof (remote as { processSyncRequest?: unknown }).processSyncRequest === 'function';

  if (isDirectPeer) {
    return { isDirectPeer: true, targetUrl: null };
  }

  let targetUrl: URL;
  try {
    targetUrl = remote instanceof URL ? new URL(remote.toString()) : new URL(remote as string);
  } catch {
    throw new SyncError('Invalid remote URL', {
      code: 'E_SYNC_REMOTE_URL',
      context: { remote },
    });
  }

  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    throw new SyncError('Unsupported remote URL protocol', {
      code: 'E_SYNC_REMOTE_URL',
      context: { protocol: targetUrl.protocol },
    });
  }

  const normalizedPath = normalizeSyncPath(path);
  if (!targetUrl.pathname || targetUrl.pathname === '/') {
    targetUrl.pathname = normalizedPath;
  } else if (hasPathOverride) {
    targetUrl.pathname = normalizedPath;
  }
  targetUrl.hash = '';

  return { isDirectPeer: false, targetUrl };
}

/**
 * Resolves the effective SyncTrustGate for a sync operation,
 * preferring per-call trust overrides when present.
 *
 * @param host - The SyncHost instance
 * @param defaultGate - The controller's default trust gate
 * @param options - Options object that may contain a `trust` override
 * @returns The resolved trust gate, or null
 */
export function resolveSyncTrustGate(
  host: SyncHost,
  defaultGate: SyncTrustGate | null,
  options: { trust?: { mode?: 'off' | 'log-only' | 'enforce'; pin?: string | null } },
): SyncTrustGate | null {
  if (
    !Object.prototype.hasOwnProperty.call(options, 'trust') ||
    typeof host._createSyncTrustGate !== 'function'
  ) {
    return defaultGate;
  }
  return host._createSyncTrustGate(options.trust);
}

/**
 * Builds auth headers for an outgoing sync request if auth is configured.
 *
 * @param params - Auth parameters
 * @returns HTTP headers map (empty if no auth configured)
 */
export async function buildSyncAuthHeaders(params: {
  auth: { secret: string; keyId?: string } | undefined;
  bodyStr: string;
  targetUrl: URL;
  crypto: CryptoPort;
}): Promise<Record<string, string>> {
  const { auth, bodyStr, targetUrl, crypto } = params;
  if (auth === undefined || auth.secret === undefined || auth.secret === '') {
    return {};
  }
  const bodyBuf = new TextEncoder().encode(bodyStr);
  return await signSyncRequest(
    {
      method: 'POST',
      path: canonicalizePath(targetUrl.pathname + (targetUrl.search || '')),
      contentType: 'application/json',
      body: bodyBuf,
      secret: auth.secret,
      keyId: auth.keyId !== undefined && auth.keyId !== '' ? auth.keyId : 'default',
    },
    { crypto },
  );
}
