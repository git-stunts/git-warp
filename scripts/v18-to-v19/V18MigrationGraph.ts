import { validateGraphName } from '../../src/domain/utils/RefLayout.ts';

export type V18MigrationGraphRecord = Readonly<{
  name: string;
  refCount: number;
  version: string;
  writerCount: number;
}>;

/** One discovered git-warp graph namespace and its migration posture. */
export default class V18MigrationGraph {
  readonly name: string;
  readonly refCount: number;
  readonly version: string;
  readonly writerCount: number;

  constructor(record: V18MigrationGraphRecord) {
    validateGraphName(record.name);
    requireCount(record.refCount, 'refCount');
    requireCount(record.writerCount, 'writerCount');
    if (record.version.length === 0) {
      throw new Error('migration graph version label cannot be empty');
    }
    this.name = record.name;
    this.refCount = record.refCount;
    this.version = record.version;
    this.writerCount = record.writerCount;
    Object.freeze(this);
  }

  summary(): string {
    const refs = `${String(this.refCount)} ${plural(this.refCount, 'ref')}`;
    const writers = `${String(this.writerCount)} ${plural(this.writerCount, 'writer')}`;
    return `${this.name} — ${this.version}; ${writers}; ${refs}`;
  }
}

function requireCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}
