// SPDX-License-Identifier: Apache-2.0

import type { AuditVerdict } from './AuditVerdict.ts';

const COLUMN_GAP = '  ';

type Column = {
  readonly title: string;
  readonly text: (verdict: AuditVerdict) => string;
};

const COLUMNS: readonly Column[] = Object.freeze([
  { title: 'RESULT', text: (verdict) => (verdict.passed ? 'PASS' : 'FAIL') },
  { title: 'ADVISORY', text: (verdict) => verdict.advisory },
  { title: 'PACKAGE', text: (verdict) => verdict.packageName },
  { title: 'SEVERITY', text: (verdict) => verdict.severity },
  { title: 'TREE', text: (verdict) => verdict.tree },
  { title: 'DISPOSITION', text: (verdict) => verdict.disposition },
  { title: 'DETAIL', text: (verdict) => verdict.details.join('; ') },
]);

/** Renders one header line and one line for each verdict, in left-aligned columns. */
export function renderVerdictTable(verdicts: readonly AuditVerdict[]): readonly string[] {
  const sized = COLUMNS.map((column) => ({
    ...column,
    width: Math.max(column.title.length, ...verdicts.map((verdict) => column.text(verdict).length)),
  }));
  const header = sized.map((column) => column.title.padEnd(column.width)).join(COLUMN_GAP).trimEnd();
  const rows = verdicts.map((verdict) => sized
    .map((column) => column.text(verdict).padEnd(column.width))
    .join(COLUMN_GAP)
    .trimEnd());
  return [header, ...rows];
}
