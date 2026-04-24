import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const warpRuntimeSource = readFileSync(
  fileURLToPath(new URL('../../../src/domain/WarpRuntime.ts', import.meta.url)),
  'utf8',
);
const tsconfig = readFileSync(
  fileURLToPath(new URL('../../../tsconfig.json', import.meta.url)),
  'utf8',
);
const tsconfigSrc = readFileSync(
  fileURLToPath(new URL('../../../tsconfig.src.json', import.meta.url)),
  'utf8',
);
const tsconfigTest = readFileSync(
  fileURLToPath(new URL('../../../tsconfig.test.json', import.meta.url)),
  'utf8',
);

describe('runtime wiring surface closeout', () => {
  it('deletes the runtime wiring and wired methods shim files', () => {
    expect(existsSync(`${repoRoot}src/domain/runtimeWiring.ts`)).toBe(false);
    expect(existsSync(`${repoRoot}src/domain/warp/_wiredMethods.d.ts`)).toBe(false);
  });

  it('stops teaching tsconfig about the deleted wired-methods shim', () => {
    expect(tsconfig).not.toContain('src/domain/warp/_wiredMethods.d.ts');
    expect(tsconfigSrc).not.toContain('src/domain/warp/_wiredMethods.d.ts');
    expect(tsconfigTest).not.toContain('src/domain/warp/_wiredMethods.d.ts');
  });

  it('gives WarpRuntime a direct static method surface', () => {
    expect(warpRuntimeSource).not.toContain("from './runtimeWiring.ts'");
    expect(warpRuntimeSource).not.toContain('wireRuntime(WarpRuntime)');
    expect(warpRuntimeSource).toContain("createCheckpoint: CheckpointController['createCheckpoint']");
    expect(warpRuntimeSource).toContain("getFrontier: SyncController['getFrontier']");
    expect(warpRuntimeSource).toContain("observer: QueryCapability['observer']");
  });
});
