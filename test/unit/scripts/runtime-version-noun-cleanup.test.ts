import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ACTIVE_CLEANUP_FILES = [
  '../../../docs/design/joinreducer-op-strategy.md',
  '../../../docs/design/joinreducer-split.md',
  '../../../src/domain/services/PatchBuilder.ts',
  '../../../src/domain/services/comparison/VisibleStateComparison.ts',
  '../../../src/domain/types/VisibleStateReader.ts',
  '../../../test/unit/domain/services/JoinReducer.integration.test.ts',
  '../../../test/unit/domain/services/controllers/ProvenanceController.test.ts',
] as const;

const STALE_RUNTIME_NOUNS = [
  'WarpStateV5',
  'createEmptyStateV5',
  'cloneStateV5',
  'materialized V5',
  'WARP v5',
  'mockReduceV5',
] as const;

function readRepoFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

describe('runtime version-noun cleanup', () => {
  it('keeps active source, tests, and current design docs on unversioned runtime names', () => {
    const offenders = ACTIVE_CLEANUP_FILES.flatMap((path) => {
      const source = readRepoFile(path);
      return STALE_RUNTIME_NOUNS
        .filter((token) => source.includes(token))
        .map((token) => `${path}: ${token}`);
    });

    expect(offenders).toEqual([]);
  });
});
