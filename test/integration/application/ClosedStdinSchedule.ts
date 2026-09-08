import childProcess, { type ChildProcess } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import type { Writable } from 'node:stream';
import { vi } from 'vitest';

/** Forces real Git to close its input before Writable reports a final flush. */
export default class ClosedStdinSchedule {
  private readonly completion = Promise.withResolvers<number | null>();
  private readonly inputs: Writable[] = [];
  private restoreSpawn: () => void = () => {};

  get closed(): Promise<number | null> {
    return this.completion.promise;
  }

  get witnesses(): number {
    return this.inputs.length;
  }

  get closedWithoutFinish(): number {
    return this.inputs.filter((input) => input.closed && !input.writableFinished).length;
  }

  install(): void {
    const spawn = childProcess.spawn;
    const replacement = vi.spyOn(childProcess, 'spawn').mockImplementation((command, args, options) => {
      const child = spawn(command, args, options);
      if (args.includes('cat-file')) {
        this.control(child);
      }
      return child;
    });
    this.restoreSpawn = () => replacement.mockRestore();
    syncBuiltinESMExports();
  }

  release(): void {
    // Rescue the deliberately blocked baseline only after the verdict, so a
    // failing regression can still release its owned storage during teardown.
    for (const input of this.inputs) {
      input.emit('finish');
    }
    this.restoreSpawn();
    syncBuiltinESMExports();
  }

  private control(child: ChildProcess): void {
    const input = child.stdin;
    if (input === null) {
      throw new Error('The controlled Git process must have piped stdin');
    }
    this.inputs.push(input);
    const final = input._final.bind(input);
    input._final = () => final(() => {
      // Send real EOF, but withhold the final callback until Git closes its
      // pipe. This models close-without-finish at the Node stream boundary.
    });
    child.once('close', (code) => this.completion.resolve(code));
  }
}
