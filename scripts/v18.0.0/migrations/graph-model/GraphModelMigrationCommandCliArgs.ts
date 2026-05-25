const FINALIZATION_FLAGS = Object.freeze(new Set([
  '--finalize',
  '--live-ref',
  '--archive-ref',
  '--expected-live-head',
  '--confirmation',
]));

export class GraphModelMigrationCommandCliArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphModelMigrationCommandCliArgumentError';
  }
}

export class GraphModelMigrationCommandCliArgs {
  readonly repositoryPath: string | null;
  readonly requestPath: string | null;
  readonly legacyFixtureManifestPath: string | null;
  readonly scratchRefName: string | null;
  readonly reportOutPath: string | null;
  readonly finalizationRequestPath: string | null;
  readonly helpRequested: boolean;

  constructor(options: {
    readonly repositoryPath: string | null;
    readonly requestPath: string | null;
    readonly legacyFixtureManifestPath: string | null;
    readonly scratchRefName: string | null;
    readonly reportOutPath: string | null;
    readonly finalizationRequestPath: string | null;
    readonly helpRequested: boolean;
  }) {
    this.repositoryPath = options.repositoryPath;
    this.requestPath = options.requestPath;
    this.legacyFixtureManifestPath = options.legacyFixtureManifestPath;
    this.scratchRefName = options.scratchRefName;
    this.reportOutPath = options.reportOutPath;
    this.finalizationRequestPath = options.finalizationRequestPath;
    this.helpRequested = options.helpRequested;
    Object.freeze(this);
  }
}

/** Returns CLI usage for the v18 graph-model migration command wrapper. */
export function graphModelMigrationCommandUsage(): string {
  return [
    'Usage:',
    [
      '  node scripts/v18.0.0/migrations/graph-model/migrate.ts',
      '--repo <path>',
      '--request <path>',
      '--legacy-fixture-manifest <path>',
      '--scratch-ref <ref>',
      '[--report-out <path>]',
      '[--finalization-request <path>]',
    ].join(' '),
    '',
    'Options:',
    '  --repo <path>                     Git repository to receive scratch migration history.',
    '  --request <path>                  JSON migration request to validate and execute.',
    '  --legacy-fixture-manifest <path>  V17 fixture manifest used for legacy equivalence reading.',
    '  --scratch-ref <ref>               refs/warp-migration-scratch/* target for scratch output.',
    '  --report-out <path>               Also write the deterministic command report to this path.',
    '  --finalization-request <path>      JSON confirmation artifact required before live refs move.',
    '  --help                           Show this help.',
    '',
    'Legacy finalization flags are refused; use --finalization-request instead.',
  ].join('\n');
}

/** Parses command CLI arguments without reading or writing files. */
export function parseGraphModelMigrationCommandCliArgs(
  argv: readonly string[],
): GraphModelMigrationCommandCliArgs {
  let repositoryPath: string | null = null;
  let requestPath: string | null = null;
  let legacyFixtureManifestPath: string | null = null;
  let scratchRefName: string | null = null;
  let reportOutPath: string | null = null;
  let finalizationRequestPath: string | null = null;
  let helpRequested = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--repo') {
      repositoryPath = readArgValue(argv, index, '--repo');
      index++;
      continue;
    }
    if (arg === '--request') {
      requestPath = readArgValue(argv, index, '--request');
      index++;
      continue;
    }
    if (arg === '--legacy-fixture-manifest') {
      legacyFixtureManifestPath = readArgValue(argv, index, '--legacy-fixture-manifest');
      index++;
      continue;
    }
    if (arg === '--scratch-ref') {
      scratchRefName = readArgValue(argv, index, '--scratch-ref');
      index++;
      continue;
    }
    if (arg === '--report-out') {
      reportOutPath = readArgValue(argv, index, '--report-out');
      index++;
      continue;
    }
    if (arg === '--finalization-request') {
      finalizationRequestPath = readArgValue(argv, index, '--finalization-request');
      index++;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      helpRequested = true;
      continue;
    }
    if (arg !== undefined && FINALIZATION_FLAGS.has(arg)) {
      throw new GraphModelMigrationCommandCliArgumentError(
        'direct finalization flags are not supported; use --finalization-request <path>',
      );
    }
    throw new GraphModelMigrationCommandCliArgumentError(`Unknown argument: ${arg ?? ''}`);
  }

  return new GraphModelMigrationCommandCliArgs({
    repositoryPath,
    requestPath,
    legacyFixtureManifestPath,
    scratchRefName,
    reportOutPath,
    finalizationRequestPath,
    helpRequested,
  });
}

function readArgValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.length === 0 || value.startsWith('--')) {
    throw new GraphModelMigrationCommandCliArgumentError(`${flag} requires a value`);
  }
  return value;
}
