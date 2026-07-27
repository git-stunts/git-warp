import type { CliOptions } from '../types.ts';

import handleAudit from './audit.ts';
import handleDoctor from './doctor-v19.ts';
import handleFork from './fork.ts';
import handleMcp from './mcp.ts';
import handleObserve from './observe.ts';
import handleReceipt from './receipt.ts';
import handleRepair from './repair.ts';
import handleSettle from './settle.ts';
import handleWrite from './write.ts';

export type CommandHandlerResult = object | undefined;

export type CommandHandler = (options: {
  readonly options: CliOptions;
  readonly args: string[];
}) => Promise<CommandHandlerResult>;

export const COMMANDS: ReadonlyMap<string, CommandHandler> = new Map<
  string,
  CommandHandler
>([
  ['write', handleWrite],
  ['observe', handleObserve],
  ['fork', handleFork],
  ['settle', handleSettle],
  ['receipt', handleReceipt],
  ['doctor', handleDoctor],
  ['repair', handleRepair],
  ['audit', handleAudit],
  ['mcp', handleMcp],
]);
