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
 */
export default class Transform<T, U> {
  protected _fn: ((item: T) => U | Promise<U>) | undefined;

  /**
   * Creates a new Transform.
   *
   * @param fn - Per-element mapping function.
   *   Optional — subclasses that override apply() don't need it.
   */
  constructor(fn?: (item: T) => U | Promise<U>) {
    if (fn !== undefined && typeof fn !== 'function') {
      throw new WarpError('Transform requires a function or subclass override', 'E_INVALID_TRANSFORM');
    }
    this._fn = fn;
  }

  /**
   * Applies this transform to a source async iterable.
   *
   * The default implementation maps each element through the constructor
   * function. Subclasses override this for complex transforms (batching,
   * splitting, stateful accumulation).
   */
  async *apply(source: AsyncIterable<T>): AsyncIterable<U> {
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
