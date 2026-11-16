import WarpError from '../errors/WarpError.ts';
import Observation, { type ObservationExecution } from './Observation.ts';
import Observer from './Observer.ts';
import type { ReadingValue } from './ObservedReading.ts';

type StartObserver = <TValue extends ReadingValue>(
  observer: Observer<TValue>,
) => ObservationExecution<TValue> | Promise<ObservationExecution<TValue>>;

type LaneOptions = {
  readonly startObserver: StartObserver;
};

/**
 * One worldline read through a Runtime: the legacy read path, kept until #1052
 * replaces it with the Optic read. It has no writes.
 */
export default class Lane {
  readonly #startObserver: StartObserver;

  constructor(options: LaneOptions | null | undefined) {
    if (options === null || options === undefined) {
      throw new WarpError('Lane options are required', 'E_LANE_OPTIONS');
    }
    if (typeof options.startObserver !== 'function') {
      throw new WarpError('Lane requires an observer executor', 'E_LANE_OBSERVER');
    }
    this.#startObserver = options.startObserver;
    Object.freeze(this);
  }

  observe<TValue extends ReadingValue>(observer: Observer<TValue>): Observation<TValue> {
    if (!(observer instanceof Observer)) {
      throw new WarpError('Lane.observe requires an Observer', 'E_LANE_OBSERVE_OBSERVER');
    }
    return new Observation({
      observer,
      start: async () => await this.#startObserver(observer),
    });
  }
}
