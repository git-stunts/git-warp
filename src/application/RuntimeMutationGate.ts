type Release = () => void;

/** Serializes authoritative mutations owned by one Runtime. */
export default class RuntimeMutationGate {
  #tail: Promise<void> = Promise.resolve();

  /**
   * Runs one authoritative mutation after every previously queued mutation.
   *
   * Operations must not call this method directly or transitively on the same
   * gate: reentrant use waits on the active operation and deadlocks.
   */
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
