import type { CliOptions } from '../types.ts';

import handleInfo from './info.ts';
import handleCheck from './check.ts';
import handleDoctor from './doctor/index.ts';
import handleMaterialize from './materialize.ts';
import handleSeek from './seek.ts';
import handleQuery from './query.ts';
import handlePath from './path.ts';
import handleOptic from './optic.ts';
import handleHistory from './history.ts';
import handleDebug from './debug.ts';
import handleStrand from './strand.ts';
import handleVerifyAudit from './verify-audit.ts';
import handleVerifyIndex from './verify-index.ts';
import handleReindex from './reindex.ts';
import handleInstallHooks from './install-hooks.ts';
import handleTrust from './trust.ts';
import handlePatch from './patch.ts';
import handleTree from './tree.ts';
import handleBisect from './bisect.ts';
import handleMcp from './mcp.ts';
import handleSync from './sync.ts';
import handleServe from './serve.ts';
import handleFork from './fork.ts';
import handleCheckpoint from './checkpoint.ts';
import handleGc from './gc.ts';
import handleWatch from './watch.ts';

/** Opaque handler return value. The entry point normalizes any shape
 *  into `{ payload, exitCode, close? }` at runtime via type guards. */
export type CommandHandlerResult = unknown;

/** Common signature every CLI command handler satisfies. Extra keys
 *  beyond `options`/`args` are ignored by handlers that don't need them. */
export type CommandHandler = (opts: {
  readonly options: CliOptions;
  readonly args: string[];
}) => Promise<CommandHandlerResult>;

export const COMMANDS: ReadonlyMap<string, CommandHandler> = new Map<string, CommandHandler>([
  ['info', handleInfo],
  ['check', handleCheck],
  ['doctor', handleDoctor],
  ['materialize', handleMaterialize],
  ['seek', handleSeek],
  ['query', handleQuery],
  ['path', handlePath],
  ['optic', handleOptic],
  ['history', handleHistory],
  ['debug', handleDebug],
  ['strand', handleStrand],
  ['verify-audit', handleVerifyAudit],
  ['verify-index', handleVerifyIndex],
  ['reindex', handleReindex],
  ['trust', handleTrust],
  ['patch', handlePatch],
  ['tree', handleTree],
  ['bisect', handleBisect],
  ['install-hooks', handleInstallHooks],
  ['mcp', handleMcp],
  ['sync', handleSync],
  ['serve', handleServe],
  ['fork', handleFork],
  ['checkpoint', handleCheckpoint],
  ['gc', handleGc],
  ['watch', handleWatch],
]);
