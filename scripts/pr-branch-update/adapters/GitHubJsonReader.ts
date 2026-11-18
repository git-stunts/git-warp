import PrBranchUpdateError from '../PrBranchUpdateError.ts';

/**
 * Reads untrusted JSON from `gh api` one checked field at a time. Every
 * refusal names the field path, so a changed GitHub response fails loudly
 * instead of reaching the updater as a wrong shape.
 */
export default class GitHubJsonReader {
  readonly #value: unknown;
  readonly #path: string;

  private constructor(value: unknown, path: string) {
    this.#value = value;
    this.#path = path;
    Object.freeze(this);
  }

  static parse(text: string, source: string): GitHubJsonReader {
    try {
      const value: unknown = JSON.parse(text);
      return new GitHubJsonReader(value, 'response');
    } catch {
      throw new PrBranchUpdateError(`${source} returned text that is not JSON`);
    }
  }

  get isNull(): boolean {
    return this.#value === null;
  }

  field(key: string): GitHubJsonReader {
    const value = this.#value;
    if (typeof value !== 'object' || value === null || Array.isArray(value) || !Object.hasOwn(value, key)) {
      throw new PrBranchUpdateError(`${this.#path} lacks field "${key}"`);
    }
    const member: unknown = Reflect.get(value, key);
    return new GitHubJsonReader(member, `${this.#path}.${key}`);
  }

  items(): readonly GitHubJsonReader[] {
    const value = this.#value;
    if (!Array.isArray(value)) {
      throw new PrBranchUpdateError(`${this.#path} is not a list`);
    }
    return value.map((item: unknown, index) => new GitHubJsonReader(item, `${this.#path}[${index}]`));
  }

  text(): string {
    if (typeof this.#value !== 'string') {
      throw new PrBranchUpdateError(`${this.#path} is not a string`);
    }
    return this.#value;
  }

  flag(): boolean {
    if (typeof this.#value !== 'boolean') {
      throw new PrBranchUpdateError(`${this.#path} is not a boolean`);
    }
    return this.#value;
  }

  count(): number {
    if (typeof this.#value !== 'number' || !Number.isSafeInteger(this.#value)) {
      throw new PrBranchUpdateError(`${this.#path} is not an integer`);
    }
    return this.#value;
  }
}
