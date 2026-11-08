import PurposeError from '../errors/PurposeError.ts';

/** Why a question is asked, as a versioned identifier. Policy refuses a purpose it does not know. */
export default class Purpose {
  readonly namespace: string;
  readonly name: string;
  readonly version: number;

  private constructor(namespace: string, name: string, version: number) {
    this.namespace = namespace;
    this.name = name;
    this.version = version;
    Object.freeze(this);
  }

  static of(namespace: string, name: string, version: number): Purpose {
    const named = [namespace, name].every((part) => typeof part === 'string' && part.length > 0 && part.isWellFormed());
    if (!named || !Number.isSafeInteger(version) || version < 1) {
      throw new PurposeError('A purpose needs a namespace, a name and a positive version');
    }
    return new Purpose(namespace, name, version);
  }

  toString(): string {
    return `${this.namespace}:${this.name}/v${String(this.version)}`;
  }
}
