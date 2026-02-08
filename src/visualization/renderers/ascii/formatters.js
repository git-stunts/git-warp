/**
 * Shared formatting functions for ASCII renderers.
 *
 * Extracted from check.js, materialize.js, and info.js to eliminate
 * duplicate formatting logic across renderers.
 */

import { colors } from './colors.js';

/**
 * Format seconds as human-readable time (e.g., "2m", "1h", "3d").
 * @param {number|null} seconds
 * @returns {string}
 */
export function formatAge(seconds) {
  if (seconds === null || seconds === undefined) {
    return 'unknown';
  }
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return 'unknown';
  }
  const secs = Math.floor(seconds);
  if (secs < 60) {
    return `${secs}s`;
  }
  const minutes = Math.floor(secs / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Format a number with thousands separator for readability.
 * @param {number} n - Number to format
 * @returns {string} Formatted number string
 */
export function formatNumber(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    return '0';
  }
  return n.toLocaleString('en-US');
}

/**
 * Format a SHA for display (first 7 characters, muted color).
 * @param {string|null} sha - Full SHA or null
 * @returns {string} Shortened SHA or 'none'
 */
export function formatSha(sha) {
  return sha ? colors.muted(sha.slice(0, 7)) : colors.muted('none');
}

/**
 * Format a writer name for display, truncating to a max length.
 * @param {string} writerId - Writer ID to format
 * @param {number} [maxLen=16] - Maximum length before truncation
 * @returns {string} Formatted writer display name
 */
export function formatWriterName(writerId, maxLen = 16) {
  if (!writerId || typeof writerId !== 'string') {
    return 'unknown';
  }
  if (writerId.length > maxLen) {
    return `${writerId.slice(0, maxLen - 1)}\u2026`;
  }
  return writerId;
}
