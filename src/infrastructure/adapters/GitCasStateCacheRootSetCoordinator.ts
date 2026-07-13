import type {
  RootSetDoctorResult,
  RootSetEntry,
  RootSetMutationResult,
  RootSetState,
} from '@git-stunts/git-cas';
import WarpStateCacheRetentionReport from '../../domain/services/state/WarpStateCacheRetentionReport.ts';
import WarpStateCacheRepairResult from '../../domain/services/state/WarpStateCacheRepairResult.ts';
import { validateGraphName } from '../../domain/utils/RefLayout.ts';
import type { WarpStateSnapshotRecord } from '../../ports/WarpStateCachePort.ts';

const ROOT_SET_PREFIX = 'refs/cas/rootsets/git-warp';

interface RootSetClient {
  read(): Promise<RootSetState>;
  mutate(
    mutator: (
      entries: ReadonlyArray<Readonly<RootSetEntry>>,
    ) => Iterable<RootSetEntry> | Promise<Iterable<RootSetEntry>>,
  ): Promise<RootSetMutationResult>;
  replace(options: {
    entries: Iterable<RootSetEntry>;
    expectedHeadOid?: string | null;
  }): Promise<RootSetMutationResult>;
  doctor(): Promise<RootSetDoctorResult>;
  repair(options: { entries: Iterable<RootSetEntry> }): Promise<{
    repaired: true;
    commitOid: string;
    treeOid: string;
    entries: RootSetEntry[];
  }>;
}

interface GitObjectProbe {
  nodeExists(oid: string): Promise<boolean>;
  readObjectType(oid: string): Promise<string>;
}

type TargetProbe = {
  readonly anchorable: WarpStateSnapshotRecord[];
  readonly missingSnapshotIds: string[];
  readonly wrongTypeSnapshotIds: string[];
};

type RootComparison = {
  readonly anchoredSnapshotIds: string[];
  readonly unanchoredSnapshotIds: string[];
  readonly mismatchedRootNames: string[];
};

type GitCasStateCacheRootSetCoordinatorOptions = {
  readonly graphName: string;
  readonly openRootSet: (ref: string) => Promise<RootSetClient>;
  readonly objectProbe: GitObjectProbe;
};

function compareEntryNames(left: RootSetEntry, right: RootSetEntry): number {
  if (left.name < right.name) { return -1; }
  if (left.name > right.name) { return 1; }
  return 0;
}

function entryForRecord(record: WarpStateSnapshotRecord): RootSetEntry {
  return {
    name: record.snapshotId,
    oid: record.payloadRef,
    type: 'tree',
    retention: record.retention,
  };
}

function entriesEqual(left: RootSetEntry, right: RootSetEntry): boolean {
  return left.name === right.name
    && left.oid === right.oid
    && left.type === right.type
    && left.retention === right.retention;
}

function entryListsEqual(
  left: ReadonlyArray<Readonly<RootSetEntry>>,
  right: ReadonlyArray<Readonly<RootSetEntry>>,
): boolean {
  return left.length === right.length
    && left.every((entry, index) => entriesEqual(entry, right[index]!));
}

function mergedEntries(
  current: ReadonlyArray<Readonly<RootSetEntry>>,
  desired: readonly RootSetEntry[],
): RootSetEntry[] {
  const byName = new Map<string, RootSetEntry>();
  for (const entry of current) {
    byName.set(entry.name, {
      name: entry.name,
      oid: entry.oid,
      type: entry.type,
      retention: entry.retention,
    });
  }
  for (const entry of desired) {
    byName.set(entry.name, entry);
  }
  return [...byName.values()].sort(compareEntryNames);
}

function rootSetError(doctor: RootSetDoctorResult): string | null {
  if (doctor.healthy) { return null; }
  return doctor.error?.message ?? 'Root-set doctor reported integrity issues';
}

function compareRootEntries(
  records: readonly WarpStateSnapshotRecord[],
  roots: readonly RootSetEntry[],
): RootComparison {
  const rootsByName = new Map(roots.map((entry) => [entry.name, entry]));
  const anchoredSnapshotIds: string[] = [];
  const unanchoredSnapshotIds: string[] = [];
  const mismatchedRootNames: string[] = [];
  for (const record of records) {
    const root = rootsByName.get(record.snapshotId);
    if (root === undefined) {
      unanchoredSnapshotIds.push(record.snapshotId);
    } else if (entriesEqual(root, entryForRecord(record))) {
      anchoredSnapshotIds.push(record.snapshotId);
    } else {
      unanchoredSnapshotIds.push(record.snapshotId);
      mismatchedRootNames.push(record.snapshotId);
    }
  }
  return { anchoredSnapshotIds, unanchoredSnapshotIds, mismatchedRootNames };
}

function findStaleRootNames(
  records: readonly WarpStateSnapshotRecord[],
  roots: readonly RootSetEntry[],
): string[] {
  const liveNames = new Set(records.map((record) => record.snapshotId));
  return roots.filter((entry) => !liveNames.has(entry.name)).map((entry) => entry.name);
}

export default class GitCasStateCacheRootSetCoordinator {
  readonly rootSetRef: string;
  private readonly _getRootSet: () => Promise<RootSetClient>;
  private readonly _objectProbe: GitObjectProbe;
  private readonly _anchoredTreeOids = new Set<string>();

  constructor(options: GitCasStateCacheRootSetCoordinatorOptions) {
    validateGraphName(options.graphName);
    this.rootSetRef = `${ROOT_SET_PREFIX}/${options.graphName}/state-cache`;
    this._objectProbe = options.objectProbe;
    let rootSetPromise: Promise<RootSetClient> | undefined;
    this._getRootSet = async () => {
      if (rootSetPromise === undefined) {
        const opening = options.openRootSet(this.rootSetRef);
        rootSetPromise = opening;
        try {
          return await opening;
        } catch (error) {
          if (rootSetPromise === opening) {
            rootSetPromise = undefined;
          }
          throw error;
        }
      }
      return await rootSetPromise;
    };
    Object.freeze(this);
  }

  async adopt(records: readonly WarpStateSnapshotRecord[]): Promise<void> {
    if (records.length === 0) { return; }
    const rootSet = await this._getRootSet();
    const state = await rootSet.read();
    const currentByName = new Map(state.entries.map((entry) => [entry.name, entry]));
    const candidates = records.filter((record) => {
      const current = currentByName.get(record.snapshotId);
      return current === undefined || !entriesEqual(current, entryForRecord(record));
    });
    const probe = await this._probeTargets(candidates);
    if (probe.anchorable.length === 0) { return; }
    const desired = probe.anchorable.map(entryForRecord);
    await rootSet.mutate((current) => mergedEntries(current, desired));
    this._rememberAnchored(probe.anchorable);
  }

  async publishTransition(
    records: readonly WarpStateSnapshotRecord[],
    publishIndex: () => Promise<void>,
    knownTreeOids: readonly string[] = [],
  ): Promise<void> {
    const rootSet = await this._getRootSet();
    this._rememberTreeOids(knownTreeOids);
    const probe = await this._probeTransitionTargets(records);
    const desired = probe.anchorable.map(entryForRecord).sort(compareEntryNames);
    const prepared = await rootSet.mutate((current) => mergedEntries(current, desired));
    this._rememberAnchored(probe.anchorable);

    await publishIndex();
    await this._cleanupPreparedSuperset(rootSet, prepared, desired);
  }

  private async _cleanupPreparedSuperset(
    rootSet: RootSetClient,
    prepared: RootSetMutationResult,
    desired: readonly RootSetEntry[],
  ): Promise<void> {
    if (entryListsEqual(prepared.entries, desired)) { return; }
    // The index is already committed. Any cleanup failure safely retains a
    // superset that doctor/repair can reconcile without risking live payloads.
    try {
      await rootSet.replace({ entries: desired, expectedHeadOid: prepared.commitOid });
    } catch {
      // The prepared superset remains authoritative and safe.
    }
  }

  async inspect(records: readonly WarpStateSnapshotRecord[]): Promise<WarpStateCacheRetentionReport> {
    const rootSet = await this._getRootSet();
    const doctor = await rootSet.doctor();
    const roots = doctor.entries ?? [];
    const probe = await this._probeTargets(records);
    const comparison = compareRootEntries(probe.anchorable, roots);

    return new WarpStateCacheRetentionReport({
      liveSnapshotIds: records.map((record) => record.snapshotId),
      anchoredSnapshotIds: comparison.anchoredSnapshotIds,
      unanchoredSnapshotIds: comparison.unanchoredSnapshotIds,
      missingSnapshotIds: probe.missingSnapshotIds,
      wrongTypeSnapshotIds: probe.wrongTypeSnapshotIds,
      staleRootNames: findStaleRootNames(records, roots),
      mismatchedRootNames: comparison.mismatchedRootNames,
      rootSetError: rootSetError(doctor),
    });
  }

  async repair(records: readonly WarpStateSnapshotRecord[]): Promise<WarpStateCacheRepairResult> {
    const rootSet = await this._getRootSet();
    const before = await this.inspect(records);
    const probe = await this._probeTargets(records);
    const desired = probe.anchorable.map(entryForRecord).sort(compareEntryNames);

    if (before.rootSetError === null) {
      const state = await rootSet.read();
      await rootSet.replace({ entries: desired, expectedHeadOid: state.headOid });
    } else {
      await rootSet.repair({ entries: desired });
    }

    const after = await this.inspect(records);
    const unrecoverableSnapshotIds = [
      ...probe.missingSnapshotIds,
      ...probe.wrongTypeSnapshotIds,
    ];
    const removedStaleRootNames = before.staleRootNames.filter(
      (name) => !after.staleRootNames.includes(name),
    );

    return new WarpStateCacheRepairResult({
      before,
      after,
      anchoredSnapshotIds: after.anchoredSnapshotIds,
      unrecoverableSnapshotIds,
      removedStaleRootNames,
    });
  }

  private async _probeTargets(records: readonly WarpStateSnapshotRecord[]): Promise<TargetProbe> {
    const anchorable: WarpStateSnapshotRecord[] = [];
    const missingSnapshotIds: string[] = [];
    const wrongTypeSnapshotIds: string[] = [];

    for (const record of records) {
      if (!(await this._objectProbe.nodeExists(record.payloadRef))) {
        missingSnapshotIds.push(record.snapshotId);
      } else if (await this._objectProbe.readObjectType(record.payloadRef) !== 'tree') {
        wrongTypeSnapshotIds.push(record.snapshotId);
      } else {
        anchorable.push(record);
      }
    }
    return { anchorable, missingSnapshotIds, wrongTypeSnapshotIds };
  }

  private async _probeTransitionTargets(
    records: readonly WarpStateSnapshotRecord[],
  ): Promise<TargetProbe> {
    const anchored: WarpStateSnapshotRecord[] = [];
    const unchecked: WarpStateSnapshotRecord[] = [];
    for (const record of records) {
      (this._anchoredTreeOids.has(record.payloadRef) ? anchored : unchecked).push(record);
    }
    const probe = await this._probeTargets(unchecked);
    return {
      anchorable: [...anchored, ...probe.anchorable],
      missingSnapshotIds: probe.missingSnapshotIds,
      wrongTypeSnapshotIds: probe.wrongTypeSnapshotIds,
    };
  }

  private _rememberAnchored(records: readonly WarpStateSnapshotRecord[]): void {
    this._rememberTreeOids(records.map((record) => record.payloadRef));
  }

  private _rememberTreeOids(oids: readonly string[]): void {
    for (const oid of oids) { this._anchoredTreeOids.add(oid); }
  }
}
