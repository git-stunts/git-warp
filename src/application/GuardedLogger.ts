import type LogFields from '../domain/types/log/LogFields.ts';
import nullLogger from '../domain/utils/nullLogger.ts';
import LoggerPort from '../ports/LoggerPort.ts';

/** A log call's failure goes nowhere: a log sink never decides a write. */
function dropped(): void {}

/**
 * An injected logger, wrapped so it can only hear (#1078). A method that throws, or
 * returns a promise that rejects, is ignored, so a broken or async sink cannot reject,
 * change or crash a write. A child that cannot be made is silent.
 */
export default class GuardedLogger extends LoggerPort {
  readonly #target: LoggerPort;

  constructor(target: LoggerPort) {
    super();
    this.#target = target;
    Object.freeze(this);
  }

  override debug(message: string, context?: LogFields): void {
    this.#heard(() => this.#target.debug(message, context));
  }

  override info(message: string, context?: LogFields): void {
    this.#heard(() => this.#target.info(message, context));
  }

  override warn(message: string, context?: LogFields): void {
    this.#heard(() => this.#target.warn(message, context));
  }

  override error(message: string, context?: LogFields): void {
    this.#heard(() => this.#target.error(message, context));
  }

  override child(context: LogFields): LoggerPort {
    try {
      return new GuardedLogger(this.#target.child(context));
    } catch {
      return nullLogger;
    }
  }

  #heard(call: () => void): void {
    try {
      Promise.resolve(call()).catch(dropped);
    } catch {
      dropped();
    }
  }
}
