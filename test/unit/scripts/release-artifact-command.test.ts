import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const COMMAND_TIMEOUT_MS = 120_000;
/** Time for the copy and the two dist/ snapshots that the build hook does around its two npm commands. */
const COPY_AND_SNAPSHOT_MARGIN_MS = 60_000;
/**
 * The `beforeAll` build hook does the copy, `npm run build`, `npm pack` and the
 * two dist/ snapshots. This explicit value replaces Vitest's default
 * `hookTimeout` (10 s; `vitest.config.ts` does not set `hookTimeout`), which the
 * build alone exceeds. Each npm command is bounded by its own `spawnSync`
 * timeout, and those are the only real bounds. Vitest cannot interrupt this
 * synchronous work; it compares the elapsed time only after the hook returns.
 * So this value is an after-the-fact verdict, sized so that a hook whose npm
 * commands stayed inside their own timeouts never fails on time. The
 * declaration type check is not in the hook: it runs in its own `it` under the
 * project `testTimeout` (60 s).
 */
const ISOLATED_BUILD_TIMEOUT_MS = 2 * COMMAND_TIMEOUT_MS + COPY_AND_SNAPSHOT_MARGIN_MS;
const V18_TO_V19_PREFIX = 'dist/scripts/v18-to-v19/';
const V20_TO_V21_PREFIX = 'dist/scripts/v20-to-v21/';

/** The package entry points whose declarations PublicSurfaceScanner reads first from the shared dist/. */
const DECLARATION_ROOTS: readonly string[] = ['index', 'advanced', 'diagnostics', 'charts', 'testing'];
/** The shared dist/ entries that must exist before the guard can take its snapshot. */
const SHARED_DIST_PRECONDITION_PATHS: readonly string[] = [
  'dist',
  ...DECLARATION_ROOTS.map((name) => `dist/${name}.d.ts`),
];
const MISSING_SHARED_DIST = 'the shared dist/ lacks the listed paths, so the guard has no surface to protect. '
  + 'The test image builds it (docker/Dockerfile.node22-slim: RUN npm run build --silent); '
  + 'run this file through scripts/run-in-docker.sh';

/**
 * Top-level names (only) that the private copy leaves out. Nested names with
 * the same spelling are copied; the test image has no nested `node_modules` or
 * `dist` under the copied sources.
 * - `node_modules`: linked back to the shared install, not copied.
 * - `dist`: the private build deletes and rebuilds it.
 * - `test`: sibling tests (for example `run-stable-unit-tests.test.ts`) create
 *   and delete fixture directories under it while this copy runs. A Docker pilot
 *   in #1094 had 10 of 30 whole-tree copies fail with ENOENT under that churn,
 *   and 0 of 30 with `test` left out. `tsconfig.publish.json` does not include
 *   `test`, but its `exclude` only trims the `include` globs. If production code
 *   ever imports test code, the build in the copy fails with a module-resolution
 *   error from `npm run build`, instead of a `dist/test/` entry in the packed
 *   inventory check.
 * - `.git` and `coverage`: the build and the pack never read them.
 *
 * What the build and pack need from the copy: `package.json`, the `tsconfig.*.json`
 * files, the entry `.ts` files, `src/`, `bin/`, `scripts/` (which holds the
 * package-payload prune steps), the `packages/` workspaces, and the `files`
 * entries of `package.json` (`README.md`, `LICENSE`, `NOTICE`, `docs/migrations/`
 * and `docs/READINGS_AND_OPTICS.md`). Everything else is copied only because a
 * denylist is simpler than keeping an allowlist in step with `package.json`.
 * The copy is about 15 MB and takes well under a second in the test image;
 * the tsc compile takes most of this test's time.
 */
const UNCOPIED_ROOT_ENTRIES: ReadonlySet<string> = new Set(['node_modules', 'dist', 'test', '.git', 'coverage']);

/** Temporary trees made by this file; the one file-level `afterAll` removes them, also after a failed copy or build. */
const isolatedTrees: string[] = [];

afterAll(() => {
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
 * `verbatimSymlinks` keeps each symlink in the sources as a symlink with its
 * original target. Without it, `cpSync` rewrites relative targets to absolute
 * paths into the shared tree.
 *
 * The build and the pack must not write under `node_modules`. The link is not
 * write-protected, so such a write would reach the shared install. Reads through
 * it are safe: tsc resolves the link to the shared install's real paths, which
 * fall outside `tree`, so the dry-run test's `startsWith('dist/')` filter on
 * declaration source files drops them; and npm pack never packs `node_modules`.
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

/**
 * Extracts only file paths from the npm tarball-contents section: the rows after
 * the first contents header and before the first details header, without any
 * repeated contents header.
 */
function packEntries(output: string): ReadonlySet<string> {
  const lines = output.split('\n');
  const end = lines.findIndex((line) => isPackSectionHeader(line, 'Tarball Details'));
  const beforeDetails = end < 0 ? lines : lines.slice(0, end);
  const start = beforeDetails.findIndex((line) => isPackSectionHeader(line, 'Tarball Contents'));
  if (start < 0) {
    return new Set();
  }
  const rows = beforeDetails.slice(start + 1).filter((line) => !isPackSectionHeader(line, 'Tarball Contents'));
  return new Set(rows.flatMap(packEntryPaths));
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

/**
 * Names one entry without reading the clock: a regular file by its inode, size
 * and a SHA-256 of its content; a directory by its inode and the sorted names
 * it holds; any other kind (for example a FIFO, which a read would block on) by
 * its inode and mode only. Replacing a file changes its inode, and rewriting it
 * changes its digest, even when the writer keeps the size and restores the mtime.
 */
function entryIdentity(path: string): string {
  const stat = statSync(path, { bigint: true });
  if (stat.isDirectory()) {
    return `${stat.ino}:dir:${readdirSync(path).sort().join('/')}`;
  }
  if (!stat.isFile()) {
    return `${stat.ino}:special:${stat.mode}`;
  }
  return `${stat.ino}:${stat.size}:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

/** Lists the precondition paths that the shared dist/ under `root` lacks. */
function missingSharedDistPaths(root: string): readonly string[] {
  return SHARED_DIST_PRECONDITION_PATHS.filter((path) => !existsSync(join(root, path)));
}

/**
 * Snapshots every entry under a directory, the directory included. Over the
 * shared dist/ this covers all that PublicSurfaceScanner reads there: the
 * declaration roots, their `dist/src/**` import closure and the `.js` export
 * targets. Two snapshots differ when an entry was added, removed, replaced or
 * rewritten between them. They see only the net change between the two
 * snapshots: a change that is undone before the second snapshot leaves no
 * trace. See `entryIdentity` for what each line records.
 */
function treeIdentities(directory: string): readonly string[] {
  return ['.', ...readdirSync(directory, { encoding: 'utf8', recursive: true })]
    .sort()
    .map((entry) => `${entry} ${entryIdentity(join(directory, entry))}`);
}

/**
 * The evidence of one private build and pack, taken around snapshots of the
 * shared dist/. The record and its arrays are frozen at runtime; the packed
 * inventory is reachable only through the frozen `entryPaths` and `hasEntry`.
 */
class IsolatedPackRun {
  readonly tree: string;
  readonly copiedTestTree: boolean;
  readonly sharedBefore: readonly string[];
  readonly sharedAfter: readonly string[];
  readonly entryPaths: readonly string[];
  readonly #entrySet: ReadonlySet<string>;

  constructor(fields: {
    readonly tree: string;
    readonly copiedTestTree: boolean;
    readonly sharedBefore: readonly string[];
    readonly sharedAfter: readonly string[];
    readonly entryPaths: Iterable<string>;
  }) {
    this.tree = fields.tree;
    this.copiedTestTree = fields.copiedTestTree;
    this.sharedBefore = Object.freeze([...fields.sharedBefore]);
    this.sharedAfter = Object.freeze([...fields.sharedAfter]);
    this.entryPaths = Object.freeze([...fields.entryPaths]);
    this.#entrySet = new Set(this.entryPaths);
    Object.freeze(this);
  }

  /** Says whether the packed npm inventory holds the path. */
  hasEntry(path: string): boolean {
    return this.#entrySet.has(path);
  }

  /** Checks the shared dist/ exists, snapshots it, builds and packs in a private copy, and snapshots it again. */
  static execute(): IsolatedPackRun {
    expect(missingSharedDistPaths(resolve('.')), MISSING_SHARED_DIST).toEqual([]);
    const sharedBefore = treeIdentities(resolve('dist'));
    const tree = isolatedPackageTree();
    const copiedTestTree = existsSync(join(tree, 'test'));
    const entryPaths = packEntries(runNpmPackDryRun(tree));
    const sharedAfter = treeIdentities(resolve('dist'));
    return new IsolatedPackRun({ tree, copiedTestTree, sharedBefore, sharedAfter, entryPaths });
  }
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

  it('stops at the first details header even when it comes before the contents header', () => {
    expect(packEntries('npm notice Tarball Details\nnpm notice Tarball Contents\nnpm notice 1.2kB dist/index.js'))
      .toEqual(new Set());
  });

  it('skips a repeated contents header instead of reading it as a row', () => {
    expect(packEntries([
      'npm notice === Tarball Contents ===',
      'npm notice === Tarball Contents ===',
      'npm notice 1.2kB dist/index.js',
    ].join('\n'))).toEqual(new Set(['dist/index.js']));
  });

  it.each([
    ['dist/scripts/v20-to-v21/migrate.js', true],
    ['dist/scripts/v20-to-v21/nested/migrate.js', false],
    ['dist/scripts/v20-to-v21/migrate.d.ts', false],
    ['dist/scripts/v20-to-v21/adapters/X.js', false],
    ['dist/scripts/v18-to-v19/adapters/GitAdapter.js', true],
    ['dist/scripts/v18-to-v19/migrate.js', true],
    ['dist/scripts/v18-to-v19/performance/Run.js', false],
    ['dist/scripts/v18-to-v19/x/adapters/Y.js', false],
    ['dist/scripts/other/migrate.js', false],
  ])('admits %s as a packed migration module: %s', (path, admitted) => {
    expect(isSupportedMigrationArtifact(path)).toBe(admitted);
  });
});

describe('shared dist/ guard helpers', () => {
  it('lists each precondition path that the shared dist/ lacks', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-warp-dist-precondition-'));
    isolatedTrees.push(root);
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist/index.d.ts'), 'export {};\n');
    expect(missingSharedDistPaths(root))
      .toEqual(['dist/advanced.d.ts', 'dist/diagnostics.d.ts', 'dist/charts.d.ts', 'dist/testing.d.ts']);
  });

  it('changes the snapshot for a same-size in-place rewrite and the directory identity for a child rename', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-warp-tree-identities-'));
    isolatedTrees.push(root);
    mkdirSync(join(root, 'sub'));
    writeFileSync(join(root, 'a.txt'), 'abc');
    writeFileSync(join(root, 'sub/b.txt'), 'xyz');
    const before = treeIdentities(root);
    writeFileSync(join(root, 'a.txt'), 'abd');
    expect(treeIdentities(root), 'a same-size rewrite must change the snapshot').not.toEqual(before);
    const directoryBefore = entryIdentity(join(root, 'sub'));
    renameSync(join(root, 'sub/b.txt'), join(root, 'sub/c.txt'));
    expect(entryIdentity(join(root, 'sub')), 'a child rename must change the directory identity')
      .not.toBe(directoryBefore);
  });

  it('names non-regular entries by kind, a same-content replacement by inode, a symlinked file by its target', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-warp-tree-identities-'));
    isolatedTrees.push(root);
    writeFileSync(join(root, 'a.txt'), 'abc');
    symlinkSync('/dev/null', join(root, 'device'));
    symlinkSync(join(root, 'a.txt'), join(root, 'alias'));
    expect(entryIdentity(join(root, 'device')), 'a non-regular entry is named by inode and mode, not read')
      .toMatch(/^\d+:special:\d+$/);
    const fileBefore = entryIdentity(join(root, 'a.txt'));
    const aliasBefore = entryIdentity(join(root, 'alias'));
    writeFileSync(join(root, 'a.txt'), 'abd');
    expect(entryIdentity(join(root, 'alias')), 'a symlinked file is named by its target').not.toBe(aliasBefore);
    writeFileSync(join(root, 'next.txt'), 'abc');
    renameSync(join(root, 'next.txt'), join(root, 'a.txt'));
    expect(entryIdentity(join(root, 'a.txt')).split(':')[2], 'same content').toBe(fileBefore.split(':')[2]);
    expect(entryIdentity(join(root, 'a.txt')), 'a same-content replacement must change the identity').not.toBe(fileBefore);
  });
});

describe('isolated release build (#1081)', () => {
  let run: IsolatedPackRun;

  beforeAll(() => {
    run = IsolatedPackRun.execute();
  }, ISOLATED_BUILD_TIMEOUT_MS);

  it('#1081: builds in a private copy without test/ and leaves every entry of the shared dist/ unchanged', () => {
    expect(run.copiedTestTree, 'the private copy must leave out the churned test/ tree').toBe(false);
    expect(run.sharedAfter, 'the build must not add, remove, replace or rewrite any entry of the shared dist/ '
      + 'that PublicSurfaceScanner reads').toEqual(run.sharedBefore);
  });

  it('dry-runs the packed npm artifact and exposes the compiled public surface', () => {
    const { tree, entryPaths } = run;
    const roots = DECLARATION_ROOTS.map((name) => resolve(tree, `dist/${name}.d.ts`));
    const declarations = ts.createProgram(roots, {
      module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: false, noEmit: true, target: ts.ScriptTarget.ESNext, strict: true,
    });
    expect(ts.getPreEmitDiagnostics(declarations)).toEqual([]);
    const requiredDeclarations = declarations.getSourceFiles()
      .map((file) => relative(tree, file.fileName).split('\\').join('/'))
      .filter((path) => path.startsWith('dist/'));
    expect(entryPaths.filter((path) => path.endsWith('.d.ts')).sort())
      .toEqual(requiredDeclarations.sort());

    const compiledTests = entryPaths.filter((entry) => entry.startsWith('dist/test/'));
    const withheldDocumentation = entryPaths.filter(
      (entry) =>
        entry === 'CHANGELOG.md' ||
        entry.startsWith('docs/topics/') ||
        entry.startsWith('docs/operations/')
    );
    const unrelatedCompiledScripts = entryPaths.filter(
      (entry) =>
        entry.startsWith('dist/scripts/') &&
        !isSupportedMigrationArtifact(entry) &&
        !entry.startsWith('dist/scripts/migrations/v17.0.0/') &&
        entry !== 'dist/scripts/formatFailure.js' &&
        entry !== 'dist/scripts/upgrade-v16-to-v17.js'
    );
    const implementationNonJavaScript = entryPaths.filter(
      (entry) =>
        (entry.startsWith('dist/bin/') || entry.startsWith('dist/scripts/')) &&
        !entry.endsWith('.js')
    );

    expect(run.hasEntry('dist/index.js')).toBe(true);
    expect(run.hasEntry('dist/index.d.ts')).toBe(true);
    expect(run.hasEntry('dist/scripts/upgrade-v16-to-v17.js')).toBe(true);
    expect(run.hasEntry('dist/scripts/upgrade-v16-to-v17.d.ts')).toBe(false);
    expect(run.hasEntry('dist/scripts/v18-to-v19/migrate.js')).toBe(true);
    expect(run.hasEntry('dist/scripts/v18-to-v19/migrate.d.ts')).toBe(false);
    expect(run.hasEntry('dist/scripts/v20-to-v21/migrate.js')).toBe(true);
    expect(run.hasEntry('dist/bin/git-warp.d.ts')).toBe(false);
    expect(implementationNonJavaScript).toEqual([]);
    expect(run.hasEntry('dist/browser.js')).toBe(false);
    expect(run.hasEntry('dist/browser.d.ts')).toBe(false);
    expect(run.hasEntry('dist/legacy.js')).toBe(false);
    expect(run.hasEntry('dist/legacy.d.ts')).toBe(false);
    expect(run.hasEntry('dist/rootCompatibility.js')).toBe(false);
    expect(run.hasEntry('dist/rootCompatibility.d.ts')).toBe(false);
    expect(run.hasEntry('dist/bin/git-warp.js')).toBe(true);
    expect(run.hasEntry('bin/git-warp')).toBe(true);
    expect(run.hasEntry('dist/bin/warp-graph.js')).toBe(false);
    expect(run.hasEntry('README.md')).toBe(true);
    expect(run.hasEntry('docs/migrations/v19/README.md')).toBe(true);
    expect(run.hasEntry('docs/migrations/v21/README.md')).toBe(true);
    expect(run.hasEntry('docs/READINGS_AND_OPTICS.md')).toBe(true);
    expect(run.hasEntry('LICENSE')).toBe(true);
    expect(run.hasEntry('NOTICE')).toBe(true);
    expect(withheldDocumentation).toEqual([]);
    expect(run.hasEntry('CHANGELOG.md')).toBe(false);
    expect(run.hasEntry('docs/topics/README.md')).toBe(false);
    expect(run.hasEntry('docs/operations/package-payload.md')).toBe(false);
    expect(compiledTests).toEqual([]);
    expect(unrelatedCompiledScripts).toEqual([]);
    expect(run.hasEntry('docs/ANTI_SLUDGE_POLICY.md')).toBe(false);
    expect(run.hasEntry('docs/plans/streaming-indexed-recursive-warp.md')).toBe(false);
    expect(run.hasEntry('docs/GUIDE.md')).toBe(false);
    expect(run.hasEntry('src/domain/RuntimeHost.ts')).toBe(false);
    expect(run.hasEntry('.github/maintainers')).toBe(false);
  });
});
