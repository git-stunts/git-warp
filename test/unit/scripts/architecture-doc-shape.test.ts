import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const architecture = readFileSync(
  fileURLToPath(new URL('../../../docs/ARCHITECTURE.md', import.meta.url)),
  'utf8',
);

describe('architecture doc shape', () => {
  it('describes the current public surfaces and internal engine clearly', () => {
    expect(architecture).toContain('# git-warp architecture');
    expect(architecture).toContain('## Public API surface');
    expect(architecture).toContain('### `openWarpGraph()` (v17+)');
    expect(architecture).toContain('### `WarpApp` / `WarpCore` (legacy, v16 compat)');
    expect(architecture).toContain('## Internal engine');
  });

  it('teaches the current read and speculative-lane nouns', () => {
    expect(architecture).toContain('graph.strands.*');
    expect(architecture).toContain('observers, worldlines');
    expect(architecture).toContain('StrandController');
    expect(architecture).toContain('Admission architecture');
    expect(architecture).not.toContain('# WarpGraph Architecture');
    expect(architecture).not.toContain('## Strand Boundary');
  });
});
