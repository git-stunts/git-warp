import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const config = readFileSync(
  fileURLToPath(new URL('../../../.markdownlint.jsonc', import.meta.url)),
  'utf8',
);

describe('markdownlint config policy', () => {
  it('disables line-length wrapping explicitly', () => {
    expect(config).toMatch(/"MD013"\s*:\s*false/);
  });

  it('keeps fenced code block language enforcement enabled', () => {
    expect(config).toMatch(/"MD040"\s*:\s*true/);
  });
});
