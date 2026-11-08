import ObserverIdentityError from '../errors/ObserverIdentityError.ts';

/** Who a read answers to. A name, not a credential: the access boundary authenticates. */
export default class ObserverIdentity {
  readonly namespace: string;
  readonly subject: string;

  private constructor(namespace: string, subject: string) {
    if (!isName(namespace) || !isName(subject)) {
      throw new ObserverIdentityError('An observer identity needs a namespace and a subject');
    }
    this.namespace = namespace;
    this.subject = subject;
    Object.freeze(this);
  }

  static of(namespace: string, subject: string): ObserverIdentity {
    return new ObserverIdentity(namespace, subject);
  }

  toString(): string {
    return `${this.namespace}:${this.subject}`;
  }
}

function isName(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value.isWellFormed() && !value.includes(':');
}
