import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const indexJs = readFileSync(
  fileURLToPath(new URL('../../../index.js', import.meta.url)),
  'utf8',
);

const indexDts = readFileSync(
  fileURLToPath(new URL('../../../index.d.ts', import.meta.url)),
  'utf8',
);

const readme = readFileSync(
  fileURLToPath(new URL('../../../README.md', import.meta.url)),
  'utf8',
);

const guide = readFileSync(
  fileURLToPath(new URL('../../../docs/GUIDE.md', import.meta.url)),
  'utf8',
);

const cliHelp = readFileSync(
  fileURLToPath(new URL('../../../bin/cli/infrastructure.js', import.meta.url)),
  'utf8',
);

describe('Strand is the public speculative-lane noun', () => {
  it('exports StrandError instead of WorkingSetError', () => {
    expect(indexJs).toContain('StrandError,');
    expect(indexJs).not.toContain('WorkingSetError,');
    expect(indexDts).toContain('export class StrandError extends Error {');
    expect(indexDts).not.toContain('export class WorkingSetError extends Error {');
  });

  it('exposes Strand methods and types on the public surface', () => {
    expect(indexDts).toContain('createStrand(options?: StrandCreateOptions): Promise<StrandDescriptor>;');
    expect(indexDts).toContain('getStrand(strandId: string): Promise<StrandDescriptor | null>;');
    expect(indexDts).toContain('listStrands(): Promise<StrandDescriptor[]>;');
    expect(indexDts).toContain('braidStrand(strandId: string, options?: StrandBraidOptions): Promise<StrandDescriptor>;');
    expect(indexDts).toContain('materializeStrand(strandId: string, options?: { receipts?: false; ceiling?: number | null }): Promise<WarpStateV5>;');
    expect(indexDts).toContain('compareStrand(strandId: string, options?: {');
    expect(indexDts).toContain('planStrandTransfer(strandId: string, options?: {');

    expect(indexDts).not.toContain('createWorkingSet(');
    expect(indexDts).not.toContain('getWorkingSet(');
    expect(indexDts).not.toContain('WorkingSetDescriptor');
  });

  it('uses strand selector vocabulary rather than working_set selectors', () => {
    expect(indexDts).toContain("kind: 'strand';");
    expect(indexDts).toContain("kind: 'strand_base';");
    expect(indexDts).toContain("coordinateKind: 'frontier' | 'strand' | 'strand_base';");
    expect(indexDts).not.toContain("kind: 'working_set';");
    expect(indexDts).not.toContain("kind: 'working_set_base';");
  });

  it('teaches Strand in the README and guide', () => {
    expect(readme).toContain('| **Strand** | A speculative write lane branched from a base observation. |');
    expect(guide).toContain('Use a `Strand` when you want reviewable or transferable work that should not land in live truth yet.');
    expect(readme).not.toContain('**WorkingSet**');
  });

  it('exposes strand as the CLI family and selector flag', () => {
    expect(cliHelp).toMatch(/strand\s+Manage pinned strand descriptors/);
    expect(cliHelp).toContain('--strand <id>');
    expect(cliHelp).not.toContain('working-set      Manage pinned working-set descriptors');
  });
});
