#!/usr/bin/env node
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

if (!existsSync(hooksDir)) {
  console.error('Error: hooks directory not found at', hooksDir);
  process.exit(1);
}

try {
  execSync(`git config core.hooksPath "${hooksDir}"`, { stdio: 'inherit' });
  console.log('✅ Git hooks configured successfully');
  console.log(`   Hooks directory: ${hooksDir}`);
} catch (err) {
  console.error('❌ Failed to configure git hooks:', err.message);
  process.exit(1);
}
