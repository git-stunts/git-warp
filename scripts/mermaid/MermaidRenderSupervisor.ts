import childProcess, { type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CDP_WEBSOCKET_ENDPOINT_REGEX, type Process } from '@puppeteer/browsers';
import MermaidValidationDeadline from './MermaidValidationDeadline.ts';
import MermaidBrowserLaunch from './MermaidBrowserLaunch.ts';

const POLL_MS = 10;
const MAX_DIAGNOSTIC_CHARACTERS = 65536;
const NANOSECONDS_PER_MILLISECOND = 1000000n;
const WINDOWS_TREE_KILL_DEADLINE_MS = 1000;
const GRACEFUL_ABORT_MS = 100;
const WORKER = fileURLToPath(new URL('./MermaidRenderWorker.ts', import.meta.url));

/** Owns the render worker and its synchronously owned native browser group. */
export default class MermaidRenderSupervisor {
  readonly #deadlines: MermaidValidationDeadline;
  readonly #worker: string;
  readonly #browserLauncher: MermaidBrowserLaunch | null;
  readonly #groups = new Set<number>();
  #phase = 'render';
  #renderFailure: string | null = null;
  #shutdownFailure: string | null = null;
  #stderr = '';
  #timer: ReturnType<typeof setTimeout> | undefined;
  #started = false;
  #reclamationDeadline: bigint | undefined;

  constructor(deadlines = new MermaidValidationDeadline(), worker = WORKER, browserLauncher: MermaidBrowserLaunch | null = new MermaidBrowserLaunch()) {
    this.#deadlines = deadlines;
    this.#worker = worker;
    this.#browserLauncher = browserLauncher;
    Object.freeze(this);
  }

  async render(input: string, output: string): Promise<void> {
    if (this.#started) { throw new Error('An owned Mermaid supervisor cannot be reused'); }
    this.#started = true;
    const interruption = new AbortController();
    const interrupt = (): void => { interruption.abort('SIGINT'); };
    const terminate = (): void => { interruption.abort('SIGTERM'); };
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', terminate);
    let child: ChildProcess | undefined;
    const renderDeadline = process.hrtime.bigint() + BigInt(this.#deadlines.renderMs) * NANOSECONDS_PER_MILLISECOND;
    try {
      const command = await this.#browserLauncher?.prepare(output, this.#deadlines.renderMs, interruption.signal);
      if (interruption.signal.aborted) { throw new Error(`Mermaid validation interrupted by ${String(interruption.signal.reason)}`); }
      const browser = command?.launch() ?? null;
      if (browser?.nodeProcess.pid !== undefined) { this.#groups.add(browser.nodeProcess.pid); }
      child = this.#forkWorker(input, output, browser);
      await this.#complete(child, await this.#observe(child, interruption.signal, browser, renderDeadline));
    } catch (error) {
      if (child === undefined) {
        await this.#complete(undefined, error instanceof Error ? error : new Error('Mermaid render failed: browser or worker launch', { cause: error }));
      }
      throw error;
    } finally {
      clearTimeout(this.#timer);
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', terminate);
    }
  }

  #forkWorker(input: string, output: string, browser: Process | null): ChildProcess {
    const args = browser === null ? [input, output] : [input, output, String(browser.nodeProcess.pid)];
    const child = childProcess.fork(this.#worker, args, {
      detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    if (child.pid !== undefined) { this.#groups.add(child.pid); }
    return child;
  }

  async #complete(child: ChildProcess | undefined, failure: Error | null): Promise<void> {
    try { await this.#reclaim(child); }
    catch (error) {
      const reclamation = new Error('Mermaid browser reclamation failed', { cause: error });
      if (failure !== null) {
        throw new AggregateError([failure, reclamation], 'Mermaid validation and browser reclamation failed');
      }
      throw reclamation;
    }
    if (failure !== null) { throw failure; }
  }

  #observe(child: ChildProcess, interruption: AbortSignal, browser: Process | null, renderDeadline: bigint): Promise<Error | null> {
    return new Promise(resolve => {
      let completed = false;
      const finish = (error: Error | null): void => {
        if (completed) { return; }
        completed = true;
        clearTimeout(this.#timer);
        resolve(error);
      };
      this.#armDeadline(Math.max(1, Number((renderDeadline - process.hrtime.bigint()) / NANOSECONDS_PER_MILLISECOND)), finish);
      interruption.addEventListener('abort', () => {
        finish(new Error(`Mermaid validation interrupted by ${String(interruption.reason)}`));
      }, { once: true });
      child.stderr?.on('data', chunk => {
        this.#stderr = (this.#stderr + String(chunk)).slice(-MAX_DIAGNOSTIC_CHARACTERS);
      });
      const endpoint = this.#browserEndpoint(browser, finish);
      child.on('message', message => { this.#receive(message, child, endpoint, finish); });
      this.#observeExit(child, finish);
    });
  }

  #browserEndpoint(browser: Process | null, finish: (error: Error | null) => void): Promise<string> | null {
    if (browser === null) { return null; }
    const failed = (cause: Error): void => { finish(new Error('Mermaid render failed: browser launch', { cause })); };
    browser.nodeProcess.once('error', failed);
    const endpoint = browser.waitForLineOutput(CDP_WEBSOCKET_ENDPOINT_REGEX, this.#deadlines.renderMs);
    void endpoint.catch(failed);
    return endpoint;
  }

  #observeExit(child: ChildProcess, finish: (error: Error | null) => void): void {
    child.once('error', error => { finish(error); });
    child.once('exit', () => {
      try { this.#terminateOwnedGroups(); }
      catch (error) { finish(new Error('Mermaid owned process reclamation failed', { cause: error })); }
    });
    child.once('close', code => { finish(this.#exitFailure(code)); });
  }

  #receive<T>(message: T, child: ChildProcess, endpoint: Promise<string> | null, finish: (error: Error | null) => void): void {
    if (typeof message !== 'string') { finish(new Error('Invalid Mermaid worker message')); return; }
    this.#receiveText(message, child, endpoint, finish);
  }

  #receiveText(message: string, child: ChildProcess, endpoint: Promise<string> | null, finish: (error: Error | null) => void): void {
    if (message === 'ready') {
      this.#connectWorker(child, endpoint, finish);
    } else if (message === 'shutdown') {
      this.#phase = 'browser shutdown';
      this.#armDeadline(this.#deadlines.shutdownMs, finish);
    } else if (message.startsWith('browser:')) {
      this.#recordBrowserPid(message.slice('browser:'.length), finish);
    } else if (message.startsWith('render-failed:')) {
      this.#renderFailure = message.slice('render-failed:'.length);
    } else if (message.startsWith('shutdown-failed:')) {
      this.#shutdownFailure = message.slice('shutdown-failed:'.length);
    } else { finish(new Error('Unexpected Mermaid worker message')); }
  }

  #connectWorker(child: ChildProcess, endpoint: Promise<string> | null, finish: (error: Error | null) => void): void {
    if (endpoint === null) { finish(new Error('Mermaid worker requested an unavailable browser')); return; }
    void endpoint.then(value => {
      if (!child.connected) { return; }
      child.send(`endpoint:${value}`, error => {
        if (error !== null) { finish(new Error('Mermaid render failed: browser connection delivery', { cause: error })); }
      });
    }).catch(cause => { finish(new Error('Mermaid render failed: browser endpoint', { cause })); });
  }

  #recordBrowserPid(value: string, finish: (error: Error | null) => void): void {
    const pid = Number(value);
    if (!Number.isSafeInteger(pid) || pid <= 0) { finish(new Error('Invalid owned Mermaid browser PID')); return; }
    this.#groups.add(pid);
  }

  #armDeadline(milliseconds: number, finish: (error: Error | null) => void): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      finish(this.#failure(`Mermaid ${this.#phase} timed out after ${String(milliseconds)} ms`));
    }, milliseconds);
  }

  #exitFailure(code: number | null): Error | null {
    if (this.#shutdownFailure !== null) { return this.#failure(`Mermaid browser shutdown failed: ${this.#shutdownFailure}`); }
    if (this.#renderFailure !== null) { return new Error(`Mermaid render failed: ${this.#renderFailure}`); }
    if (code === 0 && this.#phase === 'browser shutdown') { return null; }
    return this.#failure(`Mermaid ${this.#phase} failed (worker exit ${String(code)}): ${this.#stderr.trim()}`);
  }

  #failure(message: string): Error {
    return new Error(this.#renderFailure === null ? message : `${message}\nMermaid render failed: ${this.#renderFailure}`);
  }

  async #reclaim(child: ChildProcess | undefined): Promise<void> {
    const deadline = this.#cleanupDeadline();
    if (child?.connected === true) {
      child.send('abort', error => { if (error !== null) { child.kill('SIGKILL'); } });
    }
    if (child !== undefined) {
      await waitForExit(child, Math.min(GRACEFUL_ABORT_MS, Math.max(1, Math.floor(this.#deadlines.reclamationMs / 4)), remainingMilliseconds(deadline)));
    }
    this.#terminateOwnedGroups();
    while (ownedGroupsRemain(this.#groups)) {
      if (process.hrtime.bigint() >= deadline) { throw new Error('Mermaid browser reclamation timed out'); }
      await new Promise<void>(resolve => { setTimeout(resolve, POLL_MS); });
    }
  }

  #cleanupDeadline(): bigint {
    this.#reclamationDeadline ??= process.hrtime.bigint()
      + BigInt(this.#deadlines.reclamationMs) * NANOSECONDS_PER_MILLISECOND;
    return this.#reclamationDeadline;
  }

  #terminateOwnedGroups(): void {
    const deadline = this.#cleanupDeadline();
    for (const pid of this.#groups) {
      if (groupExists(pid)) { killOwnedGroup(pid, remainingMilliseconds(deadline)); }
    }
  }
}

async function waitForExit(child: ChildProcess, milliseconds: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) { return true; }
  return await new Promise(resolve => {
    const exited = (): void => { clearTimeout(timer); resolve(true); };
    const timer = setTimeout(() => { child.off('exit', exited); resolve(false); }, milliseconds);
    child.once('exit', exited);
  });
}

function killOwnedGroup(pid: number, remainingMs: number): void {
  if (process.platform === 'win32') {
    if (!groupExists(pid)) { return; }
    const result = childProcess.spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      timeout: Math.min(WINDOWS_TREE_KILL_DEADLINE_MS, remainingMs),
    });
    if (result.error !== undefined) { throw result.error; }
    if (result.status !== 0 && groupExists(pid)) { throw new Error('Could not reclaim owned Mermaid process tree'); }
    return;
  }
  try { process.kill(-pid, 'SIGKILL'); }
  catch (error) { if (!isMissingProcess(error)) { throw error; } }
}

function groupExists(pid: number): boolean {
  try { process.kill(process.platform === 'win32' ? pid : -pid, 0); return true; }
  catch (error) { if (isMissingProcess(error)) { return false; } throw error; }
}

function ownedGroupsRemain(groups: ReadonlySet<number>): boolean {
  return [...groups].some(groupExists);
}

function isMissingProcess<T>(error: T): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ESRCH';
}

function remainingMilliseconds(deadline: bigint): number {
  const remaining = deadline - process.hrtime.bigint();
  if (remaining <= 0n) { throw new Error('Mermaid browser reclamation timed out'); }
  return Math.max(1, Number(remaining / NANOSECONDS_PER_MILLISECOND));
}
