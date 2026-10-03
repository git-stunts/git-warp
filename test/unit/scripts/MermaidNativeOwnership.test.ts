import childProcess from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';
import MermaidRenderSupervisor from '../../../scripts/mermaid/MermaidRenderSupervisor.ts';
import MermaidBrowserCommand from '../../../scripts/mermaid/MermaidBrowserCommand.ts';
import MermaidBrowserLaunch from '../../../scripts/mermaid/MermaidBrowserLaunch.ts';
import MermaidValidationDeadline from '../../../scripts/mermaid/MermaidValidationDeadline.ts';

const gapProbe = fileURLToPath(new URL('../../fixtures/mermaid-launch-gap-probe.mjs', import.meta.url));

it('reclaims an actual browser stalled before worker reporting even when abort IPC fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mermaid-native-ownership-'));
  const marker = join(directory, 'browser');
  const nativeFork = childProcess.fork.bind(childProcess);
  const fork = vi.spyOn(childProcess, 'fork').mockImplementation((modulePath, args, options) => {
    const child = nativeFork(modulePath, Array.isArray(args) ? args : [], {
      ...options, execArgv: ['--import', gapProbe],
      env: { ...process.env, MERMAID_LAUNCH_GAP_MARKER: marker },
    });
    const send = child.send.bind(child);
    vi.spyOn(child, 'send').mockImplementation((...sendArgs) => {
      if (sendArgs[0] !== 'abort') { return send(...sendArgs); }
      const callback = sendArgs.find(argument => typeof argument === 'function');
      if (typeof callback === 'function') { callback(new Error('controlled unavailable IPC')); }
      return false;
    });
    return child;
  });
  let browserPid = 0;
  try {
    const input = join(directory, 'input.md');
    await writeFile(input, '```mermaid\ngraph TD\nA --> B\n```');
    const supervisor = new MermaidRenderSupervisor(new MermaidValidationDeadline(2000, 500, 1000));
    await expect(supervisor.render(input, join(directory, 'output.md'))).rejects.toThrow('render timed out');
    const [pid, state] = (await readFile(marker, 'utf8')).split('\n');
    browserPid = Number(pid);
    expect(state).toBe('connected'); // Chrome really started before the connection wrapper stalled.
    expect(browserPid).toBeGreaterThan(0);
    expect(() => process.kill(-browserPid, 0), 'the native browser group must be reclaimed').toThrow();
  } finally {
    fork.mockRestore();
    if (browserPid === 0) { browserPid = Number((await readFile(marker, 'utf8').catch(() => '0')).split('\n')[0]); }
    if (browserPid > 0) { try { process.kill(-browserPid, 'SIGKILL'); } catch { /* Already reclaimed. */ } }
    await rm(directory, { recursive: true, force: true });
  }
}, 10000);


it('reclaims the synchronously owned native browser when worker fork throws', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mermaid-fork-failure-'));
  const nativeLaunch = MermaidBrowserCommand.prototype.launch;
  let browserPid = 0;
  const launch = vi.spyOn(MermaidBrowserCommand.prototype, 'launch').mockImplementation(function (this: MermaidBrowserCommand) {
    const browser = nativeLaunch.call(this);
    browserPid = browser.nodeProcess.pid ?? 0;
    return browser;
  });
  const fork = vi.spyOn(childProcess, 'fork').mockImplementation(() => { throw new Error('controlled fork failure'); });
  try {
    await expect(new MermaidRenderSupervisor().render('unused', join(directory, 'output.md')))
      .rejects.toThrow('controlled fork failure');
    expect(browserPid).toBeGreaterThan(0);
    expect(() => process.kill(-browserPid, 0)).toThrow();
  } finally {
    launch.mockRestore(); fork.mockRestore();
    if (browserPid > 0) { try { process.kill(-browserPid, 'SIGKILL'); } catch { /* Already reclaimed. */ } }
    await rm(directory, { recursive: true, force: true });
  }
});

it('refuses a native browser spawn failure and reclaims its worker', async () => {
  const prepare = vi.spyOn(MermaidBrowserLaunch.prototype, 'prepare')
    .mockResolvedValue(new MermaidBrowserCommand('nonexistent-mermaid-browser', []));
  try {
    await expect(new MermaidRenderSupervisor().render('unused', 'output.md'))
      .rejects.toThrow('Mermaid render failed: browser launch');
  } finally { prepare.mockRestore(); }
});


it.each(['delivery-failure', 'disconnected'])('reclaims native ownership when endpoint IPC is %s', async mode => {
  const directory = await mkdtemp(join(tmpdir(), 'mermaid-endpoint-ipc-'));
  const nativeFork = childProcess.fork.bind(childProcess);
  const nativeLaunch = MermaidBrowserCommand.prototype.launch;
  let browserPid = 0;
  const launch = vi.spyOn(MermaidBrowserCommand.prototype, 'launch').mockImplementation(function (this: MermaidBrowserCommand) {
    const browser = nativeLaunch.call(this);
    browserPid = browser.nodeProcess.pid ?? 0;
    return browser;
  });
  const fork = vi.spyOn(childProcess, 'fork').mockImplementation((...args) => {
    const child = nativeFork(...args);
    if (mode === 'disconnected') {
      child.on('message', message => {
        if (message === 'ready') { Object.defineProperty(child, 'connected', { value: false }); }
      });
    } else {
      const send = child.send.bind(child);
      vi.spyOn(child, 'send').mockImplementation((...sendArgs) => {
        if (typeof sendArgs[0] !== 'string' || !sendArgs[0].startsWith('endpoint:')) { return send(...sendArgs); }
        const callback = sendArgs.find(argument => typeof argument === 'function');
        if (typeof callback === 'function') { callback(new Error('controlled endpoint IPC failure')); }
        return false;
      });
    }
    return child;
  });
  try {
    const diagnostic = mode === 'disconnected' ? 'render timed out' : 'browser connection delivery';
    await expect(new MermaidRenderSupervisor(new MermaidValidationDeadline(2000, 500, 1000))
      .render('unused', join(directory, 'output.md'))).rejects.toThrow(diagnostic);
    expect(browserPid).toBeGreaterThan(0);
    expect(() => process.kill(-browserPid, 0)).toThrow();
  } finally {
    launch.mockRestore(); fork.mockRestore();
    if (browserPid > 0) { try { process.kill(-browserPid, 'SIGKILL'); } catch { /* Already reclaimed. */ } }
    await rm(directory, { recursive: true, force: true });
  }
});

it('honors interruption that occurs while browser arguments resolve', async () => {
  const previous = process.listeners('SIGINT');
  const prepare = vi.spyOn(MermaidBrowserLaunch.prototype, 'prepare').mockImplementation(async () => {
    const interrupt = process.listeners('SIGINT').find(listener => !previous.includes(listener));
    interrupt?.('SIGINT');
    return new MermaidBrowserCommand('unused', []);
  });
  const launch = vi.spyOn(MermaidBrowserCommand.prototype, 'launch');
  try {
    await expect(new MermaidRenderSupervisor().render('unused', 'output.md')).rejects.toThrow('interrupted by SIGINT');
    expect(launch).not.toHaveBeenCalled();
  } finally { prepare.mockRestore(); launch.mockRestore(); }
});

it('refuses non-Error preparation failures without losing their diagnostic cause', async () => {
  const prepare = vi.spyOn(MermaidBrowserLaunch.prototype, 'prepare').mockRejectedValue('controlled non-Error failure');
  try {
    await expect(new MermaidRenderSupervisor().render('unused', 'output.md')).rejects.toMatchObject({
      message: 'Mermaid render failed: browser or worker launch', cause: 'controlled non-Error failure',
    });
  } finally { prepare.mockRestore(); }
});

it('refuses an unavailable endpoint after the worker requests connection and reclaims the native browser', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mermaid-endpoint-failure-'));
  const nativeLaunch = MermaidBrowserCommand.prototype.launch;
  const nativeFork = childProcess.fork.bind(childProcess);
  let browserPid = 0;
  let refuse: (error: Error) => void = () => { throw new Error('Endpoint wait was not installed'); };
  const launch = vi.spyOn(MermaidBrowserCommand.prototype, 'launch').mockImplementation(function (this: MermaidBrowserCommand) {
    const browser = nativeLaunch.call(this);
    browserPid = browser.nodeProcess.pid ?? 0;
    vi.spyOn(browser, 'waitForLineOutput').mockImplementation(() => new Promise((_resolve, reject) => { refuse = reject; }));
    return browser;
  });
  const fork = vi.spyOn(childProcess, 'fork').mockImplementation((...args) => {
    const child = nativeFork(...args);
    child.on('message', message => {
      if (message === 'ready') { refuse(new Error('controlled endpoint unavailable')); }
    });
    return child;
  });
  try {
    await expect(new MermaidRenderSupervisor().render('unused', join(directory, 'output.md')))
      .rejects.toThrow('Mermaid render failed: browser launch');
    expect(browserPid).toBeGreaterThan(0);
    expect(() => process.kill(-browserPid, 0)).toThrow();
  } finally {
    launch.mockRestore(); fork.mockRestore();
    if (browserPid > 0) { try { process.kill(-browserPid, 'SIGKILL'); } catch { /* Already reclaimed. */ } }
    await rm(directory, { recursive: true, force: true });
  }
});
