import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CHANGELOG = readFileSync(new URL('../../../CHANGELOG.md', import.meta.url), 'utf8');

describe('package payload contract documentation', () => {
  it('distinguishes published operator policy from excluded maintainer-only policy', () => {
    expect(CHANGELOG).toContain(
      'drivers, maintainer-only policy documents, and plans.'
    );
    expect(CHANGELOG).not.toContain('drivers, policy documents, and plans.');
  });
});
