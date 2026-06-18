import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

type InventoryEntry = {
  readonly lines: number;
  readonly path: string;
};

function runLineInventory(): readonly InventoryEntry[] {
  const result = spawnSync('sh', [
    '-c',
    [
      "find src bin scripts test/unit test/conformance -path '*/node_modules/*' -prune -o",
      "-type f \\( -name '*.ts' -o -name '*.js' -o -name '*.sh' \\) -print0",
      '| xargs -0 wc -l',
    ].join(' '),
  ], {
    encoding: 'utf8',
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.endsWith(' total'))
    .map(parseInventoryLine);
}

function parseInventoryLine(line: string): InventoryEntry {
  const match = /^(\d+)\s+(.+)$/u.exec(line);
  if (match === null) {
    throw new SourceInventoryError(`unparseable inventory line: ${line}`);
  }
  const lineCount = Number(match[1]);
  const path = match[2];
  if (!Number.isInteger(lineCount) || path === undefined) {
    throw new SourceInventoryError(`invalid inventory line: ${line}`);
  }
  return { lines: lineCount, path };
}

class SourceInventoryError extends Error {}

describe('source size inventory command', () => {
  it('reports the current source files over the 500 LOC ceiling', () => {
    const entries = runLineInventory();
    const sourceOverBudget = entries
      .filter((entry) => entry.path.startsWith('src/') && entry.lines > 500)
      .sort((a, b) => a.path.localeCompare(b.path));

    expect(sourceOverBudget).toEqual([
      { lines: 831, path: 'src/domain/orset/trie/TrieCursor.ts' },
      { lines: 920, path: 'src/domain/RuntimeHost.ts' },
      { lines: 502, path: 'src/domain/services/audit/AuditChainVerifier.ts' },
      { lines: 575, path: 'src/domain/services/controllers/CheckpointController.ts' },
      { lines: 602, path: 'src/domain/services/JoinReducerSession.ts' },
      { lines: 552, path: 'src/domain/services/optic/CheckpointBasisManifest.ts' },
      { lines: 511, path: 'src/domain/services/optic/CheckpointShardFactReader.ts' },
      { lines: 515, path: 'src/domain/services/state/WarpState.ts' },
    ]);
  });

  it('keeps test-file overages visible as inventory, not closeout prose', () => {
    const entries = runLineInventory();
    const largestTest = entries
      .filter((entry) => entry.path.startsWith('test/') && entry.lines > 800)
      .sort((a, b) => b.lines - a.lines)[0];

    expect(largestTest).toEqual({
      lines: 2845,
      path: 'test/unit/domain/services/strand/StrandService.test.ts',
    });
  });
});
