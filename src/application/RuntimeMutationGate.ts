type Release = () => void;

/** Serializes authoritative mutations owned by one Runtime. */
export default class RuntimeMutationGate {
  #tail: Promise<void> = Promise.resolve();

  async run<T>(operation: () => Promise<T>): Promise<T> {
    let release: Release | undefined;
    const turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.#tail;
    this.#tail = turn;
    await previous;
    try {
      return await operation();
    } finally {
      release?.();
    }
  }
}
