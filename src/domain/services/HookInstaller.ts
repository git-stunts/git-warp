/**
 * HookInstaller — Installs and manages the post-merge Git hook.
 *
 * Follows hexagonal architecture: all I/O is injected via constructor.
 * The service executes a strategy decided by the caller (CLI handler).
 *
 * @module domain/services/HookInstaller
 */

import WarpError from '../errors/WarpError.ts';
import type HookPathPort from '../../ports/HookPathPort.ts';

export interface FsAdapter {
  writeFileSync(path: string, content: string | Uint8Array, options?: { mode?: number }): void;
  chmodSync(path: string, mode: number): void;
  readFileSync(path: string, encoding?: string): string;
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
}

export interface PathUtils {
  join(...segments: string[]): string;
  resolve(...segments: string[]): string;
}

const DELIMITER_START_PREFIX = '# --- @git-stunts/git-warp post-merge hook';
const DELIMITER_END = '# --- end @git-stunts/git-warp ---';
const VERSION_MARKER_PREFIX = '# warp-hook-version:';
const VERSION_PLACEHOLDER = '__WARP_HOOK_VERSION__';

export type HookKind = 'none' | 'ours' | 'foreign';

export interface HookClassification {
  kind: HookKind;
  version?: string;
  appended?: boolean;
}

/**
 * Classifies an existing hook file's content.
 *
 * Determines whether the hook is absent, ours (with version), or foreign (third-party).
 *
 * @param content - File content or null if missing
 * @returns Classification result
 */
export function classifyExistingHook(content: string | null | undefined): HookClassification {
  if (content === null || content === undefined || content.trim() === '') {
    return { kind: 'none' };
  }

  const versionMatch = extractVersion(content);
  if (versionMatch !== null) {
    const appended = content.includes(DELIMITER_START_PREFIX);
    return { kind: 'ours', version: versionMatch, appended };
  }

  return { kind: 'foreign' };
}

/**
 * Extracts the warp hook version from a hook file's content.
 *
 * @param content - File content to search
 * @returns The version string, or null if not found
 */
function extractVersion(content: string): string | null {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith(VERSION_MARKER_PREFIX)) {
      const version = trimmed.slice(VERSION_MARKER_PREFIX.length).trim();
      if (version.length > 0 && version !== VERSION_PLACEHOLDER) {
        return version;
      }
    }
  }
  return null;
}

export type InstallStrategy = 'install' | 'upgrade' | 'append' | 'replace';

export interface InstallResult {
  action: string;
  hookPath: string;
  version: string;
  backupPath?: string;
}

export interface HookStatus {
  installed: boolean;
  version?: string;
  current?: boolean;
  foreign?: boolean;
  hookPath: string;
}

export class HookInstaller {
  private readonly _fs: FsAdapter;
  private readonly _hookPathPort: HookPathPort;
  private readonly _templateDir: string;
  private readonly _version: string;
  private readonly _path: PathUtils;

  /**
   * Creates a new HookInstaller.
   */
  constructor({
    fs,
    hookPathPort,
    version,
    templateDir,
    path,
  }: {
    fs: FsAdapter;
    hookPathPort: HookPathPort;
    version: string;
    templateDir: string;
    path: PathUtils;
  }) {
    this._fs = fs;
    this._hookPathPort = hookPathPort;
    this._templateDir = templateDir;
    this._version = version;
    this._path = path;
  }

  /**
   * Returns the version string this installer stamps hooks with.
   */
  get version(): string {
    return this._version;
  }

  /**
   * Get the current hook status for a repo.
   */
  async getHookStatus(repoPath: string): Promise<HookStatus> {
    const hookPath = await this._resolveHookPath(repoPath);
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
      ...(classification.version !== undefined ? { version: classification.version } : {}),
      current,
      hookPath,
    };
  }

  /**
   * Installs the post-merge hook.
   *
   * @param repoPath - Path to git repo
   * @param opts - Install options
   * @throws {WarpError} If the strategy is not recognized
   */
  async install(repoPath: string, { strategy }: { strategy: InstallStrategy }): Promise<InstallResult> {
    const hooksDir = await this._resolveHooksDir(repoPath);
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

    const unsupportedStrategy: never = strategy;
    throw new WarpError(
      'Unsupported install strategy',
      'E_HOOK_UNKNOWN_STRATEGY',
      { context: { strategy: unsupportedStrategy } },
    );
  }

  /**
   * Writes a fresh hook file with no pre-existing content.
   */
  private _freshInstall(hookPath: string, content: string): InstallResult {
    this._fs.writeFileSync(hookPath, content, { mode: 0o755 });
    this._fs.chmodSync(hookPath, 0o755);
    return {
      action: 'installed',
      hookPath,
      version: this._version,
    };
  }

  /**
   * Upgrades an existing warp hook, preserving appended third-party content when possible.
   */
  private _upgradeInstall(hookPath: string, stamped: string): InstallResult {
    const existing = this._readFile(hookPath);
    const classification = classifyExistingHook(existing);

    if (classification.appended === true) {
      const updated = replaceDelimitedSection(existing as string, stamped);
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
   * Appends the warp hook body to an existing third-party hook file.
   */
  private _appendInstall(hookPath: string, stamped: string): InstallResult {
    const existing = this._readFile(hookPath) ?? '';
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
   * Replaces an existing hook file, creating a backup of the original.
   */
  private _replaceInstall(hookPath: string, stamped: string): InstallResult {
    const existing = this._readFile(hookPath);
    let backupPath: string | undefined;
    if (existing !== null && existing.length > 0) {
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
      ...(backupPath !== undefined ? { backupPath } : {}),
    };
  }

  /**
   * Loads the post-merge hook template from the configured template directory.
   */
  private _loadTemplate(): string {
    const templatePath = this._path.join(this._templateDir, 'post-merge.sh');
    return this._fs.readFileSync(templatePath, 'utf8');
  }

  /**
   * Replaces version placeholders in the template with the actual version string.
   */
  private _stampVersion(template: string): string {
    return template.replaceAll(VERSION_PLACEHOLDER, this._version);
  }

  /**
   * Resolves the hooks directory, respecting core.hooksPath and custom git-dir config.
   */
  private async _resolveHooksDir(repoPath: string): Promise<string> {
    return await this._hookPathPort.resolveHooksDir(repoPath);
  }

  /**
   * Resolves the full path to the post-merge hook file.
   */
  private async _resolveHookPath(repoPath: string): Promise<string> {
    const hooksDir = await this._resolveHooksDir(repoPath);
    return this._path.join(hooksDir, 'post-merge');
  }

  /**
   * Reads a file, returning null if it does not exist or cannot be read.
   */
  private _readFile(filePath: string): string | null {
    try {
      return this._fs.readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }
  }

  /**
   * Creates the directory if it does not already exist.
   */
  private _ensureDir(dirPath: string): void {
    if (!this._fs.existsSync(dirPath)) {
      this._fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}

/**
 * Strips the shebang line from hook content.
 *
 * @param content - Hook file content
 * @returns Content without the shebang line
 */
function stripShebang(content: string): string {
  const lines = content.split('\n');
  if (lines[0] !== undefined && lines[0].startsWith('#!')) {
    return lines.slice(1).join('\n');
  }
  return content;
}

/**
 * Builds content by appending the warp hook body to existing hook content.
 *
 * @param existing - Existing hook file content
 * @param body - Warp hook body to append (without shebang)
 * @returns Combined hook content
 */
function buildAppendedContent(existing: string, body: string): string {
  const trimmed = existing.trimEnd();
  return `${trimmed}\n\n${body}`;
}

/**
 * Replaces the delimited warp section in an existing hook file.
 *
 * Returns the original content unchanged if delimiters are not found.
 *
 * @param existing - Existing hook file content
 * @param stamped - New version-stamped hook content
 * @returns Updated content with replaced section, or original if delimiters missing
 */
function replaceDelimitedSection(existing: string, stamped: string): string {
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
