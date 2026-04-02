/**
 * Shared operation summary utilities for ASCII renderers.
 *
 * Extracted from history.js so other views (e.g. seek) can reuse the same
 * op-type ordering, symbols, and formatting.
 */

import { colors } from './colors.js';
import { truncate } from '../../utils/truncate.js';

/**
 * @typedef {'NodeAdd' | 'EdgeAdd' | 'PropSet' | 'NodeTombstone' | 'EdgeTombstone' | 'BlobValue'} OpType
 * @typedef {Record<OpType, number>} OpSummary
 */

// Operation type to display info mapping
export const OP_DISPLAY = Object.freeze({
  NodeAdd: { symbol: '+', label: 'node', color: colors.success },
  NodeTombstone: { symbol: '-', label: 'node', color: colors.error },
  EdgeAdd: { symbol: '+', label: 'edge', color: colors.success },
  EdgeTombstone: { symbol: '-', label: 'edge', color: colors.error },
  PropSet: { symbol: '~', label: 'prop', color: colors.warning },
  BlobValue: { symbol: '+', label: 'blob', color: colors.primary },
});

// Default empty operation summary
export const EMPTY_OP_SUMMARY = Object.freeze({
  NodeAdd: 0,
  EdgeAdd: 0,
  PropSet: 0,
  NodeTombstone: 0,
  EdgeTombstone: 0,
  BlobValue: 0,
});

/**
 * Summarizes operations in a patch.
 * @param {Array<{ type: string }>} ops - Array of patch operations
 * @returns {OpSummary} Summary with counts by operation type
 */
export function summarizeOps(ops) {
  /** @type {OpSummary} */
  const summary = { ...EMPTY_OP_SUMMARY };
  for (const op of ops) {
    const t = /** @type {OpType} */ (op.type);
    if (t && summary[t] !== undefined) {
      summary[t]++;
    }
  }
  return summary;
}

/**
 * Formats operation summary as a colored string.
 * @param {OpSummary | Record<string, number>} summary - Operation counts by type
 * @param {number} maxWidth - Maximum width for the summary string
 * @returns {string} Formatted summary string
 */
export function formatOpSummary(summary, maxWidth = 40) {
  /** @type {OpType[]} */
  const order = ['NodeAdd', 'EdgeAdd', 'PropSet', 'NodeTombstone', 'EdgeTombstone', 'BlobValue'];
  const parts = order
    .filter((opType) => ((/** @type {Record<string, number>} */ (summary))[opType] ?? 0) > 0)
    .map((opType) => {
      const display = OP_DISPLAY[opType] ?? { symbol: '?', label: '', color: 'muted' };
      return { text: `${display.symbol}${(/** @type {Record<string, number>} */ (summary))[opType]}${display.label}`, color: display.color };
    });

  if (parts.length === 0) {
    return colors.muted('(empty)');
  }

  // Truncate plain text first to avoid breaking ANSI escape sequences
  const plain = parts.map((p) => p.text).join(' ');
  const truncated = truncate(plain, maxWidth);
  if (truncated === plain) {
    return parts.map((p) => p.color(p.text)).join(' ');
  }
  return colors.muted(truncated);
}

