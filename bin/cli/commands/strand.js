import { usageError } from '../infrastructure.js';

import * as braidSubcommand from './strand/braid.js';
import * as compareSubcommand from './strand/compare.js';
import * as createSubcommand from './strand/create.js';
import * as dropSubcommand from './strand/drop.js';
import * as listSubcommand from './strand/list.js';
import * as materializeSubcommand from './strand/materialize.js';
import * as showSubcommand from './strand/show.js';
import * as transferPlanSubcommand from './strand/transfer-plan.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */
/**
 * @typedef {{
 *   STRAND_SUBCOMMAND: { name: string, summary: string },
 *   handleStrandSubcommand: (params: { options: CliOptions, args: string[] }) => Promise<{ payload: unknown, exitCode: number }>
 * }} StrandModule
 */

/** @type {Record<string, StrandModule>} */
const STRAND_SUBCOMMANDS = Object.freeze({
  [createSubcommand.STRAND_SUBCOMMAND.name]: createSubcommand,
  [braidSubcommand.STRAND_SUBCOMMAND.name]: braidSubcommand,
  [listSubcommand.STRAND_SUBCOMMAND.name]: listSubcommand,
  [showSubcommand.STRAND_SUBCOMMAND.name]: showSubcommand,
  [compareSubcommand.STRAND_SUBCOMMAND.name]: compareSubcommand,
  [transferPlanSubcommand.STRAND_SUBCOMMAND.name]: transferPlanSubcommand,
  [materializeSubcommand.STRAND_SUBCOMMAND.name]: materializeSubcommand,
  [dropSubcommand.STRAND_SUBCOMMAND.name]: dropSubcommand,
});

function buildStrandUsage() {
  const subcommandLines = Object.values(STRAND_SUBCOMMANDS)
    .map(({ STRAND_SUBCOMMAND }) => `  ${STRAND_SUBCOMMAND.name.padEnd(12)} ${STRAND_SUBCOMMAND.summary}`);
  return [
    'Usage: warp-graph strand <subcommand> [options]',
    ...subcommandLines,
  ].join('\n');
}

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export default async function handleStrand({ options, args }) {
  const subcommandName = args[0];
  const rest = args.slice(1);

  if (!subcommandName) {
    throw usageError(buildStrandUsage());
  }

  const subcommand = STRAND_SUBCOMMANDS[subcommandName];
  if (!subcommand) {
    throw usageError(`Unknown strand subcommand: ${subcommandName}\n${buildStrandUsage()}`);
  }

  return await subcommand.handleStrandSubcommand({ options, args: rest });
}
