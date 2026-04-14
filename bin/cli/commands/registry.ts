import handleInfo from './info.ts';
import handleCheck from './check.ts';
import handleDoctor from './doctor/index.ts';
import handleMaterialize from './materialize.ts';
import handleSeek from './seek.ts';
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

export const COMMANDS: Map<string, Function> = new Map<string, Function>([
  ['info', handleInfo],
  ['check', handleCheck],
  ['doctor', handleDoctor],
  ['materialize', handleMaterialize],
  ['seek', handleSeek],
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
]);
