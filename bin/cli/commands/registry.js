import handleInfo from './info.js';
import handleQuery from './query.js';
import handlePath from './path.js';
import handleHistory from './history.js';
import handleCheck from './check.js';
import handleDoctor from './doctor/index.js';
import handleMaterialize from './materialize.js';
import handleSeek from './seek.js';
import handleVerifyAudit from './verify-audit.js';
import handleView from './view.js';
import handleInstallHooks from './install-hooks.js';

/** @type {Map<string, Function>} */
export const COMMANDS = new Map(/** @type {[string, Function][]} */ ([
  ['info', handleInfo],
  ['query', handleQuery],
  ['path', handlePath],
  ['history', handleHistory],
  ['check', handleCheck],
  ['doctor', handleDoctor],
  ['materialize', handleMaterialize],
  ['seek', handleSeek],
  ['verify-audit', handleVerifyAudit],
  ['view', handleView],
  ['install-hooks', handleInstallHooks],
]));
