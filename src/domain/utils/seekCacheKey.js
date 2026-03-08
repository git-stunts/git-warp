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

import defaultCrypto from './defaultCrypto.js';

const KEY_VERSION = 'v1';

/**
 * Builds a deterministic, collision-resistant cache key from a ceiling tick
 * and writer frontier snapshot.
 *
 * @param {number} ceiling - Lamport ceiling tick
 * @param {Map<string, string>} frontier - Map of writerId → tip SHA
 * @returns {Promise<string>} Cache key, e.g. `v1:t42-a1b2c3d4...` (32+ hex chars in hash)
 */
export async function buildSeekCacheKey(ceiling, frontier) {
  const sorted = [...frontier.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0
  );
  const payload = sorted.map(([w, sha]) => `${w}:${sha}`).join('\n');
  const hash = await defaultCrypto.hash('sha256', payload);
  return `${KEY_VERSION}:t${ceiling}-${hash}`;
}
