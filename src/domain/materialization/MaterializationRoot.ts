import WarpError from '../errors/WarpError.ts';
import BundleHandle from '../storage/BundleHandle.ts';

export type MaterializationRootStatus = 'retained' | 'empty' | 'unavailable';

/** Availability and optional retained handle for one materialization root. */
export default class MaterializationRoot {
  readonly status: MaterializationRootStatus;
  readonly handle: BundleHandle | null;

  private constructor(status: MaterializationRootStatus, handle: BundleHandle | null) {
    this.status = status;
    this.handle = handle;
    Object.freeze(this);
  }

  static retained(handle: BundleHandle): MaterializationRoot {
    if (!(handle instanceof BundleHandle)) {
      throw rootError('retained root must carry a BundleHandle');
    }
    return new MaterializationRoot('retained', handle);
  }

  static empty(): MaterializationRoot {
    return new MaterializationRoot('empty', null);
  }

  static unavailable(): MaterializationRoot {
    return new MaterializationRoot('unavailable', null);
  }

  equals(other: MaterializationRoot): boolean {
    if (!(other instanceof MaterializationRoot) || other.status !== this.status) {
      return false;
    }
    return this.handle === null
      ? other.handle === null
      : other.handle !== null && this.handle.equals(other.handle);
  }
}

function rootError(message: string): WarpError {
  return new WarpError(`Materialization root ${message}`, 'E_MATERIALIZATION_ROOT');
}
