import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';

/** Validated machine code used only in bounded CLI diagnostic displays. */
export default class CliFailureCode {
  readonly value: string;

  constructor(value: string) {
    if (!CliFailureCode.accepts(value)) {
      throw new AdapterValidationError('Invalid CLI failure display code');
    }
    this.value = value;
    Object.freeze(this);
  }
  static accepts(value: string): boolean {
    return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/u.test(value);
  }

}
