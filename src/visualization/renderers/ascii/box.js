import boxen from 'boxen';

/**
 * Wraps content in a bordered box using boxen.
 *
 * @param {string} content - The text content to display inside the box
 * @param {Object} [options] - Options forwarded to boxen (e.g. title, borderColor)
 * @returns {string} The boxed content string
 */
export function createBox(content, options = {}) {
  return boxen(content, {
    padding: 1,
    borderStyle: 'double',
    ...options,
  });
}

export default { createBox };
