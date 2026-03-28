import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const guide = readFileSync(
  fileURLToPath(new URL('../../../docs/GUIDE.md', import.meta.url)),
  'utf8',
);

describe('Guide builder-shape', () => {
  it('starts with the state model before diving into methods', () => {
    expect(guide).toContain('## Mental model');
    expect(guide).toContain('A `Worldline` is a pinned read coordinate.');
    expect(guide).toContain('A `Lens` defines what is visible.');
    expect(guide).toContain('An `Observer` is a filtered read-only view through that lens.');
    expect(guide).toContain('A `Strand` is a speculative write lane');
  });

  it('organizes the main API around common write and read patterns', () => {
    expect(guide).toContain('## Common write patterns');
    expect(guide).toContain('### Pattern 1: direct patch');
    expect(guide).toContain('### Pattern 2: explicit writer session');
    expect(guide).toContain('### Pattern 3: speculative write lane');
    expect(guide).toContain('## Common read patterns');
    expect(guide).toContain('### Pattern 1: the live view');
    expect(guide).toContain('### Pattern 2: the redacted view');
    expect(guide).toContain('### Pattern 3: the historical view');
    expect(guide).toContain('### Pattern 4: the speculative view');
  });

  it('shows query, hop, aggregate, and path result shapes against a canonical tree graph', () => {
    expect(guide).toContain('## Common query patterns');
    expect(guide).toContain('flowchart TD');
    expect(guide).toContain("// tasks = {");
    expect(guide).toContain('// downstream = {');
    expect(guide).toContain('// summary = {');
    expect(guide).toContain('// dependencyPath = {');
  });

  it('uses a conflict-outcome table instead of CRDT theory dump', () => {
    expect(guide).toContain('## Collaboration patterns');
    expect(guide).toContain('| Alice writes | Bob writes | Outcome |');
    expect(guide).toContain('concurrent add wins');
  });

  it('keeps the core escape hatch explicit and points deep detail to API reference and advanced guide', () => {
    expect(guide).toContain('## When to drop to WarpCore');
    expect(guide).toContain('The thing to avoid is exporting that data into a second app-local graph');
    expect(guide).toContain('[API Reference](API_REFERENCE.md)');
    expect(guide).toContain('[Advanced Guide](ADVANCED_GUIDE.md)');
    expect(guide).not.toContain('WarpRuntime');
  });
});
