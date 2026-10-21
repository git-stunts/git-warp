import PatchError from '../errors/PatchError.ts';
import EdgeRemove from '../types/ops/EdgeRemove.ts';
import type NodeRemove from '../types/ops/NodeRemove.ts';
import type DotRepairStorePort from '../../ports/DotRepairStorePort.ts';

/**
 * Refuses a remove that would tombstone a dot several objects still share
 * (#1022). Legacy history can carry one dot on unrelated adds; removing one
 * of them then also hides the others. Until a repair resolves the collision,
 * such a remove is refused with a typed reason instead of silently causing a
 * new collateral deletion.
 */
export default class SharedDotRemovalGuard {
  static readonly NONE = new SharedDotRemovalGuard(new Set());

  readonly #shared: ReadonlySet<string>;

  /** `shared` holds the encoded dots of unresolved collisions. */
  constructor(shared: ReadonlySet<string>) {
    this.#shared = new Set(shared);
    Object.freeze(this);
  }

  /**
   * The guard for patches in `scope` (`lane`, or a strand id): collisions
   * recorded there, minus lane collisions a repair resolved. A strand's view
   * is pinned, so a lane repair does not resolve a strand-scope collision.
   */
  static async load(store: DotRepairStorePort | null | undefined, scope: string): Promise<SharedDotRemovalGuard> {
    if (store === null || store === undefined) { return SharedDotRemovalGuard.NONE; }
    const [collisions, repairs] = await Promise.all([store.collisions(), store.repairs()]);
    const repaired = new Set(repairs.map((repair) => repair.dot));
    return new SharedDotRemovalGuard(new Set(collisions
      .filter((collision) => collision.scope === scope && !(scope === 'lane' && repaired.has(collision.dot)))
      .map((collision) => collision.dot)));
  }

  check(op: NodeRemove | EdgeRemove): void {
    const dot = op.observedDots.find((observed) => this.#shared.has(observed));
    if (dot === undefined) { return; }
    const target = op instanceof EdgeRemove ? `${op.from} -> ${op.to} (${op.label})` : op.node;
    throw new PatchError(
      `Removing ${target} would also hide every other object that shares dot ${dot}; repair the collision first`,
      { code: 'E_PATCH_REMOVE_SHARED_DOT', context: { target, dot } },
    );
  }
}
