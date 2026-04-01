import stringWidth from 'string-width';

/**
 * Handles degenerate width cases (zero, negative, or smaller than ellipsis).
 * @param {number} maxWidth - Maximum display width
 * @param {string} ellipsis - The ellipsis string
 * @param {number} ellipsisWidth - Display width of the ellipsis
 * @returns {string|null} Result string for degenerate cases, or null if normal truncation is needed
 */
function handleDegenerateWidth(maxWidth, ellipsis, ellipsisWidth) {
  if (maxWidth <= 0) {
    return '';
  }
  if (maxWidth <= ellipsisWidth) {
    return ellipsis.slice(0, maxWidth);
  }
  return null;
}

/**
 * Builds a truncated prefix of a string that fits within the given width budget.
 * @param {string} str - Source string to truncate
 * @param {number} maxWidth - Maximum display width
 * @param {number} ellipsisWidth - Display width of the ellipsis to reserve
 * @returns {string} The prefix that fits within the budget
 */
function buildTruncatedPrefix(str, maxWidth, ellipsisWidth) {
  let result = '';
  let width = 0;

  for (const char of str) {
    const charWidth = stringWidth(char);
    if (width + charWidth + ellipsisWidth > maxWidth) {break;}
    result += char;
    width += charWidth;
  }

  return result;
}

/**
 * Truncates a string to a maximum display width, appending an ellipsis if needed.
 * Handles wide characters (CJK, emoji) correctly via string-width.
 *
 * @param {string} str - The string to truncate
 * @param {number} maxWidth - Maximum display width in columns
 * @param {string} [ellipsis='…'] - The ellipsis character(s) to append when truncating
 * @returns {string} The truncated string, or original if it fits within maxWidth
 */
export function truncate(str, maxWidth, ellipsis = '…') {
  const ellipsisWidth = stringWidth(ellipsis);

  const degenerate = handleDegenerateWidth(maxWidth, ellipsis, ellipsisWidth);
  if (degenerate !== null) {
    return degenerate;
  }

  if (stringWidth(str) <= maxWidth) {
    return str;
  }

  return buildTruncatedPrefix(str, maxWidth, ellipsisWidth) + ellipsis;
}

export default { truncate };
