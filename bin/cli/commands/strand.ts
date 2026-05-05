import { usageError } from '../infrastructure.ts';

import * as braidSubcommand from './strand/braid.ts';
import * as compareSubcommand from './strand/compare.ts';
import * as createSubcommand from './strand/create.ts';
import * as dropSubcommand from './strand/drop.ts';
import * as listSubcommand from './strand/list.ts';
import * as materializeSubcommand from './strand/materialize.ts';
import * as showSubcommand from './strand/show.ts';
import * as transferPlanSubcommand from './strand/transfer-plan.ts';
import type { CliOptions } from '../types.ts';

type StrandModule = {
  STRAND_SUBCOMMAND: { name: string; summary: string };
  handleStrandSubcommand: (params: { options: CliOptions; args: string[] }) => Promise<{ payload: unknown; exitCode: number }>;
};

const STRAND_SUBCOMMANDS: Record<string, StrandModule> = Object.freeze({
  [createSubcommand.STRAND_SUBCOMMAND.name]: createSubcommand,
  [braidSubcommand.STRAND_SUBCOMMAND.name]: braidSubcommand,
  [listSubcommand.STRAND_SUBCOMMAND.name]: listSubcommand,
  [showSubcommand.STRAND_SUBCOMMAND.name]: showSubcommand,
  [compareSubcommand.STRAND_SUBCOMMAND.name]: compareSubcommand,
  [transferPlanSubcommand.STRAND_SUBCOMMAND.name]: transferPlanSubcommand,
  [materializeSubcommand.STRAND_SUBCOMMAND.name]: materializeSubcommand,
  [dropSubcommand.STRAND_SUBCOMMAND.name]: dropSubcommand,
});

/** Builds the usage help text for the strand subcommand listing all available subcommands. */
function buildStrandUsage(): string {
  const subcommandLines = Object.values(STRAND_SUBCOMMANDS)
    .map(({ STRAND_SUBCOMMAND }) => `  ${STRAND_SUBCOMMAND.name.padEnd(12)} ${STRAND_SUBCOMMAND.summary}`);
  return [
    'Usage: warp-graph strand <subcommand> [options]',
    ...subcommandLines,
  ].join('\n');
}

/** Dispatches to the appropriate strand subcommand handler based on the first positional argument. */
export default async function handleStrand({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
  const subcommandName = args[0];
  const rest = args.slice(1);

  if (subcommandName === undefined || subcommandName.length === 0) {
    throw usageError(buildStrandUsage());
  }

  const subcommand = STRAND_SUBCOMMANDS[subcommandName];
  if (!subcommand) {
    throw usageError(`Unknown strand subcommand: ${subcommandName}\n${buildStrandUsage()}`);
  }

  return await subcommand.handleStrandSubcommand({ options, args: rest });
}
