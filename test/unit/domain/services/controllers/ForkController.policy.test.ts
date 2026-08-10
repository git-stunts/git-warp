import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FORK_CONTROLLER_PATH = fileURLToPath(
  new URL('../../../../../src/domain/services/controllers/ForkController.ts', import.meta.url),
);

describe('ForkController source policy', () => {
  it('narrows caught values without type assertions', () => {
    const source = readFileSync(FORK_CONTROLLER_PATH, 'utf8');

    expect(source.match(/\bas\s+Error\b/u)).toBeNull();
  });
});
