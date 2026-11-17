import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { CURRENT_SUBSTRATE_MARKER } from '../../../src/infrastructure/adapters/SubstrateVersionGate.ts';
import {
  V18_MIGRATION_CLI_COMMAND,
  V18_MIGRATION_CLI_FLAGS,
  V18_MIGRATION_CLI_PLACEHOLDERS,
} from '../../../scripts/v18-to-v19/V18MigrationCliContract.ts';
import {
  V18_MIGRATION_CLI_EXAMPLES,
  V18_MIGRATION_CLI_NOTES,
  V18_MIGRATION_CLI_OUTCOMES,
} from '../../../scripts/v18-to-v19/V18MigrationCliGuidance.ts';
import type V18MigrationCliExample from '../../../scripts/v18-to-v19/V18MigrationCliExample.ts';
import type V18MigrationCliOutcome from '../../../scripts/v18-to-v19/V18MigrationCliOutcome.ts';
import { restoreV18RetainedSubstrateFixture } from '../../../scripts/v18-to-v19/V18RetainedSubstrateFixtureRestore.ts';
import { gitOk, MigrationTestDirectories } from './migrationTestEnvironment.ts';

/** Every current document that repeats the v18-to-v19 command, with the blocks it must carry. */
const GUIDANCE = Object.freeze({
  'README.md': ['example promote literal'],
  'docs/migrations/v19/README.md': [
    'note graph-names', 'example dry-run literal', 'example promote literal', 'note yes-promotes',
    'note published-package', 'help',
    ...[...V18_MIGRATION_CLI_OUTCOMES.keys()].flatMap(
      (name) => (name === 'already-current' ? ['note cancelled', `outcome ${name}`] : [`outcome ${name}`]),
    ),
    'example dry-run literal',
  ],
  'docs/operations/README.md': [
    'note graph-names', 'example dry-run shell', 'example promote shell', 'note yes-promotes',
  ],
  'scripts/v18-to-v19/README.md': [
    'example promote literal', 'note published-package', 'help', 'note yes-promotes',
    'example dry-run literal',
  ],
});
/** Git flags that the guides quote for backups and maintenance; they are not migration CLI flags. */
const FOREIGN_FLAGS = new Set(['--no-hardlinks', '--cruft']);
const MARKER = /^(?:> )?<!-- v18-to-v19-cli: ([a-z -]+) -->$/u;
/** A line that invokes this command, directly or through the pinned package. */
const COMMAND_LINE = /^(?:\$ )?(?:npm exec .*)?git-warp-v18-to-v19(?: |$)/u;
const REQUESTED_GRAPH = 'requested-graph';
/** The v18 graph in the two-graph repository that the transcripts describe. */
const LEGACY_GRAPH = 'orders';
/** Outcomes that run against the two-graph repository, with the name each one requests. */
const TWO_GRAPH_REQUESTS: ReadonlyMap<string, string> = new Map([
  ['graph-not-found', REQUESTED_GRAPH],
  ['no-terminal', LEGACY_GRAPH],
]);
const GOLDEN_MANIFEST = resolve('fixtures/v18/retained-substrate-golden/manifest.json');
const { repository, graph } = V18_MIGRATION_CLI_PLACEHOLDERS;
const yesFlag = V18_MIGRATION_CLI_FLAGS.yes.name;

type GuidanceBlock = Readonly<{
  body: string;
  directive: string;
  lines: readonly number[];
  path: string;
}>;

describe('v18-to-v19 migration guidance contract', () => {
  const directories = new MigrationTestDirectories();

  afterEach(async () => {
    await directories.cleanup();
  });

  it('carries exactly the contract-owned blocks in every guide', () => {
    for (const [path, directives] of Object.entries(GUIDANCE)) {
      expect(guidanceBlocks(path).map((block) => block.directive), path).toEqual(directives);
    }
  });

  it('renders every example block from the canonical contract', () => {
    for (const block of allBlocks().filter((entry) => entry.directive.startsWith('example '))) {
      const [, name, form] = block.directive.split(' ');
      const example = V18_MIGRATION_CLI_EXAMPLES.get(name ?? '');
      expect(example, block.directive).toBeDefined();
      expect(form === 'literal' || form === 'shell', block.directive).toBe(true);
      expect(block.body, `${block.path}: ${block.directive}`).toBe(
        example?.render(form === 'shell' ? 'shell' : 'literal'),
      );
    }
  });

  it('renders every note from the canonical guidance', () => {
    const notes = allBlocks().filter((entry) => entry.directive.startsWith('note '));

    expect(new Set(notes.map((block) => block.directive.slice('note '.length)))).toEqual(
      new Set(V18_MIGRATION_CLI_NOTES.keys()),
    );
    for (const block of notes) {
      expect(block.body, `${block.path}: ${block.directive}`).toBe(
        V18_MIGRATION_CLI_NOTES.get(block.directive.slice('note '.length)),
      );
    }
  });

  it('says which CLI the quoted output comes from before the first quoted output', () => {
    const quoting = Object.keys(GUIDANCE)
      .map((path) => guidanceBlocks(path).map((block) => block.directive))
      .filter((directives) => directives.some(quotesCliOutput));

    expect(quoting).toHaveLength(2);
    for (const directives of quoting) {
      const note = directives.indexOf('note published-package');
      expect(note).toBeGreaterThanOrEqual(0);
      expect(note).toBeLessThan(directives.findIndex(quotesCliOutput));
    }
  });

  it('warns that --yes promotes in every guide that names --yes', () => {
    const naming = Object.keys(GUIDANCE).filter((path) => readGuide(path).includes(yesFlag));

    expect(naming).toHaveLength(3);
    for (const path of naming) {
      expect(guidanceBlocks(path).map((block) => block.directive), path).toContain('note yes-promotes');
    }
  });

  it('snapshots the real CLI --help output in every help block', async () => {
    const help = await runCli(['--help']);

    expect(help.exitCode).toBe(0);
    for (const block of allBlocks().filter((entry) => entry.directive === 'help')) {
      expect(`${block.body}\n`, block.path).toBe(help.stdout);
    }
  });

  it('snapshots every documented outcome against the real CLI', async () => {
    for (const outcome of V18_MIGRATION_CLI_OUTCOMES.values()) {
      const [block] = allBlocks().filter((entry) => entry.directive === `outcome ${outcome.name}`);
      const prepared = await prepareOutcome(directories, outcome);
      const execution = await runCli(outcome.example.argv(prepared.values));
      const output = outcome.stream === 'stdout' ? execution.stdout : execution.stderr;

      expect(execution.exitCode, outcome.name).toBe(outcome.exitCode);
      expect(block?.body, outcome.name).toBe(
        `$ ${outcome.example.renderCommand()}\n${normalize(output, prepared).trimEnd()}`,
      );
    }
  });

  it('accepts a repository reached through a symlinked path', async () => {
    const prepared = await prepareOutcome(directories, requiredOutcome('already-current'));
    const linked = join(await directories.create('git-warp-cli-link-'), 'repository-link');
    await symlink(prepared.repositoryPath, linked);
    const execution = await runCli(automation().argv(new Map([
      [repository, linked], [graph, prepared.graph],
    ])));

    expect(execution.exitCode).toBe(0);
    expect(execution.stdout).toContain('status: already-current');
  });

  it('leaves no unverified copy of the command in a guide', () => {
    for (const path of Object.keys(GUIDANCE)) {
      const covered = new Set(guidanceBlocks(path).flatMap((block) => block.lines));
      readGuide(path).split('\n').forEach((line, index) => {
        const invocation = COMMAND_LINE.test(line.replace(/^(?:> )?\s*/u, ''));
        expect(invocation && !covered.has(index), `${path}:${String(index + 1)} ${line}`).toBe(false);
      });
    }
  });

  it('quotes only contract flags inline', () => {
    const known = new Set(Object.values(V18_MIGRATION_CLI_FLAGS).flatMap((flag) => flag.names()));
    for (const path of Object.keys(GUIDANCE)) {
      for (const [, span] of readGuide(path).matchAll(/`(--?[a-z][^`]*)`/gu)) {
        for (const token of (span ?? '').split(' ').filter((part) => part.startsWith('-'))) {
          expect(known.has(token) || FOREIGN_FLAGS.has(token), `${path}: ${token}`).toBe(true);
        }
      }
    }
  });

  it('does not single out a graph name in any guide', () => {
    for (const path of Object.keys(GUIDANCE)) {
      expect(readGuide(path), path).not.toMatch(/--graph (?:events|think)\b/u);
    }
  });
});

type PreparedOutcome = Readonly<{
  graph: string;
  repositoryPath: string;
  values: ReadonlyMap<typeof repository, string>;
}>;

async function prepareOutcome(
  directories: MigrationTestDirectories,
  outcome: V18MigrationCliOutcome,
): Promise<PreparedOutcome> {
  const root = await directories.create(`git-warp-cli-${outcome.name}-`);
  const repositoryPath = join(root, 'repository');
  if (outcome.name === 'already-current') {
    return await migratedFixture(repositoryPath);
  }
  if (outcome.name === 'repository-not-found') {
    return preparedOutcome(repositoryPath, REQUESTED_GRAPH);
  }
  await mkdir(repositoryPath);
  await gitOk(repositoryPath, ['init', '--bare', '--quiet']);
  const requested = TWO_GRAPH_REQUESTS.get(outcome.name);
  if (requested === undefined) {
    expect(outcome.name).toBe('empty-repository');
    return preparedOutcome(repositoryPath, REQUESTED_GRAPH);
  }
  await writeLegacyWriter(repositoryPath, LEGACY_GRAPH);
  await writeCurrentMarker(repositoryPath, 'team-notes');
  return preparedOutcome(repositoryPath, requested);
}

/** Restores the published v18 golden fixture and migrates it through the real CLI. */
async function migratedFixture(repositoryPath: string): Promise<PreparedOutcome> {
  const restored = await restoreV18RetainedSubstrateFixture({
    manifestPath: GOLDEN_MANIFEST,
    targetDirectory: repositoryPath,
  });
  const fixture = preparedOutcome(restored.repositoryPath, restored.manifest.graphId);
  const migration = await runCli(automation().argv(fixture.values));
  expect(migration.exitCode, migration.stderr).toBe(0);
  expect(migration.stdout).toContain('status: migrated');
  return fixture;
}

function preparedOutcome(repositoryPath: string, requested: string): PreparedOutcome {
  return Object.freeze({
    graph: requested,
    repositoryPath,
    values: new Map([[repository, repositoryPath], [graph, requested]]),
  });
}

function automation(): V18MigrationCliExample {
  const example = V18_MIGRATION_CLI_EXAMPLES.get('automation');
  if (example === undefined) {
    throw new Error('contract has no automation example');
  }
  return example;
}

async function writeLegacyWriter(repositoryPath: string, name: string): Promise<void> {
  const oid = await gitOk(repositoryPath, ['hash-object', '-w', '--stdin'], 'legacy');
  await gitOk(repositoryPath, ['update-ref', `refs/warp/${name}/writers/local`, oid]);
}

async function writeCurrentMarker(repositoryPath: string, name: string): Promise<void> {
  const oid = await gitOk(repositoryPath, ['hash-object', '-w', '--stdin'], CURRENT_SUBSTRATE_MARKER);
  await gitOk(repositoryPath, ['update-ref', `refs/warp/${name}/substrate-version`, oid]);
}

function normalize(output: string, prepared: PreparedOutcome): string {
  return output
    .replaceAll(prepared.repositoryPath, repository.literal)
    .replaceAll(`: ${prepared.graph}`, `: ${graph.literal}`);
}

function requiredOutcome(name: string): V18MigrationCliOutcome {
  const outcome = V18_MIGRATION_CLI_OUTCOMES.get(name);
  if (outcome === undefined) {
    throw new Error(`contract has no outcome ${name}`);
  }
  return outcome;
}

function quotesCliOutput(directive: string): boolean {
  return directive === 'help' || directive.startsWith('outcome ');
}

function allBlocks(): readonly GuidanceBlock[] {
  return Object.keys(GUIDANCE).flatMap((path) => guidanceBlocks(path));
}

function readGuide(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Reads each marked block: a note paragraph, or a fence without its uniform blockquote prefix. */
function guidanceBlocks(path: string): readonly GuidanceBlock[] {
  const lines = readGuide(path).split('\n');
  const blocks: GuidanceBlock[] = [];
  lines.forEach((line, index) => {
    const directive = MARKER.exec(line)?.[1];
    if (directive !== undefined) {
      const content = directive.startsWith('note ') ? paragraphAt(lines, index + 1) : fenceAt(lines, index + 1);
      blocks.push(Object.freeze({ ...content, directive, path }));
    }
  });
  return blocks;
}

/** A note is the paragraph directly below its marker, up to the next blank line. */
function paragraphAt(
  lines: readonly string[],
  start: number,
): Readonly<{ body: string; lines: readonly number[] }> {
  const blank = lines.indexOf('', start);
  const end = blank === -1 ? lines.length : blank;
  expect(end, `note paragraph expected at line ${String(start + 1)}`).toBeGreaterThan(start);
  return Object.freeze({
    body: lines.slice(start, end).join('\n'),
    lines: Object.freeze(Array.from({ length: end - start }, (_, offset) => start + offset)),
  });
}

function fenceAt(
  lines: readonly string[],
  start: number,
): Readonly<{ body: string; lines: readonly number[] }> {
  const prefix = (lines[start] ?? '').startsWith('> ') ? '> ' : '';
  const unquoted = lines.slice(start).map((line) => line.slice(prefix.length));
  expect(unquoted[0], `fence expected at line ${String(start + 1)}`).toMatch(/^```[a-z]+$/u);
  const end = unquoted.indexOf('```', 1);
  expect(end).toBeGreaterThan(0);
  return Object.freeze({
    body: unquoted.slice(1, end).join('\n'),
    lines: Object.freeze(Array.from({ length: end + 1 }, (_, offset) => start + offset)),
  });
}

async function runCli(
  args: readonly string[],
): Promise<Readonly<{ exitCode: number | null; stderr: string; stdout: string }>> {
  return await new Promise((complete, reject) => {
    const child = spawn(process.execPath, ['scripts/v18-to-v19/migrate.ts', ...args], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Uint8Array[] = [];
    const stderr: Uint8Array[] = [];
    child.stdout.on('data', (chunk: Uint8Array) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Uint8Array) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (exitCode) => complete(Object.freeze({
      exitCode,
      stderr: Buffer.concat(stderr).toString('utf8'),
      stdout: Buffer.concat(stdout).toString('utf8'),
    })));
  });
}
