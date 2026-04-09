import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import { buildTouchedFilesReport } from './buildTouchedFilesReport.js';
import { pairTypeScriptConversions } from './pairTypeScriptConversions.js';
import { parseChangedFiles } from './parseChangedFiles.js';

const execFile = promisify(execFileCallback);

export default class GitTouchedFilesReader {
  constructor() {
    Object.freeze(this);
  }

  /**
   * @param {string} baseRef
   * @param {string} headRef
   * @returns {Promise<import('./TouchedFilesReport.js').default>}
   */
  async loadReport(baseRef, headRef) {
    const branch = (await this.runGit(['rev-parse', '--abbrev-ref', headRef])).trim();
    const mergeBase = (await this.runGit(['merge-base', headRef, baseRef])).trim();
    const range = `${mergeBase}..${headRef}`;
    const changedFiles = pairTypeScriptConversions(
      parseChangedFiles(await this.runGit(['diff', '--name-status', '--find-renames', range])),
    );
    return await buildTouchedFilesReport(
      changedFiles,
      { branch, baseRef, headRef, mergeBase },
      async (path, oldPath) => await this.readPatch(path, oldPath, range),
      async (ref, path) => await this.readFileAtRef(ref, path),
    );
  }

  /**
   * @param {string[]} args
   * @returns {Promise<string>}
   */
  async runGit(args) {
    const { stdout } = await execFile('git', args, { encoding: 'utf8' });
    return stdout;
  }

  /**
   * @param {string} ref
   * @param {string} path
   * @returns {Promise<string | null>}
   */
  async readFileAtRef(ref, path) {
    try {
      return await this.runGit(['show', `${ref}:${path}`]);
    } catch {
      return null;
    }
  }

  /**
   * @param {string} path
   * @param {string | undefined} oldPath
   * @param {string} range
   * @returns {Promise<string>}
   */
  async readPatch(path, oldPath, range) {
    const patchPaths = oldPath === undefined ? [path] : [oldPath, path];
    return await this.runGit(['diff', '--unified=0', '--no-color', '--find-renames', range, '--', ...patchPaths]);
  }
}
