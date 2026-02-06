import Table from 'cli-table3';

export function createTable(options = {}) {
  return new Table({
    style: { head: ['cyan'], border: ['gray'] },
    ...options,
  });
}

export default { createTable };
