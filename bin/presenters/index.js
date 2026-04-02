/**
 * Unified output dispatcher for CLI commands.
 *
 * Replaces the 112-line emit() function in warp-graph.js with clean
 * format dispatch: text, json, ndjson — plus view mode handling.
 */

import fs from 'node:fs';
import process from 'node:process';

import { stripAnsi } from '../../src/visualization/utils/ansi.js';
import { renderInfoView } from '../../src/visualization/renderers/ascii/info.js';
import { renderCheckView } from '../../src/visualization/renderers/ascii/check.js';
import { renderHistoryView } from '../../src/visualization/renderers/ascii/history.js';
import { renderPathView } from '../../src/visualization/renderers/ascii/path.js';
import { renderMaterializeView } from '../../src/visualization/renderers/ascii/materialize.js';
import { renderSeekView } from '../../src/visualization/renderers/ascii/seek.js';

import { stableStringify, compactStringify, sanitizePayload } from './json.js';
import {
  renderInfo,
  renderQuery,
  renderPath,
  renderCheck,
  renderDoctor,
  renderHistory,
  renderError,
  renderMaterialize,
  renderInstallHooks,
  renderSeek,
  renderVerifyAudit,
  renderTrust,
  renderPatchShow,
  renderPatchList,
  renderDebug,
  renderStrand,
} from './text.js';

/**
 * Reads an environment variable by key (avoids dot-notation ESLint conflict with noPropertyAccessFromIndexSignature).
 *
 * @param {string} key
 * @returns {string | undefined}
 */
function getEnv(key) {
  return process.env[key];
}

// ── Color control ────────────────────────────────────────────────────────────

/**
 * Returns true if FORCE_COLOR is set to a non-empty, non-zero value.
 *
 * @returns {boolean}
 */
function isForceColorEnabled() {
  const fc = getEnv('FORCE_COLOR');
  return fc !== undefined && fc !== '' && fc !== '0';
}

/**
 * Returns true if the environment signals color should be suppressed.
 *
 * @returns {boolean}
 */
function isColorSuppressed() {
  return getEnv('NO_COLOR') !== undefined || !process.stdout.isTTY || getEnv('CI') !== undefined;
}

/**
 * Determines whether ANSI color codes should be stripped from output.
 *
 * Precedence: FORCE_COLOR=0 (strip) > FORCE_COLOR!='' (keep) > NO_COLOR > !isTTY > CI.
 * @returns {boolean}
 */
export function shouldStripColor() {
  if (getEnv('FORCE_COLOR') === '0') {
    return true;
  }
  if (isForceColorEnabled()) {
    return false;
  }
  return isColorSuppressed();
}

// ── Text renderer map ────────────────────────────────────────────────────────

/**
 * Routes patch rendering to show or list based on payload shape.
 *
 * @param {import('./text.js').PatchShowPayload & Partial<import('./text.js').PatchListPayload>} payload
 */
function renderPatch(payload) {
  if (payload.ops !== undefined && payload.ops !== null) {
    return renderPatchShow(payload);
  }
  return renderPatchList(/** @type {import('./text.js').PatchListPayload} */ (payload));
}

/**
 * Returns true if the payload has orphan data worth displaying.
 *
 * @param {{ orphanCount?: number, orphans?: string[] }} payload - Tree payload to check
 * @returns {boolean}
 */
function hasOrphans(payload) {
  return payload.orphanCount !== undefined && payload.orphanCount !== null
    && payload.orphanCount > 0
    && payload.orphans !== undefined && payload.orphans !== null;
}

/**
 * Renders a tree command payload as plain text.
 *
 * @param {{ graph: string, tree?: string, orphanCount?: number, orphans?: string[] }} payload - Tree command result
 */
function renderTree(payload) {
  const lines = [`Graph: ${payload.graph}`];
  if (payload.tree !== undefined && payload.tree !== null && payload.tree.length > 0) {
    lines.push(payload.tree);
  }
  if (hasOrphans(payload)) {
    lines.push('');
    lines.push(`Orphans (${/** @type {number} */ (payload.orphanCount)}): ${/** @type {string[]} */ (payload.orphans).join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
}

/** @type {Map<string, function(unknown): string>} */
const TEXT_RENDERERS = new Map(/** @type {[string, function(unknown): string][]} */ ([
  ['info', renderInfo],
  ['query', renderQuery],
  ['path', renderPath],
  ['check', renderCheck],
  ['doctor', renderDoctor],
  ['history', renderHistory],
  ['materialize', renderMaterialize],
  ['seek', renderSeek],
  ['verify-audit', renderVerifyAudit],
  ['trust', renderTrust],
  ['patch', renderPatch],
  ['debug', renderDebug],
  ['strand', renderStrand],
  ['tree', renderTree],
  ['install-hooks', renderInstallHooks],
]));

/** View-mode renderers keyed by command name. @type {Map<string, function(unknown): string>} */
const VIEW_RENDERERS = new Map(/** @type {[string, function(unknown): string][]} */ ([
  ['info', renderInfoView],
  ['check', renderCheckView],
  ['history', renderHistoryView],
  ['path', (/** @type {Parameters<typeof renderPathView>[0]} */ payload) => renderPathView(payload, { terminalWidth: process.stdout.columns })],
  ['materialize', renderMaterializeView],
  ['seek', renderSeekView],
]));

// ── HTML export ──────────────────────────────────────────────────────────────

/**
 * Wraps SVG content in a minimal HTML document and writes it to disk.
 * @param {string} filePath
 * @param {string} svgContent
 */
function writeHtmlExport(filePath, svgContent) {
  const html = `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>git-warp</title></head><body>\n${svgContent}\n</body></html>`;
  fs.writeFileSync(filePath, html);
}

// ── SVG / HTML file export ───────────────────────────────────────────────────

/**
 * Writes SVG or HTML content to a file path, logging the result to stderr.
 *
 * @param {{ _renderedSvg?: string }} payload - Payload with optional pre-rendered SVG
 * @param {string} filePath - Destination file path
 * @param {'svg'|'html'} format - Export format
 */
function writeExportFile(payload, filePath, format) {
  if (payload._renderedSvg === undefined || payload._renderedSvg === null || payload._renderedSvg.length === 0) {
    process.stderr.write(`No graph data — skipping ${format.toUpperCase()} export.\n`);
    return;
  }
  if (format === 'html') {
    writeHtmlExport(filePath, payload._renderedSvg);
  } else {
    fs.writeFileSync(filePath, payload._renderedSvg);
  }
  process.stderr.write(`${format.toUpperCase()} written to ${filePath}\n`);
}

/**
 * Handles svg:PATH and html:PATH view modes for commands that carry _renderedSvg.
 *
 * @param {{ _renderedSvg?: string }} payload - Payload with optional pre-rendered SVG
 * @param {string} view - View mode string (e.g. "svg:/path" or "html:/path")
 * @returns {boolean} true if handled
 */
function handleFileExport(payload, view) {
  if (typeof view === 'string' && view.startsWith('svg:')) {
    writeExportFile(payload, view.slice(4), 'svg');
    return true;
  }
  if (typeof view === 'string' && view.startsWith('html:')) {
    writeExportFile(payload, view.slice(5), 'html');
    return true;
  }
  return false;
}

// ── Output helpers ───────────────────────────────────────────────────────────

/**
 * Writes text to stdout, optionally stripping ANSI codes.
 * @param {string} text
 * @param {boolean} strip
 */
function writeText(text, strip) {
  process.stdout.write(strip ? stripAnsi(text) : text);
}

// ── Main dispatcher ──────────────────────────────────────────────────────────

/**
 * Writes a serialized JSON payload to stdout in the specified format.
 *
 * @param {Record<string, unknown>} payload - Command result payload
 * @param {string} format - Either 'json' or 'ndjson'
 */
function writeJsonOutput(payload, format) {
  const stringify = format === 'ndjson' ? compactStringify : stableStringify;
  process.stdout.write(`${stringify(sanitizePayload(payload))}\n`);
}

/**
 * Renders a payload using plain text format and writes to stdout.
 *
 * @param {Record<string, unknown>} payload - Command result payload
 * @param {string} command - CLI command name for renderer lookup
 */
function writeTextOutput(payload, command) {
  const renderer = TEXT_RENDERERS.get(command);
  if (renderer !== undefined) {
    writeText(renderer(payload), shouldStripColor());
  } else {
    process.stdout.write(`${stableStringify(sanitizePayload(payload))}\n`);
  }
}

/**
 * Returns true if the payload represents an error result.
 *
 * @param {Record<string, unknown>} payload - Payload to inspect
 * @returns {boolean}
 */
function isErrorPayload(payload) {
  const errorKey = 'error';
  return payload !== null && payload !== undefined && errorKey in payload && payload[errorKey] !== undefined;
}

/**
 * Returns true if the view option is actively set (non-null, non-false).
 *
 * @param {string|null|boolean} view - View option from CLI
 * @returns {boolean}
 */
function isViewActive(view) {
  return view !== null && view !== undefined && view !== false;
}

/**
 * Writes a command result to stdout/stderr in the requested format.
 *
 * @param {Record<string, unknown>} payload - Command result payload
 * @param {{format: string, command: string, view: string|null|boolean}} options - Output options
 */
export function present(payload, { format, command, view }) {
  if (isErrorPayload(payload)) {
    process.stderr.write(renderError(/** @type {import('./text.js').ErrorPayload} */ (payload)));
    return;
  }
  if (format === 'json' || format === 'ndjson') {
    writeJsonOutput(payload, format);
    return;
  }
  if (isViewActive(view)) {
    presentView(payload, command, /** @type {string | boolean} */ (view));
    return;
  }
  writeTextOutput(payload, command);
}

/**
 * Handles --view output dispatch (ASCII view, SVG file, HTML file).
 * @param {Record<string, unknown>} payload
 * @param {string} command
 * @param {string|boolean} view
 */
function presentView(payload, command, view) {
  const strip = shouldStripColor();

  // File exports: svg:PATH, html:PATH
  if (handleFileExport(payload, /** @type {string} */ (view))) {
    return;
  }

  // query is special: uses pre-rendered _renderedAscii
  if (command === 'query') {
    const asciiKey = '_renderedAscii';
    const ascii = typeof payload[asciiKey] === 'string' ? payload[asciiKey] : '';
    writeText(`${ascii}\n`, strip);
    return;
  }

  // Dispatch to view renderer
  const viewRenderer = VIEW_RENDERERS.get(command);
  if (viewRenderer) {
    writeText(viewRenderer(payload), strip);
  } else {
    writeText(`${stableStringify(sanitizePayload(payload))}\n`, strip);
  }
}
