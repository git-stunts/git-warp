import { usageError } from '../infrastructure.js';

import * as braidSubcommand from './working-set/braid.js';
import * as compareSubcommand from './working-set/compare.js';
import * as createSubcommand from './working-set/create.js';
import * as dropSubcommand from './working-set/drop.js';
import * as listSubcommand from './working-set/list.js';
import * as materializeSubcommand from './working-set/materialize.js';
import * as showSubcommand from './working-set/show.js';
import * as transferPlanSubcommand from './working-set/transfer-plan.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */
/**
 * @typedef {{
 *   WORKING_SET_SUBCOMMAND: { name: string, summary: string },
 *   handleWorkingSetSubcommand: (params: { options: CliOptions, args: string[] }) => Promise<{ payload: unknown, exitCode: number }>
 * }} WorkingSetModule
 */

/** @type {Record<string, WorkingSetModule>} */
const WORKING_SET_SUBCOMMANDS = Object.freeze({
  [createSubcommand.WORKING_SET_SUBCOMMAND.name]: createSubcommand,
  [braidSubcommand.WORKING_SET_SUBCOMMAND.name]: braidSubcommand,
  [listSubcommand.WORKING_SET_SUBCOMMAND.name]: listSubcommand,
  [showSubcommand.WORKING_SET_SUBCOMMAND.name]: showSubcommand,
  [compareSubcommand.WORKING_SET_SUBCOMMAND.name]: compareSubcommand,
  [transferPlanSubcommand.WORKING_SET_SUBCOMMAND.name]: transferPlanSubcommand,
  [materializeSubcommand.WORKING_SET_SUBCOMMAND.name]: materializeSubcommand,
  [dropSubcommand.WORKING_SET_SUBCOMMAND.name]: dropSubcommand,
});

function buildWorkingSetUsage() {
  const subcommandLines = Object.values(WORKING_SET_SUBCOMMANDS)
    .map(({ WORKING_SET_SUBCOMMAND }) => `  ${WORKING_SET_SUBCOMMAND.name.padEnd(12)} ${WORKING_SET_SUBCOMMAND.summary}`);
  return [
    'Usage: warp-graph working-set <subcommand> [options]',
    ...subcommandLines,
  ].join('\n');
}

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export default async function handleWorkingSet({ options, args }) {
  const subcommandName = args[0];
  const rest = args.slice(1);

  if (!subcommandName) {
    throw usageError(buildWorkingSetUsage());
  }

  const subcommand = WORKING_SET_SUBCOMMANDS[subcommandName];
  if (!subcommand) {
    throw usageError(`Unknown working-set subcommand: ${subcommandName}\n${buildWorkingSetUsage()}`);
  }

  return await subcommand.handleWorkingSetSubcommand({ options, args: rest });
}
