import process from 'node:process';
import { usageError } from '../infrastructure.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
 */
export default async function handleView({ options, args }) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw usageError('view command requires an interactive terminal (TTY)');
  }

  const viewMode = (args[0] === '--list' || args[0] === 'list') ? 'list'
    : (args[0] === '--log' || args[0] === 'log') ? 'log'
      : 'list';

  try {
    // @ts-expect-error — optional peer dependency, may not be installed
    const { startTui } = await import('@git-stunts/git-warp-tui');
    await startTui({
      repo: options.repo || '.',
      graph: options.graph || 'default',
      mode: viewMode,
    });
  } catch (/** @type {*} */ err) { // TODO(ts-cleanup): type error
    if (err.code === 'ERR_MODULE_NOT_FOUND' || (err.message && err.message.includes('Cannot find module'))) {
      throw usageError(
        'Interactive TUI requires @git-stunts/git-warp-tui.\n' +
        '  Install with: npm install -g @git-stunts/git-warp-tui',
      );
    }
    throw err;
  }
  return { payload: undefined, exitCode: 0 };
}
