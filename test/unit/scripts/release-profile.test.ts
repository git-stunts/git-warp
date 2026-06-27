import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  collectReleaseDocPaths,
  collectVersionLockstepFailures,
  loadReleaseProfile,
} from '../../../scripts/release-profile.ts';

function writeFixtureFile(root: string, relativePath: string, content: string): void {
  const path = join(root, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

async function createProfileFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'git-warp-release-profile-'));
  writeFixtureFile(
    root,
    '.continuum/release.yml',
    [
      'schema: 1',
      'version_sources:',
      '  - path: package.json',
      '    type: json',
      '    field: version',
      '  - path: package-lock.json',
      '    type: npm-lock-root',
      '    field: version',
      '  - path: "packages/*/package.json"',
      '    type: json',
      '    field: version',
      '    required: true',
      '    private: true',
      '  - path: "components/*/manifest.json"',
      '    type: json',
      '    field: version',
      'docs:',
      '  changelog: CHANGELOG.md',
      '  front_door: README.md',
      '  architecture: ARCHITECTURE.md',
      '  learning_index: docs/topics/README.md',
      '  learning_topics: docs/topics/',
      '  operations: docs/operations/README.md',
      '  contributor:',
      '    - .github/CONTRIBUTING.md',
      '    - AGENTS.md',
      '    - .github/RELEASE.md',
      '',
    ].join('\n')
  );
  writeFixtureFile(root, 'docs/topics/README.md', '# Topics\n');
  writeFixtureFile(root, 'docs/topics/alpha.md', '# Alpha\n');
  writeFixtureFile(root, 'docs/topics/zeta.md', '# Zeta\n');
  writeFixtureFile(root, 'package.json', '{"version":"1.2.3"}');
  writeFixtureFile(root, 'jsr.json', '{"version":"1.2.3"}');
  writeFixtureFile(root, 'package-lock.json', '{"packages":{"":{"version":"1.2.3"}}}');
  writeFixtureFile(root, 'packages/kernel/package.json', '{"version":"1.2.3","private":true}');
  writeFixtureFile(root, 'components/generated/manifest.json', '{"version":"1.2.3"}');
  return root;
}

describe('release profile', () => {
  it('loads the checked-in release profile', () => {
    const profile = loadReleaseProfile();

    expect(profile.schema).toBe(1);
    expect(profile.version_sources.map((source) => source.path)).toContain('package.json');
    expect(profile.docs.learning_topics).toBe('docs/topics/');
  });

  it('derives release docs from the profile and topic shelf', async () => {
    const root = await createProfileFixture();

    expect(collectReleaseDocPaths(root)).toEqual([
      '.continuum/release.yml',
      'CHANGELOG.md',
      'README.md',
      'ARCHITECTURE.md',
      'docs/topics/README.md',
      'docs/topics/alpha.md',
      'docs/topics/zeta.md',
      'docs/operations/README.md',
      '.github/CONTRIBUTING.md',
      'AGENTS.md',
      '.github/RELEASE.md',
    ]);
  });

  it('reports drift from profile-owned version sources', async () => {
    const root = await createProfileFixture();
    writeFixtureFile(root, 'packages/kernel/package.json', '{"version":"1.2.4","private":false}');

    expect(collectVersionLockstepFailures('1.2.3', root)).toEqual([
      'packages/kernel/package.json version 1.2.4 != 1.2.3',
      'packages/kernel/package.json must remain private unless publish policy changes',
    ]);
  });
});
