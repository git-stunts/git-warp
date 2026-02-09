import Table from 'cli-table3';

/**
 * Creates a cli-table3 instance with default WARP styling.
 *
 * @param {Object} [options] - Options forwarded to cli-table3 constructor
 * @param {string[]} [options.head] - Column headers
 * @param {Object} [options.style] - Style overrides (defaults: head=cyan, border=gray)
 * @returns {import('cli-table3')} A cli-table3 instance
 */
export function createTable(options = {}) {
  const defaultStyle = { head: ['cyan'], border: ['gray'] };
  return new Table({
    ...options,
    style: { ...defaultStyle, ...options.style },
  });
}

export default createTable;
