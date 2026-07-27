import { Runtime } from '../../../index.ts';
import {
  createManyObserver,
  reading,
} from '../../../advanced.ts';
import type { ReadingValue } from '../../../index.ts';
import {
  MIGRATED_READ_DOCUMENT_COUNT,
  measureMigratedRead,
  migratedReadSubject,
  printMigratedReadResult,
  requiredArgument,
} from './MigratedReadWorkerCommon.ts';

const repositoryPath = requiredArgument(process.argv.slice(2), '--repo');

const result = await measureMigratedRead(async () => {
  const runtime = await Runtime.open({
    at: repositoryPath,
    writer: 'performance-reader',
  });
  try {
    const lane = await runtime.lane('v18-medium-retained-substrate');
    const observation = lane.observe(createManyObserver(
      'v18-to-v19.performance',
      function* () {
        for (
          let ordinal = 0;
          ordinal < MIGRATED_READ_DOCUMENT_COUNT;
          ordinal += 1
        ) {
          yield reading.property({
            key: 'ordinal',
            subject: migratedReadSubject(ordinal),
          });
        }
      },
      requireOrdinal,
    ));
    let checksum = 0;
    let count = 0;
    let basisId: string | null = null;
    let supportStatus: 'supported' | null = null;
    for await (const observed of observation) {
      if (observed.value !== count) {
        throw new Error(`v19 retained scan expected ordinal ${String(count)}`);
      }
      checksum += observed.value;
      count += 1;
      basisId = observed.coordinate.basis.id;
      supportStatus = observed.support.status;
    }
    const receipt = await observation.receipt;
    if (receipt.status !== 'completed') {
      throw new Error(`v19 retained property Receipt is ${receipt.status}`);
    }
    if (
      count !== MIGRATED_READ_DOCUMENT_COUNT
      || checksum !== 120
      || basisId === null
      || supportStatus === null
    ) {
      throw new Error('v19 retained scan cardinality or checksum is invalid');
    }
    return Object.freeze({
      basisId,
      basisKind: 'opaque-evidence' as const,
      readingCount: MIGRATED_READ_DOCUMENT_COUNT,
      receiptStatus: receipt.status,
      supportStatus,
      value: 15 as const,
      valueChecksum: 120 as const,
    });
  } finally {
    await runtime.close();
  }
});
printMigratedReadResult(result);

function requireOrdinal(value: ReadingValue): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error('v19 retained property read did not return an ordinal');
  }
  return value;
}
