import { describe, expect, it } from 'vitest';
import CliJsonFormatterAdapter from '../../../../src/infrastructure/adapters/CliJsonFormatterAdapter.ts';

describe('CliJsonFormatterAdapter', () => {
  it('formats JSON with a trailing newline for CLI output', () => {
    const adapter = new CliJsonFormatterAdapter();

    expect(adapter.format({ dryRun: true, graphCount: 0, graphs: [] })).toBe([
      '{',
      '  "dryRun": true,',
      '  "graphCount": 0,',
      '  "graphs": []',
      '}',
      '',
    ].join('\n'));
  });
});
