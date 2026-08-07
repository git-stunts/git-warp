import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CHANGELOG_PATH = fileURLToPath(
  new URL('../../CHANGELOG.md', import.meta.url),
);

describe('checkpoint policy changelog', () => {
  it('describes the default threshold as inclusive', () => {
    const changelog = readFileSync(CHANGELOG_PATH, 'utf8');

    expect(changelog).toContain(
      'once their replay depth reaches or exceeds 64 patches',
    );
  });
});
