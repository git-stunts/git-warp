import { Runtime } from '../../../index.ts';
import {
  createObserver,
  reading,
} from '../../../advanced.ts';
import type { ReadingValue } from '../../../index.ts';
import {
  measureMigratedRead,
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
    const observation = lane.observe(createObserver(
      'v18-to-v19.performance',
      reading.property({
        key: 'ordinal',
        subject: 'medium:document:015',
      }),
      requireOrdinal,
    ));
    const observed = await observation.one();
    const receipt = await observation.receipt;
    if (receipt.status !== 'completed') {
      throw new Error(`v19 retained property Receipt is ${receipt.status}`);
    }
    return Object.freeze({
      basisId: observed.coordinate.basis.id,
      basisKind: 'opaque-evidence' as const,
      receiptStatus: receipt.status,
      supportStatus: observed.support.status,
      value: observed.value,
    });
  } finally {
    await runtime.close();
  }
});
printMigratedReadResult(result);

function requireOrdinal(value: ReadingValue): 15 {
  if (value !== 15) {
    throw new Error('v19 retained property read did not return ordinal 15');
  }
  return 15;
}
