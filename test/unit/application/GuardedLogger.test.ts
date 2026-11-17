import { describe, expect, it } from 'vitest';
import GuardedLogger from '../../../src/application/GuardedLogger.ts';
import type LogFields from '../../../src/domain/types/log/LogFields.ts';
import nullLogger from '../../../src/domain/utils/nullLogger.ts';
import LoggerPort from '../../../src/ports/LoggerPort.ts';

type Heard = { readonly level: string; readonly message: string; readonly context: LogFields | undefined };

/** Records each call; `child` answers with whatever the test gives it. */
class Recording extends LoggerPort {
  readonly heard: Heard[] = [];
  childOf: (context: LogFields) => LoggerPort = () => this;

  override debug(message: string, context?: LogFields): void { this.heard.push({ level: 'debug', message, context }); }
  override info(message: string, context?: LogFields): void { this.heard.push({ level: 'info', message, context }); }
  override warn(message: string, context?: LogFields): void { this.heard.push({ level: 'warn', message, context }); }
  override error(message: string, context?: LogFields): void { this.heard.push({ level: 'error', message, context }); }
  override child(context: LogFields): LoggerPort { return this.childOf(context); }
}

describe('GuardedLogger (#1078)', () => {
  it('passes every level and its context through', () => {
    const target = new Recording();
    const logger = new GuardedLogger(target);

    logger.debug('d', { a: 1 });
    logger.info('i');
    logger.warn('w', { b: 'x' });
    logger.error('e');

    expect(target.heard).toEqual([
      { level: 'debug', message: 'd', context: { a: 1 } },
      { level: 'info', message: 'i', context: undefined },
      { level: 'warn', message: 'w', context: { b: 'x' } },
      { level: 'error', message: 'e', context: undefined },
    ]);
  });

  it('guards the child the target makes', () => {
    const target = new Recording();
    const grandchild = new Recording();
    target.childOf = () => grandchild;

    const child = new GuardedLogger(target).child({ scope: 'x' });
    child.warn('heard');

    expect(child).toBeInstanceOf(GuardedLogger);
    expect(grandchild.heard).toEqual([{ level: 'warn', message: 'heard', context: undefined }]);
  });

  it('is silent when the target cannot make a child', () => {
    const target = new Recording();
    target.childOf = () => { throw new Error('no child'); };

    expect(new GuardedLogger(target).child({})).toBe(nullLogger);
  });
});
