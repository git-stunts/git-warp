#!/usr/bin/env node
import GitTouchedFilesReader from './touched-files/GitTouchedFilesReader.js';
import { buildScorecardRows } from './scorecard/buildScorecardRows.js';
import { formatBijou, formatMarkdown } from './scorecard/formatScorecard.js';

/**
 * @param {string[]} args
 * @returns {{ baseRef: string, headRef: string, format: string }}
 */
export function parseArgs(args) {
  let baseRef = 'main';
  let headRef = 'HEAD';
  let format = 'markdown';
  for (const arg of args) {
    if (arg.startsWith('--base=')) {
      baseRef = arg.slice('--base='.length);
      continue;
    }
    if (arg.startsWith('--head=')) {
      headRef = arg.slice('--head='.length);
      continue;
    }
    if (arg.startsWith('--format=')) {
      format = arg.slice('--format='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!['markdown', 'json', 'bijou'].includes(format)) {
    throw new Error(`Unsupported format: ${format}`);
  }
  return { baseRef, headRef, format };
}

/**
 * @param {string[]} args
 * @returns {Promise<void>}
 */
async function main(args) {
  const options = parseArgs(args);
  const reader = new GitTouchedFilesReader();
  const touchedReport = await reader.loadReport(options.baseRef, options.headRef);
  const rows = await buildScorecardRows(touchedReport);
  const meta = {
    branch: touchedReport.branch,
    baseRef: touchedReport.baseRef,
    mergeBase: touchedReport.mergeBase,
  };

  if (options.format === 'json') {
    console.log(JSON.stringify({ meta, rows }, null, 2));
    return;
  }
  console.log(options.format === 'bijou' ? formatBijou(meta, rows) : formatMarkdown(meta, rows));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch(error => {
    console.error(`agent-scorecard: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
