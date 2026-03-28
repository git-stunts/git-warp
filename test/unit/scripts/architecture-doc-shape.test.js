import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const architecture = readFileSync(
  fileURLToPath(new URL('../../../ARCHITECTURE.md', import.meta.url)),
  'utf8',
);

describe('architecture doc shape', () => {
  it('describes the current public surfaces and internal engine clearly', () => {
    expect(architecture).toContain('# git-warp architecture');
    expect(architecture).toContain('## Public surfaces');
    expect(architecture).toContain('### `WarpApp`');
    expect(architecture).toContain('### `WarpCore`');
    expect(architecture).toContain('### Internal engine');
    expect(architecture).toContain('`src/domain/WarpRuntime.js`');
  });

  it('teaches the current read and speculative-lane nouns', () => {
    expect(architecture).toContain('`Worldline`');
    expect(architecture).toContain('`Lens`');
    expect(architecture).toContain('`Observer`');
    expect(architecture).toContain('`Strand`');
    expect(architecture).not.toContain('# WarpGraph Architecture');
    expect(architecture).not.toContain('## Strand Boundary');
  });
});
