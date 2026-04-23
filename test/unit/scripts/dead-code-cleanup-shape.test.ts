import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, 'utf8');
}

describe('dead-code cleanup closeout', () => {
  it('marks the v17 ledger entry as not met and points at the real owner', () => {
    const releaseReadme = readRepoFile('docs/releases/v17.0.0/README.md');

    expect(releaseReadme).toContain('[✗] SLUDGE_dead-code-cleanup');
    expect(releaseReadme).toContain('cycle 0052 not-met');
    expect(releaseReadme).toContain('PROTO_purge-fake-models');
  });

  it('makes the fake-model purge note own the live blocker explicitly', () => {
    const owningNote = readRepoFile('docs/method/backlog/v17.0.0/PROTO_purge-fake-models.md');

    expect(owningNote).toContain('ConflictCandidateCollector');
    expect(owningNote).toContain('conflictTargetIdentity');
    expect(owningNote).toContain('OpStrategies');
  });

  it('removes the duplicate dead-code card from the live v17 lane', () => {
    expect(existsSync(`${repoRoot}docs/method/backlog/v17.0.0/SLUDGE_dead-code-cleanup.md`)).toBe(false);
  });
});
