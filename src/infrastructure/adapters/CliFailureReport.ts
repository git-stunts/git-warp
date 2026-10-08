import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';
import CliFailureCode from './CliFailureCode.ts';
import CliFailureExitCode from './CliFailureExitCode.ts';
import CliFailureNode from './CliFailureNode.ts';

/** The failure identity and bounded display graph for one invocation. */
export default class CliFailureReport {
  readonly primary: CliFailureNode;
  readonly code: string;
  readonly exitCode: number;
  readonly cause: string | undefined;
  readonly truncated: boolean;
  readonly cleanup: readonly CliFailureNode[];

  constructor(options: {
    readonly primary: CliFailureNode;
    readonly code: string;
    readonly exitCode: number;
    readonly cause?: string;
    readonly cleanup?: readonly CliFailureNode[];
    readonly truncated?: boolean;
  }) {
    if (!(options.primary instanceof CliFailureNode)) {
      throw new AdapterValidationError('CLI failure report requires a validated primary node');
    }
    this.primary = options.primary;
    this.code = new CliFailureCode(options.code).value;
    this.exitCode = new CliFailureExitCode(options.exitCode).value;
    this.cause = options.cause;
    this.truncated = options.truncated ?? false;
    this.cleanup = Object.freeze([...(options.cleanup ?? [])]);
    if (!this.cleanup.every((cause) => cause instanceof CliFailureNode)) {
      throw new AdapterValidationError('CLI cleanup failures must be validated display nodes');
    }
    Object.freeze(this);
  }
}
