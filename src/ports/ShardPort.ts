import type { MetaShard } from '../domain/artifacts/MetaShard.ts';
import type { EdgeShard } from '../domain/artifacts/EdgeShard.ts';
import type { LabelShard } from '../domain/artifacts/LabelShard.ts';

/**
 * Port for typed index shard I/O.
 *
 * Domain services work with IndexShard subclasses (MetaShard,
 * EdgeShard, LabelShard). The adapter owns serialization and
 * raw Git storage. This port replaces the ad-hoc `loadShard`
 * callback pattern used by IncrementalIndexUpdater and
 * StreamingBitmapIndexBuilder.
 *
 * Complements IndexStorePort (which handles bulk stream I/O)
 * with single-shard random access needed by incremental updates.
 */
export default abstract class ShardPort {
  abstract loadMeta(_shardKey: string): MetaShard | null;
  abstract loadEdgeShard(
    _direction: 'fwd' | 'rev',
    _shardKey: string,
  ): EdgeShard | null;
  abstract loadLabels(): LabelShard | null;

  abstract saveMeta(_shardKey: string, _shard: MetaShard): void;
  abstract saveEdgeShard(
    _direction: 'fwd' | 'rev',
    _shardKey: string,
    _shard: EdgeShard,
  ): void;
  abstract saveLabels(_labels: LabelShard): void;
}
