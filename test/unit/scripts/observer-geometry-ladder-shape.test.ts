import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readDoc(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)), 'utf8');
}

const ladder = readDoc('docs/design/0035-observer-geometry-architecture-ladder.md');
const horizon = readDoc('docs/design/release-horizon-v20-v21.md');
const v19Lane = readDoc('docs/method/backlog/v19.0.0/README.md');

describe('Observer geometry architecture ladder docs', () => {
  it('defines the ideal architecture and the missing runtime nouns', () => {
    expect(ladder).toContain('# Observer Geometry Architecture Ladder');
    expect(ladder).toContain('[docs/GLOSSARY.md](../GLOSSARY.md)');
    expect(ladder).toContain('[release-horizon-v20-v21.md](./release-horizon-v20-v21.md)');
    expect(ladder).toContain('## Ideal architecture');
    expect(ladder).toContain('### 4. Bounded support rule makes the read operationally honest');
    expect(ladder).toContain('### 5. Causal indexes make discovery cheap');
    expect(ladder).toContain('### 6. Support fragments make reuse cheap');
    expect(ladder).toContain('## Missing nouns');
    expect(ladder).toContain('- `Optic`');
    expect(ladder).toContain('- `bounded support rule`');
    expect(ladder).toContain('- `support fragment`');
  });

  it('defines the architectural ladder and points at the promoted runtime backlog items', () => {
    expect(ladder).toContain('## Architectural ladder');
    expect(ladder).toContain('### Rung 1 — Canonical nouns');
    expect(ladder).toContain('### Rung 5 — Support fragments');
    expect(ladder).toContain('## Backlog ladder');
    expect(ladder).toContain('[PROTO_bounded-support-rules-for-query-surfaces]');
    expect(ladder).toContain('[PROTO_causal-indexes-for-sliced-queries]');
    expect(ladder).toContain('[PROTO_support-scoped-fragment-materialization]');
    expect(ladder).toContain('[PROTO_tick-range-graph-diff-api]');
  });

  it('keeps the v20/v21 horizon explicit, including the external-memory global operator distinction', () => {
    expect(horizon).toContain('# Release Horizon: v20.0.0 and v21.0.0');
    expect(horizon).toContain('## `v20.0.0` — Slice-First Read Execution');
    expect(horizon).toContain('## `v21.0.0` — Distributed Observer Geometry and Admission Reality');
    expect(horizon).toContain('### What "external-memory global operators" means');
    expect(horizon).toContain('- **global scope** is a property of the question');
    expect(horizon).toContain('- **whole-graph in-memory residency** is an implementation choice');
  });

  it('records the promoted ladder items in the v19 lane readme', () => {
    expect(v19Lane).toContain('## Architecture ladder');
    expect(v19Lane).toContain('PROTO_bounded-support-rules-for-query-surfaces');
    expect(v19Lane).toContain('PROTO_causal-indexes-for-sliced-queries');
    expect(v19Lane).toContain('PROTO_support-scoped-fragment-materialization');
    expect(v19Lane).toContain('PROTO_tick-range-graph-diff-api');
  });
});
