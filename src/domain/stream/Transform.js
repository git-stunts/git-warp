import WarpError from '../errors/WarpError.ts';

/**
 * Base class for stream transforms.
 *
 * A Transform maps each element of an async iterable source to a new
 * value. Simple transforms pass a function to the constructor. Complex
 * transforms (batching, splitting, stateful) override `apply()`.
 *
 * Transforms are the composition unit for WarpStream pipelines. The
 * codec, the compressor, the encryptor — all Transforms.
 *
 * @template T
 * @template U
 */
export default class Transform {
  /**
   * Creates a new Transform.
   *
   * @param {(item: T) => U | Promise<U>} [fn] - Per-element mapping function.
   *   Optional — subclasses that override apply() don't need it.
   */
  constructor(fn) {
    if (fn !== undefined && typeof fn !== 'function') {
      throw new WarpError('Transform requires a function or subclass override', 'E_INVALID_TRANSFORM');
    }
    /** @type {((item: T) => U | Promise<U>) | undefined} */
    this._fn = fn;
  }

  /**
   * Applies this transform to a source async iterable.
   *
   * The default implementation maps each element through the constructor
   * function. Subclasses override this for complex transforms (batching,
   * splitting, stateful accumulation).
   *
   * @param {AsyncIterable<T>} source - The upstream async iterable
   * @returns {AsyncIterable<U>} A new async iterable of transformed values
   */
  async *apply(source) {
    if (this._fn === undefined) {
      throw new WarpError(
        'Transform.apply() must be overridden or a function must be provided to the constructor',
        'E_NOT_IMPLEMENTED',
      );
    }
    const fn = this._fn;
    for await (const item of source) {
      yield await fn(item);
    }
  }
}
