import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCoverageLines } from '../../../scripts/coverage-runner/ReadCoverageSummary.ts';
import { afterEach, describe, expect, it } from 'vitest';
import { raisedLineThreshold } from '../../../scripts/coverage-ratchet.ts';

const configuration = 'thresholds: {\n  lines: 93.48,\n  autoUpdate: false,\n}\n';

describe('coverage ratchet threshold candidate', () => {
  it('raises only the line number and preserves all surrounding configuration', () => {
    expect(raisedLineThreshold(configuration, 94.25)).toBe(configuration.replace('93.48', '94.25'));
  });
  it.each([0, 93, 93.48])('does not lower or rewrite a threshold at %s', percentage => {
    expect(raisedLineThreshold(configuration, percentage)).toBe(configuration);
  });
  it.each([NaN, Infinity, -1, 101])('refuses invalid coverage percentage %s', percentage => {
    expect(() => raisedLineThreshold(configuration, percentage)).toThrow('invalid line threshold');
  });
  it.each(['', 'lines: 10, lines: 20,', 'lines: "not a number",'])('refuses ambiguous configuration %s', source => {
    expect(() => raisedLineThreshold(source, 95)).toThrow('invalid line threshold');
  });
});

const summaries: string[] = [];
afterEach(() => {
  for (const directory of summaries.splice(0)) rmSync(directory, { recursive: true, force: true });
});
describe('coverage summary boundary', () => {
  it.each([
    ['{"total":{"lines":{"pct":94.25}}}', 94.25],
    ['{"total":{"lines":{"pct":0}}}', 0],
    ['{"total":{"lines":{"pct":100}}}', 100],
  ])('reads a validated summary %s', async (text, percentage) => {
    const directory = mkdtempSync(join(tmpdir(), 'coverage-summary-'));
    summaries.push(directory);
    const path = join(directory, 'summary.json');
    writeFileSync(path, String(text));
    expect(await readCoverageLines(path)).toBe(percentage);
  });
  it.each(['{}', '{"total":{"lines":{"pct":101}}}', '{"total":{"lines":{"pct":-1}}}', '{"total":{"lines":{"pct":"100"}}}', '{'])('rejects invalid summary %s', async text => {
    const directory = mkdtempSync(join(tmpdir(), 'coverage-summary-'));
    summaries.push(directory);
    const path = join(directory, 'summary.json');
    writeFileSync(path, text);
    await expect(readCoverageLines(path)).rejects.toThrow();
  });
});
