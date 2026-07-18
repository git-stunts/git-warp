import type { CacheAcquisition } from '@git-stunts/git-cas';
import WarpError from '../../domain/errors/WarpError.ts';
import type MaterializationCoordinate from '../../domain/materialization/MaterializationCoordinate.ts';
import type MaterializationHandle from '../../domain/materialization/MaterializationHandle.ts';
import type { MaterializationAcquisition } from '../../ports/MaterializationStorePort.ts';

/** One runtime-owned git-cas acquisition with operation-scoped borrows. */
export default class GitCasMaterializationLease {
  readonly coordinate: MaterializationCoordinate;
  readonly #acquisition: CacheAcquisition;
  readonly #materialization: MaterializationHandle;
  #borrowers = 0;
  #retired = false;
  #releasing = false;
  #retirement: PromiseWithResolvers<void> | null = null;

  constructor(options: Readonly<{
    acquisition: CacheAcquisition;
    coordinate: MaterializationCoordinate;
    materialization: MaterializationHandle;
  }>) {
    this.#acquisition = options.acquisition;
    this.coordinate = options.coordinate;
    this.#materialization = options.materialization;
  }

  acquire(): MaterializationAcquisition {
    if (this.#retired) {
      throw leaseError('retired lease cannot be acquired');
    }
    this.#borrowers += 1;
    let released = false;
    return Object.freeze({
      materialization: this.#materialization,
      acquiredAt: this.#acquisition.acquiredAt,
      release: async () => {
        if (released) {
          return;
        }
        released = true;
        this.#borrowers -= 1;
        const completedLease = this.#borrowers === 0;
        this.#releaseIfReady();
        if (completedLease && this.#retirement !== null) {
          await this.#retirement.promise;
        }
      },
    });
  }

  retire(): Promise<void> {
    this.#retired = true;
    this.#retirement ??= Promise.withResolvers<void>();
    this.#releaseIfReady();
    return this.#retirement.promise;
  }

  #releaseIfReady(): void {
    if (!this.#retired || this.#borrowers !== 0 || this.#releasing) {
      return;
    }
    const retirement = this.#retirement;
    if (retirement === null) {
      throw leaseError('retired lease is missing its completion');
    }
    this.#releasing = true;
    void this.#acquisition.release().then(
      () => retirement.resolve(),
      retirement.reject,
    );
  }
}

function leaseError(message: string): WarpError {
  return new WarpError(`Git-cas materialization ${message}`, 'E_MATERIALIZATION_STORAGE');
}
