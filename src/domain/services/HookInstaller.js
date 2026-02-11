/**
 * HookInstaller — Installs and manages the post-merge Git hook.
 *
 * Follows hexagonal architecture: all I/O is injected via constructor.
 * The service executes a strategy decided by the caller (CLI handler).
 *
 * @module domain/services/HookInstaller
 */

/**
 * @typedef {Object} FsAdapter
 * @property {(path: string, content: string | Buffer, options?: Object) => void} writeFileSync
 * @property {(path: string, mode: number) => void} chmodSync
 * @property {(path: string, encoding?: string) => string} readFileSync
 * @property {(path: string) => boolean} existsSync
 * @property {(path: string, options?: Object) => void} mkdirSync
 */

/**
 * @typedef {Object} PathUtils
 * @property {(...segments: string[]) => string} join
 * @property {(...segments: string[]) => string} resolve
 */

const DELIMITER_START_PREFIX = '# --- @git-stunts/git-warp post-merge hook';
const DELIMITER_END = '# --- end @git-stunts/git-warp ---';
const VERSION_MARKER_PREFIX = '# warp-hook-version:';
const VERSION_PLACEHOLDER = '__WARP_HOOK_VERSION__';

/**
 * Classifies an existing hook file's content.
 *
 * Determines whether the hook is absent, ours (with version), or foreign (third-party).
 *
 * @param {string|null} content - File content or null if missing
 * @returns {{ kind: 'none'|'ours'|'foreign', version?: string, appended?: boolean }}
 */
export function classifyExistingHook(content) {
  if (!content || content.trim() === '') {
    return { kind: 'none' };
  }

  const versionMatch = extractVersion(content);
  if (versionMatch) {
    const appended = content.includes(DELIMITER_START_PREFIX);
    return { kind: 'ours', version: versionMatch, appended };
  }

  return { kind: 'foreign' };
}

/**
 * Extracts the warp hook version from a hook file's content.
 *
 * @param {string} content - File content to search
 * @returns {string|null} The version string, or null if not found
 * @private
 */
function extractVersion(content) {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith(VERSION_MARKER_PREFIX)) {
      const version = trimmed.slice(VERSION_MARKER_PREFIX.length).trim();
      if (version && version !== VERSION_PLACEHOLDER) {
        return version;
      }
    }
  }
  return null;
}

export class HookInstaller {
  /**
   * Creates a new HookInstaller.
   *
   * @param {Object} deps - Injected dependencies
   * @param {FsAdapter} deps.fs - Filesystem adapter with methods: readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync
   * @param {(repoPath: string, key: string) => string|null} deps.execGitConfig - Function to read git config values
   * @param {string} deps.version - Package version
   * @param {string} deps.templateDir - Directory containing hook templates
   * @param {PathUtils} deps.path - Path utilities (join and resolve)
   */
  constructor({ fs, execGitConfig, version, templateDir, path } = /** @type {*} */ ({})) { // TODO(ts-cleanup): needs options type
    /** @type {FsAdapter} */
    this._fs = fs;
    /** @type {(repoPath: string, key: string) => string|null} */
    this._execGitConfig = execGitConfig;
    /** @type {string} */
    this._templateDir = templateDir;
    /** @type {string} */
    this._version = version;
    /** @type {PathUtils} */
    this._path = path;
  }

  /**
   * Get the current hook status for a repo.
   *
   * @param {string} repoPath - Path to git repo
   * @returns {{ installed: boolean, version?: string, current?: boolean, foreign?: boolean, hookPath: string }}
   */
  getHookStatus(repoPath) {
    const hookPath = this._resolveHookPath(repoPath);
    const content = this._readFile(hookPath);
    const classification = classifyExistingHook(content);

    if (classification.kind === 'none') {
      return { installed: false, hookPath };
    }

    if (classification.kind === 'foreign') {
      return { installed: false, foreign: true, hookPath };
    }

    const current = classification.version === this._version;
    return {
      installed: true,
      version: classification.version,
      current,
      hookPath,
    };
  }

  /**
   * Installs the post-merge hook.
   *
   * @param {string} repoPath - Path to git repo
   * @param {Object} opts - Install options
   * @param {'install'|'upgrade'|'append'|'replace'} opts.strategy - Installation strategy
   * @returns {{ action: string, hookPath: string, version: string, backupPath?: string }}
   * @throws {Error} If the strategy is unknown
   */
  install(repoPath, { strategy }) {
    const hooksDir = this._resolveHooksDir(repoPath);
    const hookPath = this._path.join(hooksDir, 'post-merge');
    const template = this._loadTemplate();
    const stamped = this._stampVersion(template);

    this._ensureDir(hooksDir);

    if (strategy === 'install') {
      return this._freshInstall(hookPath, stamped);
    }
    if (strategy === 'upgrade') {
      return this._upgradeInstall(hookPath, stamped);
    }
    if (strategy === 'append') {
      return this._appendInstall(hookPath, stamped);
    }
    if (strategy === 'replace') {
      return this._replaceInstall(hookPath, stamped);
    }

    throw new Error(`Unknown install strategy: ${strategy}`);
  }

  /**
   * @param {string} hookPath
   * @param {string} content
   * @private
   */
  _freshInstall(hookPath, content) {
    this._fs.writeFileSync(hookPath, content, { mode: 0o755 });
    this._fs.chmodSync(hookPath, 0o755);
    return {
      action: 'installed',
      hookPath,
      version: this._version,
    };
  }

  /**
   * @param {string} hookPath
   * @param {string} stamped
   * @private
   */
  _upgradeInstall(hookPath, stamped) {
    const existing = this._readFile(hookPath);
    const classification = classifyExistingHook(existing);

    if (classification.appended) {
      const updated = replaceDelimitedSection(/** @type {string} */ (existing), stamped);
      // If delimiters were corrupted, replaceDelimitedSection returns unchanged content — fall back to overwrite
      if (updated === existing) {
        this._fs.writeFileSync(hookPath, stamped, { mode: 0o755 });
      } else {
        this._fs.writeFileSync(hookPath, updated, { mode: 0o755 });
      }
    } else {
      this._fs.writeFileSync(hookPath, stamped, { mode: 0o755 });
    }
    this._fs.chmodSync(hookPath, 0o755);

    return {
      action: 'upgraded',
      hookPath,
      version: this._version,
    };
  }

  /**
   * @param {string} hookPath
   * @param {string} stamped
   * @private
   */
  _appendInstall(hookPath, stamped) {
    const existing = this._readFile(hookPath) || '';
    const body = stripShebang(stamped);
    const appended = buildAppendedContent(existing, body);
    this._fs.writeFileSync(hookPath, appended, { mode: 0o755 });
    this._fs.chmodSync(hookPath, 0o755);
    return {
      action: 'appended',
      hookPath,
      version: this._version,
    };
  }

  /**
   * @param {string} hookPath
   * @param {string} stamped
   * @private
   */
  _replaceInstall(hookPath, stamped) {
    const existing = this._readFile(hookPath);
    let backupPath;
    if (existing) {
      backupPath = `${hookPath}.backup`;
      this._fs.writeFileSync(backupPath, existing);
      this._fs.chmodSync(backupPath, 0o755);
    }

    this._fs.writeFileSync(hookPath, stamped, { mode: 0o755 });
    this._fs.chmodSync(hookPath, 0o755);
    return {
      action: 'replaced',
      hookPath,
      version: this._version,
      backupPath,
    };
  }

  /** @private */
  _loadTemplate() {
    const templatePath = this._path.join(this._templateDir, 'post-merge.sh');
    return this._fs.readFileSync(templatePath, 'utf8');
  }

  /**
   * @param {string} template
   * @private
   */
  _stampVersion(template) {
    return template.replaceAll(VERSION_PLACEHOLDER, this._version);
  }

  /**
   * @param {string} repoPath
   * @private
   */
  _resolveHooksDir(repoPath) {
    const customPath = this._execGitConfig(repoPath, 'core.hooksPath');
    if (customPath) {
      return resolveHooksPath(customPath, repoPath, this._path);
    }

    const gitDir = this._execGitConfig(repoPath, '--git-dir');
    if (gitDir) {
      return this._path.join(this._path.resolve(repoPath, gitDir), 'hooks');
    }

    return this._path.join(repoPath, '.git', 'hooks');
  }

  /**
   * @param {string} repoPath
   * @private
   */
  _resolveHookPath(repoPath) {
    return this._path.join(this._resolveHooksDir(repoPath), 'post-merge');
  }

  /**
   * @param {string} filePath
   * @private
   */
  _readFile(filePath) {
    try {
      return this._fs.readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }
  }

  /**
   * @param {string} dirPath
   * @private
   */
  _ensureDir(dirPath) {
    if (!this._fs.existsSync(dirPath)) {
      this._fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}

/**
 * Resolves a hooks path, handling both absolute and relative paths.
 *
 * @param {string} customPath - The custom hooks path from git config
 * @param {string} repoPath - The repo root path for resolving relative paths
 * @param {{ resolve: (...segments: string[]) => string }} pathUtils - Path utilities
 * @returns {string} Resolved absolute hooks directory path
 * @private
 */
function resolveHooksPath(customPath, repoPath, pathUtils) {
  if (customPath.startsWith('/')) {
    return customPath;
  }
  return pathUtils.resolve(repoPath, customPath);
}

/**
 * Strips the shebang line from hook content.
 *
 * @param {string} content - Hook file content
 * @returns {string} Content without the shebang line
 * @private
 */
function stripShebang(content) {
  const lines = content.split('\n');
  if (lines[0] && lines[0].startsWith('#!')) {
    return lines.slice(1).join('\n');
  }
  return content;
}

/**
 * Builds content by appending the warp hook body to existing hook content.
 *
 * @param {string} existing - Existing hook file content
 * @param {string} body - Warp hook body to append (without shebang)
 * @returns {string} Combined hook content
 * @private
 */
function buildAppendedContent(existing, body) {
  const trimmed = existing.trimEnd();
  return `${trimmed}\n\n${body}`;
}

/**
 * Replaces the delimited warp section in an existing hook file.
 *
 * Returns the original content unchanged if delimiters are not found.
 *
 * @param {string} existing - Existing hook file content
 * @param {string} stamped - New version-stamped hook content
 * @returns {string} Updated content with replaced section, or original if delimiters missing
 * @private
 */
function replaceDelimitedSection(existing, stamped) {
  const body = stripShebang(stamped);
  const startIdx = existing.indexOf(DELIMITER_START_PREFIX);
  const endIdx = existing.indexOf(DELIMITER_END);

  if (startIdx === -1 || endIdx === -1) {
    return existing;
  }

  const endOfEnd = endIdx + DELIMITER_END.length;
  const before = existing.slice(0, startIdx).trimEnd();
  const after = existing.slice(endOfEnd).trimStart();
  const parts = [before, '', body];
  if (after) {
    parts.push(after);
  }
  return parts.join('\n');
}
