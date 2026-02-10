import { describe, it, expect } from 'vitest';
import { createTable as _createTable } from '../../../src/visualization/renderers/ascii/table.js';

/** @type {any} */
const createTable = _createTable;

describe('createTable', () => {
  it('returns an object with push and toString methods', () => {
    const table = createTable();

    expect(typeof table.push).toBe('function');
    expect(typeof table.toString).toBe('function');
  });

  it('applies default style (head: cyan, border: gray)', () => {
    const table = createTable();

    expect(table.options.style.head).toEqual(['cyan']);
    expect(table.options.style.border).toEqual(['gray']);
  });

  it('custom style overrides defaults', () => {
    const table = createTable({
      style: { head: ['green'], border: ['white'] },
    });

    expect(table.options.style.head).toEqual(['green']);
    expect(table.options.style.border).toEqual(['white']);
  });

  it('accepts head option for column headers', () => {
    const table = createTable({ head: ['Name', 'Value'] });

    expect(table.options.head).toEqual(['Name', 'Value']);
  });

  it('can be rendered with toString()', () => {
    const table = createTable({ head: ['ID', 'Label'] });
    table.push(['n1', 'Alice']);
    table.push(['n2', 'Bob']);

    const output = table.toString();

    expect(typeof output).toBe('string');
    expect(output).toContain('Alice');
    expect(output).toContain('Bob');
    expect(output).toContain('ID');
    expect(output).toContain('Label');
  });

  it('renders empty table without errors', () => {
    const table = createTable({ head: ['Col'] });
    const output = table.toString();

    expect(typeof output).toBe('string');
    expect(output).toContain('Col');
  });

  it('preserves non-style options', () => {
    const table = createTable({ colWidths: [20, 30] });

    expect(table.options.colWidths).toEqual([20, 30]);
  });

  it('partial style override merges with defaults', () => {
    const table = createTable({ style: { head: ['red'] } });

    // head is overridden, border keeps default
    expect(table.options.style.head).toEqual(['red']);
    expect(table.options.style.border).toEqual(['gray']);
  });
});
