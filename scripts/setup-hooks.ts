#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sets up git hooks for the repository.
 * Run: npm run setup:hooks
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hooksDir = join(__dirname, 'hooks');

let repoRoot = '';
try {
  repoRoot = execSync('git rev-parse --show-toplevel', { stdio: ['ignore', 'pipe', 'ignore'] })
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
  execSync(`git config core.hooksPath "${hooksDir}"`, { stdio: 'inherit' });
  console.log('✅ Git hooks configured successfully');
  console.log(`   Hooks directory: ${hooksDir}`);
} catch (err) {
  console.error('❌ Failed to configure git hooks:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
