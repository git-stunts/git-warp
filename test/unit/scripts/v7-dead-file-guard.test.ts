import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

type DeadFileGuard = {
  readonly path: string;
  readonly reason: string;
};

const deletedV7Artifacts: readonly DeadFileGuard[] = Object.freeze([
  {
    path: 'src/domain/services/Reducer.js',
    reason: 'schema:1 LWW reducer replaced by schema:2 join reduction',
  },
  {
    path: 'src/domain/services/StateSerializer.js',
    reason: 'schema:1 state serialization replaced by current state model',
  },
  {
    path: 'src/domain/EmptyGraphWrapper.js',
    reason: 'legacy commit-per-node wrapper replaced by WarpCore',
  },
  {
    path: 'src/domain/services/GraphService.js',
    reason: 'legacy commit-per-node engine replaced by WarpCore',
  },
  {
    path: 'src/domain/legacy',
    reason: 'legacy module directory must not return',
  },
]);

describe('V7 dead-file deletion guard', () => {
  for (const artifact of deletedV7Artifacts) {
    it(`keeps ${artifact.path} deleted`, () => {
      const fullPath = join(REPO_ROOT, artifact.path);

      expect(existsSync(fullPath), artifact.reason).toBe(false);
    });
  }
});
