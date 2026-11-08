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
// The runner's own discovery pattern (not Vitest's include): it finds benchmarks anywhere and then refuses misplaced ones.
const testSuffixes = suffixesFor(['test', 'spec', 'benchmark']);
const runnableSuffixes = suffixesFor(['test', 'spec']);
const vitestEntry = join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs');
const listFailureHeadline = 'stable-unit-tests: BLOCKED: `vitest list --filesOnly`';
const blocked = 'stable-unit-tests: BLOCKED:';
const includeQuote = 'vitest.config.ts includes only **/*.{test,spec}.?(c|m)[jt]s?(x) and **/benchmark/*.benchmark.ts.';
const deleteRemedy = 'Rename or move each file to match, or delete it if it is not meant to run.';
const passingTest = "import { expect, it } from 'vitest';\nit('passes', () => { expect(1).toBe(1); });\n";
const markedBenchmark = "import { it } from 'vitest';\nit('must not run', () => { throw new Error('THIS BENCHMARK RAN'); });\n";

function writeFixture(directory: string, name: string, content = 'export {};\n'): string {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, name);
  writeFileSync(path, content);
  return relative(repoRoot, path).split(sep).join('/');
}

function withDirectory(parent: string, prefix: string, body: (directory: string) => void): void {
  const directory = mkdtempSync(join(parent, prefix));
  try { body(directory); } finally { rmSync(directory, { recursive: true }); }
}

const withUnitFixtures = (body: (directory: string) => void) =>
  withDirectory(join(repoRoot, 'test/unit/domain'), 'stable-runner-fixture-', body);

/** Writes a stand-in Vitest entry: it optionally replays the real file list or prints a marker, then ends as told. */
function writeVitestListStub(directory: string, ending: string, options: { readonly replayRealList?: boolean } = {}): string {
  const path = join(directory, 'vitest-list-stub.mjs');
  const replay = options.replayRealList === true
    ? `spawnSync(process.execPath, ['${vitestEntry}', ...process.argv.slice(2)], { stdio: 'inherit' });`
    : "process.stdout.write('STUB STDOUT MARKER\\n');";
  writeFileSync(path, `import { spawnSync } from 'node:child_process';\n${replay}\n${ending}\n`);
  return path;
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
  readonly realRun?: boolean;
  readonly vitestListEntry?: string;
} = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...(options.args ?? [])], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
      WARP_STABLE_TEST_DRY_RUN: options.realRun === true ? '0' : '1',
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

  it('refuses before any shard runs when it selects a file that Vitest does not run', () => withUnitFixtures((directory) => {
    writeFixture(directory, 'Good.test.ts');
    const runnable = writeFixture(join(directory, 'benchmark'), 'Runnable.benchmark.ts');
    const misplaced = suffixesFor(['benchmark']).map((suffix) => writeFixture(directory, `Bad${suffix}`));
    const wrongExtension = suffixesFor(['benchmark']).filter((suffix) => suffix !== '.benchmark.ts')
      .map((suffix) => writeFixture(join(directory, 'benchmark'), `Bad${suffix}`));
    const ignored = [...misplaced, ...wrongExtension];
    const result = runStableUnitTests();
    expect(result.status).toBe(1);
    expect(result.output).toContain(`${blocked} ${ignored.length} selected files are not run by Vitest:`);
    for (const path of ignored) { expect(result.output).toContain(`  ${path}`); }
    expect(result.output).not.toContain(`  ${runnable}`);
    expect(result.output).toContain(includeQuote);
    expect(result.output).toContain(deleteRemedy);
    expect(result.output).not.toContain('stable-unit-tests: running shard');
    expect(result.output).not.toContain('dry-run node');
  }));

  it('lists at most 20 refused files and counts the rest', () => withUnitFixtures((directory) => {
    const ignored = Array.from({ length: 25 }, (_, index) => writeFixture(directory, `Bad${String(index).padStart(2, '0')}.benchmark.ts`));
    const result = runStableUnitTests();
    expect(result.status).toBe(1);
    expect(result.output).toContain(`${blocked} 25 selected files are not run by Vitest:`);
    expect(ignored.filter((path) => result.output.includes(`  ${path}\n`))).toHaveLength(20);
    expect(result.output).toContain('  ...and 5 more');
  }));

  it('refuses when Vitest would run test/unit files that the stable runner never selects', () => withUnitFixtures((directory) => {
    withDirectory(tmpdir(), 'stable-symlink-target-', (outside) => {
      const reverse = writeFixture(directory, 'Rev.test.mtsx');
      writeFileSync(join(outside, 'Sym.test.ts'), 'export {};\n');
      symlinkSync(outside, join(directory, 'linked'), 'dir');
      const linked = `${relative(repoRoot, directory).split(sep).join('/')}/linked/Sym.test.ts`;
      const result = runStableUnitTests();
      expect(result.status).toBe(1);
      expect(result.output).toContain(`${blocked} 2 files under test/unit/ are run by Vitest but never selected by the stable runner:`);
      expect(result.output).toContain(`  ${reverse}`);
      expect(result.output).toContain(`  ${linked}`);
      expect(result.output).toContain('For another extension, rename the file to one of those.');
      expect(result.output).toContain('For a symlinked file or directory, replace the link with the real file or directory.');
      expect(result.output).not.toContain('stable-unit-tests: running shard');
    });
  }));

  it('refuses when vitest list fails even if it printed every runnable file', () => withDirectory(tmpdir(), 'stable-list-stub-', (directory) => {
    const result = runStableUnitTests({
      vitestListEntry: writeVitestListStub(directory, 'process.exit(7);', { replayRealList: true }),
    });
    expect(result.status).toBe(1);
    expect(result.output).toContain(`${listFailureHeadline} exited 7`);
    expect(result.output).toContain('The runner could not learn which files Vitest runs, so no test ran.');
    expect(result.output).not.toContain('stable-unit-tests: running shard');
    expect(result.output).not.toContain(deleteRemedy);
  }));

  it('blames vitest list and shows its output when it exits non-zero', () => withDirectory(tmpdir(), 'stable-list-stub-', (directory) => {
    const result = runStableUnitTests({ vitestListEntry: writeVitestListStub(directory, 'process.exit(3);') });
    expect(result.status).toBe(1);
    expect(result.output).toContain(`${listFailureHeadline} exited 3`);
    expect(result.output).toMatch(/STUB STDOUT MARKER[\s\S]*BLOCKED: `vitest list/);
    expect(result.output).toContain("Vitest's own output is printed above. Fix that failure, then rerun.");
    expect(result.output).not.toContain('judged');
    expect(result.output).not.toContain(deleteRemedy);
  }));

  it('names the signal when vitest list is killed', () => withDirectory(tmpdir(), 'stable-list-stub-', (directory) => {
    const result = runStableUnitTests({
      vitestListEntry: writeVitestListStub(directory, "process.kill(process.pid, 'SIGKILL');"),
    });
    expect(result.status).toBe(1);
    expect(result.output).toContain(`${listFailureHeadline} was killed by signal SIGKILL`);
  }));

  it('names the spawn error when vitest list cannot be run to completion', () => withDirectory(tmpdir(), 'stable-list-stub-', (directory) => {
    const result = runStableUnitTests({
      vitestListEntry: writeVitestListStub(directory, "process.stdout.write('x'.repeat(2 * 1024 * 1024));"),
    });
    expect(result.status).toBe(1);
    expect(result.output).toContain(`${listFailureHeadline} could not be run: spawnSync`);
    expect(result.output).toContain('ENOBUFS');
  }));

  it('accepts a targeted file that Vitest runs', () => withUnitFixtures((directory) => {
    const good = writeFixture(directory, 'Good.test.ts');
    const result = runStableUnitTests({ args: [good] });
    expect(result.status).toBe(0);
    expect(result.output).not.toContain(blocked);
    expect(result.output).toContain(`--maxWorkers 3 ${good}`);
  }));

  it('refuses a targeted file argument that Vitest does not run', () => withUnitFixtures((directory) => {
    const good = writeFixture(directory, 'Good.test.ts');
    const bad = writeFixture(directory, 'Bad.benchmark.ts');
    const result = runStableUnitTests({ args: [good, bad, `./${bad}`] });
    expect(result.status).toBe(1);
    expect(result.output).toContain(`${blocked} 1 named file is not run by Vitest:`);
    expect(result.output).toContain(`  ${bad}`);
    expect(result.output).not.toContain(`  ${good}`);
    expect(result.output).toContain(includeQuote);
    expect(result.output).toContain('Rename or move each file to match, or name a file that Vitest runs.');
    expect(result.output).not.toContain(deleteRemedy);
    expect(result.output).not.toContain('dry-run node');
  }));

  it('refuses a targeted test file that does not exist', () => withUnitFixtures((directory) => {
    const good = writeFixture(directory, 'Good.test.ts');
    const missing = `${relative(repoRoot, directory).split(sep).join('/')}/DoesNotExist.test.ts`;
    const one = runStableUnitTests({ args: [good, missing, 'domain/stable-runner-fixture', 'Good.test.ts'] });
    expect(one.status).toBe(1);
    expect(one.output).toContain(`${blocked} 1 named test file does not exist:`);
    expect(one.output).toContain(`  ${missing}`);
    expect(one.output).not.toContain('  Good.test.ts');
    expect(one.output).toContain('Check the spelling and path; Vitest would have skipped them silently.');
    const two = runStableUnitTests({ args: [good, missing, 'NoSuchName.spec.ts'] });
    expect(two.output).toContain(`${blocked} 2 named test files do not exist:`);
  }));

  it('judges only positional filters, never option values', () => withUnitFixtures((directory) => {
    const good = writeFixture(directory, 'Good.test.ts');
    const bad = writeFixture(directory, 'Bad.benchmark.ts');
    for (const args of [['--config', 'vitest.config.ts', good], ['-t', bad, good], ['-t', 'some name', good]]) {
      const result = runStableUnitTests({ args });
      expect(result.status, args.join(' ')).toBe(0);
      expect(result.output).toContain(`--maxWorkers 3 ${args.join(' ')}`);
    }
  }));

  it('runs a real targeted file and refuses a real ignored one before any test runs', () => withUnitFixtures((directory) => {
    const good = writeFixture(directory, 'Good.test.ts', passingTest);
    const bad = writeFixture(directory, 'Bad.benchmark.ts', markedBenchmark);
    const stub = writeVitestListStub(directory, 'process.exit(3);');
    const passing = runStableUnitTests({ args: [good], realRun: true, vitestListEntry: stub });
    expect(passing.status, passing.output).toBe(0);
    expect(passing.output).toMatch(/Test Files\s+1 passed \(1\)/);
    const refused = runStableUnitTests({ args: [good, bad], realRun: true });
    expect(refused.status).toBe(1);
    expect(refused.output).toContain(`  ${bad}`);
    expect(refused.output).not.toContain('Test Files');
    expect(refused.output).not.toContain('THIS BENCHMARK RAN');
  }));

  it('rejects malformed numeric overrides', () => {
    const workers = runStableUnitTests({ maxWorkers: '0' });
    expect(workers.status).toBe(1);
    expect(workers.output).toContain('stable-unit-tests: WARP_TEST_MAX_WORKERS must be an integer of at least 1, got 0');
    const memory = runStableUnitTests({ freeMib: 'plenty' });
    expect(memory.status).toBe(1);
    expect(memory.output).toContain('stable-unit-tests: WARP_TEST_FAKE_FREE_MB must be an integer of at least 0, got plenty');
  });

  it('discovers every supported suffix beneath newly introduced nested directories', () => {
    const directories = ['test/unit', 'test/unit/domain', 'test/unit/domain/services']
      .map((parent) => mkdtempSync(join(repoRoot, parent, 'stable-inventory-fixture-')));
    try {
      const expected = directories.flatMap((directory) => {
        const nested = join(directory, 'new', 'nested');
        writeFixture(nested, 'ordinary-module.ts');
        return runnableSuffixes.map((suffix) => writeFixture(nested, `fixture${suffix}`));
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

  it('keeps targeted invocations bounded without running all shards', () => withUnitFixtures((directory) => {
    const good = writeFixture(directory, 'Good.test.ts');
    const result = runStableUnitTests({ args: [good], maxWorkers: '2' });

    expect(result.status).toBe(0);
    expect(result.output).toContain('stable-unit-tests: running targeted bounded Vitest invocation');
    expect(result.output).toContain(`--maxWorkers 2 ${good}`);
    expect(result.output).not.toContain('stable-unit-tests: running shard unit-small-surfaces');
  }));
});
