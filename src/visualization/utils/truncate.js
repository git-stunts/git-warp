import stringWidth from 'string-width';

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

  // Guard degenerate cases
  if (maxWidth <= 0) {
    return '';
  }
  if (maxWidth <= ellipsisWidth) {
    return ellipsis.slice(0, maxWidth);
  }

  if (stringWidth(str) <= maxWidth) {
    return str;
  }

  let result = '';
  let width = 0;

  for (const char of str) {
    const charWidth = stringWidth(char);
    if (width + charWidth + ellipsisWidth > maxWidth) {break;}
    result += char;
    width += charWidth;
  }

  return result + ellipsis;
}

export default { truncate };
