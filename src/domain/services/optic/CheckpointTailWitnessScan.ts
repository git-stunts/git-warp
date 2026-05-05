import QueryError from '../../errors/QueryError.ts';
import type CheckpointTailOpticSource from './CheckpointTailOpticSource.ts';
import type { CheckpointTailPatchEntry } from './CheckpointTailOpticSource.ts';
import type { ReadIdentityTailWitness } from './ReadIdentity.ts';

export type CheckpointTailScanBasis = {
  readonly schema: number;
  readonly frontier: Map<string, string>;
};

export type TailWitnessScan = {
  readonly witnesses: readonly ReadIdentityTailWitness[];
  readonly entries: readonly CheckpointTailPatchEntry[];
};

type TailWitnessScanDraft = {
  readonly entries: CheckpointTailPatchEntry[];
  readonly witnesses: ReadIdentityTailWitness[];
  scanned: number;
};

export default class CheckpointTailWitnessScan {
  private readonly _source: CheckpointTailOpticSource;
  private readonly _maxTailPatches: number;

  constructor(options: {
    readonly source: CheckpointTailOpticSource;
    readonly maxTailPatches: number;
  }) {
    this._source = options.source;
    this._maxTailPatches = options.maxTailPatches;
    Object.freeze(this);
  }

  async collect(options: {
    readonly basis: CheckpointTailScanBasis;
    readonly includeEntry: (entry: CheckpointTailPatchEntry) => boolean;
  }): Promise<TailWitnessScan> {
    const scan = createTailWitnessScanDraft();
    for (const writerId of await this._sortedWriterIds()) {
      await this._scanWriterTail({
        basis: options.basis,
        includeEntry: options.includeEntry,
        scan,
        writerId,
      });
    }
    return {
      entries: Object.freeze(scan.entries),
      witnesses: Object.freeze(scan.witnesses),
    };
  }

  private async _sortedWriterIds(): Promise<readonly string[]> {
    return Object.freeze([...(await this._source.discoverWriters())].sort());
  }

  private async _scanWriterTail(options: {
    readonly basis: CheckpointTailScanBasis;
    readonly includeEntry: (entry: CheckpointTailPatchEntry) => boolean;
    readonly scan: TailWitnessScanDraft;
    readonly writerId: string;
  }): Promise<void> {
    const writerTail = await this._loadWriterTail(options.basis, options.writerId);
    this._accountTailBudget(options.scan, writerTail.length);
    await this._validateWriterTail(options.writerId, writerTail, options.basis);
    collectIncludedTailEntries({
      entries: writerTail,
      includeEntry: options.includeEntry,
      scan: options.scan,
    });
  }

  private async _loadWriterTail(
    basis: CheckpointTailScanBasis,
    writerId: string,
  ): Promise<CheckpointTailPatchEntry[]> {
    const stopAtSha = basis.frontier.get(writerId) ?? null;
    return await this._source._loadWriterPatches(writerId, stopAtSha);
  }

  private _accountTailBudget(scan: TailWitnessScanDraft, patchCount: number): void {
    scan.scanned += patchCount;
    if (scan.scanned > this._maxTailPatches) {
      throwTailBudgetExceeded(this._source.graphName, {
        budgetLimit: this._maxTailPatches,
        budgetObserved: scan.scanned,
      });
    }
  }

  private async _validateWriterTail(
    writerId: string,
    writerTail: readonly CheckpointTailPatchEntry[],
    basis: CheckpointTailScanBasis,
  ): Promise<void> {
    if (writerTail.length === 0) {
      return;
    }
    const lastEntry = writerTail[writerTail.length - 1];
    if (lastEntry === undefined) {
      return;
    }
    await this._source._validatePatchAgainstCheckpoint(
      writerId,
      lastEntry.sha,
      { schema: basis.schema, frontier: basis.frontier },
    );
  }
}

function createTailWitnessScanDraft(): TailWitnessScanDraft {
  return {
    entries: [],
    witnesses: [],
    scanned: 0,
  };
}

function collectIncludedTailEntries(options: {
  readonly entries: readonly CheckpointTailPatchEntry[];
  readonly includeEntry: (entry: CheckpointTailPatchEntry) => boolean;
  readonly scan: TailWitnessScanDraft;
}): void {
  for (const entry of options.entries) {
    if (options.includeEntry(entry)) {
      options.scan.entries.push(entry);
      options.scan.witnesses.push({
        sha: entry.sha,
        writerId: entry.patch.writer,
        lamport: entry.patch.lamport,
      });
    }
  }
}

function throwTailBudgetExceeded(
  graphName: string,
  budget: {
    readonly budgetLimit: number;
    readonly budgetObserved: number;
  },
): never {
  throw new QueryError('Checkpoint-tail optic read exceeded its tail scan budget.', {
    code: 'E_OPTIC_TAIL_BUDGET_EXCEEDED',
    context: {
      graphName,
      maxTailPatches: budget.budgetLimit,
      budgetKind: 'maxTailPatches',
      budgetLimit: budget.budgetLimit,
      budgetObserved: budget.budgetObserved,
      budgetUnit: 'patch',
    },
  });
}
