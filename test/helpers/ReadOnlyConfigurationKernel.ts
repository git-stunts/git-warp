import type InMemoryGraphAdapter from './InMemoryGraphAdapter.ts';
import HistoryOnlyKernel from './HistoryOnlyKernel.ts';

/** A read-only configuration extension on the same history authority. */
export default class ReadOnlyConfigurationKernel extends HistoryOnlyKernel {
  readonly #configuration: InMemoryGraphAdapter;
  constructor(history: InMemoryGraphAdapter) { super(history); this.#configuration = history; }
  configGet(key: string): Promise<string | null> { return this.#configuration.configGet(key); }
}
