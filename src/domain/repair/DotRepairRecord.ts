import WarpError from '../errors/WarpError.ts';

/** `separate` re-adds every visible member; `restore` re-adds the members an operator selected. */
export type DotRepairPolicy = 'separate' | 'restore';

/**
 * What one duplicate-dot repair did (#1022): the collision it resolved, the
 * policy and selection the operator chose, the frontier it read, the repair
 * writer, and the commits it appended. Its id is derived from the dot,
 * policy, selection and repair writer, so retrying the same repair finds
 * this record instead of minting another batch.
 */
export default class DotRepairRecord {
  readonly repairId: string;
  readonly dot: string;
  readonly policy: DotRepairPolicy;
  readonly targets: readonly string[];
  readonly repairWriter: string;
  readonly inputFrontier: Readonly<Record<string, string>>;
  readonly commits: readonly string[];

  constructor(options: Readonly<{
    repairId: string;
    dot: string;
    policy: DotRepairPolicy;
    targets: readonly string[];
    repairWriter: string;
    inputFrontier: Readonly<Record<string, string>>;
    commits: readonly string[];
  }>) {
    if (options.repairId.length === 0 || options.dot.length === 0 || options.repairWriter.length === 0) {
      throw new WarpError('A dot repair record needs an id, a dot and a repair writer', 'E_DOT_REPAIR_INVALID', {
        context: { repairId: options.repairId, dot: options.dot },
      });
    }
    this.repairId = options.repairId;
    this.dot = options.dot;
    this.policy = options.policy;
    this.targets = Object.freeze([...options.targets].sort());
    this.repairWriter = options.repairWriter;
    this.inputFrontier = Object.freeze({ ...options.inputFrontier });
    this.commits = Object.freeze([...options.commits]);
    Object.freeze(this);
  }
}
