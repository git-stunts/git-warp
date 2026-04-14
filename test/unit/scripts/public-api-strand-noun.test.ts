import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const barrel = readFileSync(
  fileURLToPath(new URL('../../../index.ts', import.meta.url)),
  'utf8',
);

const wiredMethods = readFileSync(
  fileURLToPath(new URL('../../../src/domain/warp/_wiredMethods.d.ts', import.meta.url)),
  'utf8',
);

const strandErrorSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/errors/StrandError.ts', import.meta.url)),
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
  fileURLToPath(new URL('../../../bin/cli/infrastructure.ts', import.meta.url)),
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
    expect(barrel).toContain('StrandError,');
    expect(barrel).not.toContain(`${LEGACY_CLASS},`);
    expect(strandErrorSource).toContain('class StrandError extends');
    expect(strandErrorSource).not.toContain(`class ${LEGACY_CLASS}`);
  });

  it('exposes Strand methods and types on the public surface', () => {
    expect(wiredMethods).toContain('createStrand(options?: StrandCreateOptions): Promise<StrandDescriptor>;');
    expect(wiredMethods).toContain('getStrand(strandId: string): Promise<StrandDescriptor | null>;');
    expect(wiredMethods).toContain('listStrands(): Promise<StrandDescriptor[]>;');
    expect(wiredMethods).toContain('braidStrand(strandId: string, options?: StrandBraidOptions): Promise<StrandDescriptor>;');
    expect(wiredMethods).toContain('materializeStrand(strandId: string, options?: { receipts?: false; ceiling?: number | null }): Promise<WarpState>;');
    expect(wiredMethods).toContain('compareStrand(strandId: string, options?: {');
    expect(wiredMethods).toContain('planStrandTransfer(strandId: string, options?: {');

    expect(wiredMethods).not.toContain(LEGACY_METHOD_CREATE);
    expect(wiredMethods).not.toContain(LEGACY_METHOD_GET);
    expect(wiredMethods).not.toContain(LEGACY_DESCRIPTOR);
  });

  it('uses strand selector vocabulary rather than the legacy selector vocabulary', () => {
    expect(wiredMethods).toContain("kind: 'strand';");
    expect(wiredMethods).toContain("kind: 'strand_base';");
    expect(wiredMethods).toContain("coordinateKind: 'frontier' | 'strand' | 'strand_base';");
    expect(wiredMethods).not.toContain(LEGACY_SELECTOR);
    expect(wiredMethods).not.toContain(LEGACY_BASE_SELECTOR);
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
