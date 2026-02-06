import Table from 'cli-table3';

export function createTable(options = {}) {
  const defaultStyle = { head: ['cyan'], border: ['gray'] };
  return new Table({
    ...options,
    style: { ...defaultStyle, ...options.style },
  });
}

export default createTable;
