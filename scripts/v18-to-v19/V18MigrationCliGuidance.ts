import V18MigrationCliArgument from './V18MigrationCliArgument.ts';
import {
  V18_MIGRATION_CLI_CANCELLED,
  V18_MIGRATION_CLI_FLAGS,
  V18_MIGRATION_CLI_PACKAGE,
  V18_MIGRATION_CLI_PLACEHOLDERS,
} from './V18MigrationCliContract.ts';
import V18MigrationCliExample from './V18MigrationCliExample.ts';
import V18MigrationCliOutcome from './V18MigrationCliOutcome.ts';
import type { V18MigrationCliStream } from './V18MigrationCliOutcome.ts';

/*
 * Canonical examples, quoted outcomes, and shared notes for the guides. Only
 * the guidance tests import this module, so the published migrator does not
 * carry it.
 */

const flags = V18_MIGRATION_CLI_FLAGS;
const placeholders = V18_MIGRATION_CLI_PLACEHOLDERS;

const required = [
  new V18MigrationCliArgument(flags.repo, placeholders.repository),
  new V18MigrationCliArgument(flags.graph, placeholders.graph),
];
const dryRun = new V18MigrationCliArgument(flags.dryRun);
const yes = new V18MigrationCliArgument(flags.yes);
const json = new V18MigrationCliArgument(flags.json);

function examples(...entries: readonly V18MigrationCliExample[]): ReadonlyMap<string, V18MigrationCliExample> {
  return new Map(entries.map((example) => [example.name, example]));
}

const rehearsal = new V18MigrationCliExample('dry-run', [...required, dryRun]);
const unattendedRehearsal = new V18MigrationCliExample('dry-run-unattended', [...required, dryRun, yes]);

/** Canonical invocations, keyed by the name a guide marker cites. */
export const V18_MIGRATION_CLI_EXAMPLES = examples(
  new V18MigrationCliExample('promote', required),
  rehearsal,
  unattendedRehearsal,
  new V18MigrationCliExample('automation', [...required, yes]),
  new V18MigrationCliExample('verify-current', [...required, yes, json]),
);

type OutcomeResult = Readonly<{ exitCode: number; stream: V18MigrationCliStream }>;

function outcome(
  name: string,
  example: V18MigrationCliExample,
  result: OutcomeResult
): readonly [string, V18MigrationCliOutcome] {
  return [name, new V18MigrationCliOutcome({ example, name, ...result })];
}

const refusal: OutcomeResult = Object.freeze({ exitCode: 1, stream: 'stderr' });

/**
 * Repository states whose real output the migration guide quotes. Every
 * transcript uses a `--dry-run` form, so a reader who copies one cannot
 * promote a graph.
 */
export const V18_MIGRATION_CLI_OUTCOMES: ReadonlyMap<string, V18MigrationCliOutcome> = new Map([
  outcome('repository-not-found', rehearsal, refusal),
  outcome('empty-repository', rehearsal, refusal),
  outcome('graph-not-found', rehearsal, refusal),
  outcome('no-terminal', rehearsal, refusal),
  outcome('already-current', unattendedRehearsal, { exitCode: 0, stream: 'stdout' }),
]);

/** Version of the pinned package, which is also the name of its release tag without the `v`. */
const PINNED_VERSION = V18_MIGRATION_CLI_PACKAGE.slice(V18_MIGRATION_CLI_PACKAGE.lastIndexOf('@') + 1);

/**
 * Prose that several guides must state in the same words, keyed by the name a
 * guide marker cites. The `published-package` note was checked against the
 * source at the tag of the pinned package; check it again when the pin moves.
 */
export const V18_MIGRATION_CLI_NOTES: ReadonlyMap<string, string> = new Map([
  ['published-package', [
    'The help text and the command output that the git-warp guides quote come from',
    'the migrator source in the git-warp repository. The repository\'s test suite',
    'runs that source and compares its output with each quoted block. That source',
    'is not in a published package yet; it ships in the next release. The examples',
    `pin the published \`${V18_MIGRATION_CLI_PACKAGE}\` package, which carries an older`,
    `migrator. The migrator source at tag \`v${PINNED_VERSION}\` differs from the quoted`,
    `blocks in two ways. \`${flags.help.name}\` prints an older, shorter text. The command`,
    `does not check the \`${flags.repo.name}\` path before it starts Git, so a wrong path fails`,
    'with a Git process-spawn error or a Git diagnostic, not with',
    '`Repository not found`.',
  ].join('\n')],
  ['yes-promotes', [
    `\`${flags.yes.name}\` skips the confirmation. With \`${flags.yes.name}\` and without \`${flags.dryRun.name}\`, the command`,
    'migrates and promotes the named graph without asking. Use that form only',
    'after the backup, with every writer stopped.',
  ].join('\n')],
  ['graph-names', [
    `To learn the graph names, run the \`${flags.dryRun.name}\` form below with any name. If the`,
    'repository does not hold that name, the command stops with `Graph not found`',
    'and lists every graph. If the repository holds that name, the command shows',
    'the selected graph and waits for you to confirm a rehearsal; without a',
    `terminal it lists every graph and stops. A \`${flags.dryRun.name}\` run cannot change`,
    'authoritative refs.',
  ].join('\n')],
  ['cancelled', [
    'If you cancel at the confirmation, the command prints',
    `\`${V18_MIGRATION_CLI_CANCELLED}\` on standard output and`,
    'exits with status 0.',
  ].join('\n')],
]);
