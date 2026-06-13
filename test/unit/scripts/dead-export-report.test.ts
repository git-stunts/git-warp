import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildDeadExportReport,
  formatDeadExportReport,
} from '../../../scripts/dead-export-report.ts';

const fixtureRoot = fileURLToPath(new URL('../../fixtures/dead-export-report/src', import.meta.url));

describe('dead export report', () => {
  it('reports deterministic candidate exports from a canonical fixture corpus', () => {
    const report = buildDeadExportReport(fixtureRoot);

    expect(report.filesScanned).toBe(5);
    expect(report.exportsScanned).toBe(6);
    expect(report.findings.map((finding) => `${finding.path}:${finding.name}:${finding.kind}`)).toEqual([
      'index.ts:renamedUnusedFunction:re-export',
      'index.ts:UnusedValue:re-export',
      'renamed-unused-function.ts:renamedUnusedFunction:function',
      'unused-value.ts:UnusedValue:class',
    ]);
  });

  it('formats a stable markdown witness table', () => {
    const report = buildDeadExportReport(fixtureRoot);

    expect(formatDeadExportReport(report)).toContain('| Path | Export | Kind | Identifier refs |');
    expect(formatDeadExportReport(report)).toContain('| unused-value.ts | `UnusedValue` | class | 0 |');
  });
});
