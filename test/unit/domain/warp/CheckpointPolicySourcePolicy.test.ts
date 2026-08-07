import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CHECKPOINT_POLICY_TEST_PATH = fileURLToPath(
  new URL('../WarpGraph.checkpointPolicy.test.ts', import.meta.url),
);

describe('checkpoint policy test source', () => {
  it('contains no any escape hatch', () => {
    const source = readFileSync(CHECKPOINT_POLICY_TEST_PATH, 'utf8');

    expect(source.match(/\bany\b/u)).toBeNull();
  });
});
