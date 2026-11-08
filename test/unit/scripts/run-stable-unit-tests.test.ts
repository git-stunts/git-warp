import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const scriptPath = fileURLToPath(new URL('../../../scripts/run-stable-unit-tests.ts', import.meta.url));
const extensions = ['js', 'jsx', 'ts', 'tsx', 'mjs', 'mts', 'cjs', 'cts'];
const suffixesFor = (kinds: readonly string[]) =>
  kinds.flatMap((kind) => extensions.map((extension) => `.${kind}.${extension}`));
const testSuffixes = suffixesFor(['test', 'spec', 'benchmark']);
const runnableSuffixes = suffixesFor(['test', 'spec']);
const vitestEntry = join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs');
const listFailureHeadline = 'stable-unit-tests: BLOCKED: `vitest list --filesOnly` exited';
const ignoredHeadline = 'stable-unit-tests: BLOCKED:';
const unselectedHeadline = 'run by Vitest but never selected by the stable runner:';
const renameRemedy = 'Rename or move each file to match, or delete it if it is not meant to run.';
const goodTarget = 'test/unit/scripts/release-policy-shape.test.ts';

/** Writes a stand-in Vitest entry that optionally replays the real file list, then exits with a status. */
function writeVitestListStub(directory: string, options: { readonly replayRealList: boolean; readonly status: number }): string {
  const path = join(directory, `vitest-list-stub-${options.status}.mjs`);
  const replay = options.replayRealList
    ? `spawnSync(process.execPath, ['${vitestEntry}', ...process.argv.slice(2)], { stdio: 'inherit' });`
    : '';
  writeFileSync(path, `import { spawnSync } from 'node:child_process';\n${replay}\nprocess.exit(${options.status});\n`);
  return path;
}

function writeFixture(directory: string, name: string): string {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, name);
  writeFileSync(path, 'export {};\n');
  return relative(repoRoot, path).split(sep).join('/');
}

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
  readonly vitestListEntry?: string;
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
      ...(options.vitestListEntry === undefined ? {} : { WARP_TEST_FAKE_VITEST_LIST_ENTRY: options.vitestListEntry }),
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

  it('refuses before any shard runs when it selects a file that Vitest does not run', () => {
    const directory = mkdtempSync(join(repoRoot, 'test/unit/domain', 'stable-ignored-fixture-'));
    try {
      writeFixture(directory, 'Good.test.ts');
      const runnable = writeFixture(join(directory, 'benchmark'), 'Runnable.benchmark.ts');
      const misplaced = suffixesFor(['benchmark']).map((suffix) => writeFixture(directory, `Bad${suffix}`));
      const wrongExtension = suffixesFor(['benchmark']).filter((suffix) => suffix !== '.benchmark.ts')
        .map((suffix) => writeFixture(join(directory, 'benchmark'), `Bad${suffix}`));
      const ignored = [...misplaced, ...wrongExtension];
      const result = runStableUnitTests();
      expect(result.status).toBe(1);
      expect(result.output).toContain(`${ignoredHeadline} ${ignored.length} selected files are not run by Vitest:`);
      for (const path of ignored) { expect(result.output).toContain(`  ${path}`); }
      expect(result.output).not.toContain(`  ${runnable}`);
      expect(result.output).toContain('vitest.config.ts runs only *.test.* / *.spec.* files and benchmark/*.benchmark.ts.');
      expect(result.output).toContain(renameRemedy);
      expect(result.output).not.toContain('stable-unit-tests: running shard');
      expect(result.output).not.toContain('dry-run node');
    } finally {
      rmSync(directory, { recursive: true });
    }
  });

  it('refuses when Vitest would run test/unit files that the stable runner never selects', () => {
    const directory = mkdtempSync(join(repoRoot, 'test/unit/domain', 'stable-unselected-fixture-'));
    const outside = mkdtempSync(join(tmpdir(), 'stable-symlink-target-'));
    try {
      const reverse = writeFixture(directory, 'Rev.test.mtsx');
      writeFileSync(join(outside, 'Sym.test.ts'), 'export {};\n');
      symlinkSync(outside, join(directory, 'linked'), 'dir');
      const linked = `${relative(repoRoot, directory).split(sep).join('/')}/linked/Sym.test.ts`;
      const result = runStableUnitTests();
      expect(result.status).toBe(1);
      expect(result.output).toContain(`${ignoredHeadline} 2 files under test/unit/ are ${unselectedHeadline}`);
      expect(result.output).toContain(`  ${reverse}`);
      expect(result.output).toContain(`  ${linked}`);
      expect(result.output).not.toContain('stable-unit-tests: running shard');
    } finally {
      rmSync(directory, { recursive: true });
      rmSync(outside, { recursive: true });
    }
  });

  it('refuses when vitest list fails even if it printed every runnable file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'stable-vitest-list-stub-'));
    try {
      const result = runStableUnitTests({
        vitestListEntry: writeVitestListStub(directory, { replayRealList: true, status: 7 }),
      });
      expect(result.status).toBe(1);
      expect(result.output).toContain(`${listFailureHeadline} 7`);
      expect(result.output).not.toContain('stable-unit-tests: running shard');
      expect(result.output).not.toContain(renameRemedy);
    } finally {
      rmSync(directory, { recursive: true });
    }
  });

  it('blames vitest list rather than the test files when it fails with no output', () => {
    const directory = mkdtempSync(join(tmpdir(), 'stable-vitest-list-stub-'));
    try {
      const result = runStableUnitTests({
        vitestListEntry: writeVitestListStub(directory, { replayRealList: false, status: 3 }),
      });
      expect(result.status).toBe(1);
      expect(result.output).toContain(`${listFailureHeadline} 3`);
      expect(result.output).toContain('No test file was judged; its error output is printed above.');
      expect(result.output).not.toContain(renameRemedy);
      expect(result.output).not.toContain(goodTarget);
    } finally {
      rmSync(directory, { recursive: true });
    }
  });

  it('refuses a targeted file argument that Vitest does not run', () => {
    const directory = mkdtempSync(join(repoRoot, 'test/unit/domain', 'stable-targeted-fixture-'));
    try {
      const bad = writeFixture(directory, 'Bad.benchmark.ts');
      const result = runStableUnitTests({ args: [goodTarget, bad] });
      expect(result.status).toBe(1);
      expect(result.output).toContain(`${ignoredHeadline} 1 selected file is not run by Vitest:`);
      expect(result.output).toContain(`  ${bad}`);
      expect(result.output).not.toContain(`  ${goodTarget}`);
      expect(result.output).not.toContain('dry-run node');
    } finally {
      rmSync(directory, { recursive: true });
    }
  });

  it('passes targeted filters and flags through untouched', () => {
    const result = runStableUnitTests({ args: ['-t', 'some name', goodTarget] });
    expect(result.status).toBe(0);
    expect(result.output).toContain('stable-unit-tests: running targeted bounded Vitest invocation');
    expect(result.output).toContain(`--maxWorkers 3 -t some name ${goodTarget}`);
  });

  it('discovers every supported suffix beneath newly introduced nested directories', () => {
    const directories = ['test/unit', 'test/unit/domain', 'test/unit/domain/services']
      .map((parent) => mkdtempSync(join(repoRoot, parent, 'stable-inventory-fixture-')));
    try {
      const expected = directories.flatMap((directory) => {
        const nested = join(directory, 'new', 'nested');
        mkdirSync(nested, { recursive: true });
        writeFileSync(join(nested, 'ordinary-module.ts'), 'export {};\n');
        return runnableSuffixes.map((suffix) => {
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

  it('selects every cone runtime test and the entity admission inventory test exactly once', () => {
    const result = runStableUnitTests();
    expect(result.status).toBe(0);
    const coneDirectory = 'test/unit/domain/services/cone/';
    const coneFiles = readdirSync(new URL(`../../../${coneDirectory}`, import.meta.url))
      .filter((name) => name.endsWith('.test.ts')).map((name) => `${coneDirectory}${name}`);
    expect(coneFiles.length).toBeGreaterThan(0);
    const expected = [...coneFiles, 'test/unit/domain/entity/ConeEntityAdmissionInventory.test.ts'];
    const argumentsPrinted = result.output.split(/\s+/);
    for (const path of expected) {
      expect(argumentsPrinted.filter((argument) => argument === path), path).toHaveLength(1);
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
