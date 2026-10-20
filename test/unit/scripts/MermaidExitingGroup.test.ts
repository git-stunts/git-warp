import { ChildProcess } from 'node:child_process';
import childProcess from 'node:child_process';
import { PassThrough } from 'node:stream';
import { expect, it, vi } from 'vitest';
import MermaidRenderSupervisor from '../../../scripts/mermaid/MermaidRenderSupervisor.ts';
import MermaidValidationDeadline from '../../../scripts/mermaid/MermaidValidationDeadline.ts';

const WORKER_PID = 111;
const BROWSER_PID = 222;

function signalError(code: string): Error {
  return Object.assign(new Error(`kill ${code}`), { code });
}

/**
 * Darwin reports EPERM for kill(-pgid, signal) while every member of an
 * owned process group is exiting or a zombie. The browser group answers EPERM
 * for `exitingProbes` signals and then disappears.
 */
async function reclaimGroup(exitingProbes: number, hostPlatform = 'darwin'): Promise<void> {
  const child = new ChildProcess();
  Object.defineProperties(child, {
    pid: { value: WORKER_PID }, connected: { value: false }, exitCode: { value: 0 },
    stderr: { value: new PassThrough() },
  });
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  let remaining = exitingProbes;
  const kill = vi.spyOn(process, 'kill').mockImplementation(pid => {
    if (Math.abs(pid) !== BROWSER_PID || remaining <= 0) { throw signalError('ESRCH'); }
    remaining -= 1;
    throw signalError('EPERM');
  });
  const fork = vi.spyOn(childProcess, 'fork').mockImplementation(() => {
    queueMicrotask(() => {
      child.emit('message', `browser:${BROWSER_PID}`); child.emit('message', 'shutdown');
      child.emit('exit', 0); child.emit('close', 0);
    });
    return child;
  });
  Object.defineProperty(process, 'platform', { value: hostPlatform });
  try {
    await new MermaidRenderSupervisor(new MermaidValidationDeadline(500, 200, 100), 'controlled-worker', null)
      .render('input.md', 'output.md');
  } finally {
    if (platform !== undefined) { Object.defineProperty(process, 'platform', platform); }
    fork.mockRestore(); kill.mockRestore();
  }
}

it('waits for an exiting Darwin process group instead of failing on EPERM', async () => {
  await expect(reclaimGroup(4)).resolves.toBeUndefined();
});

it('fails closed when a Darwin process group keeps reporting EPERM past the deadline', async () => {
  await expect(reclaimGroup(Number.POSITIVE_INFINITY)).rejects.toMatchObject({
    message: 'Mermaid browser reclamation failed',
    cause: expect.objectContaining({ message: 'Mermaid browser reclamation timed out' }),
  });
});

it('keeps EPERM fatal outside Darwin', async () => {
  await expect(reclaimGroup(1, 'linux')).rejects.toMatchObject({
    message: 'Mermaid owned process reclamation failed',
    cause: expect.objectContaining({ code: 'EPERM' }),
  });
});
