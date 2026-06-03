import type TreeEntryFound from '../domain/tree/TreeEntryFound.ts';
import type TreeEntryLimit from '../domain/tree/TreeEntryLimit.ts';
import type TreeEntryMissing from '../domain/tree/TreeEntryMissing.ts';
import type TreeEntryPath from '../domain/tree/TreeEntryPath.ts';
import type TreeEntryPrefixBatch from '../domain/tree/TreeEntryPrefixBatch.ts';

export type TreeEntryProbeResult = TreeEntryFound | TreeEntryMissing;

export default abstract class TreeEntryProbePort {
  abstract readTreeEntryOid(
    _treeOid: string,
    _path: TreeEntryPath,
  ): Promise<TreeEntryProbeResult>;

  abstract readTreeEntryPrefix(
    _treeOid: string,
    _prefix: TreeEntryPath,
    _limit: TreeEntryLimit,
  ): Promise<TreeEntryPrefixBatch>;
}
