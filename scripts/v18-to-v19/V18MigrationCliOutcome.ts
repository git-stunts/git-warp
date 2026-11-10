import type V18MigrationCliExample from './V18MigrationCliExample.ts';

export type V18MigrationCliStream = 'stderr' | 'stdout';

/** One repository state whose real CLI output every guide may quote. */
export default class V18MigrationCliOutcome {
  readonly name: string;
  readonly example: V18MigrationCliExample;
  readonly exitCode: number;
  /** The stream that carries the deterministic part of the outcome. */
  readonly stream: V18MigrationCliStream;

  constructor(
    record: Readonly<{
      example: V18MigrationCliExample;
      exitCode: number;
      name: string;
      stream: V18MigrationCliStream;
    }>
  ) {
    if (!Number.isSafeInteger(record.exitCode) || record.exitCode < 0) {
      throw new Error(`CLI outcome ${record.name} needs a non-negative exit code`);
    }
    this.name = record.name;
    this.example = record.example;
    this.exitCode = record.exitCode;
    this.stream = record.stream;
    Object.freeze(this);
  }
}
