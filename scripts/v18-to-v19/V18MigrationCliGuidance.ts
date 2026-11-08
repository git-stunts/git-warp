import V18MigrationCliArgument from './V18MigrationCliArgument.ts';
import { V18_MIGRATION_CLI_FLAGS, V18_MIGRATION_CLI_PLACEHOLDERS } from './V18MigrationCliContract.ts';
import V18MigrationCliExample from './V18MigrationCliExample.ts';
import V18MigrationCliOutcome from './V18MigrationCliOutcome.ts';

/*
 * Canonical examples and quoted outcomes for the guides. Only the guidance
 * test imports this module, so the published migrator does not carry it.
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

const automation = new V18MigrationCliExample('automation', [...required, yes]);

/** Canonical invocations, keyed by the name a guide marker cites. */
export const V18_MIGRATION_CLI_EXAMPLES = examples(
  new V18MigrationCliExample('promote', required),
  new V18MigrationCliExample('dry-run', [...required, dryRun]),
  automation,
  new V18MigrationCliExample('verify-current', [...required, yes, json]),
);

function outcome(
  name: string,
  stream: V18MigrationCliOutcome['stream'],
  exitCode: number
): readonly [string, V18MigrationCliOutcome] {
  return [name, new V18MigrationCliOutcome({ example: automation, exitCode, name, stream })];
}

/** Repository states whose real output the migration guide quotes. */
export const V18_MIGRATION_CLI_OUTCOMES: ReadonlyMap<string, V18MigrationCliOutcome> = new Map([
  outcome('repository-not-found', 'stderr', 1),
  outcome('empty-repository', 'stderr', 1),
  outcome('graph-not-found', 'stderr', 1),
  outcome('already-current', 'stdout', 0),
]);

