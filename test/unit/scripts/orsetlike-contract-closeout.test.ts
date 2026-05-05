import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function sourceFilesUnder(directoryPath: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directoryPath)) {
    const entryPath = join(directoryPath, entry);
    const stat = statSync(entryPath);
    if (stat.isDirectory()) {
      files.push(...sourceFilesUnder(entryPath));
      continue;
    }
    if (entryPath.endsWith('.ts')) {
      files.push(entryPath);
    }
  }
  return files;
}

describe('ORSetLike contract closeout', () => {
  it('removes the invalid live v17 card', () => {
    expect(existsSync(join(
      repoRoot,
      'docs/method/backlog/v17.0.0/PROTO_orsetlike-contract.md',
    ))).toBe(false);
  });

  it('keeps source free of the rejected ORSetLike abstraction', () => {
    const sourceText = sourceFilesUnder(join(repoRoot, 'src'))
      .map((filePath) => readFileSync(filePath, 'utf8'))
      .join('\n');

    expect(sourceText).not.toContain('ORSetLike');
  });

  it('removes ORSetLike as a live extraction dependency', () => {
    const extraction = readRepoFile('docs/method/backlog/v17.0.0/INFRA_extract-warp-orset-package-post-publish.md');
    const releaseLedger = readRepoFile('docs/releases/v17.0.0/README.md');
    const workloads = readRepoFile('docs/method/backlog/WORKLOADS.md');

    expect(extraction).not.toContain('PROTO_orsetlike-contract');
    expect(extraction).toContain('concrete `ORSet`');
    expect(extraction).toContain('`StateSession`');
    expect(releaseLedger).toContain('[x] PROTO_orsetlike-contract');
    expect(releaseLedger).toContain('cycle 0091 retired stale');
    expect(releaseLedger).toContain('live card');
    expect(releaseLedger).not.toContain('[ ] PROTO_orsetlike-contract');
    expect(workloads).not.toContain('PROTO_orsetlike-contract');
    expect(workloads).not.toContain('WL-36-v17-state-stream-core');
  });

  it('documents the concrete ORSet and StateSession seam law', () => {
    const orsetReadme = readRepoFile('src/domain/orset/README.md');
    const design0018 = readRepoFile('docs/design/0018-shadow-trie-orset/shadow-trie-orset.md');

    expect(orsetReadme).toContain('concrete `ORSet` remains the synchronous in-memory form');
    expect(orsetReadme).toContain('cycle 0091 retired the stale live card');
    expect(design0018).toContain('Concrete ORSet (synchronous in-memory form)');
    expect(design0018).toContain('No ORSetLike parent');
    expect(design0018).not.toContain('ORSetLike (synchronous in-memory seam)');
  });
});
