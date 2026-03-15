/**
 * Plain-text renderers for CLI output.
 *
 * Each function accepts a command payload and returns a formatted string
 * (with trailing newline) suitable for process.stdout.write().
 */

import { formatStructuralDiff } from '../../src/visualization/renderers/ascii/seek.js';

// ── Payload typedefs ────────────────────────────────────────────────────────

/**
 * @typedef {{ installed: boolean, foreign?: boolean, current?: boolean, version?: string }} HookStatus
 * @typedef {{ repo: string, graphs: Array<{ name: string, writers?: { count: number } | null, checkpoint?: { sha: string } | null, coverage?: { sha: string } | null, cursor?: { active: boolean, tick: number, mode: string } | null }> }} InfoPayload
 * @typedef {{ graph: string, stateHash?: string, nodes: Array<{ id?: string, props?: Record<string, unknown>, edges?: NodeEdges }>, _renderedAscii?: string, _renderedSvg?: string }} QueryPayload
 * @typedef {{ outgoing?: Array<{ label: string, to: string }>, incoming?: Array<{ label: string, from: string }> }} NodeEdges
 * @typedef {{ graph: string, from: string, to: string, found: boolean, length?: number, path?: string[] }} PathPayload
 * @typedef {{ graph: string, health: { status: string }, checkpoint?: { sha: string, ageSeconds: number | null } | null, writers: { count: number, heads: Array<{ writerId: string, sha: string }> }, coverage?: { sha: string, missingWriters: string[] } | null, gc?: { totalTombstones: number, tombstoneRatio: number } | null, hook?: HookStatus | null, status?: { cachedState: string, patchesSinceCheckpoint: number, tombstoneRatio: number, writers: number } | null }} CheckPayload
 * @typedef {{ graph: string, writer: string, nodeFilter?: string | null, entries: Array<{ sha: string, lamport: number, opCount: number }> }} HistoryPayload
 * @typedef {{ error: { message: string } }} ErrorPayload
 * @typedef {{ graphs: Array<{ graph: string, nodes?: number, edges?: number, checkpoint?: string, error?: string }> }} MaterializePayload
 * @typedef {{ action: string, hookPath?: string, version?: string, backupPath?: string, name?: string }} InstallHooksPayload
 * @typedef {{ graph?: string, action: string, tick?: number, maxTick?: number, ticks?: number[], nodes?: number, edges?: number, patchCount?: number, perWriter?: Record<string, unknown>, diff?: { nodes?: number, edges?: number } | null, tickReceipt?: Record<string, unknown>, structuralDiff?: import('../../src/domain/services/StateDiff.js').StateDiffResult | null, cursor?: { active: boolean, tick?: number }, message?: string, cursors?: Array<{ name: string, tick: number }>, activeTick?: number | null, name?: string, diffBaseline?: string, baselineTick?: number | null, truncated?: boolean, totalChanges?: number, shownChanges?: number }} SeekPayload
 * @typedef {{ graph: string, health: string, checkedAt: string, summary: { checksRun: number, findingsTotal: number, ok: number, warn: number, fail: number, priorityActions: string[] }, findings: Array<{ status: string, id: string, message: string, fix?: string }> }} DoctorPayload
 * @typedef {{ graph: string, verifiedAt: string, summary: { total: number, valid: number, partial: number, invalid: number }, chains: Array<{ writerId: string, status: string, receiptsVerified: number, since?: string, errors: Array<{ code: string, message: string }>, warnings: Array<{ code: string, message: string }> }>, trustWarning?: { message: string } }} VerifyAuditPayload
 * @typedef {{ graph: string, trustVerdict: string, mode: string, trust: { source: string, evidenceSummary: { activeKeys: number, revokedKeys: number, activeBindings: number }, explanations: Array<{ trusted: boolean, writerId: string, reasonCode: string, reason: string }>, untrustedWriters: string[] } }} TrustPayload
 * @typedef {{ type: string, node?: string, from?: string, to?: string, label?: string, key?: string, value?: unknown }} PatchOp
 * @typedef {{ graph: string, sha: string, writer: string, lamport: number, schema?: number, ops: PatchOp[] }} PatchShowPayload
 * @typedef {{ graph: string, total: number, showing: number, writerFilter?: string | null, entries: Array<{ sha: string, writer: string, lamport: number, opCount: number, nodeIds: string[] }> }} PatchListPayload
 * @typedef {import('../../index.js').ConflictAnalysis & { graph: string, debugTopic: 'conflicts' }} DebugConflictsPayload
 */

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

/** @param {HookStatus} hook */
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

/** @param {InfoPayload} payload */
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

/**
 * Appends edge lines for a single node to the output array.
 * @param {string[]} lines
 * @param {NodeEdges} edges
 */
function appendNodeEdges(lines, edges) {
  if (edges.outgoing && edges.outgoing.length > 0) {
    for (const e of edges.outgoing) {
      lines.push(`  -> ${e.label} -> ${e.to}`);
    }
  }
  if (edges.incoming && edges.incoming.length > 0) {
    for (const e of edges.incoming) {
      lines.push(`  <- ${e.label} <- ${e.from}`);
    }
  }
}

/** @param {QueryPayload} payload */
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
    if (node.edges) {
      appendNodeEdges(lines, node.edges);
    }
  }

  return `${lines.join('\n')}\n`;
}

/** @param {PathPayload} payload */
export function renderPath(payload) {
  const lines = [
    `Graph: ${payload.graph}`,
    `From: ${payload.from}`,
    `To: ${payload.to}`,
    `Found: ${payload.found ? 'yes' : 'no'}`,
  ];

  if (payload.found) {
    lines.push(`Length: ${payload.length}`);
  }

  if (payload.path && payload.path.length > 0) {
    lines.push(`Path: ${payload.path.join(' -> ')}`);
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Appends checkpoint and writer lines to check output.
 * @param {string[]} lines
 * @param {CheckPayload} payload
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
 * @param {CheckPayload} payload
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

/** @param {CheckPayload} payload */
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

/** @param {HistoryPayload} payload */
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

/** @param {ErrorPayload} payload */
export function renderError(payload) {
  return `Error: ${payload.error.message}\n`;
}

/** @param {MaterializePayload} payload */
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

/** @param {InstallHooksPayload} payload */
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
 * @param {unknown} n
 * @returns {string}
 */
function formatDelta(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n === 0) {
    return '';
  }
  const sign = n > 0 ? '+' : '';
  return ` (${sign}${n})`;
}

/**
 * Formats an operation summary object as a compact plain-text string.
 * @param {Record<string, number> | null | undefined} summary
 * @returns {string}
 */
function formatOpSummaryPlain(summary) {
  const order = [
    ['NodeAdd', '+', 'node'],
    ['EdgeAdd', '+', 'edge'],
    ['prop', '~', 'prop'],       // coalesced PropSet + NodePropSet
    ['EdgePropSet', '~', 'eprop'],
    ['NodeTombstone', '-', 'node'],
    ['EdgeTombstone', '-', 'edge'],
    ['BlobValue', '+', 'blob'],
  ];

  const parts = [];
  for (const [opType, symbol, label] of order) {
    // Coalesce PropSet + NodePropSet into one bucket
    const n = opType === 'prop'
      ? (summary?.PropSet || 0) + (summary?.NodePropSet || 0) || undefined
      : summary?.[opType];
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
      parts.push(`${symbol}${n}${label}`);
    }
  }
  return parts.length > 0 ? parts.join(' ') : '(empty)';
}

/**
 * Appends a per-writer tick receipt summary below a base line.
 * @param {string} baseLine
 * @param {SeekPayload} payload
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
    /** @type {Record<string, unknown>} */
    const rec = /** @type {Record<string, unknown>} */ (entry);
    const sha = typeof rec.sha === 'string' ? rec.sha.slice(0, 7) : '';
    const opSummary = rec.opSummary && typeof rec.opSummary === 'object'
      ? /** @type {Record<string, number>} */ (rec.opSummary)
      : /** @type {Record<string, number>} */ (rec);
    receiptLines.push(`    ${writerId.padEnd(maxWriterLen)}  ${sha.padEnd(7)}  ${formatOpSummaryPlain(opSummary)}`);
  }

  return `${baseLine}\n${receiptLines.join('\n')}\n`;
}

/**
 * Builds human-readable state count strings from a seek payload.
 * @param {SeekPayload} payload
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
 * @param {SeekPayload} payload
 * @param {string} headerLine
 * @returns {string}
 */
function renderSeekWithDiff(payload, headerLine) {
  const base = appendReceiptSummary(headerLine, payload);
  return base + formatStructuralDiff(/** @type {import('../../src/visualization/renderers/ascii/seek.js').SeekPayload} */ (payload));
}

// ── Seek simple-action renderers ─────────────────────────────────────────────

/**
 * Renders seek actions that don't involve state counts: clear-cache, list, drop, save.
 * @param {SeekPayload} payload
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
 * @param {SeekPayload} payload
 * @returns {string}
 */
function renderSeekList(payload) {
  if (!payload.cursors || payload.cursors.length === 0) {
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
 * @param {SeekPayload} payload
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
  return `${payload.graph}: no cursor active, ${(payload.ticks ?? []).length} ticks available\n`;
}

// ── Seek main renderer ──────────────────────────────────────────────────────

/** @param {SeekPayload} payload */
export function renderSeek(payload) {
  return renderSeekSimple(payload) ?? renderSeekState(payload);
}

// ── Doctor renderer ──────────────────────────────────────────────────────────

/** @param {string} status */
function findingIcon(status) {
  if (status === 'ok') {
    return `${ANSI_GREEN}\u2713${ANSI_RESET}`;
  }
  if (status === 'warn') {
    return `${ANSI_YELLOW}\u26A0${ANSI_RESET}`;
  }
  return `${ANSI_RED}\u2717${ANSI_RESET}`;
}

/** @param {string} health */
function colorHealth(health) {
  if (health === 'ok') {
    return `${ANSI_GREEN}${health}${ANSI_RESET}`;
  }
  if (health === 'degraded') {
    return `${ANSI_YELLOW}${health}${ANSI_RESET}`;
  }
  return `${ANSI_RED}${health}${ANSI_RESET}`;
}

/** @param {DoctorPayload} payload */
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

/** @param {VerifyAuditPayload} payload */
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

/** @param {TrustPayload} payload */
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

// ── Patch renderers ──────────────────────────────────────────────────────────

/**
 * Formats a single operation line for patch show output.
 * @param {PatchOp} op
 * @returns {string|null}
 */
function formatPatchOp(op) {
  if (op.type === 'NodeAdd') {
    return `  + node ${op.node}`;
  }
  if (op.type === 'NodeTombstone') {
    return `  - node ${op.node}`;
  }
  if (op.type === 'EdgeAdd') {
    return `  + edge ${op.from} -[${op.label}]-> ${op.to}`;
  }
  if (op.type === 'EdgeTombstone') {
    return `  - edge ${op.from} -[${op.label}]-> ${op.to}`;
  }
  if (op.type === 'PropSet' || op.type === 'NodePropSet') {
    return `  ~ ${op.node}.${op.key} = ${JSON.stringify(op.value)}`;
  }
  if (op.type === 'EdgePropSet') {
    return `  ~ edge(${op.from} -[${op.label}]-> ${op.to}).${op.key} = ${JSON.stringify(op.value)}`;
  }
  if (op.type === 'BlobValue') {
    return `  + blob ${op.node}`;
  }
  return null;
}

/** @param {PatchShowPayload} payload */
export function renderPatchShow(payload) {
  const lines = [
    `Graph: ${payload.graph}`,
    `SHA: ${payload.sha}`,
    `Writer: ${payload.writer}`,
    `Lamport: ${payload.lamport}`,
    `Schema: ${payload.schema}`,
    `Operations: ${payload.ops.length}`,
    '',
  ];

  for (const op of payload.ops) {
    const line = formatPatchOp(op);
    if (line) {
      lines.push(line);
    }
  }

  return `${lines.join('\n')}\n`;
}

/** @param {PatchListPayload} payload */
export function renderPatchList(payload) {
  const lines = [
    `Graph: ${payload.graph}`,
    `Patches: ${payload.showing}/${payload.total}`,
  ];

  if (payload.writerFilter) {
    lines.push(`Writer: ${payload.writerFilter}`);
  }

  lines.push('');

  for (const entry of payload.entries) {
    const nodes = entry.nodeIds.length > 0 ? ` [${entry.nodeIds.join(', ')}]` : '';
    lines.push(`  ${entry.sha}  L${String(entry.lamport).padStart(3)}  ${entry.writer.padEnd(20)}  ${entry.opCount} ops${nodes}`);
  }

  return `${lines.join('\n')}\n`;
}

// ── Debug renderer ───────────────────────────────────────────────────────────

/**
 * @param {import('../../index.js').ConflictAnchor} anchor
 * @returns {string}
 */
function formatConflictAnchor(anchor) {
  return `${anchor.writerId}@L${anchor.lamport} op#${anchor.opIndex} ${anchor.patchSha.slice(0, 7)}`;
}

/**
 * @param {import('../../index.js').ConflictTarget} target
 * @returns {string}
 */
function formatConflictTarget(target) {
  if (target.targetKind === 'node') {
    return target.entityId || target.targetDigest;
  }
  if (target.targetKind === 'node_property') {
    return `${target.entityId}.${target.propertyKey}`;
  }
  if (target.targetKind === 'edge') {
    return `${target.from} -[${target.label}]-> ${target.to}`;
  }
  if (target.targetKind === 'edge_property') {
    return `edge(${target.from} -[${target.label}]-> ${target.to}).${target.propertyKey}`;
  }
  return target.targetDigest;
}

/** @param {DebugConflictsPayload} payload */
export function renderDebug(payload) {
  if (payload.debugTopic !== 'conflicts') {
    return `${JSON.stringify(payload, null, 2)}\n`;
  }

  const lines = [
    `Graph: ${payload.graph}`,
    `Topic: conflicts`,
    `Analysis Version: ${payload.analysisVersion}`,
    `Lamport Ceiling: ${payload.resolvedCoordinate.lamportCeiling ?? 'head'}`,
    `Frontier Writers: ${Object.keys(payload.resolvedCoordinate.frontier).length}`,
    `Snapshot: ${payload.analysisSnapshotHash}`,
    `Conflicts: ${payload.conflicts.length}`,
  ];

  if (payload.diagnostics && payload.diagnostics.length > 0) {
    lines.push('');
    lines.push('Diagnostics:');
    for (const diagnostic of payload.diagnostics) {
      lines.push(`- ${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}`);
    }
  }

  for (const trace of payload.conflicts) {
    lines.push('');
    lines.push(`- ${trace.kind} ${formatConflictTarget(trace.target)}`);
    lines.push(`  Winner: ${formatConflictAnchor(trace.winner.anchor)} (${trace.winner.effectDigest.slice(0, 12)})`);
    lines.push(`  Resolution: ${trace.resolution.reducerId} / ${trace.resolution.basis.code} / ${trace.resolution.winnerMode}`);
    if (trace.resolution.basis.reason) {
      lines.push(`  Why: ${trace.resolution.basis.reason}`);
    }
    lines.push(`  Fingerprint: ${trace.whyFingerprint}`);
    lines.push('  Losers:');
    for (const loser of trace.losers) {
      const relation = loser.causalRelationToWinner ? ` relation=${loser.causalRelationToWinner}` : '';
      lines.push(
        `    - ${formatConflictAnchor(loser.anchor)} (${loser.effectDigest.slice(0, 12)})${relation} distinct=${loser.structurallyDistinctAlternative ? 'yes' : 'no'} replayable=${loser.replayableFromAnchors ? 'yes' : 'no'}`
      );
      if (loser.notes && loser.notes.length > 0) {
        lines.push(`      notes: ${loser.notes.join(', ')}`);
      }
    }
    if (trace.classificationNotes && trace.classificationNotes.length > 0) {
      lines.push(`  Notes: ${trace.classificationNotes.join(', ')}`);
    }
  }

  return `${lines.join('\n')}\n`;
}
