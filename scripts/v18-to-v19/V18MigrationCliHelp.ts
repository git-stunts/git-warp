import {
  V18_MIGRATION_CLI_FLAGS,
  V18_MIGRATION_CLI_SEMANTICS,
  v18MigrationCliUsageLine,
} from './V18MigrationCliContract.ts';

const SYNOPSIS_COLUMN = 26;

/** Renders `--help` from the canonical migration CLI contract. */
export function formatV18MigrationCliHelp(): string {
  const options = Object.values(V18_MIGRATION_CLI_FLAGS).map(
    (flag) => `  ${flag.synopsis().padEnd(SYNOPSIS_COLUMN)}${flag.summary}`
  );
  return [v18MigrationCliUsageLine(), '', 'Options:', ...options, '', ...V18_MIGRATION_CLI_SEMANTICS, ''].join('\n');
}
