import { describe, expect, it } from 'vitest';
import { openWarp } from '../../../src/application/openWarp.ts';
import { resolveWarpStorage } from '../../../src/application/WarpStorageRegistry.ts';
import { intent } from '../../../src/domain/api/IntentBuilders.ts';
import { reading } from '../../../src/domain/api/ReadingBuilders.ts';
import type ReadReceipt from '../../../src/domain/api/ReadReceipt.ts';
import { getRoaringBitmap32, initRoaring } from '../../../src/domain/utils/roaring.ts';
import MemoryStorage from '../../helpers/MemoryStorage.ts';
import { openMemoryRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';

/**
 * #1159 follow-up from the PR #1128 decision check: a checkpoint bitmap
 * that the shard boundary refuses reaches the optic as
 * E_OPTIC_NO_BOUNDED_BASIS with reason checkpoint-shard-invalid and the
 * rejection as cause. The read receipt keeps only the code.
 *
 * The checkpoint is written while the loaded bitmap class serializes every
 * bitmap as three bytes that are not a portable Roaring bitmap (unknown
 * cookie), so the reader's shard boundary refuses each stored bitmap.
 *
 * Oracle: the receipt of a timeline with no checkpoint at all (WarpFacade
 * test 'returns an obstructed receipt instead of materializing a missing
 * read basis'). A refused shard is a different fault, so its receipt must
 * not be that one.
 */
const NOT_A_BITMAP = new Uint8Array([1, 2, 3]);

async function checkpointWithRefusedBitmaps(storage: MemoryStorage, graphName: string): Promise<void> {
  const Loaded = getRoaringBitmap32();
  class RefusedBytesBitmap extends Loaded {
    override serialize(_portable: boolean): Uint8Array {
      return NOT_A_BITMAP;
    }
  }
  const binding = resolveWarpStorage(storage);
  const runtime = await openMemoryRuntimeHostProduct({
    persistence: binding.history,
    runtimeStorage: binding.runtimeStorage,
    graphName,
    writerId: 'agent-1',
  });
  await runtime.materialize();
  await initRoaring({ RoaringBitmap32: RefusedBytesBitmap });
  try {
    await runtime.createCheckpoint();
  } finally {
    await initRoaring({ RoaringBitmap32: Loaded });
  }
}

function receiptFields(receipt: ReadReceipt): object {
  return { outcome: receipt.outcome, reason: receipt.reason, repairHints: receipt.repairHints };
}

async function missingCheckpointReceipt(): Promise<object> {
  const warp = await openWarp({ storage: MemoryStorage.create(), writer: 'agent-1' });
  const timeline = await warp.timeline('events');
  const result = await timeline.read(reading.neighborhood({ subject: 'user:alice', direction: 'out' }));
  return receiptFields(result.receipt);
}

describe('the read receipt of a checkpoint bitmap that the shard boundary refuses (#1159)', () => {
  // Reproduced, not fixed: both receipts are obstructed / missing_bounded_basis.
  it.fails('differs from the receipt of a timeline that has no checkpoint (#1159)', async () => {
    const storage = MemoryStorage.create();
    const writer = await (await openWarp({ storage, writer: 'agent-1' })).timeline('events');
    await writer.write(intent.node.add({ subject: 'user:alice' }));
    await writer.write(intent.node.add({ subject: 'team:ops' }));
    await writer.write(intent.edge.add({ from: 'user:alice', to: 'team:ops', label: 'memberOf' }));
    await checkpointWithRefusedBitmaps(storage, writer.name);
    const reader = await (await openWarp({ storage, writer: 'agent-2' })).timeline('events');

    const refused = await reader.read(reading.neighborhood({ subject: 'user:alice', direction: 'out' }));

    expect(receiptFields(refused.receipt)).not.toEqual(await missingCheckpointReceipt());
  });
});
