import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CHANGELOG = readFileSync(new URL('../../../CHANGELOG.md', import.meta.url), 'utf8');
const PACKAGE_PAYLOAD_CONTRACT = readFileSync(
  new URL('../../../docs/operations/package-payload.md', import.meta.url),
  'utf8'
);

describe('package payload contract documentation', () => {
  it('distinguishes published operator policy from excluded maintainer-only policy', () => {
    expect(CHANGELOG).toContain(
      'drivers, maintainer-only policy documents, and plans.'
    );
    expect(CHANGELOG).not.toContain('drivers, policy documents, and plans.');
  });

  it('names the complete v18-to-v19 adapter publication path', () => {
    expect(PACKAGE_PAYLOAD_CONTRACT).toContain(
      '`dist/scripts/v18-to-v19/*.{js,d.ts}`, `dist/scripts/v18-to-v19/adapters/**`'
    );
    expect(PACKAGE_PAYLOAD_CONTRACT).not.toContain(
      '`dist/scripts/v18-to-v19/*.{js,d.ts}`, `adapters/**`'
    );
  });
});
