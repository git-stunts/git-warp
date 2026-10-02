#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sets up git hooks for the repository.
 * Run: npm run setup:hooks
 */
import { execFileSync, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hooksDir = join(__dirname, 'hooks');

let repoRoot = '';
try {
  repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
} catch {
  console.log('ℹ️  Skipping git hooks setup (not a git repository).');
  process.exit(0);
}

if (!existsSync(hooksDir)) {
  console.error('Error: hooks directory not found at', hooksDir);
  process.exit(1);
}

try {
  process.chdir(repoRoot);
  const configured = spawnSync('git', ['config', '--null', '--show-scope', '--get', 'core.hooksPath'],
    { encoding: 'utf8' });
  if (configured.error) {
    throw configured.error;
  }
  if (configured.status !== 0 && configured.status !== 1) {
    console.error('❌ Failed to read Git hook configuration:', configured.stderr);
    process.exit(1);
  }
  if (configured.status === 0) {
    const [scope, value] = configured.stdout.split('\0');
    // Only migrate paths written by the old installer into shared local config.
    // Global, worktree and command overrides belong to the caller.
    const legacyPath = scope === 'local' && execFileSync('git', ['worktree', 'list', '--porcelain', '-z'],
      { encoding: 'utf8' }).split('\0').some((field) =>
      field.startsWith('worktree ') && value === join(field.slice('worktree '.length), 'scripts/hooks'));
    if (!legacyPath) {
      console.log('ℹ️  Preserving existing Git hook configuration.');
      process.exit(0);
    }
  }
  execFileSync('git', ['config', '--local', 'core.hooksPath', 'scripts/hooks'], { stdio: 'inherit' });
  console.log('✅ Git hooks configured successfully');
  console.log('   Hooks directory: scripts/hooks (relative to each working tree)');
} catch (err) {
  console.error('❌ Failed to configure git hooks:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
