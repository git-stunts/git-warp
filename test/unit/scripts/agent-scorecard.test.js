import { describe, expect, it } from 'vitest';

import { parseArgs } from '../../../scripts/agent-scorecard.js';
import { buildScorecardRows } from '../../../scripts/scorecard/buildScorecardRows.js';
import { classifyPath } from '../../../scripts/scorecard/classifyPath.js';
import { collectMetrics } from '../../../scripts/scorecard/collectMetrics.js';
import { formatMarkdown } from '../../../scripts/scorecard/formatScorecard.js';
import { scoreStatus } from '../../../scripts/scorecard/scoreStatus.js';

describe('agent-scorecard', () => {
  it('parses CLI options', () => {
    expect(parseArgs(['--base=origin/main', '--head=HEAD~1', '--format=json'])).toEqual({
      baseRef: 'origin/main',
      headRef: 'HEAD~1',
      format: 'json',
    });
  });

  it('classifies path kinds and limits', () => {
    expect(classifyPath('src/domain/services/PatchBuilder.ts')).toEqual({ kind: 'source', limit: 500 });
    expect(classifyPath('test/unit/domain/services/PatchBuilder.test.ts')).toEqual({ kind: 'test', limit: 800 });
    expect(classifyPath('scripts/agent-scorecard.js')).toEqual({ kind: 'bin', limit: 300 });
  });

  it('collects scorecard metrics from source text', () => {
    const metrics = collectMetrics([
      'type Value = any;',
      '/** @typedef {{ value: string }} Example */',
      'export enum ExampleKind { One = 1 }',
      'export class Example {',
      '  constructor(value: unknown) {',
      '    this.value = value as string;',
      '  }',
      '}',
      'export const helper = 1;',
    ].join('\n'));

    expect(metrics.typedefCount).toBe(1);
    expect(metrics.enumCount).toBe(1);
    expect(metrics.unknownCount).toBe(1);
    expect(metrics.asCount).toBe(1);
    expect(metrics.anyCount).toBe(1);
    expect(metrics.exportCount).toBe(3);
    expect(metrics.freeze).toBe('review');
  });

  it('scores rows from touch state plus metrics', () => {
    expect(scoreStatus('js-body', {
      loc: 10,
      freeze: 'n/a',
      unknownCount: 0,
      asCount: 0,
      anyCount: 0,
      typedefCount: 0,
      enumCount: 0,
      exportCount: 1,
    }, 500)).toBe('red');
    expect(scoreStatus('js-import', {
      loc: 10,
      freeze: 'n/a',
      unknownCount: 0,
      asCount: 0,
      anyCount: 0,
      typedefCount: 0,
      enumCount: 0,
      exportCount: 1,
    }, 500)).toBe('yellow');
    expect(scoreStatus('ts', {
      loc: 10,
      freeze: 'yes',
      unknownCount: 0,
      asCount: 0,
      anyCount: 0,
      typedefCount: 0,
      enumCount: 0,
      exportCount: 1,
    }, 500)).toBe('green');
  });

  it('formats markdown output with the expected columns', () => {
    const text = formatMarkdown(
      { branch: 'cycle/0013-typescript-migration', baseRef: 'main', mergeBase: 'abc12345def67890' },
      [{
        path: 'src/domain/services/PatchBuilder.ts',
        kind: 'source',
        touch: 'ts',
        loc: 42,
        limit: 500,
        unknownCount: 0,
        asCount: 0,
        anyCount: 0,
        typedefCount: 0,
        enumCount: 0,
        exportCount: 1,
        freeze: 'yes',
        status: 'green',
      }],
    );

    expect(text).toContain('# Agent Scorecard');
    expect(text).toContain('| File | Kind | Touch | LOC | <=Limit | unknown | as | any | typedef | enum | exports | freeze | status |');
    expect(text).toContain('| src/domain/services/PatchBuilder.ts | source | ts | 42 | yes | 0 | 0 | 0 | 0 | 0 | 1 | yes | green |');
    expect(text).toContain('Manual review still required');
  });

  it('builds rows from touched report entries', async () => {
    const rows = await buildScorecardRows({
      branch: 'cycle/0013-typescript-migration',
      baseRef: 'main',
      mergeBase: 'abc12345',
      convertedToTs: [],
      alreadyTsModified: [{ path: 'scripts/coverage-ratchet.js' }],
      jsBodyModified: [],
      jsImportOnly: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.path).toBe('scripts/coverage-ratchet.js');
    expect(rows[0]?.kind).toBe('bin');
    expect(rows[0]?.status).toBeTypeOf('string');
  });

  it('skips touched entries whose current file is missing', async () => {
    const rows = await buildScorecardRows({
      listCodeTouches: () => [{ path: 'scripts/does-not-exist.js', touch: 'js-body' }],
    });

    expect(rows).toEqual([]);
  });
});
