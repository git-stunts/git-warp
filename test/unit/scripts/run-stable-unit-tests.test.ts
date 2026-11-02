import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const scriptPath = fileURLToPath(new URL('../../../scripts/run-stable-unit-tests.ts', import.meta.url));
const testSuffixes = ['test', 'spec', 'benchmark'].flatMap((kind) =>
  ['js', 'jsx', 'ts', 'tsx', 'mjs', 'mts', 'cjs', 'cts'].map((extension) => `.${kind}.${extension}`));

function printedTestPaths(output: string): string[] {
  return output.split(/\s+/).filter((argument) => argument.startsWith('test/')).sort();
}

function unitInventory(): string[] {
  return readdirSync(join(repoRoot, 'test/unit'), { recursive: true, encoding: 'utf8' })
    .filter((name) => testSuffixes.some((suffix) => name.endsWith(suffix)))
    .map((name) => `test/unit/${name.split(sep).join('/')}`).sort();
}

function runStableUnitTests(options: {
  readonly args?: readonly string[];
  readonly freeMib?: string;
  readonly maxWorkers?: string;
} = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...(options.args ?? [])], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      WARP_STABLE_TEST_DRY_RUN: '1',
      WARP_TEST_FAKE_CPU_COUNT: '8',
      WARP_TEST_FAKE_FREE_MB: options.freeMib ?? '2048',
      WARP_TEST_FAKE_TOTAL_MB: '16384',
      WARP_TEST_MAX_WORKERS: options.maxWorkers ?? '3',
      WARP_TEST_MIN_FREE_MB: '512',
    },
  });

  return {
    output: `${result.stdout}${result.stderr}`,
    status: result.status,
  };
}

describe('scripts/run-stable-unit-tests.ts', () => {
  it('selects the entire unit inventory and the explicit contract exactly once', () => {
    const result = runStableUnitTests();
    expect(result.status).toBe(0);
    const expected = [...unitInventory(), 'test/contract/NeighborProviderPort.contract.test.ts'].sort();
    expect(printedTestPaths(result.output)).toEqual(expected);
  });

  it('discovers every supported suffix beneath newly introduced nested directories', () => {
    const directories = ['test/unit', 'test/unit/domain', 'test/unit/domain/services']
      .map((parent) => mkdtempSync(join(repoRoot, parent, 'stable-inventory-fixture-')));
    try {
      const expected = directories.flatMap((directory) => {
        const nested = join(directory, 'new', 'nested');
        mkdirSync(nested, { recursive: true });
        writeFileSync(join(nested, 'ordinary-module.ts'), 'export {};\n');
        return testSuffixes.map((suffix) => {
          const path = join(nested, `fixture${suffix}`);
          writeFileSync(path, 'export {};\n');
          return relative(repoRoot, path).split(sep).join('/');
        });
      });
      const result = runStableUnitTests();
      expect(result.status).toBe(0);
      const selected = printedTestPaths(result.output);
      for (const path of expected) {
        expect(selected.filter((candidate) => candidate === path), path).toHaveLength(1);
      }
      expect(selected.some((path) => path.endsWith('ordinary-module.ts'))).toBe(false);
    } finally {
      for (const directory of directories) { rmSync(directory, { recursive: true }); }
    }
  });

  it('prints resource facts and runs deterministic shards with bounded workers', () => {
    const result = runStableUnitTests();

    expect(result.status).toBe(0);
    expect(result.output).toContain('stable-unit-tests: runner facts');
    expect(result.output).toContain('cpu count: 8');
    expect(result.output).toContain('max workers: 3');
    expect(result.output).toContain('free memory: 2048 MiB');
    expect(result.output).toContain('stable-unit-tests: running shard unit-small-surfaces');
    expect(result.output).toContain('stable-unit-tests: running shard unit-domain-services-subdirs');
    expect(result.output).toContain('test/unit/scripts/run-stable-unit-tests-extension-fixture.test.mts');
    expect(result.output).toContain('--maxWorkers 3');
    expect(result.output).toContain('test/contract/NeighborProviderPort.contract.test.ts');
  });

  it('fails before spawning workers when free memory is below the configured floor', () => {
    const result = runStableUnitTests({ freeMib: '256' });

    expect(result.status).toBe(1);
    expect(result.output).toContain('stable-unit-tests: BLOCKED before spawning Vitest workers');
    expect(result.output).toContain('free memory: 256 MiB');
    expect(result.output).toContain('required free memory: 512 MiB');
    expect(result.output).not.toContain('dry-run node');
  });

  it('keeps targeted invocations bounded without running all shards', () => {
    const result = runStableUnitTests({
      args: ['test/unit/scripts/release-policy-shape.test.ts'],
      maxWorkers: '2',
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain('stable-unit-tests: running targeted bounded Vitest invocation');
    expect(result.output).toContain('--maxWorkers 2 test/unit/scripts/release-policy-shape.test.ts');
    expect(result.output).not.toContain('stable-unit-tests: running shard unit-small-surfaces');
  });
});
