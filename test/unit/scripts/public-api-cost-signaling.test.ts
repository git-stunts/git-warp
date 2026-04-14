import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const wiredMethods = readFileSync(
  fileURLToPath(new URL('../../../src/domain/warp/_wiredMethods.d.ts', import.meta.url)),
  'utf8',
);

describe('public API cost signaling', () => {
  it('labels broad runtime enumeration as inspection-oriented', () => {
    expect(wiredMethods).toContain('Inspection API: enumerates all visible nodes in the current materialized state.');
    expect(wiredMethods).toContain('Inspection API: enumerates all visible edges in the current materialized state.');
    expect(wiredMethods).toContain('Inspection API: reads one node from the current materialized state.');
    expect(wiredMethods).toContain('Inspection API: walks visible neighbors from the current materialized state.');
  });

  it('tells consumers to prefer worldline and observer for stable product reads', () => {
    expect(wiredMethods).toContain('Prefer `worldline().query()` for stable product reads, or');
    expect(wiredMethods).toContain('`worldline().observer(...).query()` when you need a filtered aperture.');
    expect(wiredMethods).toContain('For application-facing reads, prefer `Observer` query/traverse helpers over direct materialization.');
  });

  it('labels direct materialization as advanced substrate replay', () => {
    expect(wiredMethods).toContain('Advanced substrate replay primitive over the live frontier.');
    expect(wiredMethods).toContain('Advanced substrate replay primitive against an explicit pinned frontier.');
    expect(wiredMethods).toContain("Advanced substrate replay primitive for a strand's pinned base observation plus overlay.");
    expect(wiredMethods).toContain('Advanced substrate replay primitive for this pinned source.');
  });
});
