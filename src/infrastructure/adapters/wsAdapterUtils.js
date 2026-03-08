/**
 * Shared utilities for WebSocket server adapters.
 *
 * Extracted from BunWsAdapter, DenoWsAdapter, and NodeWsAdapter
 * to eliminate duplicated constants and message-decoding logic.
 * Follows the same pattern as httpAdapterUtils.js.
 *
 * @module infrastructure/adapters/wsAdapterUtils
 * @private
 */

/** Default bind host (loopback only). */
export const DEFAULT_HOST = '127.0.0.1';

/**
 * Normalizes a host parameter, falling back to loopback.
 *
 * @param {string} [host]
 * @returns {string}
 */
export function normalizeHost(host) {
  return host || DEFAULT_HOST;
}

/**
 * Guards against calling `listen()` on a server that is already running.
 * Throws if `server` is truthy.
 *
 * @param {unknown} server - The current server handle
 * @returns {void}
 */
export function assertNotListening(server) {
  if (server) {
    throw new Error('Server already listening. Call close() before listening again.');
  }
}

const _textDecoder = new TextDecoder();

/**
 * Converts a WebSocket message payload to a UTF-8 string.
 * Handles both string data and binary data (ArrayBuffer, Uint8Array).
 *
 * @param {string|ArrayBuffer|Uint8Array|Buffer|Buffer[]} data
 * @returns {string}
 */
export function messageToString(data) {
  if (typeof data === 'string') {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    return _textDecoder.decode(data);
  }
  if (data instanceof ArrayBuffer) {
    return _textDecoder.decode(data);
  }
  // Node `ws` can send Buffer[] for fragmented messages
  if (Array.isArray(data)) {
    let total = 0;
    for (const chunk of data) {
      total += chunk.byteLength;
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of data) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return _textDecoder.decode(merged);
  }
  return String(data);
}
