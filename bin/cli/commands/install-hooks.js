import fs from 'node:fs';
import process from 'node:process';
import { classifyExistingHook } from '../../../src/domain/services/HookInstaller.js';
import { EXIT_CODES, usageError, parseCommandArgs } from '../infrastructure.js';
import { installHooksSchema } from '../schemas.js';
import { createHookInstaller, isInteractive, promptUser } from '../shared.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

const INSTALL_HOOKS_OPTIONS = {
  force: { type: 'boolean', default: false },
};

/** @param {string[]} args */
function parseInstallHooksArgs(args) {
  const { values } = parseCommandArgs(args, INSTALL_HOOKS_OPTIONS, installHooksSchema);
  return values;
}

/**
 * @param {*} classification
 * @param {{force: boolean}} hookOptions
 */
async function resolveStrategy(classification, hookOptions) {
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

/** @param {*} classification */
async function promptForOursStrategy(classification) {
  const installer = createHookInstaller();
  if (classification.version === installer._version) {
    return 'up-to-date';
  }

  if (!isInteractive()) {
    throw usageError('Existing hook found. Use --force or run interactively.');
  }

  const answer = await promptUser(
    `Upgrade hook from v${classification.version} to v${installer._version}? [Y/n] `,
  );
  if (answer === '' || answer.toLowerCase() === 'y') {
    return 'upgrade';
  }
  return 'skip';
}

async function promptForForeignStrategy() {
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

/** @param {string} hookPath */
function readHookContent(hookPath) {
  try {
    return fs.readFileSync(hookPath, 'utf8');
  } catch (/** @type {*} */ err) { // TODO(ts-cleanup): type fs error
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Handles the `install-hooks` command.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
 */
export default async function handleInstallHooks({ options, args }) {
  const hookOptions = parseInstallHooksArgs(args);
  const installer = createHookInstaller();
  const status = installer.getHookStatus(options.repo);
  const content = readHookContent(status.hookPath);
  const classification = classifyExistingHook(content);
  const strategy = await resolveStrategy(classification, hookOptions);

  if (strategy === 'up-to-date') {
    return {
      payload: {
        action: 'up-to-date',
        hookPath: status.hookPath,
        version: installer._version,
      },
      exitCode: EXIT_CODES.OK,
    };
  }

  if (strategy === 'skip') {
    return {
      payload: { action: 'skipped' },
      exitCode: EXIT_CODES.OK,
    };
  }

  const result = installer.install(options.repo, { strategy });
  return {
    payload: result,
    exitCode: EXIT_CODES.OK,
  };
}
