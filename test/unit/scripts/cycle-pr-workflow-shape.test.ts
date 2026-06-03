import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOW_DOC_PATHS = Object.freeze([
  'AGENTS.md',
  'docs/METHOD.md',
  'docs/method/process.md',
]);

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('cycle PR workflow shape', () => {
  it('keeps cycle PRs draft until they are ready to merge into main', () => {
    for (const path of WORKFLOW_DOC_PATHS) {
      const source = readRepoFile(path);

      expect(source, path).toContain('ready to merge into `main`');
      expect(source, path).not.toMatch(/Move the PR out of draft only when[\s\S]{0,200}ready for\s+review/u);
      expect(source, path).not.toMatch(/keep the PR draft until[\s\S]{0,200}ready for\s+review/u);
    }
  });
});
