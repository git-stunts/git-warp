import WarpError from '../domain/errors/WarpError.ts';

/**
 * The option keys one Runtime operation accepts.
 *
 * JavaScript callers bypass TypeScript's excess-property checks, so an
 * operation that silently ignored an unrecognized key (such as `at`) would act
 * on a different request than the caller wrote. Admission refuses every key it
 * does not interpret, own or inherited, string or symbol, and requires each
 * supported key to be an own data property so it reads the same value every
 * time.
 */
export default class RuntimeOptionAdmission {
  readonly operation: string;
  readonly code: string;
  readonly supported: readonly string[];

  constructor({ operation, code, supported }: {
    readonly operation: string;
    readonly code: string;
    readonly supported: readonly string[];
  }) {
    this.operation = operation;
    this.code = code;
    this.supported = Object.freeze([...supported]);
    Object.freeze(this);
  }

  /** Throws a typed error naming the first key this operation does not interpret. */
  admit(options: object): void {
    for (const key of Reflect.ownKeys(options)) {
      this.#admitOwnKey(options, key);
    }
    for (let prototype = Reflect.getPrototypeOf(options);
      prototype !== null && prototype !== Object.prototype;
      prototype = Reflect.getPrototypeOf(prototype)) {
      const [inherited] = Reflect.ownKeys(prototype);
      if (inherited !== undefined) {
        this.#reject(inherited, `does not accept inherited option '${String(inherited)}'`);
      }
    }
  }

  #admitOwnKey(options: object, key: string | symbol): void {
    if (typeof key !== 'string' || !this.supported.includes(key)) {
      this.#reject(key, `does not accept option '${String(key)}'`);
    }
    const descriptor = Reflect.getOwnPropertyDescriptor(options, key);
    if (descriptor !== undefined && !('value' in descriptor)) {
      this.#reject(key, `option '${key}' must be an own data property`);
    }
  }

  #reject(key: string | symbol, reason: string): never {
    throw new WarpError(
      `${this.operation} ${reason}; supported options: ${this.supported.join(', ')}`,
      this.code,
      { context: { rejected: String(key), supported: [...this.supported] } },
    );
  }
}
