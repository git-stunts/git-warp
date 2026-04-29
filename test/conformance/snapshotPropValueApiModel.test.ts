import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Dot } from '../../src/domain/crdt/Dot.ts';
import ORSet from '../../src/domain/crdt/ORSet.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const PROP_VALUE_PATH = 'src/domain/types/PropValue.ts';
const IMMUTABLE_SNAPSHOT_PATH = 'src/domain/services/ImmutableSnapshot.ts';
const MATERIALIZE_CAPABILITY_PATH = 'src/domain/capabilities/MaterializeCapability.ts';
const QUERY_CAPABILITY_PATH = 'src/domain/capabilities/QueryCapability.ts';
const QUERY_READS_PATH = 'src/domain/services/controllers/QueryReads.ts';
const STATE_READER_CONTEXT_PATH = 'src/domain/services/state/StateReaderContext.ts';

type SnapshotEntry = {
  readonly element: string;
  readonly dots: readonly string[];
};

type SnapshotORSetView = {
  contains(element: string): boolean;
  elements(): readonly string[];
  countEntries(): number;
  countLiveDots(): number;
  countTombstones(): number;
  getDots(element: string): readonly string[];
  hasDot(element: string, encodedDot: string): boolean;
  isTombstoned(encodedDot: string): boolean;
  entries(): readonly SnapshotEntry[];
  entryDots(): readonly string[];
  tombstones(): readonly string[];
};

type SnapshotFactoryModule = {
  readonly createSnapshotORSet?: (value: ORSet) => SnapshotORSetView;
};

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

function readDomainSource(): string {
  return domainSourceFiles('src/domain')
    .map((path) => readRepoFile(path))
    .join('\n');
}

function classSource(source: string, className: string): string {
  const classPrefix = '(?:export\\s+)?(?:default\\s+)?class';
  const startPattern = new RegExp(`${classPrefix}\\s+${className}\\b`, 'u');
  const start = source.search(startPattern);
  if (start === -1) {
    return '';
  }
  const rest = source.slice(start);
  const nextClass = rest.slice(1).search(/\n(?:export\s+)?(?:default\s+)?class\s+\w+\b/u);
  return nextClass === -1 ? rest : rest.slice(0, nextClass + 1);
}

function sortedStrings(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sortedEntries(entries: readonly SnapshotEntry[]): SnapshotEntry[] {
  return [...entries]
    .map((entry) => ({
      element: entry.element,
      dots: sortedStrings(entry.dots),
    }))
    .sort((left, right) => left.element.localeCompare(right.element));
}

function domainSourceFiles(path: string): string[] {
  const absolutePath = join(REPO_ROOT, path);
  if (!existsSync(absolutePath)) {
    return [];
  }
  const entries = readdirSync(absolutePath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const childPath = `${path}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...domainSourceFiles(childPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(childPath);
    }
  }
  return files;
}

function mutateStringArray(values: readonly string[]): void {
  try {
    Reflect.set(values, '0', 'mutated');
  } catch {
    // Frozen arrays may throw. The assertion is that later reads do not change.
  }
  try {
    Reflect.apply(Array.prototype.push, values, ['extra']);
  } catch {
    // Frozen arrays may throw. The assertion is that later reads do not change.
  }
}

function mutateSnapshotEntry(entry: SnapshotEntry): void {
  try {
    Reflect.set(entry, 'element', 'mutated-entry');
  } catch {
    // Frozen entry objects may throw. The assertion is that later reads do not change.
  }
  mutateStringArray(entry.dots);
}

async function loadSnapshotFactoryModule(): Promise<SnapshotFactoryModule> {
  return import('../../src/domain/services/ImmutableSnapshot.ts');
}

describe('snapshot PropValue API model', () => {
  it('keeps storage PropValue storage-shaped and separate from immutable snapshot bytes', () => {
    const propValueSource = readRepoFile(PROP_VALUE_PATH);
    const domainSource = readDomainSource();

    expect(propValueSource).toContain('Uint8Array');
    expect(propValueSource).not.toContain('ImmutableBytes');
    expect(domainSource).toMatch(/class\s+ImmutableBytes\b/u);
    expect(domainSource).toMatch(/type\s+SnapshotPropValue\b[\s\S]*ImmutableBytes/u);
  });

  it('requires public state snapshots to use SnapshotWarpState instead of storage WarpState', () => {
    const immutableSnapshotSource = readRepoFile(IMMUTABLE_SNAPSHOT_PATH);
    const materializeCapabilitySource = readRepoFile(MATERIALIZE_CAPABILITY_PATH);
    const queryCapabilitySource = readRepoFile(QUERY_CAPABILITY_PATH);
    const domainSource = readDomainSource();

    expect(domainSource).toMatch(/class\s+SnapshotWarpState\b/u);
    expect(immutableSnapshotSource).toMatch(/createSnapshotWarpState\s*\(\s*state:\s*WarpState\s*\)\s*:\s*SnapshotWarpState/u);
    expect(immutableSnapshotSource).not.toMatch(/createImmutableWarpStateSnapshot\s*\(\s*state:\s*WarpState\s*\)\s*:\s*WarpState/u);

    // MaterializeCapability is the public read-side materialization surface.
    // This does not ban internal/live reducer or cache APIs from returning WarpState.
    expect(materializeCapabilitySource).toContain('SnapshotWarpState');
    expect(materializeCapabilitySource).not.toMatch(/type\s+MaterializeWithReceipts\s*=\s*\{[\s\S]*?\bstate\s*:\s*WarpState\b/u);
    expect(materializeCapabilitySource).not.toMatch(/abstract\s+materialize\s*\([^;]*\):\s*Promise\s*<\s*WarpState\s*>/u);
    expect(materializeCapabilitySource).not.toMatch(/abstract\s+materialize\s*\([^;]*\):\s*Promise\s*<\s*WarpState\s*\|/u);
    expect(materializeCapabilitySource).not.toMatch(/abstract\s+materializeCoordinate\s*\([^;]*\):\s*Promise\s*<\s*WarpState\s*>/u);
    expect(materializeCapabilitySource).not.toMatch(/abstract\s+materializeCoordinate\s*\([^;]*\):\s*Promise\s*<\s*WarpState\s*\|/u);
    expect(materializeCapabilitySource).not.toMatch(/abstract\s+materializeAt\s*\([^;]*\):\s*Promise\s*<\s*WarpState\s*>/u);
    expect(queryCapabilitySource).not.toMatch(/getStateSnapshot\s*\([^)]*\)\s*:\s*Promise\s*<\s*WarpState\s*\|\s*null\s*>/u);
  });

  it('requires SnapshotWarpState fields to expose read-side types, not live mutable CRDT surfaces', () => {
    const domainSource = readDomainSource();

    expect(domainSource).toMatch(/class\s+SnapshotORSet\b/u);
    expect(domainSource).toMatch(/class\s+SnapshotVersionVector\b/u);
    expect(domainSource).toMatch(/nodeAlive\s*:\s*SnapshotORSet/u);
    expect(domainSource).toMatch(/edgeAlive\s*:\s*SnapshotORSet/u);
    expect(domainSource).toMatch(/observedFrontier\s*:\s*SnapshotVersionVector/u);
    expect(domainSource).toMatch(/prop\s*:\s*ReadonlyMap\s*<\s*string\s*,\s*LWWRegister\s*<\s*SnapshotPropValue\s*>\s*>/u);
    expect(domainSource).toMatch(/edgeBirthEvent\s*:\s*ReadonlyMap\s*<\s*string\s*,\s*EventId\s*>/u);
    expect(domainSource).not.toMatch(/nodeAlive\s*:\s*ORSet/u);
    expect(domainSource).not.toMatch(/edgeAlive\s*:\s*ORSet/u);
    expect(domainSource).not.toMatch(/observedFrontier\s*:\s*VersionVector/u);
  });

  it('requires public property-bag APIs to project storage values to SnapshotPropValue', () => {
    const queryCapabilitySource = readRepoFile(QUERY_CAPABILITY_PATH);
    const queryReadsSource = readRepoFile(QUERY_READS_PATH);
    const stateReaderContextSource = readRepoFile(STATE_READER_CONTEXT_PATH);

    expect(queryCapabilitySource).not.toMatch(/Record\s*<\s*string\s*,\s*unknown\s*>/u);
    expect(queryCapabilitySource).toContain('SnapshotPropValue');
    expect(queryCapabilitySource).not.toMatch(/props\s*:\s*Record\s*<\s*string\s*,\s*unknown\s*>/u);
    expect(queryReadsSource).not.toMatch(/type\s+PropertyBag\s*=\s*Record\s*<\s*string\s*,\s*PropValue\s*>/u);
    expect(stateReaderContextSource).not.toMatch(/Record\s*<\s*string\s*,\s*unknown\s*>/u);
  });

  it('requires SnapshotORSet to avoid live mutators and fake readonly Set returns', () => {
    const domainSource = readDomainSource();
    const snapshotORSetSource = classSource(domainSource, 'SnapshotORSet');

    expect(domainSource).toMatch(/class\s+SnapshotORSet\b/u);
    expect(snapshotORSetSource).not.toMatch(/\badd\s*\(/u);
    expect(snapshotORSetSource).not.toMatch(/\bremove\s*\(/u);
    expect(snapshotORSetSource).not.toMatch(/\bcompact\s*\(/u);
    expect(snapshotORSetSource).not.toMatch(/\bentries\s*:\s*Map\b/u);
    expect(snapshotORSetSource).not.toMatch(/\btombstones\s*:\s*Set\b/u);
    expect(snapshotORSetSource).not.toMatch(/ReadonlySet/u);
    expect(snapshotORSetSource).not.toMatch(/:\s*Set\s*</u);
  });

  it('requires SnapshotVersionVector to avoid mutating frontier methods', () => {
    const domainSource = readDomainSource();
    const snapshotVersionVectorSource = classSource(domainSource, 'SnapshotVersionVector');

    expect(domainSource).toMatch(/class\s+SnapshotVersionVector\b/u);
    expect(snapshotVersionVectorSource).not.toMatch(/\bset\s*\(/u);
    expect(snapshotVersionVectorSource).not.toMatch(/\bincrement\s*\(/u);
  });

  it('requires SnapshotORSet array returns to be frozen or defensive copies', async () => {
    const snapshotModule = await loadSnapshotFactoryModule();

    expect(typeof snapshotModule.createSnapshotORSet).toBe('function');

    const createSnapshotORSet = snapshotModule.createSnapshotORSet;
    if (createSnapshotORSet === undefined) {
      expect(createSnapshotORSet).toBeDefined();
      return;
    }

    const source = ORSet.empty();
    source.add('node-a', new Dot('writer-a', 1));
    source.add('node-b', new Dot('writer-a', 2));

    const snapshot = createSnapshotORSet(source);
    const elements = snapshot.elements();
    const dots = snapshot.getDots('node-a');
    const entryDots = snapshot.entryDots();
    const tombstones = snapshot.tombstones();
    const entries = snapshot.entries();
    const nestedEntryDots = entries[0]?.dots;
    const firstEntry = entries[0];

    mutateStringArray(elements);
    mutateStringArray(dots);
    mutateStringArray(entryDots);
    mutateStringArray(tombstones);
    if (nestedEntryDots !== undefined) {
      mutateStringArray(nestedEntryDots);
    }
    if (firstEntry !== undefined) {
      mutateSnapshotEntry(firstEntry);
    }

    expect(sortedStrings(snapshot.elements())).toEqual(['node-a', 'node-b']);
    expect(sortedStrings(snapshot.getDots('node-a'))).toEqual(['writer-a:1']);
    expect(sortedStrings(snapshot.entryDots())).toEqual(['writer-a:1', 'writer-a:2']);
    expect(sortedStrings(snapshot.tombstones())).toEqual([]);
    expect(sortedEntries(snapshot.entries())).toEqual([
      { element: 'node-a', dots: ['writer-a:1'] },
      { element: 'node-b', dots: ['writer-a:2'] },
    ]);
  });

  it('rejects fake immutable byte and set representations in snapshot source', () => {
    const immutableSnapshotSource = readRepoFile(IMMUTABLE_SNAPSHOT_PATH);

    expect(immutableSnapshotSource).not.toContain('Readonly<Uint8Array>');
    expect(immutableSnapshotSource).not.toContain('ReadonlySet');
    expect(immutableSnapshotSource).not.toMatch(/\bProxy\s*</u);
    expect(immutableSnapshotSource).not.toMatch(/\bas\s+unknown\s+as\b/u);
    expect(immutableSnapshotSource).not.toMatch(/\bas\s+any\b/u);
  });
});
