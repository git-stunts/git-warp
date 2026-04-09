/**
 * @param {string} patch
 * @returns {{ added: number, deleted: number, oldChangedLines: number[], newChangedLines: number[] }}
 */
export function parseUnifiedDiff(patch) {
  const oldChangedLines = [];
  const newChangedLines = [];
  let added = 0;
  let deleted = 0;
  let oldLine = 0;
  let newLine = 0;

  for (const line of patch.split('\n')) {
    const hunkMatch = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunkMatch !== null) {
      oldLine = Number.parseInt(hunkMatch[1] ?? '0', 10);
      newLine = Number.parseInt(hunkMatch[3] ?? '0', 10);
      continue;
    }
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git')) {
      continue;
    }
    if (line.startsWith('+')) {
      added += 1;
      newChangedLines.push(newLine);
      newLine += 1;
      continue;
    }
    if (line.startsWith('-')) {
      deleted += 1;
      oldChangedLines.push(oldLine);
      oldLine += 1;
      continue;
    }
    if (line.startsWith(' ')) {
      oldLine += 1;
      newLine += 1;
    }
  }

  return { added, deleted, oldChangedLines, newChangedLines };
}
