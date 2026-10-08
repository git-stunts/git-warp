import { describe, expect, it } from 'vitest';
import { CliError } from '../../../../bin/cli/infrastructure.ts';
import CliFailureReporterAdapter from '../../../../src/infrastructure/adapters/CliFailureReporterAdapter.ts';
import CliFailureProjectionAdapter from '../../../../src/infrastructure/adapters/CliFailureProjectionAdapter.ts';
import CliFailureRedactorAdapter from '../../../../src/infrastructure/adapters/CliFailureRedactorAdapter.ts';
import CliFailureCodecAdapter from '../../../../src/infrastructure/adapters/CliFailureCodecAdapter.ts';

for (const mode of ['human', 'json', 'jsonl']) {
  if (mode !== 'human' && mode !== 'json' && mode !== 'jsonl') { continue; }
  describe(`CLI failure reporter ${mode}`, () => {
    it('finishes a failed command after successful storage cleanup', async () => {
      const output: string[] = [];
      const statuses: number[] = [];
      const reporter = new CliFailureReporterAdapter({
        host: {
          async close() {},
          writeHuman(text) { output.push(text); },
          writeMachine(text) { output.push(text); },
          exit(code) { statuses.push(code); },
        },
        projector: new CliFailureProjectionAdapter({
          classifier: { isCliError: (error) => error instanceof CliError },
          redactor: new CliFailureRedactorAdapter({ home: '', directory: '' }),
        }),
        codec: new CliFailureCodecAdapter(), format: mode,
      });
      await reporter.failure(new Error('Primary'));
      expect(statuses).toEqual([3]);
      expect(output.join('')).toContain('Primary');
    });

    it('retains primary failure when storage cleanup rejects', async () => {
      const output: string[] = [];
      const statuses: number[] = [];
      let closed = 0;
      const reporter = new CliFailureReporterAdapter({
        host: {
          async close() { closed++; throw new Error('Storage close failed'); },
          writeHuman(text) { output.push(`human:${text}`); },
          writeMachine(text) { output.push(`machine:${text}`); },
          exit(code) { statuses.push(code); },
        },
        projector: new CliFailureProjectionAdapter({
          classifier: { isCliError: (error) => error instanceof CliError },
          redactor: new CliFailureRedactorAdapter({ home: '', directory: '' }),
        }),
        codec: new CliFailureCodecAdapter(), format: mode,
      });
      await reporter.failure(new CliError('Primary', { code: 'E_USAGE', exitCode: 1 }));
      expect(closed).toBe(1);
      expect(statuses).toEqual([1]);
      expect(output.join('')).toContain('Primary');
      expect(output.join('')).toContain('Storage close failed');
      expect(output[0]?.startsWith(mode === 'human' ? 'human:' : 'machine:')).toBe(true);
      reporter.shutdownFailure(new Error('Command close failed'));
      expect(closed).toBe(1);
      expect(statuses).toEqual([1, 3]);
      expect(output.join('')).toContain('Command close failed');
    });
  });
}
