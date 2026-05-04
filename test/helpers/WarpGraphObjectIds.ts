class FixedWidthHexCounter {
  #counter = 0;
  readonly #width: number;

  constructor(width: number) {
    this.#width = width;
  }

  readonly next = (): string => {
    this.#counter += 1;
    return this.#counter.toString(16).padStart(this.#width, '0');
  };

  readonly reset = (): void => {
    this.#counter = 0;
  };
}

export function createOidGenerator(): FixedWidthHexCounter {
  return new FixedWidthHexCounter(40);
}

export function createHashGenerator(): FixedWidthHexCounter {
  return new FixedWidthHexCounter(64);
}

export function generateOidFromNumber(n: number): string {
  const hex = n.toString(16).padStart(40, '0');
  return hex.slice(-40);
}
