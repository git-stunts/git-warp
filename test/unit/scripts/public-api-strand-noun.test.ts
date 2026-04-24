import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const barrel = readFileSync(
  fileURLToPath(new URL('../../../index.ts', import.meta.url)),
  'utf8',
);

const runtimeSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/WarpRuntime.ts', import.meta.url)),
  'utf8',
);
const coordinateComparisonSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/types/CoordinateComparison.ts', import.meta.url)),
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
    expect(runtimeSource).toContain("createStrand: StrandController['createStrand']");
    expect(runtimeSource).toContain("getStrand: StrandController['getStrand']");
    expect(runtimeSource).toContain("listStrands: StrandController['listStrands']");
    expect(runtimeSource).toContain("braidStrand: StrandController['braidStrand']");
    expect(runtimeSource).toContain('async materializeStrand(');
    expect(runtimeSource).toContain("compareStrand: ComparisonController['compareStrand']");
    expect(runtimeSource).toContain("planStrandTransfer: ComparisonController['planStrandTransfer']");

    expect(runtimeSource).not.toContain(LEGACY_METHOD_CREATE);
    expect(runtimeSource).not.toContain(LEGACY_METHOD_GET);
    expect(runtimeSource).not.toContain(LEGACY_DESCRIPTOR);
  });

  it('uses strand selector vocabulary rather than the legacy selector vocabulary', () => {
    expect(coordinateComparisonSource).toContain("kind: 'strand';");
    expect(coordinateComparisonSource).toContain("kind: 'strand_base';");
    expect(coordinateComparisonSource).toContain("coordinateKind: 'frontier' | 'strand' | 'strand_base';");
    expect(coordinateComparisonSource).not.toContain(LEGACY_SELECTOR);
    expect(coordinateComparisonSource).not.toContain(LEGACY_BASE_SELECTOR);
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
