import type WarpWorldline from '../WarpWorldline.ts';
import WarpError from '../errors/WarpError.ts';
import type { SnapshotPropValue } from '../services/snapshot/SnapshotPropValue.ts';
import type Reading from './Reading.ts';
import type {
  ReadingDescriptor,
  ReadingKind,
} from './Reading.ts';
import ReadReceipt from './ReadReceipt.ts';
import ReadingResult from './ReadingResult.ts';

type ReadingExecutor = (
  descriptor: ReadingDescriptor,
  runtime: WarpWorldline,
) => Promise<SnapshotPropValue>;

const readers: ReadonlyMap<ReadingKind, ReadingExecutor> = new Map([
  ['property.get', readProperty],
  ['node.exists', readNodeExists],
]);

export async function executeReading(
  runtime: WarpWorldline,
  reading: Reading,
): Promise<ReadingResult> {
  const { descriptor } = reading;
  const reader = readers.get(reading.kind);
  if (reader === undefined) {
    throw new WarpError('Reading kind is unsupported', 'E_READING_KIND');
  }
  const value = await reader(descriptor, runtime);
  return new ReadingResult({
    value,
    receipt: new ReadReceipt({
      timeline: runtime.worldlineName,
      writer: runtime.writerId,
      reading,
      outcome: 'resolved',
    }),
  });
}

async function readProperty(
  descriptor: ReadingDescriptor,
  runtime: WarpWorldline,
): Promise<SnapshotPropValue> {
  if (descriptor.kind !== 'property.get') {
    throw new WarpError('Reading executor received a mismatched descriptor', 'E_READING_KIND');
  }
  const props = await runtime.live().getNodeProps(descriptor.subject);
  return props?.[descriptor.key] ?? null;
}

async function readNodeExists(
  descriptor: ReadingDescriptor,
  runtime: WarpWorldline,
): Promise<SnapshotPropValue> {
  if (descriptor.kind !== 'node.exists') {
    throw new WarpError('Reading executor received a mismatched descriptor', 'E_READING_KIND');
  }
  return await runtime.live().hasNode(descriptor.subject);
}
