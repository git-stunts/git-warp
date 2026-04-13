import { readdir, readFile, stat } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = new URL('../../../', import.meta.url);
const SCRIPT_LINE_LIMIT = 300;

/**
 * @param {string} relativePath
 * @returns {URL}
 */
function repoPath(relativePath) {
  return new URL(relativePath, REPO_ROOT);
}

/**
 * @param {string} relativePath
 * @returns {Promise<boolean>}
 */
async function pathExists(relativePath) {
  try {
    await stat(repoPath(relativePath));
    return true;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * @param {string} content
 * @returns {number}
 */
function countLines(content) {
  return content.split('\n').length;
}

/**
 * @returns {Promise<string[]>}
 */
async function listRatchetScriptPaths() {
  const entries = await readdir(repoPath('scripts/ratchet'), { withFileTypes: true });
  return [
    'scripts/ratchet-snapshot.js',
    'scripts/ratchet-delta.js',
    ...entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
      .map(entry => `scripts/ratchet/${entry.name}`),
  ];
}

describe('dx script hygiene', () => {
  it('does not expose the deleted branch-gated dx commands', async () => {
    const packageJson = JSON.parse(await readFile(repoPath('package.json'), 'utf8'));

    expect(packageJson.scripts).not.toHaveProperty('status:touched');
    expect(packageJson.scripts).not.toHaveProperty('scorecard:agent');
  });

  it('does not keep the deleted touched-files or scorecard script surface around', async () => {
    await expect(pathExists('scripts/touched-files-status.js')).resolves.toBe(false);
    await expect(pathExists('scripts/agent-scorecard.js')).resolves.toBe(false);
    await expect(pathExists('scripts/touched-files')).resolves.toBe(false);
    await expect(pathExists('scripts/scorecard')).resolves.toBe(false);
  });

  it('keeps the remaining ratchet scripts under the script line limit', async () => {
    const paths = await listRatchetScriptPaths();
    const offenders: string[] = [];

    for (const path of paths) {
      const content = await readFile(repoPath(path), 'utf8');
      const lines = countLines(content);
      if (lines > SCRIPT_LINE_LIMIT) {
        offenders.push(`${path}: ${lines}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
