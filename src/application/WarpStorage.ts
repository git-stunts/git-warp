type CloseStorage = () => Promise<void>;

const CLOSE_NOOP: CloseStorage = () => Promise.resolve();

/** Opaque, runtime-backed handle for one WARP storage composition. */
export default abstract class WarpStorage {
  readonly #identity = 'warp-storage';
  readonly #closeStorage: CloseStorage;
  #closePromise: Promise<void> | null = null;

  protected constructor(closeStorage: CloseStorage = CLOSE_NOOP) {
    void this.#identity;
    this.#closeStorage = closeStorage;
    Object.freeze(this);
  }

  /** Releases local storage resources without changing admitted history. */
  close(): Promise<void> {
    this.#closePromise ??= Promise.resolve().then(this.#closeStorage);
    return this.#closePromise;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}
