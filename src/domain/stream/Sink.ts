import WarpError from '../errors/WarpError.ts';

/**
 * Base class for stream sinks.
 *
 * A Sink is a terminal consumer of an async iterable. It accepts
 * elements via `_accept()`, then produces a final accumulated result
 * via `_finalize()`. Sinks do not yield values — they end the pipeline.
 *
 * Examples: TreeAssemblerSink accumulates [path, oid] entries and
 * publishes its aggregate in finalize(). ArraySink collects all items.
 */
export default class Sink<T, R> {
  /**
   * Consumes an entire async iterable and returns the accumulated result.
   *
   * Subclasses implement `_accept(item)` for per-element processing and
   * `_finalize()` for the terminal result. The default `consume()` loop
   * handles iteration, error propagation, and finalization.
   */
  async consume(source: AsyncIterable<T>): Promise<R> {
    if (source === null || source === undefined) {
      throw new WarpError('Sink.consume() requires a source', 'E_INVALID_SOURCE');
    }
    for await (const item of source) {
      await this._accept(item);
    }
    return await this._finalize();
  }

  /**
   * Accepts a single element from the stream.
   *
   * Override this in subclasses to process each element.
   */
  protected _accept(_item: T): void | Promise<void> {
    throw new WarpError('Sink._accept() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Produces the final accumulated result after all elements are consumed.
   *
   * Override this in subclasses to return the terminal value.
   */
  protected _finalize(): R | Promise<R> {
    throw new WarpError('Sink._finalize() not implemented', 'E_NOT_IMPLEMENTED');
  }
}
