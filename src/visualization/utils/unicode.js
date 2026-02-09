import stringWidth from 'string-width';

/**
 * Right-pads a string to a target display width.
 * Handles wide characters correctly via string-width.
 *
 * @param {string} str - The string to pad
 * @param {number} width - Target display width in columns
 * @param {string} [char=' '] - The padding character
 * @returns {string} The padded string, or original if already >= width
 */
export function padRight(str, width, char = ' ') {
  const currentWidth = stringWidth(str);
  if (currentWidth >= width) {return str;}
  return str + char.repeat(width - currentWidth);
}

/**
 * Left-pads a string to a target display width.
 * Handles wide characters correctly via string-width.
 *
 * @param {string} str - The string to pad
 * @param {number} width - Target display width in columns
 * @param {string} [char=' '] - The padding character
 * @returns {string} The padded string, or original if already >= width
 */
export function padLeft(str, width, char = ' ') {
  const currentWidth = stringWidth(str);
  if (currentWidth >= width) {return str;}
  return char.repeat(width - currentWidth) + str;
}

/**
 * Centers a string within a target display width.
 * Handles wide characters correctly via string-width.
 * Extra padding goes to the right when the total padding is odd.
 *
 * @param {string} str - The string to center
 * @param {number} width - Target display width in columns
 * @param {string} [char=' '] - The padding character
 * @returns {string} The centered string, or original if already >= width
 */
export function center(str, width, char = ' ') {
  const currentWidth = stringWidth(str);
  if (currentWidth >= width) {return str;}
  const padding = width - currentWidth;
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return char.repeat(left) + str + char.repeat(right);
}

export default { padRight, padLeft, center, stringWidth };
