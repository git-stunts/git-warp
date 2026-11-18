// SPDX-License-Identifier: Apache-2.0

import type { AuditRefusal } from '../AuditRefusal.ts';

/** What a finished command wrote and how it exited. */
export type CommandResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

/** Port: runs one command without a shell. */
export interface CommandRunner {
  /** The result, or a refusal when the command did not start or did not exit normally. */
  run(command: string, args: readonly string[]): Promise<CommandResult | AuditRefusal>;
}
