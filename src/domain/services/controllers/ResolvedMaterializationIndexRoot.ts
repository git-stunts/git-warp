import MaterializationRoot from '../../materialization/MaterializationRoot.ts';
import type ArtifactStagingPort from '../../../ports/ArtifactStagingPort.ts';
import WarpError from '../../errors/WarpError.ts';

/** A materialization index root that requires no storage work. */
export default class ResolvedMaterializationIndexRoot {
  readonly #root: MaterializationRoot;

  constructor(root: MaterializationRoot) {
    if (!(root instanceof MaterializationRoot)) {
      throw new WarpError(
        'Resolved materialization index root requires a valid root',
        'E_MATERIALIZATION_STORAGE',
      );
    }
    this.#root = root;
    Object.freeze(this);
  }

  get admissionOperationBound(): number {
    return 0;
  }

  get admissionGroupCount(): number {
    return 0;
  }

  write(_staging: ArtifactStagingPort): Promise<MaterializationRoot> {
    return Promise.resolve(this.#root);
  }
}
