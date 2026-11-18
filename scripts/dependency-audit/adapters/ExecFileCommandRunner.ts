// SPDX-License-Identifier: Apache-2.0

import { execFile, type ExecFileException } from 'node:child_process';

import { AuditRefusal } from '../AuditRefusal.ts';
import type { CommandResult, CommandRunner } from './CommandRunner.ts';

/** npm audit output for this repository is about 12 KiB; this bound only stops a runaway child. */
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
/** A bound on one npm command, so a stalled registry request cannot hold the CI job. */
const COMMAND_TIMEOUT_MILLISECONDS = 300_000;

type CommandOutput = {
  readonly stdout: string;
  readonly stderr: string;
};

/** Runs commands with `child_process.execFile` in one working directory. */
export class ExecFileCommandRunner implements CommandRunner {
  private readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
    Object.freeze(this);
  }

  run(command: string, args: readonly string[]): Promise<CommandResult | AuditRefusal> {
    return new Promise((resolve) => {
      execFile(
        command,
        [...args],
        { cwd: this.cwd, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES, timeout: COMMAND_TIMEOUT_MILLISECONDS },
        (error, stdout, stderr) => {
          resolve(resultOf(error, { stdout, stderr }, command));
        },
      );
    });
  }
}

/** A nonzero exit is a result; a command that did not start or was killed is a refusal. */
function resultOf(error: ExecFileException | null, output: CommandOutput, command: string): CommandResult | AuditRefusal {
  if (error === null) {
    return { exitCode: 0, ...output };
  }
  if (typeof error.code === 'number') {
    return { exitCode: error.code, ...output };
  }
  return new AuditRefusal(`${command} did not exit normally: ${error.message}`);
}
