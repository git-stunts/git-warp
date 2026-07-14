/** Opaque, runtime-backed handle for one WARP storage composition. */
export default abstract class WarpStorage {
  readonly #identity = 'warp-storage';

  protected constructor() {
    void this.#identity;
    Object.freeze(this);
  }
}
