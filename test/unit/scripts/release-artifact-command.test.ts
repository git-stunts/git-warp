import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';

const COMMAND_TIMEOUT_MS = 120_000;
/** Time for the declaration type check that follows the two bounded npm commands. */
const DECLARATION_CHECK_MARGIN_MS = 60_000;
/** The dry-run test runs `npm run build` and `npm pack`; each can use its full command timeout. */
const PACK_DRY_RUN_TEST_TIMEOUT_MS = 2 * COMMAND_TIMEOUT_MS + DECLARATION_CHECK_MARGIN_MS;
const V18_TO_V19_PREFIX = 'dist/scripts/v18-to-v19/';
const V20_TO_V21_PREFIX = 'dist/scripts/v20-to-v21/';

/** The package entry points whose declarations PublicSurfaceScanner reads from the shared dist/. */
const DECLARATION_ROOTS: readonly string[] = ['index', 'advanced', 'diagnostics', 'charts', 'testing'];
/** The shared dist/ directory and the declaration roots; the isolated build must leave all of them unchanged. */
const SHARED_SURFACE_PATHS: readonly string[] = ['dist', ...DECLARATION_ROOTS.map((name) => `dist/${name}.d.ts`)];

/**
 * Top-level names (only) that the private copy leaves out:
 * - `node_modules`: linked back to the shared install, not copied.
 * - `dist`: the private build deletes and rebuilds it.
 * - `test`: `tsconfig.publish.json` excludes it from the build, and sibling tests
 *   (for example `run-stable-unit-tests.test.ts`) create and delete fixture
 *   directories under it while this copy runs.
 * - `.git` and `coverage`: the build and the pack never read them.
 */
const UNCOPIED_ROOT_ENTRIES: ReadonlySet<string> = new Set(['node_modules', 'dist', 'test', '.git', 'coverage']);

const isolatedTrees: string[] = [];

afterEach(() => {
  for (const tree of isolatedTrees.splice(0)) rmSync(tree, { recursive: true, force: true });
});

type CommandRunner = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding
) => SpawnSyncReturns<string>;

type SpawnCall = {
  readonly command: string;
  readonly args: readonly string[];
  readonly timeout: SpawnSyncOptionsWithStringEncoding['timeout'];
  readonly killSignal: SpawnSyncOptionsWithStringEncoding['killSignal'];
};

type PackSectionName = 'Tarball Contents' | 'Tarball Details';

/** Executes npm without a shell, preserving argument boundaries. */
const defaultCommandRunner: CommandRunner = (command, args, options) =>
  spawnSync(command, [...args], options);

/** Runs a bounded npm command and requires successful process completion. */
function runNpmCommand(
  args: readonly string[],
  cwd: string,
  runner: CommandRunner = defaultCommandRunner
): string {
  const result = runner('npm', [...args], {
    cwd,
    encoding: 'utf8',
    timeout: COMMAND_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  return `${result.stdout}\n${result.stderr}`;
}

/**
 * Copies the package sources into a private directory (#1081). `npm run build`
 * deletes dist/ and then rebuilds it during the whole tsc compile. In the shared
 * tree, `public-surface-package.test.ts` (through PublicSurfaceScanner) reads
 * dist/ in a parallel worker and then finds no declaration surface. Pass `tree`,
 * never the repository root, to the build, the declaration roots and the
 * relative paths.
 *
 * The `node_modules` link is read-only for this test: tsc resolves it to the
 * shared install's real paths, which fall outside `tree` and so outside the
 * `dist/` filter below, and npm pack never packs `node_modules`.
 */
function isolatedPackageTree(): string {
  const root = resolve('.');
  const tree = mkdtempSync(join(tmpdir(), 'git-warp-release-artifact-'));
  isolatedTrees.push(tree);
  cpSync(root, tree, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (source) => !UNCOPIED_ROOT_ENTRIES.has(relative(root, source)),
  });
  symlinkSync(join(root, 'node_modules'), join(tree, 'node_modules'), 'dir');
  return tree;
}

/** Builds a clean publish tree before inspecting npm’s dry-run inventory. */
function runNpmPackDryRun(tree: string): string {
  runNpmCommand(['run', 'build', '--silent'], tree);
  return runNpmCommand(['pack', '--dry-run', '--ignore-scripts', '--no-json'], tree);
}

/** Extracts only file paths from the npm tarball-contents section. */
function packEntries(output: string): ReadonlySet<string> {
  const lines = output.split('\n');
  const start = lines.findIndex((line) => isPackSectionHeader(line, 'Tarball Contents'));
  if (start < 0) {
    return new Set();
  }
  const following = lines.slice(start + 1);
  const end = following.findIndex((line) => isPackSectionHeader(line, 'Tarball Details'));
  const contents = end < 0 ? following : following.slice(0, end);
  return new Set(contents.flatMap(packEntryPaths));
}

/** Recognizes both plain and decorated npm notice section headers. */
function isPackSectionHeader(line: string, sectionName: PackSectionName): boolean {
  const normalizedHeader = line.replaceAll('=', '').replace(/\s+/gu, ' ').trim();
  return line.includes(sectionName) && normalizedHeader === `npm notice ${sectionName}`;
}

/** Reads one npm inventory row as zero or one paths, ignoring unrelated output. */
function packEntryPaths(line: string): readonly string[] {
  const entry = /^npm notice\s+\S+\s+(.+)$/u.exec(line)?.[1];
  return entry === undefined ? [] : [entry];
}

/** Admits only JavaScript modules that sit directly in a migration directory. */
function isTopLevelJavaScript(relativePath: string): boolean {
  return !relativePath.includes('/') && relativePath.endsWith('.js');
}

/**
 * Admits the packed migration modules: top-level JavaScript in v20-to-v21, and
 * top-level JavaScript plus the adapters subtree in v18-to-v19.
 */
function isSupportedMigrationArtifact(path: string): boolean {
  if (path.startsWith(V20_TO_V21_PREFIX)) {
    return isTopLevelJavaScript(path.slice(V20_TO_V21_PREFIX.length));
  }
  if (!path.startsWith(V18_TO_V19_PREFIX)) {
    return false;
  }
  const relativePath = path.slice(V18_TO_V19_PREFIX.length);
  return relativePath.startsWith('adapters/') || isTopLevelJavaScript(relativePath);
}

/** Names one file's inode and modification time, so replacing the file is observable. */
function fileIdentity(path: string): string {
  const stat = statSync(path, { bigint: true });
  return `${stat.ino}:${stat.mtimeNs}`;
}

/** Creates a completed process result for the command timeout regression. */
function successfulSpawnResult(stdout: string): SpawnSyncReturns<string> {
  return {
    pid: 0,
    output: [null, stdout, ''],
    stdout,
    stderr: '',
    status: 0,
    signal: null,
  };
}

describe('release artifact command evidence', () => {
  it('bounds npm subprocesses with a timeout', () => {
    const calls: SpawnCall[] = [];
    const recordingRunner: CommandRunner = (command, args, options) => {
      calls.push({
        command,
        args: [...args],
        timeout: options.timeout,
        killSignal: options.killSignal,
      });
      return successfulSpawnResult('10.0.0\n');
    };

    runNpmCommand(['--version'], resolve('.'), recordingRunner);

    expect(calls).toEqual([
      {
        command: 'npm',
        args: ['--version'],
        timeout: COMMAND_TIMEOUT_MS,
        killSignal: 'SIGKILL',
      },
    ]);
  });

  it('parses decorated npm pack section headers', () => {
    const entries = packEntries(
      [
        'npm notice === Tarball Contents ===',
        'npm notice 1.2kB dist/index.js',
        'npm notice === Tarball Details ===',
        'npm notice name: @git-stunts/git-warp',
      ].join('\n')
    );

    expect(entries).toEqual(new Set(['dist/index.js']));
  });

  it('reads no rows when the contents header is absent', () => {
    expect(packEntries('npm notice 1.2kB dist/index.js')).toEqual(new Set());
  });

  it('reads every inventory row after the contents header when details are absent', () => {
    expect(packEntries('npm notice Tarball Contents\nnpm notice\nnpm notice 1.2kB dist/index.js'))
      .toEqual(new Set(['dist/index.js']));
  });

  it('dry-runs the packed npm artifact and exposes the compiled public surface', () => {
    expect(existsSync(resolve('dist/index.d.ts')), 'docker/Dockerfile.node22-slim builds the shared dist/ this guard reads')
      .toBe(true);
    const sharedIdentities = SHARED_SURFACE_PATHS.map((path) => fileIdentity(resolve(path)));
    const tree = isolatedPackageTree();
    expect(existsSync(join(tree, 'test')), 'the private copy must leave out the churned test/ tree').toBe(false);
    const entries = packEntries(runNpmPackDryRun(tree));
    expect(SHARED_SURFACE_PATHS.map((path) => fileIdentity(resolve(path))),
      'the build must not replace the shared dist/ that sibling tests read').toEqual(sharedIdentities);
    const roots = DECLARATION_ROOTS.map((name) => resolve(tree, `dist/${name}.d.ts`));
    const declarations = ts.createProgram(roots, {
      module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: false, noEmit: true, target: ts.ScriptTarget.ESNext, strict: true,
    });
    expect(ts.getPreEmitDiagnostics(declarations)).toEqual([]);
    const requiredDeclarations = declarations.getSourceFiles()
      .map((file) => relative(tree, file.fileName).split('\\').join('/'))
      .filter((path) => path.startsWith('dist/'));
    expect([...entries].filter((path) => path.endsWith('.d.ts')).sort())
      .toEqual(requiredDeclarations.sort());

    const compiledTests = [...entries].filter((entry) => entry.startsWith('dist/test/'));
    const withheldDocumentation = [...entries].filter(
      (entry) =>
        entry === 'CHANGELOG.md' ||
        entry.startsWith('docs/topics/') ||
        entry.startsWith('docs/operations/')
    );
    const unrelatedCompiledScripts = [...entries].filter(
      (entry) =>
        entry.startsWith('dist/scripts/') &&
        !isSupportedMigrationArtifact(entry) &&
        !entry.startsWith('dist/scripts/migrations/v17.0.0/') &&
        entry !== 'dist/scripts/formatFailure.js' &&
        entry !== 'dist/scripts/upgrade-v16-to-v17.js'
    );
    const implementationNonJavaScript = [...entries].filter(
      (entry) =>
        (entry.startsWith('dist/bin/') || entry.startsWith('dist/scripts/')) &&
        !entry.endsWith('.js')
    );

    expect(entries.has('dist/index.js')).toBe(true);
    expect(entries.has('dist/index.d.ts')).toBe(true);
    expect(entries.has('dist/scripts/upgrade-v16-to-v17.js')).toBe(true);
    expect(entries.has('dist/scripts/upgrade-v16-to-v17.d.ts')).toBe(false);
    expect(entries.has('dist/scripts/v18-to-v19/migrate.js')).toBe(true);
    expect(entries.has('dist/scripts/v18-to-v19/migrate.d.ts')).toBe(false);
    expect(entries.has('dist/scripts/v20-to-v21/migrate.js')).toBe(true);
    expect(entries.has('dist/bin/git-warp.d.ts')).toBe(false);
    expect(implementationNonJavaScript).toEqual([]);
    expect(entries.has('dist/browser.js')).toBe(false);
    expect(entries.has('dist/browser.d.ts')).toBe(false);
    expect(entries.has('dist/legacy.js')).toBe(false);
    expect(entries.has('dist/legacy.d.ts')).toBe(false);
    expect(entries.has('dist/rootCompatibility.js')).toBe(false);
    expect(entries.has('dist/rootCompatibility.d.ts')).toBe(false);
    expect(entries.has('dist/bin/git-warp.js')).toBe(true);
    expect(entries.has('bin/git-warp')).toBe(true);
    expect(entries.has('dist/bin/warp-graph.js')).toBe(false);
    expect(entries.has('README.md')).toBe(true);
    expect(entries.has('docs/migrations/v19/README.md')).toBe(true);
    expect(entries.has('docs/migrations/v21/README.md')).toBe(true);
    expect(entries.has('docs/READINGS_AND_OPTICS.md')).toBe(true);
    expect(entries.has('LICENSE')).toBe(true);
    expect(entries.has('NOTICE')).toBe(true);
    expect(withheldDocumentation).toEqual([]);
    expect(entries.has('CHANGELOG.md')).toBe(false);
    expect(entries.has('docs/topics/README.md')).toBe(false);
    expect(entries.has('docs/operations/package-payload.md')).toBe(false);
    expect(compiledTests).toEqual([]);
    expect(unrelatedCompiledScripts).toEqual([]);
    expect(entries.has('docs/ANTI_SLUDGE_POLICY.md')).toBe(false);
    expect(entries.has('docs/plans/streaming-indexed-recursive-warp.md')).toBe(false);
    expect(entries.has('docs/GUIDE.md')).toBe(false);
    expect(entries.has('src/domain/RuntimeHost.ts')).toBe(false);
    expect(entries.has('.github/maintainers')).toBe(false);
  }, PACK_DRY_RUN_TEST_TIMEOUT_MS);
});
