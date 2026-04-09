/**
 * @param {{ branch: string, baseRef: string, mergeBase: string }} meta
 * @param {Array<{ path: string, kind: string, touch: string, loc: number, limit: number, unknownCount: number, asCount: number, anyCount: number, typedefCount: number, enumCount: number, exportCount: number, freeze: string, status: string }>} rows
 * @returns {string}
 */
export function formatMarkdown(meta, rows) {
  const lines = [
    '# Agent Scorecard',
    '',
    `Touched on ${meta.branch} (vs ${meta.baseRef}, merge-base ${meta.mergeBase.slice(0, 8)})`,
    '',
    '| File | Kind | Touch | LOC | <=Limit | unknown | as | any | typedef | enum | exports | freeze | status |',
    '| --- | --- | --- | ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: | :---: |',
  ];
  for (const row of rows) {
    lines.push(`| ${row.path} | ${row.kind} | ${row.touch} | ${row.loc} | ${row.loc <= row.limit ? 'yes' : 'no'} | ${row.unknownCount} | ${row.asCount} | ${row.anyCount} | ${row.typedefCount} | ${row.enumCount} | ${row.exportCount} | ${row.freeze} | ${row.status} |`);
  }
  lines.push('');
  lines.push('Manual review still required: runtime-backed forms (P1), boundary validation placement (P2), owning-type behavior (P3), human-readable error branching, and peer concepts that escape simple export counting.');
  return lines.join('\n');
}

/**
 * @param {{ branch: string, baseRef: string, mergeBase: string }} meta
 * @param {Array<{ path: string, kind: string, touch: string, loc: number, limit: number, unknownCount: number, asCount: number, anyCount: number, typedefCount: number, enumCount: number, exportCount: number, freeze: string, status: string }>} rows
 * @returns {string}
 */
export function formatBijou(meta, rows) {
  const header = `Agent scorecard on ${meta.branch} vs ${meta.baseRef} @ ${meta.mergeBase.slice(0, 8)}`;
  const body = rows.map(row => `${row.status.toUpperCase()} ${row.path} loc=${row.loc}/${row.limit} touch=${row.touch} unknown=${row.unknownCount} as=${row.asCount} any=${row.anyCount} typedef=${row.typedefCount} enum=${row.enumCount} exports=${row.exportCount} freeze=${row.freeze}`).join('\n');
  return `${header}\n${body}\nMANUAL runtime-backed/boundary/owning-type review still required.`;
}
