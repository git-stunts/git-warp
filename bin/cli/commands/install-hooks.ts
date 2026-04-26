import fs from 'node:fs';
import process from 'node:process';
import { classifyExistingHook } from '../../../src/domain/services/HookInstaller.ts';
import { EXIT_CODES, usageError, parseCommandArgs } from '../infrastructure.ts';
import { installHooksSchema } from '../schemas.ts';
import { createHookInstaller, isInteractive, promptUser } from '../shared.ts';
import type { CliOptions } from '../types.ts';

const INSTALL_HOOKS_OPTIONS = {
  force: { type: 'boolean', default: false },
};

/** Parses CLI arguments for the install-hooks command. */
function parseInstallHooksArgs(args: string[]): { force: boolean } {
  const { values } = parseCommandArgs(args, INSTALL_HOOKS_OPTIONS, installHooksSchema);
  return values;
}

/** Decides which installation strategy to use based on the existing hook state. */
async function resolveStrategy(classification: { kind: string; version?: string; appended?: boolean }, hookOptions: { force: boolean }): Promise<string> {
  if (hookOptions.force) {
    return 'replace';
  }

  if (classification.kind === 'none') {
    return 'install';
  }

  if (classification.kind === 'ours') {
    return await promptForOursStrategy(classification);
  }

  return await promptForForeignStrategy();
}

/** Formats a hook version for user-facing prompts. */
function formatHookVersion(version: string | undefined): string {
  if (version === undefined) {
    return 'version unreported';
  }
  return `v${version}`;
}

/** Prompts the user to upgrade an existing warp-managed hook. */
async function promptForOursStrategy(classification: { kind: string; version?: string; appended?: boolean }): Promise<string> {
  const installer = createHookInstaller();
  if (classification.version === installer.version) {
    return 'up-to-date';
  }

  if (!isInteractive()) {
    throw usageError('Existing hook found. Use --force or run interactively.');
  }

  const installedVersion = formatHookVersion(classification.version);
  const targetVersion = formatHookVersion(installer.version);
  const answer = await promptUser(
    `Upgrade hook from ${installedVersion} to ${targetVersion}? [Y/n] `,
  );
  if (answer === '' || answer.toLowerCase() === 'y') {
    return 'upgrade';
  }
  return 'skip';
}

/**
 * Prompts the user to choose how to handle a foreign (non-warp) hook.
 * @returns Strategy: 'append', 'replace', or 'skip'
 */
async function promptForForeignStrategy(): Promise<string> {
  if (!isInteractive()) {
    throw usageError('Existing hook found. Use --force or run interactively.');
  }

  process.stderr.write('Existing post-merge hook found.\n');
  process.stderr.write('  1) Append (keep existing hook, add warp section)\n');
  process.stderr.write('  2) Replace (back up existing, install fresh)\n');
  process.stderr.write('  3) Skip\n');
  const answer = await promptUser('Choose [1-3]: ');

  if (answer === '1') {
    return 'append';
  }
  if (answer === '2') {
    return 'replace';
  }
  return 'skip';
}

/** Reads the content of a hook file, returning null if it does not exist. */
function readHookContent(hookPath: string): string | null {
  try {
    return fs.readFileSync(hookPath, 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/** Builds the response payload for a no-op strategy (up-to-date or skip). */
function buildNoOpResponse(strategy: string, status: { hookPath: string }, installer: { version: string }): { payload: unknown; exitCode: number } | null {
  if (strategy === 'up-to-date') {
    return {
      payload: { action: 'up-to-date', hookPath: status.hookPath, version: installer.version },
      exitCode: EXIT_CODES.OK,
    };
  }
  if (strategy === 'skip') {
    return { payload: { action: 'skipped' }, exitCode: EXIT_CODES.OK };
  }
  return null;
}

/** Handles the `install-hooks` command. */
export default async function handleInstallHooks({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
  const hookOptions = parseInstallHooksArgs(args);
  const installer = createHookInstaller();
  const status = await installer.getHookStatus(options.repo);
  const content = readHookContent(status.hookPath);
  const classification = classifyExistingHook(content);
  const strategy = await resolveStrategy(classification, hookOptions);

  const noOp = buildNoOpResponse(strategy, status, installer);
  if (noOp !== null) {
    return noOp;
  }

  const result = await installer.install(options.repo, { strategy: strategy as 'install' | 'upgrade' | 'append' | 'replace' });
  return { payload: result, exitCode: EXIT_CODES.OK };
}
