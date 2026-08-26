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

export type CommandOutputValue = object | string | number | boolean | null;

export type CommandOutputLines =
  | readonly CommandOutputValue[]
  | AsyncIterable<CommandOutputValue>;

export interface CommandHandlerResult {
  readonly payload: CommandOutputValue | undefined;
  readonly human?: string | undefined;
  readonly lines?: CommandOutputLines | undefined;
  readonly exitCode?: number | undefined;
  readonly close?: (() => Promise<void>) | undefined;
  readonly completion?: Promise<void> | undefined;
}

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
