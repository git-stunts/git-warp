#!/usr/bin/env node

import GitTouchedFilesReader from './touched-files/GitTouchedFilesReader.js';

const DEFAULT_BASE_REF = 'main';
const DEFAULT_HEAD_REF = 'HEAD';
const USAGE = 'Usage: node scripts/touched-files-status.js [--base=<ref>] [--head=<ref>] [--json]';

/**
 * @param {string[]} args
 * @returns {{ baseRef: string, headRef: string, json: boolean, help: boolean }}
 */
export function parseArgs(args) {
  let baseRef = DEFAULT_BASE_REF;
  let headRef = DEFAULT_HEAD_REF;
  let json = false;
  let help = false;

  for (const arg of args) {
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg.startsWith('--base=')) {
      baseRef = arg.slice('--base='.length);
      continue;
    }
    if (arg.startsWith('--head=')) {
      headRef = arg.slice('--head='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { baseRef, headRef, json, help };
}

/**
 * @param {string[]} args
 * @returns {Promise<void>}
 */
async function main(args) {
  const options = parseArgs(args);
  if (options.help) {
    console.log(USAGE);
    return;
  }

  const reader = new GitTouchedFilesReader();
  const report = await reader.loadReport(options.baseRef, options.headRef);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(report.formatText());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`touched-files-status: ${message}`);
    process.exit(1);
  });
}
