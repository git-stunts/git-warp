import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, 'utf8');
}

describe('repository standard docs', () => {
  it('keeps root pointers to the canonical GitHub standard docs', () => {
    const pointers = [
      {
        rootPath: 'CODE_OF_CONDUCT.md',
        githubPath: '.github/CODE_OF_CONDUCT.md',
        heading: 'Code of Conduct',
      },
      {
        rootPath: 'CONTRIBUTING.md',
        githubPath: '.github/CONTRIBUTING.md',
        heading: 'Contributing',
      },
      {
        rootPath: 'SECURITY.md',
        githubPath: '.github/SECURITY.md',
        heading: 'Security',
      },
    ];

    for (const pointer of pointers) {
      expect(existsSync(`${repoRoot}${pointer.rootPath}`)).toBe(true);
      expect(existsSync(`${repoRoot}${pointer.githubPath}`)).toBe(true);
      const rootPointer = readRepoFile(pointer.rootPath);
      expect(rootPointer).toContain(`[${pointer.githubPath}](${pointer.githubPath})`);
      expect(rootPointer).toContain(`# ${pointer.heading}\n\n`);
    }
  });
});
