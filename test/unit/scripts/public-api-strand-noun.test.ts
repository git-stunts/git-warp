import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const indexJs = readFileSync(
  fileURLToPath(new URL('../../../index.ts', import.meta.url)),
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

const LEGACY_CLASS = 'Working' + 'SetError';
const LEGACY_METHOD_CREATE = 'create' + 'Working' + 'Set(';
const LEGACY_METHOD_GET = 'get' + 'Working' + 'Set(';
const LEGACY_DESCRIPTOR = 'Working' + 'SetDescriptor';
const LEGACY_SELECTOR = "kind: '" + 'working' + '_set' + "';";
const LEGACY_BASE_SELECTOR = "kind: '" + 'working' + '_set' + '_base' + "';";
const LEGACY_LABEL = 'Working' + ' ' + 'Set';
const LEGACY_FLAG = 'working' + '-' + 'set';

describe('Strand is the public speculative-lane noun', () => {
  it('exports StrandError instead of the legacy strand error noun', () => {
    expect(indexJs).toContain('StrandError,');
    expect(indexJs).not.toContain(`${LEGACY_CLASS},`);
    expect(indexDts).toContain('export class StrandError extends Error {');
    expect(indexDts).not.toContain(`export class ${LEGACY_CLASS} extends Error {`);
  });

  it('exposes Strand methods and types on the public surface', () => {
    expect(indexDts).toContain('createStrand(options?: StrandCreateOptions): Promise<StrandDescriptor>;');
    expect(indexDts).toContain('getStrand(strandId: string): Promise<StrandDescriptor | null>;');
    expect(indexDts).toContain('listStrands(): Promise<StrandDescriptor[]>;');
    expect(indexDts).toContain('braidStrand(strandId: string, options?: StrandBraidOptions): Promise<StrandDescriptor>;');
    expect(indexDts).toContain('materializeStrand(strandId: string, options?: { receipts?: false; ceiling?: number | null }): Promise<WarpState>;');
    expect(indexDts).toContain('compareStrand(strandId: string, options?: {');
    expect(indexDts).toContain('planStrandTransfer(strandId: string, options?: {');

    expect(indexDts).not.toContain(LEGACY_METHOD_CREATE);
    expect(indexDts).not.toContain(LEGACY_METHOD_GET);
    expect(indexDts).not.toContain(LEGACY_DESCRIPTOR);
  });

  it('uses strand selector vocabulary rather than the legacy selector vocabulary', () => {
    expect(indexDts).toContain("kind: 'strand';");
    expect(indexDts).toContain("kind: 'strand_base';");
    expect(indexDts).toContain("coordinateKind: 'frontier' | 'strand' | 'strand_base';");
    expect(indexDts).not.toContain(LEGACY_SELECTOR);
    expect(indexDts).not.toContain(LEGACY_BASE_SELECTOR);
  });

  it('teaches Strand in the README and guide', () => {
    expect(readme).toContain('| **Strand** | Speculative causal lane with fork provenance. Private until admitted. |');
    expect(guide).toContain('Use a `Strand` when you want reviewable or transferable work that should not land in live truth yet.');
    expect(readme).not.toContain(LEGACY_LABEL);
  });

  it('exposes strand as the CLI family and selector flag', () => {
    expect(cliHelp).toMatch(/strand\s+Manage pinned strand descriptors/);
    expect(cliHelp).toContain('--strand <id>');
    expect(cliHelp).not.toContain(LEGACY_FLAG);
  });
});
