import PurposeError from '../errors/PurposeError.ts';

/** Why a question is asked, as a versioned identifier. Policy refuses a purpose it does not know. */
export default class Purpose {
  readonly namespace: string;
  readonly name: string;
  readonly version: number;

  private constructor(namespace: string, name: string, version: number) {
    if (!isPurposeName(namespace) || !isPurposeName(name) || !Number.isSafeInteger(version) || version < 1) {
      throw new PurposeError('A purpose needs a namespace, a name and a positive version');
    }
    this.namespace = namespace;
    this.name = name;
    this.version = version;
    Object.freeze(this);
  }

  static of(namespace: string, name: string, version: number): Purpose {
    return new Purpose(namespace, name, version);
  }

  toString(): string {
    return `${this.namespace}:${this.name}/v${String(this.version)}`;
  }
}

function isPurposeName(part: string): boolean {
  return typeof part === 'string' && part.length > 0 && part.isWellFormed() && !part.includes(':') && !part.includes('/');
}
