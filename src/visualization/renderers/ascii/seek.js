/**
 * ASCII renderer for the `seek --view` command.
 * Displays a dashboard with timeline, writer status, and graph state at the current tick.
 */

import boxen from 'boxen';
import { colors } from './colors.js';
import { padRight } from '../../utils/unicode.js';
import { formatSha } from './formatters.js';
import { TIMELINE } from './symbols.js';

const MAX_TIMELINE_WIDTH = 40;

/**
 * Builds an ASCII timeline bar showing the current tick position.
 * @param {number} currentTick - The active tick
 * @param {number[]} ticks - All available ticks (sorted ascending)
 * @returns {string} Timeline string like "○───●───○"
 */
function buildSeekTimeline(currentTick, ticks) {
  if (ticks.length === 0) {
    return colors.muted('(no ticks)');
  }

  const allPoints = (ticks[0] === 0) ? [...ticks] : [0, ...ticks];
  const maxPoints = Math.min(allPoints.length, MAX_TIMELINE_WIDTH);
  let displayPoints;
  if (allPoints.length <= maxPoints) {
    displayPoints = allPoints;
  } else {
    displayPoints = [allPoints[0]];
    const step = (allPoints.length - 1) / (maxPoints - 1);
    for (let i = 1; i < maxPoints - 1; i++) {
      displayPoints.push(allPoints[Math.round(i * step)]);
    }
    displayPoints.push(allPoints[allPoints.length - 1]);
  }

  const segLen = Math.max(1, Math.floor(MAX_TIMELINE_WIDTH / displayPoints.length));
  let timeline = '';
  let labels = '';

  for (let i = 0; i < displayPoints.length; i++) {
    const tick = displayPoints[i];
    const isActive = tick === currentTick;

    if (i > 0) {
      timeline += colors.muted(TIMELINE.line.repeat(segLen));
    }

    if (isActive) {
      timeline += colors.primary(TIMELINE.dot);
    } else {
      timeline += colors.muted('\u25CB'); // ○ open circle
    }

    // Pad labels so each tick label starts at the same column as its dot
    const tickLabel = String(tick);
    const targetPos = i * (segLen + 1);
    const padNeeded = Math.max(0, targetPos - labels.length);
    labels += ' '.repeat(padNeeded) + tickLabel;
  }

  // Add pointer line
  const pointerLine = buildPointerLine(currentTick, displayPoints);

  return `${timeline}\n  ${labels}\n${pointerLine}`;
}

/**
 * Builds a pointer line ("▲") under the active tick.
 * @param {number} currentTick
 * @param {number[]} displayPoints
 * @returns {string}
 */
function buildPointerLine(currentTick, displayPoints) {
  const idx = displayPoints.indexOf(currentTick);
  if (idx === -1) {
    return '';
  }

  const segLen = Math.max(1, Math.floor(MAX_TIMELINE_WIDTH / displayPoints.length));
  const offset = idx * (segLen + 1);
  return `  ${' '.repeat(offset)}${colors.primary('\u25B2')}`; // ▲
}

/**
 * Renders a writer row showing inclusion status at the given tick.
 * @param {Object} opts
 * @param {string} opts.writerId
 * @param {{ticks: number[], tipSha: string|null}} opts.writerInfo
 * @param {number} opts.currentTick
 * @returns {string}
 */
function renderWriterRow({ writerId, writerInfo, currentTick }) {
  const included = writerInfo.ticks.filter((t) => t <= currentTick);
  const maxWriterTick = included.length > 0 ? included[included.length - 1] : 0;
  const marker = included.length > 0
    ? colors.success(TIMELINE.dot)
    : colors.muted('\u25CB');

  const name = padRight(writerId, 16);
  const lamportLabel = included.length > 0
    ? `L${maxWriterTick}`
    : colors.muted('--');
  const shaLabel = writerInfo.tipSha ? formatSha(writerInfo.tipSha) : colors.muted('none');

  return `    ${name}  ${marker} ${lamportLabel}  ${shaLabel}`;
}

/**
 * Builds the body lines for the seek dashboard.
 * @param {Object} payload - Seek payload
 * @returns {string[]} Lines for the box body
 */
function buildSeekBodyLines(payload) {
  const { graph, tick, maxTick, ticks, nodes, edges, patchCount, perWriter } = payload;
  const lines = [];

  lines.push('');
  lines.push(`  ${colors.bold('GRAPH:')} ${graph}`);
  lines.push(`  ${colors.bold('POSITION:')} tick ${tick} of ${maxTick}`);
  lines.push('');
  lines.push(`  ${buildSeekTimeline(tick, ticks)}`);
  lines.push('');

  const writerEntries = perWriter instanceof Map
    ? [...perWriter.entries()]
    : Object.entries(perWriter).map(([k, v]) => [k, v]);

  if (writerEntries.length > 0) {
    lines.push(`  Writers included at tick ${tick}:`);
    for (const [writerId, writerInfo] of writerEntries) {
      lines.push(renderWriterRow({ writerId, writerInfo, currentTick: tick }));
    }
    lines.push('');
  }

  const edgeLabel = edges === 1 ? 'edge' : 'edges';
  const nodeLabel = nodes === 1 ? 'node' : 'nodes';
  const patchLabel = patchCount === 1 ? 'patch' : 'patches';
  lines.push(`  ${colors.bold('State:')} ${nodes} ${nodeLabel}, ${edges} ${edgeLabel}, ${patchCount} ${patchLabel}`);
  lines.push('');

  return lines;
}

/**
 * Renders the seek view dashboard.
 *
 * @param {Object} payload - Seek payload
 * @returns {string} Formatted ASCII output
 */
export function renderSeekView(payload) {
  const lines = buildSeekBodyLines(payload);
  const body = lines.join('\n');

  return `${boxen(body, {
    title: ' SEEK ',
    titleAlignment: 'center',
    padding: 0,
    borderStyle: 'double',
    borderColor: 'cyan',
  })}\n`;
}
