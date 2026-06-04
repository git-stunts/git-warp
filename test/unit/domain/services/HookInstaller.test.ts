import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import { HookInstaller, classifyExistingHook } from '../../../../src/domain/services/HookInstaller.ts';

const VERSION = '7.1.0';
const REAL_TEMPLATE = readFileSync(
  fileURLToPath(new URL('../../../../scripts/hooks/post-merge.sh', import.meta.url)),
  'utf8',
);

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

function makeInstaller(fsFiles = {}, hooksDir = '/repo/.git/hooks') {
  const fs = makeFs(fsFiles);
  const hookPathPort = {
    resolveHooksDir: vi.fn(async (_repoPath: string) => hooksDir),
  };
  const installer = new HookInstaller({
    fs: (fs as any),
    hookPathPort,
    version: VERSION,
    templateDir: '/tmpl',
    path,
  });
  return { installer, fs, hookPathPort };
}

function readStoredString(fs: ReturnType<typeof makeFs>, filePath: string): string {
  const content = fs._store.get(filePath);
  expect(typeof content).toBe('string');
  if (typeof content === 'string') {
    return content;
  }
  return '';
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
  it('fresh install writes hook with correct version', async () => {
    const { installer, fs } = makeInstaller({
      '/tmpl/post-merge.sh': TEMPLATE,
    });

    const result = await installer.install('/repo', { strategy: 'install' });

    expect(result.action).toBe('installed');
    expect(result.version).toBe(VERSION);
    expect(result.hookPath).toContain('post-merge');
    expect(fs.writeFileSync).toHaveBeenCalled();

    const written = fs._store.get(result.hookPath);
    expect(written).toContain(`# warp-hook-version: ${VERSION}`);
    expect(written).not.toContain('__WARP_HOOK_VERSION__');
  });

  it('creates hooks directory if missing', async () => {
    const { installer, fs } = makeInstaller({
      '/tmpl/post-merge.sh': TEMPLATE,
    });

    await installer.install('/repo', { strategy: 'install' });
    expect(fs.mkdirSync).toHaveBeenCalled();
  });

  it('upgrade replaces standalone hook', async () => {
    const oldHook = TEMPLATE.replaceAll('__WARP_HOOK_VERSION__', '7.0.0');
    const { installer, fs } = makeInstaller({
      '/tmpl/post-merge.sh': TEMPLATE,
      '/repo/.git/hooks/post-merge': oldHook,
    });

    const result = await installer.install('/repo', { strategy: 'upgrade' });
    expect(result.action).toBe('upgraded');

    const written = fs._store.get(result.hookPath);
    expect(written).toContain(`# warp-hook-version: ${VERSION}`);
  });

  it('upgrade replaces delimited section in appended hook', async () => {
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

    const result = await installer.install('/repo', { strategy: 'upgrade' });
    expect(result.action).toBe('upgraded');

    const written = fs._store.get(result.hookPath);
    expect(written).toContain('echo "foreign"');
    expect(written).toContain(`# warp-hook-version: ${VERSION}`);
    expect(written).not.toContain('7.0.0');
  });

  it('append adds delimited section to foreign hook', async () => {
    const foreign = '#!/bin/sh\necho "existing hook"\n';
    const { installer, fs } = makeInstaller({
      '/tmpl/post-merge.sh': TEMPLATE,
      '/repo/.git/hooks/post-merge': foreign,
    });

    const result = await installer.install('/repo', { strategy: 'append' });
    expect(result.action).toBe('appended');

    const written = fs._store.get(result.hookPath);
    expect(written).toContain('echo "existing hook"');
    expect(written).toContain(`# warp-hook-version: ${VERSION}`);
    expect(written).toContain('# --- end @git-stunts/git-warp ---');
  });

  it('replace backs up existing hook', async () => {
    const foreign = '#!/bin/sh\necho "existing"\n';
    const { installer, fs } = makeInstaller({
      '/tmpl/post-merge.sh': TEMPLATE,
      '/repo/.git/hooks/post-merge': foreign,
    });

    const result = await installer.install('/repo', { strategy: 'replace' });
    expect(result.action).toBe('replaced');
    expect(result.backupPath).toContain('.backup');

    const backup = fs._store.get((result.backupPath as string));
    expect(backup).toBe(foreign);

    const written = fs._store.get(result.hookPath);
    expect(written).toContain(`# warp-hook-version: ${VERSION}`);
  });

  it('replace with no existing hook skips backup', async () => {
    const { installer } = makeInstaller({
      '/tmpl/post-merge.sh': TEMPLATE,
    });

    const result = await installer.install('/repo', { strategy: 'replace' });
    expect(result.action).toBe('replaced');
    expect(result.backupPath).toBeUndefined();
  });

  it('throws on unsupported strategy', async () => {
    const { installer } = makeInstaller({
      '/tmpl/post-merge.sh': TEMPLATE,
    });

    await expect(installer.install('/repo', { strategy: ('bogus' as any) }))
      .rejects.toThrow('Unsupported install strategy');
  });
});

// ── getHookStatus ───────────────────────────────────────────────────────────

describe('HookInstaller.getHookStatus', () => {
  it('not installed when hook file missing', async () => {
    const { installer } = makeInstaller({});
    const status = await installer.getHookStatus('/repo');
    expect(status.installed).toBe(false);
    expect(status.hookPath).toContain('post-merge');
  });

  it('installed and current', async () => {
    const { installer } = makeInstaller({
      '/repo/.git/hooks/post-merge': STAMPED,
    });
    const status = await installer.getHookStatus('/repo');
    expect(status.installed).toBe(true);
    expect(status.version).toBe(VERSION);
    expect(status.current).toBe(true);
  });

  it('installed but outdated', async () => {
    const old = TEMPLATE.replaceAll('__WARP_HOOK_VERSION__', '7.0.0');
    const { installer } = makeInstaller({
      '/repo/.git/hooks/post-merge': old,
    });
    const status = await installer.getHookStatus('/repo');
    expect(status.installed).toBe(true);
    expect(status.version).toBe('7.0.0');
    expect(status.current).toBe(false);
  });

  it('foreign hook shows as not installed', async () => {
    const { installer } = makeInstaller({
      '/repo/.git/hooks/post-merge': '#!/bin/sh\necho "other"\n',
    });
    const status = await installer.getHookStatus('/repo');
    expect(status.installed).toBe(false);
    expect(status.foreign).toBe(true);
  });
});

// ── Real template smoke ─────────────────────────────────────────────────────

describe('real post-merge template smoke', () => {
  it('stamps the checked-in template and reports current status through the installer', async () => {
    const { installer, fs } = makeInstaller({
      '/tmpl/post-merge.sh': REAL_TEMPLATE,
    });

    const result = await installer.install('/repo', { strategy: 'install' });
    const written = readStoredString(fs, result.hookPath);
    const classification = classifyExistingHook(written);
    const status = await installer.getHookStatus('/repo');

    expect(result.action).toBe('installed');
    expect(classification.kind).toBe('ours');
    expect(classification.version).toBe(VERSION);
    expect(status.installed).toBe(true);
    expect(status.current).toBe(true);
    expect(status.version).toBe(VERSION);
  });

  it('appends and upgrades the checked-in template through installer behavior', async () => {
    const foreign = '#!/bin/sh\necho "foreign"\n';
    const { installer, fs } = makeInstaller({
      '/tmpl/post-merge.sh': REAL_TEMPLATE,
      '/repo/.git/hooks/post-merge': foreign,
    });

    const appendResult = await installer.install('/repo', { strategy: 'append' });
    const appended = readStoredString(fs, appendResult.hookPath);
    const appendedClassification = classifyExistingHook(appended);

    expect(appendResult.action).toBe('appended');
    expect(appendedClassification.kind).toBe('ours');
    expect(appendedClassification.version).toBe(VERSION);
    expect(appendedClassification.appended).toBe(true);

    const { installer: upgrader, fs: upgradeFs } = makeInstaller({
      '/tmpl/post-merge.sh': REAL_TEMPLATE,
      '/repo/.git/hooks/post-merge': appended.replaceAll(VERSION, '7.0.0'),
    });

    const upgradeResult = await upgrader.install('/repo', { strategy: 'upgrade' });
    const upgraded = readStoredString(upgradeFs, upgradeResult.hookPath);
    const upgradedClassification = classifyExistingHook(upgraded);

    expect(upgradeResult.action).toBe('upgraded');
    expect(upgraded).toContain('echo "foreign"');
    expect(upgradedClassification.kind).toBe('ours');
    expect(upgradedClassification.version).toBe(VERSION);
    expect(upgraded).not.toContain('7.0.0');
  });
});
