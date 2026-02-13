import process from 'node:process';
import { parseCommandArgs, usageError } from '../infrastructure.js';
import { viewSchema } from '../schemas.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

const VIEW_OPTIONS = {
  list: { type: 'boolean', default: false },
  log: { type: 'boolean', default: false },
};

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
 */
export default async function handleView({ options, args }) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw usageError('view command requires an interactive terminal (TTY)');
  }

  const { values, positionals } = parseCommandArgs(args, VIEW_OPTIONS, viewSchema, { allowPositionals: true });
  const viewMode = values.log || positionals[0] === 'log' ? 'log' : 'list';

  try {
    // @ts-expect-error — optional peer dependency, may not be installed
    const { startTui } = await import('@git-stunts/git-warp-tui');
    await startTui({
      repo: options.repo || '.',
      graph: options.graph || 'default',
      mode: viewMode,
    });
  } catch (/** @type {*} */ err) { // TODO(ts-cleanup): type error
    const isMissing = err.code === 'ERR_MODULE_NOT_FOUND' || (err.message && err.message.includes('Cannot find module'));
    const isTui = err.specifier?.includes('git-warp-tui') ||
      /cannot find (?:package|module) ['"]@git-stunts\/git-warp-tui/i.test(err.message);
    if (isMissing && isTui) {
      throw usageError(
        'Interactive TUI requires @git-stunts/git-warp-tui.\n' +
        '  Install with: npm install -g @git-stunts/git-warp-tui',
      );
    }
    throw err;
  }
  return { payload: undefined, exitCode: 0 };
}
