import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  findEscapingDocumentLinks,
  findUnresolvedImports,
  markdownLinkTargets,
  relativeImportSpecifiers,
} from '../../../scripts/package-payload/PackedArtifactFiles.ts';

const roots: string[] = [];

function packageFixture(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'packed-artifact-files-'));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('packed artifact documentation links', () => {
  it('reads inline and reference-style link targets', () => {
    expect(
      markdownLinkTargets('[a](docs/a.md) and [b](https://example.com "t")\n[c]: ./c.md\n')
    ).toEqual(['docs/a.md', 'https://example.com', './c.md']);
  });

  it('accepts shipped targets, directories, fragments, and external URLs', () => {
    const root = packageFixture({
      'README.md': '[g](docs/guide/) [h](docs/guide/README.md#top) [x](https://example.com) [s](#s)',
      'docs/guide/README.md': '[up](../../README.md)',
    });

    expect(findEscapingDocumentLinks(root)).toEqual([]);
  });

  it('reports links into withheld or missing files and outside the package', () => {
    const root = packageFixture({
      'README.md': '[changelog](CHANGELOG.md) [escape](../elsewhere/README.md)',
      'docs/guide/README.md': '[topic](../topics/cli.md)',
    });

    expect(findEscapingDocumentLinks(root).sort()).toEqual([
      'README.md -> ../elsewhere/README.md',
      'README.md -> CHANGELOG.md',
      'docs/guide/README.md -> ../topics/cli.md',
    ]);
  });
});

describe('packed artifact JavaScript imports', () => {
  it('lists real relative specifiers and ignores comments and packages', () => {
    const source = [
      "import a from './a.js';",
      "export { b } from '../b.js';",
      "// should migrate to importing from '../c.js' directly",
      "import zod from 'zod';",
      "const lazy = await import('./lazy.js');",
    ].join('\n');

    expect(relativeImportSpecifiers(source)).toEqual(['./a.js', '../b.js', './lazy.js']);
  });

  it('reports shipped JavaScript whose relative imports are missing', () => {
    const root = packageFixture({
      'dist/bin/cli.js': "import './shared.js';\nimport '../scripts/missing.js';\n",
      'dist/bin/shared.js': 'export {};\n',
    });

    expect(findUnresolvedImports(root)).toEqual(['dist/bin/cli.js -> ../scripts/missing.js']);
  });
});
