/**
 * Deterministic cache key for seek materialization cache.
 *
 * Key format: `v1:t<ceiling>-<frontierHash>`
 * where frontierHash = hex SHA-256 of sorted writerId:tipSha pairs.
 *
 * The `v1` prefix ensures future schema/codec changes produce distinct keys
 * without needing to flush existing caches.
 *
 * @module domain/utils/seekCacheKey
 */

import { requireCrypto } from '../services/crypto/CryptoRequirement.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';

const KEY_VERSION = 'v1';

/**
 * Builds a deterministic, collision-resistant cache key from a ceiling tick
 * and writer frontier snapshot.
 *
 * This function is intentionally async — WebCrypto's `digest()` is async-only,
 * and WebCrypto-backed ports use it. Both call sites are already async.
 */
export async function buildSeekCacheKey(
  ceiling: number,
  frontier: Map<string, string>,
  options: { crypto?: CryptoPort } = {},
): Promise<string> {
  const sorted = [...frontier.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0
  );
  const payload = sorted.map(([w, sha]) => `${w}:${sha}`).join('\n');
  const hash = await requireCrypto(options.crypto, 'buildSeekCacheKey').hash('sha256', payload);
  return `${KEY_VERSION}:t${ceiling}-${hash}`;
}
