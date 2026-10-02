import { ChildProcess } from 'node:child_process';
import childProcess from 'node:child_process';
import { PassThrough } from 'node:stream';
import { expect, it, vi } from 'vitest';
import MermaidRenderSupervisor from '../../../scripts/mermaid/MermaidRenderSupervisor.ts';
import MermaidValidationDeadline from '../../../scripts/mermaid/MermaidValidationDeadline.ts';

it.each(['spent', 'remaining'])('shares one Windows cleanup budget after worker exit: %s', async mode => {
  const child = new ChildProcess();
  Object.defineProperties(child, {
    pid: { value: 111 }, connected: { value: false }, exitCode: { value: 0 },
    stderr: { value: new PassThrough() },
  });
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const living = new Set([111, 222]);
  const allowances: number[] = [];
  let elapsedMs = 0;
  const nativeSpawnSync = childProcess.spawnSync.bind(childProcess);
  const clock = vi.spyOn(process.hrtime, 'bigint').mockImplementation(() => BigInt(elapsedMs) * 1000000n);
  const kill = vi.spyOn(process, 'kill').mockImplementation(pid => {
    if (!living.has(pid)) { throw Object.assign(new Error('missing'), { code: 'ESRCH' }); }
    return true;
  });
  const spawn = vi.spyOn(childProcess, 'spawnSync').mockImplementation((_command, args, options) => {
    const allowance = options?.timeout ?? 0;
    allowances.push(allowance);
    elapsedMs += mode === 'spent' ? allowance : Math.floor(allowance / 2);
    living.delete(Array.isArray(args) ? Number(args[1]) : 0);
    return nativeSpawnSync(process.execPath, ['-e', '']);
  });
  const fork = vi.spyOn(childProcess, 'fork').mockImplementation(() => {
    queueMicrotask(() => {
      child.emit('message', 'browser:222'); child.emit('message', 'shutdown');
      child.emit('exit', 0); child.emit('close', 0);
    });
    return child;
  });
  Object.defineProperty(process, 'platform', { value: 'win32' });
  try {
    const running = new MermaidRenderSupervisor(new MermaidValidationDeadline(500, 200, 100)).render('input.md', 'output.md');
    if (mode === 'spent') {
      await expect(running).rejects.toThrow('reclamation failed');
      expect(allowances).toEqual([100]);
      expect(elapsedMs).toBe(100);
    } else {
      await running;
      expect(allowances).toEqual([100, 50]);
      expect(elapsedMs).toBe(75);
      expect(living.size).toBe(0);
    }
  } finally {
    if (platform !== undefined) { Object.defineProperty(process, 'platform', platform); }
    fork.mockRestore(); spawn.mockRestore(); kill.mockRestore(); clock.mockRestore();
  }
});
