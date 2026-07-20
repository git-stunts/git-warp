import WarpError from '../domain/errors/WarpError.ts';

type RuntimeState = 'open' | 'closing' | 'closed';
type ReleaseLocalResources = () => Promise<void>;

export default class RuntimeActivity {
  readonly #active = new Set<Promise<unknown>>();
  #closePromise: Promise<void> | null = null;
  #state: RuntimeState = 'open';

  run<T>(operation: () => Promise<T>): Promise<T> {
    this.#assertOpen();
    const active = Promise.resolve().then(operation);
    this.#active.add(active);
    void active.then(
      () => this.#active.delete(active),
      () => this.#active.delete(active),
    );
    return active;
  }

  close(release: ReleaseLocalResources): Promise<void> {
    if (this.#closePromise !== null) {
      return this.#closePromise;
    }
    this.#state = 'closing';
    this.#closePromise = this.#finishClose(release);
    return this.#closePromise;
  }

  async #finishClose(release: ReleaseLocalResources): Promise<void> {
    try {
      await Promise.allSettled([...this.#active]);
      await release();
    } finally {
      this.#state = 'closed';
    }
  }

  #assertOpen(): void {
    if (this.#state !== 'open') {
      throw new WarpError(
        'Runtime is closing or closed',
        'E_RUNTIME_CLOSED',
      );
    }
  }
}
