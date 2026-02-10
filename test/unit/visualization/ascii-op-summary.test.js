import { describe, it, expect } from 'vitest';
import { summarizeOps as _summarizeOps, formatOpSummary, EMPTY_OP_SUMMARY } from '../../../src/visualization/renderers/ascii/opSummary.js';

/** @type {any} */
const summarizeOps = _summarizeOps;
import { stripAnsi } from '../../../src/visualization/utils/ansi.js';

describe('opSummary utilities', () => {
  it('summarizeOps counts known operation types', () => {
    const ops = [
      { type: 'NodeAdd' },
      { type: 'EdgeAdd' },
      { type: 'EdgeAdd' },
      { type: 'PropSet' },
      { type: 'UnknownOp' },
      {},
    ];

    const summary = summarizeOps(ops);
    expect(summary.NodeAdd).toBe(1);
    expect(summary.EdgeAdd).toBe(2);
    expect(summary.PropSet).toBe(1);
    expect(summary.NodeTombstone).toBe(0);
    expect(summary.EdgeTombstone).toBe(0);
    expect(summary.BlobValue).toBe(0);
  });

  it('formatOpSummary renders a stable textual summary and (empty) for no-ops', () => {
    const empty = stripAnsi(formatOpSummary(EMPTY_OP_SUMMARY));
    expect(empty).toContain('(empty)');

    const summary = { ...EMPTY_OP_SUMMARY, NodeAdd: 2, PropSet: 1 };
    const output = stripAnsi(formatOpSummary(summary));
    expect(output).toContain('+2node');
    expect(output).toContain('~1prop');
    expect(output).not.toContain('(empty)');
  });
});

