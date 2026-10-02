import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import childProcess from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import MermaidRenderSupervisor from '../../../scripts/mermaid/MermaidRenderSupervisor.ts';
import MermaidValidationDeadline from '../../../scripts/mermaid/MermaidValidationDeadline.ts';

const worker = fileURLToPath(new URL('../../fixtures/mermaid-worker-probe.mjs', import.meta.url));
const budgets = new MermaidValidationDeadline(500, 200, 100);
const interruptions: readonly ('SIGINT' | 'SIGTERM')[] = ['SIGINT', 'SIGTERM'];

describe('Owned Mermaid worker lifecycle', () => {
  it.each([
    ['render-stall', 'Mermaid render timed out'],
    ['shutdown-stall', 'Mermaid browser shutdown timed out'],
    ['render-failure', 'Mermaid render failed: controlled invalid diagram'],
    ['shutdown-failure', 'Mermaid browser shutdown failed'],
    ['close-error', 'Mermaid browser shutdown failed: controlled close error'],
    ['both-failures', 'Mermaid render failed: controlled invalid diagram'],
    ['failed-render-shutdown-stall', 'Mermaid render failed: controlled invalid diagram'],
    ['stderr-failure', 'controlled worker crash'],
  ])('reclaims worker, browser and descendants after %s', async (mode, diagnostic) => {
    const directory = await mkdtemp(join(tmpdir(), 'mermaid-owned-worker-'));
    const marker = join(directory, 'browser-pid');
    try {
      await expect(new MermaidRenderSupervisor(budgets, worker).render(mode, marker)).rejects.toThrow(diagnostic);
      const browserPid = Number(await readFile(marker, 'utf8'));
      expect(() => process.kill(-browserPid, 0)).toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('reclaims surviving browser descendants even when the worker reports success', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mermaid-owned-success-'));
    const marker = join(directory, 'browser-pid');
    const supervisor = new MermaidRenderSupervisor(budgets, worker);
    try {
      await supervisor.render('success', marker);
      const browserPid = Number(await readFile(marker, 'utf8'));
      expect(() => process.kill(-browserPid, 0)).toThrow();
      await expect(supervisor.render('success', marker)).rejects.toThrow('cannot be reused');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it.each([
    ['invalid-message', 'Invalid Mermaid worker message'],
    ['invalid-pid', 'Invalid owned Mermaid browser PID'],
    ['unexpected-message', 'Unexpected Mermaid worker message'],
    ['exit-before-render', 'Mermaid render failed'],
  ])('fails closed on %s', async (mode, diagnostic) => {
    await expect(new MermaidRenderSupervisor(budgets, worker).render(mode, 'unused')).rejects.toThrow(diagnostic);
  });

  it('rejects invalid wall-clock budgets at construction', () => {
    expect(() => new MermaidValidationDeadline(0)).toThrow('positive integer');
    expect(() => new MermaidValidationDeadline(1, -1)).toThrow('positive integer');
    expect(() => new MermaidValidationDeadline(1, 1, 1.5)).toThrow('positive integer');
    expect(() => new MermaidValidationDeadline(2147483648)).toThrow('positive integer');
    expect(Object.isFrozen(budgets)).toBe(true);
    expect(new MermaidValidationDeadline().renderMs).toBe(120000);
  });

  it('handles native worker spawn failure without leaking a deadline', async () => {
    const fork = vi.spyOn(childProcess, 'fork').mockImplementation(() => childProcess.spawn('nonexistent-mermaid-worker'));
    try {
      await expect(new MermaidRenderSupervisor(undefined, worker).render('unused', 'unused')).rejects.toThrow('ENOENT');
    } finally { fork.mockRestore(); }
  });

  it('fails when the kernel cannot establish that owned groups are gone', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mermaid-reclamation-error-'));
    const nativeKill = process.kill.bind(process);
    const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (pid < 0 && signal === 0) { throw Object.assign(new Error('denied'), { code: 'EPERM' }); }
      return nativeKill(pid, signal);
    });
    try {
      await expect(new MermaidRenderSupervisor(budgets, worker).render('success', join(directory, 'pid'))).rejects.toThrow('reclamation failed');
    } finally { kill.mockRestore(); await rm(directory, { recursive: true, force: true }); }
  });

  it('fails a bounded reclamation check instead of claiming success on uncertain ownership', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mermaid-reclamation-stall-'));
    const nativeKill = process.kill.bind(process);
    const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (pid < 0 && signal === 0) { return true; }
      return nativeKill(pid, signal);
    });
    try {
      await expect(new MermaidRenderSupervisor(budgets, worker).render('success', join(directory, 'pid'))).rejects.toThrow('reclamation failed');
    } finally { kill.mockRestore(); await rm(directory, { recursive: true, force: true }); }
  });

  it.each(interruptions)('reclaims its processes when its registered %s handler runs', async signal => {
    const directory = await mkdtemp(join(tmpdir(), 'mermaid-interruption-'));
    const marker = join(directory, 'pid');
    const previous = process.listeners(signal);
    const supervisor = new MermaidRenderSupervisor(new MermaidValidationDeadline(2000, 2000, 100), worker);
    const running = supervisor.render('render-stall', marker);
    try {
      await vi.waitFor(async () => { expect(await readFile(marker, 'utf8')).toMatch(/^\d+$/); });
      const interrupt = process.listeners(signal).find(listener => !previous.includes(listener));
      expect(interrupt).toBeDefined();
      interrupt?.(signal);
      await expect(running).rejects.toThrow(`interrupted by ${signal}`);
      const browserPid = Number(await readFile(marker, 'utf8'));
      expect(() => process.kill(-browserPid, 0)).toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it.each(['success', 'command-error', 'command-failure'])('bounds Windows tree reclamation on %s', async mode => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    const nativeSpawnSync = childProcess.spawnSync.bind(childProcess);
    const nativeFork = childProcess.fork.bind(childProcess);
    const children: childProcess.ChildProcess[] = [];
    const fork = vi.spyOn(childProcess, 'fork').mockImplementation((...args) => {
      const child = nativeFork(...args);
      children.push(child);
      return child;
    });
    const spawn = vi.spyOn(childProcess, 'spawnSync').mockImplementation((_command, args) => {
      if (mode === 'command-error') { return nativeSpawnSync('nonexistent-taskkill'); }
      if (mode === 'command-failure') { return nativeSpawnSync(process.execPath, ['-e', 'process.exit(1)']); }
      const pid = Array.isArray(args) ? Number(args[1]) : 0;
      process.kill(pid, 'SIGKILL');
      return nativeSpawnSync(process.execPath, ['-e', '']);
    });
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      await expect(new MermaidRenderSupervisor(budgets, worker).render('invalid-message', 'unused')).rejects.toThrow();
      expect(spawn).toHaveBeenCalledWith('taskkill', expect.arrayContaining(['/T', '/F']), {
        timeout: expect.any(Number),
      });
    } finally {
      if (platform !== undefined) { Object.defineProperty(process, 'platform', platform); }
      fork.mockRestore(); spawn.mockRestore();
      for (const child of children) { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); } }
    }
  });

  it('renders real Markdown and SVG before accepting the actual worker exit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mermaid-real-render-'));
    const input = join(directory, 'input.md');
    const output = join(directory, 'rendered.md');
    try {
      await writeFile(input, '```mermaid\ngraph TD\nA --> B\n```');
      await new MermaidRenderSupervisor().render(input, output);
      const images = (await readdir(directory)).filter(path => path.endsWith('.svg'));
      expect(images).toHaveLength(1);
      expect(await readFile(join(directory, images[0] ?? ''), 'utf8')).toContain('<svg');
      expect(await readFile(output, 'utf8')).toContain(images[0]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('reports an owned-group termination failure after the worker exits', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mermaid-owned-kill-error-'));
    const nativeKill = process.kill.bind(process);
    let first = true;
    const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      const killed = nativeKill(pid, signal);
      if (pid < 0 && signal === 'SIGKILL' && first) {
        first = false;
        throw Object.assign(new Error('controlled group termination error'), { code: 'EPERM' });
      }
      return killed;
    });
    try {
      await expect(new MermaidRenderSupervisor(budgets, worker).render('success', join(directory, 'pid'))).rejects.toThrow('owned process reclamation failed');
    } finally { kill.mockRestore(); await rm(directory, { recursive: true, force: true }); }
  });

  it('reports an actual invalid diagram as render failure after successful browser cleanup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mermaid-invalid-render-'));
    const input = join(directory, 'input.md');
    const output = join(directory, 'rendered.md');
    try {
      await writeFile(input, '```mermaid\nnot_a_supported_diagram\n```');
      await expect(new MermaidRenderSupervisor().render(input, output)).rejects.toThrow(/^Mermaid render failed:/);
      expect((await readdir(directory)).filter(path => path.endsWith('.svg'))).toHaveLength(0);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('reclaims an owned browser when cancellation cannot be delivered over IPC', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mermaid-cancellation-error-'));
    const marker = join(directory, 'pid');
    const nativeFork = childProcess.fork.bind(childProcess);
    const fork = vi.spyOn(childProcess, 'fork').mockImplementation((...args) => {
      const child = nativeFork(...args);
      vi.spyOn(child, 'send').mockImplementation((...sendArgs) => {
        const callback = sendArgs.find(argument => typeof argument === 'function');
        if (typeof callback === 'function') { callback(new Error('controlled closed IPC channel')); }
        return false;
      });
      return child;
    });
    try {
      await expect(new MermaidRenderSupervisor(budgets, worker).render('render-stall', marker)).rejects.toThrow('render timed out');
      const pid = Number(await readFile(marker, 'utf8'));
      expect(() => process.kill(-pid, 0)).toThrow();
    } finally { fork.mockRestore(); await rm(directory, { recursive: true, force: true }); }
  });
});
