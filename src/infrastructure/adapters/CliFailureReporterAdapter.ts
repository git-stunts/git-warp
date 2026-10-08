import type CliFailureHostPort from '../../ports/CliFailureHostPort.ts';
import type CliFailureProjectionAdapter from './CliFailureProjectionAdapter.ts';
import type CliFailureCodecAdapter from './CliFailureCodecAdapter.ts';
import type { CliFailureFormat } from './CliFailureFormat.ts';

/** Owns raw rejection callbacks, cleanup, output and non-success termination. */
export default class CliFailureReporterAdapter {
  private readonly host: CliFailureHostPort;
  private readonly projector: CliFailureProjectionAdapter;
  private readonly codec: CliFailureCodecAdapter;
  private readonly format: CliFailureFormat;

  constructor(options: {
    readonly host: CliFailureHostPort;
    readonly projector: CliFailureProjectionAdapter;
    readonly codec: CliFailureCodecAdapter;
    readonly format: CliFailureFormat;
  }) {
    this.host = options.host;
    this.projector = options.projector;
    this.codec = options.codec;
    this.format = options.format;
  }

  readonly failure = async (primary: unknown): Promise<void> => {
    const [cleanup] = await Promise.allSettled([this.host.close()]);
    this.emit(primary, cleanup.status === 'rejected' ? cleanup.reason : undefined);
  };

  /** Signal shutdown already attempts command and storage closure exactly once. */
  readonly shutdownFailure = (error: unknown): void => { this.emit(error); };

  private emit(primary: unknown, cleanup?: unknown): void {
    const report = this.projector.project(primary, cleanup);
    const text = this.codec.encode(report, this.format);
    if (this.format === 'human') { this.host.writeHuman(text); }
    else { this.host.writeMachine(text); }
    this.host.exit(report.exitCode);
  }
}
