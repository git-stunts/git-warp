import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import { HookInstaller, classifyExistingHook } from '../../../../src/domain/services/HookInstaller.js';

const VERSION = '7.1.0';

function makeFs(files = {}) {
  const store = new Map(Object.entries(files));
  return {
    readFileSync: vi.fn((p, _enc) => {
      if (!store.has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return store.get(p);
    }),
    writeFileSync: vi.fn((p, content) => { store.set(p, content); }),
    existsSync: vi.fn((p) => store.has(p) || [...store.keys()].some(k => k.startsWith(p + '/'))),
    mkdirSync: vi.fn(),
    chmodSync: vi.fn(),
    _store: store,
  };
}

function makeExecGitConfig(overrides = /** @type {any} */ ({})) {
  return vi.fn((repoPath, key) => {
    if (key === '--git-dir') return overrides.gitDir || '.git';
    if (key === 'core.hooksPath') return overrides.hooksPath || null;
    return null;
  });
}

function makeInstaller(fsFiles = {}, gitOverrides = {}) {
  const fs = makeFs(fsFiles);
  const execGitConfig = makeExecGitConfig(gitOverrides);
  const installer = new HookInstaller({
    fs,
    execGitConfig,
    version: VERSION,
    templateDir: '/tmpl',
    path,
  });
  return { installer, fs, execGitConfig };
}

const TEMPLATE = `#!/bin/sh
# --- @git-stunts/git-warp post-merge hook __WARP_HOOK_VERSION__ ---
# warp-hook-version: __WARP_HOOK_VERSION__
# body
echo "hello"
# --- end @git-stunts/git-warp ---
`;

const STAMPED = TEMPLATE.replaceAll('__WARP_HOOK_VERSION__', VERSION);

// ── classifyExistingHook ────────────────────────────────────────────────────

describe('classifyExistingHook', () => {
  it('returns none for null content', () => {
    expect(classifyExistingHook(null)).toEqual({ kind: 'none' });
  });

  it('returns none for empty string', () => {
    expect(classifyExistingHook('')).toEqual({ kind: 'none' });
  });

  it('returns none for whitespace-only', () => {
    expect(classifyExistingHook('   \n  ')).toEqual({ kind: 'none' });
  });

  it('identifies our standalone hook', () => {
    const result = classifyExistingHook(STAMPED);
    expect(result.kind).toBe('ours');
    expect(result.version).toBe(VERSION);
    expect(result.appended).toBe(true);
  });

  it('identifies our hook with version only (no delimiters)', () => {
    const content = '#!/bin/sh\n# warp-hook-version: 7.0.0\necho hi\n';
    const result = classifyExistingHook(content);
    expect(result.kind).toBe('ours');
    expect(result.version).toBe('7.0.0');
    expect(result.appended).toBe(false);
  });

  it('identifies appended hook', () => {
    const content = [
      '#!/bin/sh',
      'echo "foreign stuff"',
      '',
      '# --- @git-stunts/git-warp post-merge hook 7.1.0 ---',
      '# warp-hook-version: 7.1.0',
      'echo "warp"',
      '# --- end @git-stunts/git-warp ---',
    ].join('\n');
    const result = classifyExistingHook(content);
    expect(result.kind).toBe('ours');
    expect(result.version).toBe('7.1.0');
    expect(result.appended).toBe(true);
  });

  it('identifies foreign hook', () => {
    const content = '#!/bin/sh\necho "some other hook"\n';
    const result = classifyExistingHook(content);
    expect(result.kind).toBe('foreign');
  });

  it('ignores placeholder version', () => {
    const content = '#!/bin/sh\n# warp-hook-version: __WARP_HOOK_VERSION__\n';
    const result = classifyExistingHook(content);
    expect(result.kind).toBe('foreign');
  });
});

// ── install() ───────────────────────────────────────────────────────────────

describe('HookInstaller.install', () => {
  it('fresh install writes hook with correct version', () => {
    const { installer, fs } = makeInstaller({
      '/tmpl/post-merge.sh': TEMPLATE,
    });

    const result = installer.install('/repo', { strategy: 'install' });

    expect(result.action).toBe('installed');
    expect(result.version).toBe(VERSION);
    expect(result.hookPath).toContain('post-merge');
    expect(fs.writeFileSync).toHaveBeenCalled();

    const written = fs._store.get(result.hookPath);
    expect(written).toContain(`# warp-hook-version: ${VERSION}`);
    expect(written).not.toContain('__WARP_HOOK_VERSION__');
  });

  it('creates hooks directory if missing', () => {
    const { installer, fs } = makeInstaller({
      '/tmpl/post-merge.sh': TEMPLATE,
    });

    installer.install('/repo', { strategy: 'install' });
    expect(fs.mkdirSync).toHaveBeenCalled();
  });

  it('upgrade replaces standalone hook', () => {
    const oldHook = TEMPLATE.replaceAll('__WARP_HOOK_VERSION__', '7.0.0');
    const { installer, fs } = makeInstaller({
      '/tmpl/post-merge.sh': TEMPLATE,
      '/repo/.git/hooks/post-merge': oldHook,
    });

    const result = installer.install('/repo', { strategy: 'upgrade' });
    expect(result.action).toBe('upgraded');

    const written = fs._store.get(result.hookPath);
    expect(written).toContain(`# warp-hook-version: ${VERSION}`);
  });

  it('upgrade replaces delimited section in appended hook', () => {
    const appended = [
      '#!/bin/sh',
      'echo "foreign"',
      '',
      '# --- @git-stunts/git-warp post-merge hook 7.0.0 ---',
      '# warp-hook-version: 7.0.0',
      'echo "old warp"',
      '# --- end @git-stunts/git-warp ---',
    ].join('\n');

    const { installer, fs } = makeInstaller({
      '/tmpl/post-merge.sh': TEMPLATE,
      '/repo/.git/hooks/post-merge': appended,
    });

    const result = installer.install('/repo', { strategy: 'upgrade' });
    expect(result.action).toBe('upgraded');

    const written = fs._store.get(result.hookPath);
    expect(written).toContain('echo "foreign"');
    expect(written).toContain(`# warp-hook-version: ${VERSION}`);
    expect(written).not.toContain('7.0.0');
  });

  it('append adds delimited section to foreign hook', () => {
    const foreign = '#!/bin/sh\necho "existing hook"\n';
    const { installer, fs } = makeInstaller({
      '/tmpl/post-merge.sh': TEMPLATE,
      '/repo/.git/hooks/post-merge': foreign,
    });

    const result = installer.install('/repo', { strategy: 'append' });
    expect(result.action).toBe('appended');

    const written = fs._store.get(result.hookPath);
    expect(written).toContain('echo "existing hook"');
    expect(written).toContain(`# warp-hook-version: ${VERSION}`);
    expect(written).toContain('# --- end @git-stunts/git-warp ---');
  });

  it('replace backs up existing hook', () => {
    const foreign = '#!/bin/sh\necho "existing"\n';
    const { installer, fs } = makeInstaller({
      '/tmpl/post-merge.sh': TEMPLATE,
      '/repo/.git/hooks/post-merge': foreign,
    });

    const result = installer.install('/repo', { strategy: 'replace' });
    expect(result.action).toBe('replaced');
    expect(result.backupPath).toContain('.backup');

    const backup = fs._store.get(/** @type {string} */ (result.backupPath));
    expect(backup).toBe(foreign);

    const written = fs._store.get(result.hookPath);
    expect(written).toContain(`# warp-hook-version: ${VERSION}`);
  });

  it('replace with no existing hook skips backup', () => {
    const { installer } = makeInstaller({
      '/tmpl/post-merge.sh': TEMPLATE,
    });

    const result = installer.install('/repo', { strategy: 'replace' });
    expect(result.action).toBe('replaced');
    expect(result.backupPath).toBeUndefined();
  });

  it('throws on unknown strategy', () => {
    const { installer } = makeInstaller({
      '/tmpl/post-merge.sh': TEMPLATE,
    });

    expect(() => installer.install('/repo', { strategy: /** @type {any} */ ('bogus') }))
      .toThrow('Unknown install strategy: bogus');
  });
});

// ── getHookStatus ───────────────────────────────────────────────────────────

describe('HookInstaller.getHookStatus', () => {
  it('not installed when hook file missing', () => {
    const { installer } = makeInstaller({});
    const status = installer.getHookStatus('/repo');
    expect(status.installed).toBe(false);
    expect(status.hookPath).toContain('post-merge');
  });

  it('installed and current', () => {
    const { installer } = makeInstaller({
      '/repo/.git/hooks/post-merge': STAMPED,
    });
    const status = installer.getHookStatus('/repo');
    expect(status.installed).toBe(true);
    expect(status.version).toBe(VERSION);
    expect(status.current).toBe(true);
  });

  it('installed but outdated', () => {
    const old = TEMPLATE.replaceAll('__WARP_HOOK_VERSION__', '7.0.0');
    const { installer } = makeInstaller({
      '/repo/.git/hooks/post-merge': old,
    });
    const status = installer.getHookStatus('/repo');
    expect(status.installed).toBe(true);
    expect(status.version).toBe('7.0.0');
    expect(status.current).toBe(false);
  });

  it('foreign hook shows as not installed', () => {
    const { installer } = makeInstaller({
      '/repo/.git/hooks/post-merge': '#!/bin/sh\necho "other"\n',
    });
    const status = installer.getHookStatus('/repo');
    expect(status.installed).toBe(false);
    expect(status.foreign).toBe(true);
  });
});

// ── Hooks directory resolution ──────────────────────────────────────────────

describe('hooks directory resolution', () => {
  it('uses core.hooksPath when set (absolute)', () => {
    const { installer, execGitConfig } = makeInstaller(
      { '/tmpl/post-merge.sh': TEMPLATE },
      { hooksPath: '/custom/hooks' },
    );

    const result = installer.install('/repo', { strategy: 'install' });
    expect(result.hookPath).toBe('/custom/hooks/post-merge');
    expect(execGitConfig).toHaveBeenCalledWith('/repo', 'core.hooksPath');
  });

  it('resolves relative core.hooksPath against repo root', () => {
    const { installer } = makeInstaller(
      { '/tmpl/post-merge.sh': TEMPLATE },
      { hooksPath: 'my-hooks' },
    );

    const result = installer.install('/repo', { strategy: 'install' });
    expect(result.hookPath).toBe('/repo/my-hooks/post-merge');
  });

  it('falls back to gitDir/hooks when no core.hooksPath', () => {
    const { installer } = makeInstaller(
      { '/tmpl/post-merge.sh': TEMPLATE },
      { gitDir: '.git' },
    );

    const result = installer.install('/repo', { strategy: 'install' });
    expect(result.hookPath).toContain('.git/hooks/post-merge');
  });
});

// ── Template integrity ──────────────────────────────────────────────────────

describe('template integrity', () => {
  /** @type {any} */
  let templateContent;

  beforeEach(async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = dirname(fileURLToPath(import.meta.url));
    const templatePath = resolve(dir, '..', '..', '..', '..', 'src', 'hooks', 'post-merge.sh');
    templateContent = readFileSync(templatePath, 'utf8');
  });

  it('has shebang line', () => {
    expect(templateContent.startsWith('#!/bin/sh')).toBe(true);
  });

  it('contains version placeholder', () => {
    expect(templateContent).toContain('__WARP_HOOK_VERSION__');
  });

  it('contains start delimiter', () => {
    expect(templateContent).toContain('# --- @git-stunts/git-warp post-merge hook');
  });

  it('contains end delimiter', () => {
    expect(templateContent).toContain('# --- end @git-stunts/git-warp ---');
  });

  it('contains version marker line', () => {
    expect(templateContent).toContain('# warp-hook-version: __WARP_HOOK_VERSION__');
  });

  it('contains warp.autoMaterialize config check', () => {
    expect(templateContent).toContain('warp.autoMaterialize');
  });
});
