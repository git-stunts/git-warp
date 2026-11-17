import { parseArgs } from 'node:util';

import PrBranchUpdateError from './PrBranchUpdateError.ts';

const REPOSITORY_NAME = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/u;
const DEFAULT_BASE = 'main';

/**
 * The updater's command line:
 * `update-pr-branches.ts --repo owner/name [--base main] [--dry-run]`.
 */
export default class UpdaterArguments {
  readonly repository: string;
  readonly baseRefName: string;
  /** List what the updater would do, and write nothing to GitHub. */
  readonly dryRun: boolean;

  private constructor(repository: string, baseRefName: string, dryRun: boolean) {
    this.repository = repository;
    this.baseRefName = baseRefName;
    this.dryRun = dryRun;
    Object.freeze(this);
  }

  static parse(argv: readonly string[]): UpdaterArguments {
    const { values } = parseUpdaterOptions(argv);
    if (values.repo === undefined) {
      throw new PrBranchUpdateError('--repo owner/name is required');
    }
    if (!REPOSITORY_NAME.test(values.repo)) {
      throw new PrBranchUpdateError(`--repo must be owner/name, got "${values.repo}"`);
    }
    return new UpdaterArguments(values.repo, values.base, values['dry-run']);
  }
}

function parseUpdaterOptions(argv: readonly string[]) {
  try {
    return parseArgs({
      args: [...argv],
      allowPositionals: false,
      strict: true,
      options: {
        repo: { type: 'string' },
        base: { type: 'string', default: DEFAULT_BASE },
        'dry-run': { type: 'boolean', default: false },
      },
    });
  } catch (error) {
    throw new PrBranchUpdateError(error instanceof Error ? error.message : String(error));
  }
}
