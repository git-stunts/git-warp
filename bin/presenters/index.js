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
} from './text.js';

// ── Color control ────────────────────────────────────────────────────────────

/**
 * Determines whether ANSI color codes should be stripped from output.
 *
 * Precedence: FORCE_COLOR=0 (strip) > FORCE_COLOR!='' (keep) > NO_COLOR > !isTTY > CI.
 * @returns {boolean}
 */
export function shouldStripColor() {
  if (process.env.FORCE_COLOR === '0') {
    return true;
  }
  if (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== '') {
    return false;
  }
  if (process.env.NO_COLOR !== undefined) {
    return true;
  }
  if (!process.stdout.isTTY) {
    return true;
  }
  if (process.env.CI !== undefined) {
    return true;
  }
  return false;
}

// ── Text renderer map ────────────────────────────────────────────────────────

/** @type {Map<string, function(*): string>} */
const TEXT_RENDERERS = new Map(/** @type {[string, function(*): string][]} */ ([
  ['info', renderInfo],
  ['query', renderQuery],
  ['path', renderPath],
  ['check', renderCheck],
  ['doctor', renderDoctor],
  ['history', renderHistory],
  ['materialize', renderMaterialize],
  ['seek', renderSeek],
  ['verify-audit', renderVerifyAudit],
  ['install-hooks', renderInstallHooks],
]));

/** @type {Map<string, function(*): string>} */
const VIEW_RENDERERS = new Map(/** @type {[string, function(*): string][]} */ ([
  ['info', renderInfoView],
  ['check', renderCheckView],
  ['history', renderHistoryView],
  ['path', renderPathView],
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
 * Handles svg:PATH and html:PATH view modes for commands that carry _renderedSvg.
 * @param {*} payload
 * @param {string} view
 * @returns {boolean} true if handled
 */
function handleFileExport(payload, view) {
  if (typeof view === 'string' && view.startsWith('svg:')) {
    const svgPath = view.slice(4);
    if (!payload._renderedSvg) {
      process.stderr.write('No graph data — skipping SVG export.\n');
    } else {
      fs.writeFileSync(svgPath, payload._renderedSvg);
      process.stderr.write(`SVG written to ${svgPath}\n`);
    }
    return true;
  }
  if (typeof view === 'string' && view.startsWith('html:')) {
    const htmlPath = view.slice(5);
    if (!payload._renderedSvg) {
      process.stderr.write('No graph data — skipping HTML export.\n');
    } else {
      writeHtmlExport(htmlPath, payload._renderedSvg);
      process.stderr.write(`HTML written to ${htmlPath}\n`);
    }
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
 * Writes a command result to stdout/stderr in the requested format.
 *
 * @param {*} payload - Command result payload
 * @param {{format: string, command: string, view: string|null|boolean}} options
 */
export function present(payload, { format, command, view }) {
  // Error payloads always go to stderr as plain text
  if (payload?.error) {
    process.stderr.write(renderError(payload));
    return;
  }

  // JSON: sanitize + pretty-print
  if (format === 'json') {
    process.stdout.write(`${stableStringify(sanitizePayload(payload))}\n`);
    return;
  }

  // NDJSON: sanitize + compact single line
  if (format === 'ndjson') {
    process.stdout.write(`${compactStringify(sanitizePayload(payload))}\n`);
    return;
  }

  // Text with view mode
  if (view) {
    presentView(payload, command, view);
    return;
  }

  // Plain text
  const renderer = TEXT_RENDERERS.get(command);
  if (renderer) {
    writeText(renderer(payload), shouldStripColor());
  } else {
    // Fallback for unknown commands
    process.stdout.write(`${stableStringify(sanitizePayload(payload))}\n`);
  }
}

/**
 * Handles --view output dispatch (ASCII view, SVG file, HTML file).
 * @param {*} payload
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
    writeText(`${payload._renderedAscii ?? ''}\n`, strip);
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
