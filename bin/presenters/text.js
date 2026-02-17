/**
 * Plain-text renderers for CLI output.
 *
 * Each function accepts a command payload and returns a formatted string
 * (with trailing newline) suitable for process.stdout.write().
 */

import { formatStructuralDiff } from '../../src/visualization/renderers/ascii/seek.js';

// ── ANSI helpers ─────────────────────────────────────────────────────────────

const ANSI_GREEN = '\x1b[32m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_RED = '\x1b[31m';
const ANSI_DIM = '\x1b[2m';
const ANSI_RESET = '\x1b[0m';

/** @param {string} state */
function colorCachedState(state) {
  if (state === 'fresh') {
    return `${ANSI_GREEN}${state}${ANSI_RESET}`;
  }
  if (state === 'stale') {
    return `${ANSI_YELLOW}${state}${ANSI_RESET}`;
  }
  return `${ANSI_RED}${ANSI_DIM}${state}${ANSI_RESET}`;
}

/** @param {*} hook */
function formatHookStatusLine(hook) {
  if (!hook.installed && hook.foreign) {
    return "Hook: foreign hook present — run 'git warp install-hooks'";
  }
  if (!hook.installed) {
    return "Hook: not installed — run 'git warp install-hooks'";
  }
  if (hook.current) {
    return `Hook: installed (v${hook.version}) — up to date`;
  }
  return `Hook: installed (v${hook.version}) — upgrade available, run 'git warp install-hooks'`;
}

// ── Simple renderers ─────────────────────────────────────────────────────────

/** @param {*} payload */
export function renderInfo(payload) {
  const lines = [`Repo: ${payload.repo}`];
  lines.push(`Graphs: ${payload.graphs.length}`);
  for (const graph of payload.graphs) {
    const writers = graph.writers ? ` writers=${graph.writers.count}` : '';
    lines.push(`- ${graph.name}${writers}`);
    if (graph.checkpoint?.sha) {
      lines.push(`  checkpoint: ${graph.checkpoint.sha}`);
    }
    if (graph.coverage?.sha) {
      lines.push(`  coverage: ${graph.coverage.sha}`);
    }
    if (graph.cursor?.active) {
      lines.push(`  cursor: tick ${graph.cursor.tick} (${graph.cursor.mode})`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/** @param {*} payload */
export function renderQuery(payload) {
  const lines = [
    `Graph: ${payload.graph}`,
    `State: ${payload.stateHash}`,
    `Nodes: ${payload.nodes.length}`,
  ];

  for (const node of payload.nodes) {
    const id = node.id ?? '(unknown)';
    lines.push(`- ${id}`);
    if (node.props && Object.keys(node.props).length > 0) {
      lines.push(`  props: ${JSON.stringify(node.props)}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

/** @param {*} payload */
export function renderPath(payload) {
  const lines = [
    `Graph: ${payload.graph}`,
    `From: ${payload.from}`,
    `To: ${payload.to}`,
    `Found: ${payload.found ? 'yes' : 'no'}`,
    `Length: ${payload.length}`,
  ];

  if (payload.path && payload.path.length > 0) {
    lines.push(`Path: ${payload.path.join(' -> ')}`);
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Appends checkpoint and writer lines to check output.
 * @param {string[]} lines
 * @param {*} payload
 */
function appendCheckpointAndWriters(lines, payload) {
  if (payload.checkpoint?.sha) {
    lines.push(`Checkpoint: ${payload.checkpoint.sha}`);
    if (payload.checkpoint.ageSeconds !== null) {
      lines.push(`Checkpoint Age: ${payload.checkpoint.ageSeconds}s`);
    }
  } else {
    lines.push('Checkpoint: none');
  }

  if (!payload.status) {
    lines.push(`Writers: ${payload.writers.count}`);
  }
  for (const head of payload.writers.heads) {
    lines.push(`- ${head.writerId}: ${head.sha}`);
  }
}

/**
 * Appends coverage, gc, and hook lines to check output.
 * @param {string[]} lines
 * @param {*} payload
 */
function appendCoverageAndExtras(lines, payload) {
  if (payload.coverage?.sha) {
    lines.push(`Coverage: ${payload.coverage.sha}`);
    lines.push(`Coverage Missing: ${payload.coverage.missingWriters.length}`);
  } else {
    lines.push('Coverage: none');
  }

  if (payload.gc) {
    lines.push(`Tombstones: ${payload.gc.totalTombstones}`);
    if (!payload.status) {
      lines.push(`Tombstone Ratio: ${payload.gc.tombstoneRatio}`);
    }
  }

  if (payload.hook) {
    lines.push(formatHookStatusLine(payload.hook));
  }
}

/** @param {*} payload */
export function renderCheck(payload) {
  const lines = [
    `Graph: ${payload.graph}`,
    `Health: ${payload.health.status}`,
  ];

  if (payload.status) {
    lines.push(`Cached State: ${colorCachedState(payload.status.cachedState)}`);
    lines.push(`Patches Since Checkpoint: ${payload.status.patchesSinceCheckpoint}`);
    lines.push(`Tombstone Ratio: ${payload.status.tombstoneRatio.toFixed(2)}`);
    lines.push(`Writers: ${payload.status.writers}`);
  }

  appendCheckpointAndWriters(lines, payload);
  appendCoverageAndExtras(lines, payload);
  return `${lines.join('\n')}\n`;
}

/** @param {*} payload */
export function renderHistory(payload) {
  const lines = [
    `Graph: ${payload.graph}`,
    `Writer: ${payload.writer}`,
    `Entries: ${payload.entries.length}`,
  ];

  if (payload.nodeFilter) {
    lines.push(`Node Filter: ${payload.nodeFilter}`);
  }

  for (const entry of payload.entries) {
    lines.push(`- ${entry.sha} (lamport: ${entry.lamport}, ops: ${entry.opCount})`);
  }

  return `${lines.join('\n')}\n`;
}

/** @param {*} payload */
export function renderError(payload) {
  return `Error: ${payload.error.message}\n`;
}

/** @param {*} payload */
export function renderMaterialize(payload) {
  if (payload.graphs.length === 0) {
    return 'No graphs found in repo.\n';
  }

  const lines = [];
  for (const entry of payload.graphs) {
    if (entry.error) {
      lines.push(`${entry.graph}: error — ${entry.error}`);
    } else {
      lines.push(`${entry.graph}: ${entry.nodes} nodes, ${entry.edges} edges, checkpoint ${entry.checkpoint}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/** @param {*} payload */
export function renderInstallHooks(payload) {
  if (payload.action === 'up-to-date') {
    return `Hook: already up to date (v${payload.version}) at ${payload.hookPath}\n`;
  }
  if (payload.action === 'skipped') {
    return 'Hook: installation skipped\n';
  }
  const lines = [`Hook: ${payload.action} (v${payload.version})`, `Path: ${payload.hookPath}`];
  if (payload.backupPath) {
    lines.push(`Backup: ${payload.backupPath}`);
  }
  return `${lines.join('\n')}\n`;
}

// ── Seek helpers (extracted for ESLint 50-line limit) ────────────────────────

/**
 * Formats a numeric delta as " (+N)" or " (-N)", or empty string for zero/non-finite.
 * @param {*} n
 * @returns {string}
 */
function formatDelta(n) { // TODO(ts-cleanup): type CLI payload
  if (typeof n !== 'number' || !Number.isFinite(n) || n === 0) {
    return '';
  }
  const sign = n > 0 ? '+' : '';
  return ` (${sign}${n})`;
}

/**
 * Formats an operation summary object as a compact plain-text string.
 * @param {*} summary
 * @returns {string}
 */
function formatOpSummaryPlain(summary) { // TODO(ts-cleanup): type CLI payload
  const order = [
    ['NodeAdd', '+', 'node'],
    ['EdgeAdd', '+', 'edge'],
    ['PropSet', '~', 'prop'],
    ['NodeTombstone', '-', 'node'],
    ['EdgeTombstone', '-', 'edge'],
    ['BlobValue', '+', 'blob'],
  ];

  const parts = [];
  for (const [opType, symbol, label] of order) {
    const n = summary?.[opType];
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
      parts.push(`${symbol}${n}${label}`);
    }
  }
  return parts.length > 0 ? parts.join(' ') : '(empty)';
}

/**
 * Appends a per-writer tick receipt summary below a base line.
 * @param {string} baseLine
 * @param {*} payload
 * @returns {string}
 */
function appendReceiptSummary(baseLine, payload) {
  const tickReceipt = payload?.tickReceipt;
  if (!tickReceipt || typeof tickReceipt !== 'object') {
    return `${baseLine}\n`;
  }

  const entries = Object.entries(tickReceipt)
    .filter(([writerId, entry]) => writerId && entry && typeof entry === 'object')
    .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {
    return `${baseLine}\n`;
  }

  const maxWriterLen = Math.max(5, ...entries.map(([writerId]) => writerId.length));
  const receiptLines = [`  Tick ${payload.tick}:`];
  for (const [writerId, entry] of entries) {
    const sha = typeof entry.sha === 'string' ? entry.sha.slice(0, 7) : '';
    const opSummary = entry.opSummary && typeof entry.opSummary === 'object' ? entry.opSummary : entry;
    receiptLines.push(`    ${writerId.padEnd(maxWriterLen)}  ${sha.padEnd(7)}  ${formatOpSummaryPlain(opSummary)}`);
  }

  return `${baseLine}\n${receiptLines.join('\n')}\n`;
}

/**
 * Builds human-readable state count strings from a seek payload.
 * @param {*} payload
 * @returns {{nodesStr: string, edgesStr: string, patchesStr: string}}
 */
function buildStateStrings(payload) {
  const nodeLabel = payload.nodes === 1 ? 'node' : 'nodes';
  const edgeLabel = payload.edges === 1 ? 'edge' : 'edges';
  const patchLabel = payload.patchCount === 1 ? 'patch' : 'patches';
  return {
    nodesStr: `${payload.nodes} ${nodeLabel}${formatDelta(payload.diff?.nodes)}`,
    edgesStr: `${payload.edges} ${edgeLabel}${formatDelta(payload.diff?.edges)}`,
    patchesStr: `${payload.patchCount} ${patchLabel}`,
  };
}

/**
 * Renders the "tick" / "latest" / "load" seek action with receipt + structural diff.
 * @param {*} payload
 * @param {string} headerLine
 * @returns {string}
 */
function renderSeekWithDiff(payload, headerLine) {
  const base = appendReceiptSummary(headerLine, payload);
  return base + formatStructuralDiff(payload);
}

// ── Seek simple-action renderers ─────────────────────────────────────────────

/**
 * Renders seek actions that don't involve state counts: clear-cache, list, drop, save.
 * @param {*} payload
 * @returns {string|null} Rendered string, or null if action is not simple
 */
function renderSeekSimple(payload) {
  if (payload.action === 'clear-cache') {
    return `${payload.message}\n`;
  }
  if (payload.action === 'drop') {
    return `Dropped cursor "${payload.name}" (was at tick ${payload.tick}).\n`;
  }
  if (payload.action === 'save') {
    return `Saved cursor "${payload.name}" at tick ${payload.tick}.\n`;
  }
  if (payload.action === 'list') {
    return renderSeekList(payload);
  }
  return null;
}

/**
 * Renders the cursor list action.
 * @param {*} payload
 * @returns {string}
 */
function renderSeekList(payload) {
  if (payload.cursors.length === 0) {
    return 'No saved cursors.\n';
  }
  const lines = [];
  for (const c of payload.cursors) {
    const active = c.tick === payload.activeTick ? ' (active)' : '';
    lines.push(`  ${c.name}: tick ${c.tick}${active}`);
  }
  return `${lines.join('\n')}\n`;
}

// ── Seek state-action renderer ───────────────────────────────────────────────

/**
 * Renders seek actions that show state: latest, load, tick, status.
 * @param {*} payload
 * @returns {string}
 */
function renderSeekState(payload) {
  if (payload.action === 'latest') {
    const { nodesStr, edgesStr } = buildStateStrings(payload);
    return renderSeekWithDiff(
      payload,
      `${payload.graph}: returned to present (tick ${payload.maxTick}, ${nodesStr}, ${edgesStr})`,
    );
  }
  if (payload.action === 'load') {
    const { nodesStr, edgesStr } = buildStateStrings(payload);
    return renderSeekWithDiff(
      payload,
      `${payload.graph}: loaded cursor "${payload.name}" at tick ${payload.tick} of ${payload.maxTick} (${nodesStr}, ${edgesStr})`,
    );
  }
  if (payload.action === 'tick') {
    const { nodesStr, edgesStr, patchesStr } = buildStateStrings(payload);
    return renderSeekWithDiff(
      payload,
      `${payload.graph}: tick ${payload.tick} of ${payload.maxTick} (${nodesStr}, ${edgesStr}, ${patchesStr})`,
    );
  }
  // status (structuralDiff is never populated here; no formatStructuralDiff call)
  if (payload.cursor && payload.cursor.active) {
    const { nodesStr, edgesStr, patchesStr } = buildStateStrings(payload);
    return appendReceiptSummary(
      `${payload.graph}: tick ${payload.tick} of ${payload.maxTick} (${nodesStr}, ${edgesStr}, ${patchesStr})`,
      payload,
    );
  }
  return `${payload.graph}: no cursor active, ${payload.ticks.length} ticks available\n`;
}

// ── Seek main renderer ──────────────────────────────────────────────────────

/** @param {*} payload */
export function renderSeek(payload) {
  return renderSeekSimple(payload) ?? renderSeekState(payload);
}

// ── Doctor renderer ──────────────────────────────────────────────────────────

/** @param {'ok'|'warn'|'fail'} status */
function findingIcon(status) {
  if (status === 'ok') {
    return `${ANSI_GREEN}\u2713${ANSI_RESET}`;
  }
  if (status === 'warn') {
    return `${ANSI_YELLOW}\u26A0${ANSI_RESET}`;
  }
  return `${ANSI_RED}\u2717${ANSI_RESET}`;
}

/** @param {'ok'|'degraded'|'failed'} health */
function colorHealth(health) {
  if (health === 'ok') {
    return `${ANSI_GREEN}${health}${ANSI_RESET}`;
  }
  if (health === 'degraded') {
    return `${ANSI_YELLOW}${health}${ANSI_RESET}`;
  }
  return `${ANSI_RED}${health}${ANSI_RESET}`;
}

/** @param {*} payload */
export function renderDoctor(payload) {
  const lines = [
    `Graph: ${payload.graph}`,
    `Health: ${colorHealth(payload.health)}`,
    `Checked: ${payload.checkedAt}`,
    `Summary: ${payload.summary.checksRun} checks, ${payload.summary.findingsTotal} findings (${payload.summary.ok} ok, ${payload.summary.warn} warn, ${payload.summary.fail} fail)`,
    '',
  ];

  for (const f of payload.findings) {
    lines.push(`${findingIcon(f.status)} ${f.id}: ${f.message}`);
    if (f.fix) {
      lines.push(`  fix: ${f.fix}`);
    }
  }

  if (payload.summary.priorityActions.length > 0) {
    lines.push('');
    lines.push('Priority actions:');
    for (const action of payload.summary.priorityActions) {
      lines.push(`  - ${action}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

// ── Verify-audit renderer ────────────────────────────────────────────────────

/** @param {string} status */
function colorStatus(status) {
  if (status === 'VALID' || status === 'PARTIAL') {
    return `${ANSI_GREEN}${status}${ANSI_RESET}`;
  }
  return `${ANSI_RED}${status}${ANSI_RESET}`;
}

/** @param {*} payload */
export function renderVerifyAudit(payload) {
  const lines = [
    `Graph: ${payload.graph}`,
    `Verified: ${payload.verifiedAt}`,
    `Chains: ${payload.summary.total} (${payload.summary.valid} valid, ${payload.summary.partial} partial, ${payload.summary.invalid} invalid)`,
  ];

  for (const chain of payload.chains) {
    lines.push('');
    lines.push(`  Writer: ${chain.writerId}`);
    lines.push(`  Status: ${colorStatus(chain.status)}`);
    lines.push(`  Receipts: ${chain.receiptsVerified} verified`);
    if (chain.since) {
      lines.push(`  Since: ${chain.since}`);
    }
    for (const err of chain.errors) {
      lines.push(`  ${ANSI_RED}Error [${err.code}]: ${err.message}${ANSI_RESET}`);
    }
    for (const warn of chain.warnings) {
      lines.push(`  ${ANSI_YELLOW}Warning [${warn.code}]: ${warn.message}${ANSI_RESET}`);
    }
  }

  if (payload.trustWarning) {
    lines.push('');
    lines.push(`${ANSI_YELLOW}Trust: ${payload.trustWarning.message}${ANSI_RESET}`);
  }

  return `${lines.join('\n')}\n`;
}

// ── Trust renderer ────────────────────────────────────────────────────────

/** @param {string} verdict */
function colorVerdict(verdict) {
  if (verdict === 'pass') {
    return `${ANSI_GREEN}${verdict}${ANSI_RESET}`;
  }
  if (verdict === 'not_configured') {
    return `${ANSI_YELLOW}${verdict}${ANSI_RESET}`;
  }
  return `${ANSI_RED}${verdict}${ANSI_RESET}`;
}

/** @param {*} payload */
export function renderTrust(payload) {
  const lines = [
    `Graph: ${payload.graph}`,
    `Verdict: ${colorVerdict(payload.trustVerdict)}`,
    `Mode: ${payload.mode}`,
    `Source: ${payload.trust.source}`,
  ];

  const { evidenceSummary } = payload.trust;
  lines.push(`Evidence: ${evidenceSummary.activeKeys} active keys, ${evidenceSummary.revokedKeys} revoked keys, ${evidenceSummary.activeBindings} active bindings`);

  if (payload.trust.explanations.length > 0) {
    lines.push('');
    for (const expl of payload.trust.explanations) {
      const icon = expl.trusted ? `${ANSI_GREEN}\u2713${ANSI_RESET}` : `${ANSI_RED}\u2717${ANSI_RESET}`;
      lines.push(`  ${icon} ${expl.writerId}: ${expl.reasonCode}`);
      lines.push(`    ${ANSI_DIM}${expl.reason}${ANSI_RESET}`);
    }
  }

  if (payload.trust.untrustedWriters.length > 0) {
    lines.push('');
    lines.push(`${ANSI_RED}Untrusted: ${payload.trust.untrustedWriters.join(', ')}${ANSI_RESET}`);
  }

  return `${lines.join('\n')}\n`;
}
