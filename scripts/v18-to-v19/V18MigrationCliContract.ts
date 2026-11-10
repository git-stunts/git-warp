import V18MigrationCliFlag from './V18MigrationCliFlag.ts';
import { V18_MIGRATION_CLI_COMMAND } from './V18MigrationCliIdentity.ts';
import V18MigrationCliPlaceholder from './V18MigrationCliPlaceholder.ts';

/**
 * The one source for the v18-to-v19 migration CLI: flag names, default
 * behavior, confirmation semantics, and example placeholders. `--help`
 * renders from it and the parser dispatches on it. The documentation-only
 * examples and outcomes in `V18MigrationCliGuidance.ts` are built from these
 * flags, and the guidance test verifies every guide against both.
 */
export { V18_MIGRATION_CLI_COMMAND, V18_MIGRATION_CLI_PACKAGE } from './V18MigrationCliIdentity.ts';

export const V18_MIGRATION_CLI_PLACEHOLDERS = Object.freeze({
  graph: new V18MigrationCliPlaceholder({
    literal: '<graph-name>',
    shell: '"$GRAPH_NAME"',
    synopsis: '<graph-name>',
  }),
  repository: new V18MigrationCliPlaceholder({
    literal: '/path/to/repository',
    shell: '"$REPOSITORY"',
    synopsis: '<path>',
  }),
  recoveryId: new V18MigrationCliPlaceholder({
    literal: '<token>',
    shell: '"$RECOVERY_ID"',
    synopsis: '<token>',
  }),
  scratchRoot: new V18MigrationCliPlaceholder({
    literal: '/path/to/scratch',
    shell: '"$SCRATCH_ROOT"',
    synopsis: '<path>',
  }),
});

const placeholders = V18_MIGRATION_CLI_PLACEHOLDERS;

/** Flags in `--help` order. Required flags come first. */
export const V18_MIGRATION_CLI_FLAGS = Object.freeze({
  repo: new V18MigrationCliFlag({
    name: '--repo',
    summary: 'Git repository that holds the graph (required).',
    value: placeholders.repository,
  }),
  graph: new V18MigrationCliFlag({
    name: '--graph',
    summary: 'Discovered graph name to migrate (required).',
    value: placeholders.graph,
  }),
  dryRun: new V18MigrationCliFlag({
    name: '--dry-run',
    summary: 'Rehearse fully, then discard the verified scratch repo.',
  }),
  yes: new V18MigrationCliFlag({
    name: '--yes',
    summary: 'Skip the interactive confirmation for automation.',
  }),
  apply: new V18MigrationCliFlag({
    name: '--apply',
    summary: 'Compatibility alias for the default promotion mode.',
  }),
  json: new V18MigrationCliFlag({
    name: '--json',
    summary: 'Print the machine-readable report.',
  }),
  recoveryId: new V18MigrationCliFlag({
    name: '--recovery-id',
    summary: 'Stable recovery-ref suffix for operator tracking.',
    value: placeholders.recoveryId,
  }),
  scratchRoot: new V18MigrationCliFlag({
    name: '--scratch-root',
    summary: 'Place disposable repositories on this volume.',
    value: placeholders.scratchRoot,
  }),
  help: new V18MigrationCliFlag({
    aliases: ['-h'],
    name: '--help',
    summary: 'Show this help.',
  }),
});

const flags = V18_MIGRATION_CLI_FLAGS;

/** Default behavior and confirmation semantics, as `--help` states them. */
export const V18_MIGRATION_CLI_SEMANTICS: readonly string[] = Object.freeze([
  'The default is one pass: discover, confirm, rehearse, promote, and verify.',
  'Discovery finds every graph. The command lists them, and whether each is',
  'current or needs an upgrade, when --graph names no graph, with --yes, and',
  'when it has no terminal.',
  'Without --yes, the command requires an interactive terminal and asks for',
  'confirmation before inventory. With --yes and without --dry-run, it',
  'migrates and promotes the named graph without asking.',
  'Authoritative refs change only in the final compare-and-swap transaction,',
  'after the scratch proof succeeds. If the promoted graph then fails',
  'verification, a second guarded transaction rolls those refs back.',
  'A separate --dry-run is intentionally disposable and cannot be reused.',
  'For encrypted stores, set GIT_WARP_MIGRATION_PASSPHRASE in the environment.',
]);

/** The line the command prints when the operator cancels at the confirmation. */
export const V18_MIGRATION_CLI_CANCELLED = 'v18-to-v19 migration cancelled; no refs changed';

/** `Usage:` line: the command followed by its required flags. */
export function v18MigrationCliUsageLine(): string {
  return `Usage: ${V18_MIGRATION_CLI_COMMAND} ${flags.repo.synopsis()} ${flags.graph.synopsis()} [options]`;
}
