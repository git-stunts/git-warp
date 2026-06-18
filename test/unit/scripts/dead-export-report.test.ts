import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  type DeadExportFinding,
  buildDeadExportReport,
  formatDeadExportReport,
} from '../../../scripts/dead-export-report.ts';

const fixtureRoot = fileURLToPath(new URL('../../fixtures/dead-export-report/src', import.meta.url));

type FormattedDeadExportRow = {
  readonly path: string;
  readonly name: string;
  readonly kind: DeadExportFinding['kind'];
  readonly identifierReferences: number;
};

function findingKey(finding: DeadExportFinding): string {
  return `${finding.path}:${finding.name}:${finding.kind}`;
}

function parseFormattedRows(report: string): readonly FormattedDeadExportRow[] {
  const rows: FormattedDeadExportRow[] = [];
  for (const line of report.split('\n')) {
    if (!line.startsWith('| ') || line.startsWith('| Path ') || line.startsWith('| --- ')) {
      continue;
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    const [path, nameCell, kind, refsCell] = cells;
    if (
      path === undefined
      || nameCell === undefined
      || kind === undefined
      || refsCell === undefined
    ) {
      throw new DeadExportReportTestError('formatted row has missing cells');
    }
    rows.push(Object.freeze({
      path,
      name: nameCell.replaceAll('`', ''),
      kind: parseExportKind(kind),
      identifierReferences: Number.parseInt(refsCell, 10),
    }));
  }
  return rows;
}

function parseExportKind(value: string): DeadExportFinding['kind'] {
  if (
    value === 'class'
    || value === 'const'
    || value === 'enum'
    || value === 'function'
    || value === 'interface'
    || value === 're-export'
    || value === 'type'
  ) {
    return value;
  }
  throw new DeadExportReportTestError(`unsupported export kind: ${value}`);
}

class DeadExportReportTestError extends Error {}

describe('dead export report', () => {
  it('reports deterministic candidate exports from a canonical fixture corpus', () => {
    const report = buildDeadExportReport(fixtureRoot);

    expect(report.filesScanned).toBe(5);
    expect(report.exportsScanned).toBe(6);
    expect(report.findings.map(findingKey)).toEqual([
      'index.ts:PublicUnusedFunction:re-export',
      'index.ts:UnusedValue:re-export',
      'renamed-unused-function.ts:renamedUnusedFunction:function',
      'unused-value.ts:UnusedValue:class',
    ]);
  });

  it('formats a stable markdown witness table', () => {
    const report = buildDeadExportReport(fixtureRoot);
    const formattedRows = parseFormattedRows(formatDeadExportReport(report));

    expect(formattedRows).toEqual(report.findings.map((finding) => ({
      path: finding.path,
      name: finding.name,
      kind: finding.kind,
      identifierReferences: finding.identifierReferences,
    })));
  });
});
