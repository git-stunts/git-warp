#!/usr/bin/env node

/**
 * scripts/roadmap.js — Roadmap management tool
 *
 * Usage:
 *   node scripts/roadmap.js close <taskId>   Close a task, propagate unblocks
 *   node scripts/roadmap.js open             List OPEN tasks
 *   node scripts/roadmap.js status           Show stats per milestone
 *   node scripts/roadmap.js show             Draw colored ASCII DAG
 *   node scripts/roadmap.js init             Bootstrap Status fields + DAG
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROADMAP_PATH = resolve(__dirname, '..', 'ROADMAP.md');

const DAG_START = '<!-- ROADMAP:DAG:START -->';
const DAG_END = '<!-- ROADMAP:DAG:END -->';

const MILESTONES = [
  { code: 'AP', name: 'AUTOPILOT', version: 'v7.1.0' },
  { code: 'GK', name: 'GROUNDSKEEPER', version: 'v7.2.0' },
  { code: 'WT', name: 'WEIGHTED', version: 'v7.3.0' },
  { code: 'HS', name: 'HANDSHAKE', version: 'v7.4.0' },
  { code: 'CP', name: 'COMPASS', version: 'v7.5.0' },
  { code: 'LH', name: 'LIGHTHOUSE', version: 'v7.6.0' },
  { code: 'PL', name: 'PULSE', version: 'v7.7.0' },
  { code: 'HG', name: 'HOLOGRAM', version: 'v8.0.0' },
  { code: 'EC', name: 'ECHO', version: 'v9.0.0' },
  { code: 'BK', name: 'BULKHEAD', version: 'v10.0.0' },
  { code: 'RC', name: 'RECALL', version: 'v10.4.0' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Extract task IDs (XX/YYY/N pattern) from a string, ignoring parenthetical notes. */
function extractTaskIds(str) {
  if (!str || str.trim() === 'None') return [];
  return [...str.matchAll(/[A-Z]{2}\/[A-Z]+\/\d+/g)].map(m => m[0]);
}

function getMilestone(taskId) {
  const prefix = taskId.split('/')[0];
  return MILESTONES.find(m => m.code === prefix);
}

function pad(s, n) {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

// ── Parsing ──────────────────────────────────────────────────────────────────

function parseTasks(content) {
  const tasks = new Map();
  const regex = /^####\s+([\w/]+)\s+—\s+(.+)$/gm;
  const headers = [];
  let m;

  while ((m = regex.exec(content)) !== null) {
    headers.push({ id: m[1], title: m[2], pos: m.index });
  }

  for (let i = 0; i < headers.length; i++) {
    const { id, title, pos } = headers[i];
    const endPos = i + 1 < headers.length ? headers[i + 1].pos : content.length;
    const section = content.substring(pos, endPos);

    const statusMatch = section.match(/\*\*Status:\*\*\s*`(\w+)`/);
    const blockedByMatch = section.match(/\*\*Blocked [Bb]y:\*\*\s*(.+)/);
    const blockingMatch = section.match(/\*\*Blocking:\*\*\s*(.+)/);
    const hoursMatch = section.match(/\*\*Estimated Hours:\*\*\s*(\d+)/);
    const ms = getMilestone(id);

    tasks.set(id, {
      id,
      title,
      status: statusMatch ? statusMatch[1] : null,
      blockedBy: blockedByMatch ? extractTaskIds(blockedByMatch[1]) : [],
      blocking: blockingMatch ? extractTaskIds(blockingMatch[1]) : [],
      hours: hoursMatch ? parseInt(hoursMatch[1]) : 0,
      milestone: ms ? ms.name : id.split('/')[0],
      milestoneCode: id.split('/')[0],
    });
  }

  normalizeGraph(tasks);
  return tasks;
}

/**
 * Normalize the graph: ensure blocking/blockedBy are symmetric.
 * Some cross-milestone edges are only recorded on one side in the ROADMAP.
 */
function normalizeGraph(tasks) {
  for (const [id, task] of tasks) {
    // For each task I block, make sure that child's blockedBy includes me
    for (const childId of task.blocking) {
      const child = tasks.get(childId);
      if (child && !child.blockedBy.includes(id)) {
        child.blockedBy.push(id);
      }
    }
    // For each task that blocks me, make sure that parent's blocking includes me
    for (const parentId of task.blockedBy) {
      const parent = tasks.get(parentId);
      if (parent && !parent.blocking.includes(id)) {
        parent.blocking.push(id);
      }
    }
  }
}

// ── File mutation ────────────────────────────────────────────────────────────

/**
 * Set (or insert) a task's Status field in the ROADMAP content string.
 * Searches by task ID pattern so it works even after prior edits shift positions.
 */
function setTaskStatus(content, taskId, newStatus) {
  const escapedId = escapeRegex(taskId);

  // Find the task header
  const headerRegex = new RegExp(`####\\s+${escapedId}\\s+—\\s+.+`);
  const headerMatch = headerRegex.exec(content);
  if (!headerMatch) {
    console.error(`Task ${taskId} not found in ROADMAP.md`);
    process.exit(1);
  }

  const headerStart = headerMatch.index;

  // Find end of this task's section (next #### or ### or ## or EOF)
  const rest = content.substring(headerStart + 1);
  const nextHeader = rest.search(/\n#{2,4}\s/);
  const sectionEnd = nextHeader > -1 ? headerStart + 1 + nextHeader : content.length;
  const section = content.substring(headerStart, sectionEnd);

  // Check if Status line already exists
  const statusLineRegex = /- \*\*Status:\*\* `\w+`/;
  const statusMatch = statusLineRegex.exec(section);

  if (statusMatch) {
    // Replace existing
    const absPos = headerStart + statusMatch.index;
    const absEnd = absPos + statusMatch[0].length;
    return (
      content.substring(0, absPos) +
      `- **Status:** \`${newStatus}\`` +
      content.substring(absEnd)
    );
  }

  // Insert new Status line before the first bullet in the section
  const bulletRegex = /\n- \*\*/;
  const bulletMatch = bulletRegex.exec(section);
  if (bulletMatch) {
    const absPos = headerStart + bulletMatch.index + 1; // +1 to skip the \n
    return (
      content.substring(0, absPos) +
      `- **Status:** \`${newStatus}\`\n` +
      content.substring(absPos)
    );
  }

  // Fallback: insert after header line
  const eol = content.indexOf('\n', headerStart);
  const insertPos = eol > -1 ? eol + 1 : content.length;
  return (
    content.substring(0, insertPos) +
    `\n- **Status:** \`${newStatus}\`\n` +
    content.substring(insertPos)
  );
}

// ── DAG generation ───────────────────────────────────────────────────────────

function statusIcon(status) {
  switch (status) {
    case 'CLOSED':
      return '■';
    case 'OPEN':
      return '◆';
    case 'BLOCKED':
      return '○';
    default:
      return '?';
  }
}

function progressBar(done, total, width = 20) {
  const filled = total > 0 ? Math.round((done / total) * width) : 0;
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function generateDagMarkdown(tasks) {
  const lines = [];
  lines.push('```');
  lines.push('Key: ■ CLOSED   ◆ OPEN   ○ BLOCKED');
  lines.push('');

  for (const ms of MILESTONES) {
    const msTasks = [...tasks.values()]
      .filter(t => t.milestoneCode === ms.code)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (msTasks.length === 0) continue;

    const done = msTasks.filter(t => t.status === 'CLOSED').length;
    const total = msTasks.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const bar = progressBar(done, total);

    lines.push(`${pad(ms.name, 16)} (${ms.version})  ${bar}  ${String(pct).padStart(3)}%  (${done}/${total})`);

    for (const task of msTasks) {
      const icon = statusIcon(task.status);
      const outEdges =
        task.blocking.length > 0 ? `  →  ${task.blocking.join(', ')}` : '';
      lines.push(`  ${icon} ${pad(task.id, 18)}${outEdges}`);
    }
    lines.push('');
  }

  // Cross-milestone dependencies
  const crossDeps = [];
  for (const task of tasks.values()) {
    for (const childId of task.blocking) {
      const child = tasks.get(childId);
      if (child && child.milestoneCode !== task.milestoneCode) {
        crossDeps.push({
          from: task.id,
          to: childId,
          toMs: child.milestone,
        });
      }
    }
  }

  if (crossDeps.length > 0) {
    lines.push('Cross-Milestone Dependencies:');
    for (const dep of crossDeps.sort((a, b) => a.from.localeCompare(b.from))) {
      lines.push(`  ${pad(dep.from, 18)}  →  ${dep.to} (${dep.toMs})`);
    }
    lines.push('');
  }

  lines.push('```');
  return lines.join('\n');
}

function updateDag(content, tasks) {
  const dag = generateDagMarkdown(tasks);
  const startIdx = content.indexOf(DAG_START);
  const endIdx = content.indexOf(DAG_END);

  if (startIdx === -1 || endIdx === -1) {
    console.error('DAG sentinel markers not found in ROADMAP.md');
    console.error(`Expected ${DAG_START} and ${DAG_END}`);
    console.error('Run: node scripts/roadmap.js init');
    process.exit(1);
  }

  return (
    content.substring(0, startIdx + DAG_START.length) +
    '\n' +
    dag +
    '\n' +
    content.substring(endIdx)
  );
}

// ── Commands ─────────────────────────────────────────────────────────────────

function cmdClose(taskId) {
  let content = readFileSync(ROADMAP_PATH, 'utf8');
  const tasks = parseTasks(content);

  const task = tasks.get(taskId);
  if (!task) {
    console.error(`Unknown task: ${taskId}`);
    const similar = [...tasks.keys()].filter(k =>
      k.toLowerCase().includes(taskId.toLowerCase()),
    );
    if (similar.length > 0) {
      console.error(`Did you mean: ${similar.join(', ')}?`);
    }
    process.exit(1);
  }

  if (task.status === 'CLOSED') {
    console.log(`${taskId} is already CLOSED.`);
    return;
  }

  if (task.status === 'BLOCKED') {
    const openBlockers = task.blockedBy.filter(bid => {
      const b = tasks.get(bid);
      return !b || b.status !== 'CLOSED';
    });
    console.error(`Cannot close ${taskId} — it is BLOCKED by:`);
    for (const bid of openBlockers) {
      const b = tasks.get(bid);
      console.error(`  ○ ${bid}  (${b ? b.status : 'unknown'})`);
    }
    process.exit(1);
  }

  // Close the task
  content = setTaskStatus(content, taskId, 'CLOSED');
  task.status = 'CLOSED';
  console.log(`  ■ ${taskId}  →  CLOSED`);

  // Propagate: check each child
  const unblocked = [];
  for (const childId of task.blocking) {
    const child = tasks.get(childId);
    if (!child || child.status === 'CLOSED') continue;

    const allBlockersClosed = child.blockedBy.every(bid => {
      if (bid === taskId) return true; // just closed
      const b = tasks.get(bid);
      return b && b.status === 'CLOSED';
    });

    if (allBlockersClosed && child.status === 'BLOCKED') {
      content = setTaskStatus(content, childId, 'OPEN');
      child.status = 'OPEN';
      unblocked.push(childId);
      console.log(`  ◆ ${childId}  →  OPEN  (unblocked)`);
    }
  }

  // Regenerate DAG
  // Re-parse to get fresh task data after status changes
  const freshTasks = parseTasks(content);
  content = updateDag(content, freshTasks);

  writeFileSync(ROADMAP_PATH, content, 'utf8');

  if (unblocked.length === 0) {
    console.log('\n  No new tasks unblocked.');
  } else {
    console.log(`\n  ${unblocked.length} task(s) now ready to work on.`);
  }
}

function cmdOpen() {
  const content = readFileSync(ROADMAP_PATH, 'utf8');
  const tasks = parseTasks(content);

  const openTasks = [...tasks.values()]
    .filter(t => t.status === 'OPEN')
    .sort((a, b) => a.id.localeCompare(b.id));

  if (openTasks.length === 0) {
    console.log('No OPEN tasks.');
    return;
  }

  console.log(`\n  ◆ OPEN tasks (${openTasks.length}):\n`);

  let currentMs = '';
  for (const task of openTasks) {
    if (task.milestone !== currentMs) {
      currentMs = task.milestone;
      const ms = getMilestone(task.id);
      console.log(`  ${currentMs} (${ms?.version || '?'}):`);
    }
    console.log(
      `    ◆ ${pad(task.id, 18)}  ${task.title}  (${task.hours}h)`,
    );
  }
  console.log('');
}

function cmdStatus() {
  const content = readFileSync(ROADMAP_PATH, 'utf8');
  const tasks = parseTasks(content);

  const totalTasks = tasks.size;
  const totalClosed = [...tasks.values()].filter(
    t => t.status === 'CLOSED',
  ).length;
  const totalOpen = [...tasks.values()].filter(
    t => t.status === 'OPEN',
  ).length;
  const totalBlocked = [...tasks.values()].filter(
    t => t.status === 'BLOCKED',
  ).length;
  const totalHours = [...tasks.values()].reduce((s, t) => s + t.hours, 0);
  const closedHours = [...tasks.values()]
    .filter(t => t.status === 'CLOSED')
    .reduce((s, t) => s + t.hours, 0);

  const W = 72;
  const line = '═'.repeat(W);
  const thin = '─'.repeat(W);

  console.log(`\n  ╔${line}╗`);
  console.log(`  ║${pad('  ROADMAP STATUS', W)}║`);
  console.log(`  ╠${line}╣`);

  for (const ms of MILESTONES) {
    const msTasks = [...tasks.values()].filter(
      t => t.milestoneCode === ms.code,
    );
    if (msTasks.length === 0) continue;

    const done = msTasks.filter(t => t.status === 'CLOSED').length;
    const open = msTasks.filter(t => t.status === 'OPEN').length;
    const blocked = msTasks.filter(t => t.status === 'BLOCKED').length;
    const total = msTasks.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const hrs = msTasks.reduce((s, t) => s + t.hours, 0);
    const doneHrs = msTasks
      .filter(t => t.status === 'CLOSED')
      .reduce((s, t) => s + t.hours, 0);
    const bar = progressBar(done, total);

    const label = `${ms.name} (${ms.version})`;
    const stats = `${bar}  ${String(pct).padStart(3)}%  ${done}/${total}  (${doneHrs}/${hrs}h)`;
    const row = `  ${pad(label, 28)}${stats}`;
    console.log(`  ║${pad(row, W)}║`);
  }

  console.log(`  ╠${line}╣`);

  const totalPct =
    totalTasks > 0 ? Math.round((totalClosed / totalTasks) * 100) : 0;
  const totalBar = progressBar(totalClosed, totalTasks);
  const totalRow = `  ${pad('TOTAL', 28)}${totalBar}  ${String(totalPct).padStart(3)}%  ${totalClosed}/${totalTasks}  (${closedHours}/${totalHours}h)`;
  console.log(`  ║${pad(totalRow, W)}║`);
  console.log(`  ╚${line}╝`);
  console.log(
    `\n  ■ ${totalClosed} closed   ◆ ${totalOpen} open   ○ ${totalBlocked} blocked\n`,
  );
}

function cmdShow() {
  const content = readFileSync(ROADMAP_PATH, 'utf8');
  const tasks = parseTasks(content);

  // ANSI escape codes
  const R = '\x1b[0m'; // reset
  const GREEN = '\x1b[32m';
  const YELLOW = '\x1b[33m';
  const DIM = '\x1b[2m';
  const BOLD = '\x1b[1m';
  const CYAN = '\x1b[36m';

  function colorIcon(status) {
    switch (status) {
      case 'CLOSED':
        return `${GREEN}■${R}`;
      case 'OPEN':
        return `${YELLOW}${BOLD}◆${R}`;
      case 'BLOCKED':
        return `${DIM}○${R}`;
      default:
        return '?';
    }
  }

  function colorId(id, status) {
    switch (status) {
      case 'CLOSED':
        return `${GREEN}${id}${R}`;
      case 'OPEN':
        return `${YELLOW}${BOLD}${id}${R}`;
      case 'BLOCKED':
        return `${DIM}${id}${R}`;
      default:
        return id;
    }
  }

  console.log('');

  for (const ms of MILESTONES) {
    const msTasks = [...tasks.values()]
      .filter(t => t.milestoneCode === ms.code)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (msTasks.length === 0) continue;

    const done = msTasks.filter(t => t.status === 'CLOSED').length;
    const total = msTasks.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    const filled = total > 0 ? Math.round((done / total) * 20) : 0;
    const bar = `${GREEN}${'█'.repeat(filled)}${R}${DIM}${'░'.repeat(20 - filled)}${R}`;

    console.log(
      `  ${CYAN}${BOLD}${pad(ms.name, 16)}${R} ${DIM}(${ms.version})${R}  ${bar}  ${pct}%  (${done}/${total})`,
    );
    console.log('');

    for (const task of msTasks) {
      const icon = colorIcon(task.status);
      const id = colorId(pad(task.id, 18), task.status);
      const arrows =
        task.blocking.length > 0
          ? `${DIM}  →  ${task.blocking.join(', ')}${R}`
          : '';
      console.log(`    ${icon} ${id}${arrows}`);
    }
    console.log('');
  }

  // Cross-milestone dependencies
  const crossDeps = [];
  for (const task of tasks.values()) {
    for (const childId of task.blocking) {
      const child = tasks.get(childId);
      if (child && child.milestoneCode !== task.milestoneCode) {
        crossDeps.push({
          from: task.id,
          to: childId,
          toMs: child.milestone,
        });
      }
    }
  }

  if (crossDeps.length > 0) {
    console.log(`  ${CYAN}${BOLD}Cross-Milestone Dependencies${R}`);
    console.log('');
    for (const dep of crossDeps.sort((a, b) =>
      a.from.localeCompare(b.from),
    )) {
      console.log(
        `    ${pad(dep.from, 18)}  ${DIM}→${R}  ${dep.to} ${DIM}(${dep.toMs})${R}`,
      );
    }
    console.log('');
  }
}

function cmdInit() {
  let content = readFileSync(ROADMAP_PATH, 'utf8');

  // Ensure DAG sentinels exist
  if (!content.includes(DAG_START)) {
    console.error(
      `Missing DAG sentinel: ${DAG_START}\nAdd it to ROADMAP.md first.`,
    );
    process.exit(1);
  }

  let tasks = parseTasks(content);
  let modified = 0;

  // Add Status field to tasks that don't have one
  for (const [id, task] of tasks) {
    if (task.status !== null) continue;

    const hasOpenBlocker = task.blockedBy.some(bid => {
      const b = tasks.get(bid);
      return !b || b.status !== 'CLOSED';
    });
    const status =
      task.blockedBy.length === 0 || !hasOpenBlocker ? 'OPEN' : 'BLOCKED';

    content = setTaskStatus(content, id, status);
    task.status = status;
    modified++;
  }

  // Re-parse after all status insertions (positions shifted)
  tasks = parseTasks(content);

  // Generate DAG
  content = updateDag(content, tasks);

  writeFileSync(ROADMAP_PATH, content, 'utf8');
  console.log(`  Initialized ${modified} task status fields.`);
  console.log(`  Total tasks: ${tasks.size}\n`);

  const open = [...tasks.values()].filter(t => t.status === 'OPEN').length;
  const blocked = [...tasks.values()].filter(
    t => t.status === 'BLOCKED',
  ).length;
  const closed = [...tasks.values()].filter(t => t.status === 'CLOSED').length;
  console.log(
    `  ■ ${closed} closed   ◆ ${open} open   ○ ${blocked} blocked\n`,
  );
}

function cmdHelp() {
  console.log(`
  Usage: node scripts/roadmap.js <command> [args]

  Commands:
    close <taskId>   Mark a task as CLOSED and propagate status changes
    open             List all OPEN tasks (ready to work on)
    status           Show completion stats per milestone
    show             Draw colored ASCII task DAG to terminal
    init             Initialize status fields and DAG (run once after setup)
    help             Show this help message

  Examples:
    node scripts/roadmap.js close AP/INVAL/1
    node scripts/roadmap.js open
    node scripts/roadmap.js status
    node scripts/roadmap.js show
`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const [, , command, ...args] = process.argv;

switch (command) {
  case 'close':
    if (!args[0]) {
      console.error('Usage: roadmap close <taskId>');
      process.exit(1);
    }
    cmdClose(args[0]);
    break;
  case 'open':
    cmdOpen();
    break;
  case 'status':
    cmdStatus();
    break;
  case 'show':
    cmdShow();
    break;
  case 'init':
    cmdInit();
    break;
  case 'help':
  case '--help':
  case '-h':
    cmdHelp();
    break;
  default:
    if (command) console.error(`Unknown command: ${command}\n`);
    cmdHelp();
    process.exit(command ? 1 : 0);
}
