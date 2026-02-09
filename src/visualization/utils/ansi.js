import stripAnsiLib from 'strip-ansi';

/**
 * Strips ANSI escape codes from a string.
 * Used primarily for snapshot testing to get deterministic output.
 *
 * @param {string} str - The string potentially containing ANSI escape codes
 * @returns {string} The string with all ANSI codes removed
 */
export function stripAnsi(str) {
  return stripAnsiLib(str);
}

export default { stripAnsi };
