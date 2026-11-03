import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ContentAddressableStore from '@git-stunts/git-cas';
import Plumbing from '@git-stunts/plumbing';
import ObservationAttemptId from '../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationBindings from '../../src/domain/services/custody/ObservationBindings.ts';
import ObservationBudget from '../../src/domain/services/custody/ObservationBudget.ts';
import ObservationCustodyService from '../../src/domain/services/custody/ObservationCustodyService.ts';
import ObservationDependency from '../../src/domain/services/custody/ObservationDependency.ts';
import ObservationDigest from '../../src/domain/services/custody/ObservationDigest.ts';
import ObservationEvidenceBinding from '../../src/domain/services/custody/ObservationEvidenceBinding.ts';
import ObservationIndeterminate from '../../src/domain/services/custody/ObservationIndeterminate.ts';
import ObservationQuestion from '../../src/domain/services/custody/ObservationQuestion.ts';
import ObservationReceiptCore from '../../src/domain/services/custody/ObservationReceiptCore.ts';
import ObservationSupportLimits from '../../src/domain/services/custody/ObservationSupportLimits.ts';
import type { ObservationSupportSources } from '../../src/domain/services/custody/ObservationSupportRequest.ts';
import ObservationWritePremise from '../../src/domain/services/custody/ObservationWritePremise.ts';
import EntropyObservationAttemptSource from '../../src/infrastructure/adapters/EntropyObservationAttemptSource.ts';
import GitCasObservationCustodyAdapter from '../../src/infrastructure/adapters/GitCasObservationCustodyAdapter.ts';
import GitCasObservationSupportAdapter from '../../src/infrastructure/adapters/GitCasObservationSupportAdapter.ts';
import GitTimelineHistoryAdapter from '../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import NodeCryptoAdapter from '../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import ObservationCustodyCborCodec from '../../src/infrastructure/adapters/ObservationCustodyCborCodec.ts';
import codec from '../../src/infrastructure/codecs/CborCodec.ts';
import type ObservationCustodyPort from '../../src/ports/ObservationCustodyPort.ts';

export const FIXTURE_GRAPH = 'custody-fixture';
export const FIXTURE_DIGEST = new ObservationDigest('ab'.repeat(32));
export const FIXTURE_ATTEMPT = new ObservationAttemptId('f'.repeat(32));
export const DEFAULT_SUPPORT_LIMITS = new ObservationSupportLimits({ writers: 512, dependencies: 4096 });

/** One opened store and the production services over it. */
export type OpenedCustody = {
  readonly store: ContentAddressableStore;
  readonly custody: GitCasObservationCustodyAdapter;
  readonly support: GitCasObservationSupportAdapter;
  readonly service: ObservationCustodyService;
  /** Carrier publications made through this opening, for boundedness witnesses. */
  readonly carriersPublished: () => number;
};

/** The value as `type`, failing the test with a useful cause otherwise. */
export function narrowed<T extends object>(value: object | null, type: abstract new (...args: never[]) => T): T {
  if (value instanceof ObservationIndeterminate) {
    throw value.cause;
  }
  if (!(value instanceof type)) {
    throw new Error(`Expected ${type.name}, got ${JSON.stringify(value)} (${value?.constructor.name ?? 'null'})`);
  }
  return value;
}

export function git(path: string, args: readonly string[], input?: string): string {
  return execFileSync('git', [...args], { cwd: path, encoding: 'utf8', input }).trim();
}

/** Disposable bare repositories and stores, removed by {@link dispose}. */
export default class ObservationCustodyFixture {
  readonly #directories: string[] = [];
  readonly #stores = new Set<ContentAddressableStore>();

  async repository(format: string): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), 'warp-observation-custody-'));
    this.#directories.push(path);
    git(path, ['init', '--bare', '--quiet', `--object-format=${format}`]);
    git(path, ['config', 'user.name', 'Custody fixture']);
    git(path, ['config', 'user.email', 'custody@example.invalid']);
    git(path, ['config', 'gc.auto', '0']);
    return path;
  }

  /** Opens production services; `wrap` may interpose faults on the custody port. */
  async open(path: string, options: {
    readonly limit: number;
    readonly limits?: ObservationSupportLimits;
    readonly wrap?: (custody: ObservationCustodyPort) => ObservationCustodyPort;
  }): Promise<OpenedCustody> {
    const plumbing = await Plumbing.createDefault({ cwd: path });
    const store = ContentAddressableStore.createCbor({ plumbing, applicationRefPrefixes: ['refs/warp/'] });
    this.#stores.add(store);
    const custody = await GitCasObservationCustodyAdapter.open({
      reservations: store.reservations, graphName: FIXTURE_GRAPH, limit: options.limit,
    });
    if (!(custody instanceof GitCasObservationCustodyAdapter)) {
      throw new Error('Fixture custody did not open');
    }
    const crypto = new NodeCryptoAdapter();
    let carriers = 0;
    const support = new GitCasObservationSupportAdapter({
      publications: {
        commit: async (request) => {
          const published = await store.publications.commit(request);
          carriers += 1;
          return published;
        },
      },
      assets: store.assets,
      history: new GitTimelineHistoryAdapter({ plumbing }),
      crypto,
      graphName: FIXTURE_GRAPH,
    });
    const service = new ObservationCustodyService({
      custody: options.wrap === undefined ? custody : options.wrap(custody),
      support,
      codec: new ObservationCustodyCborCodec(codec),
      crypto,
      attempts: new EntropyObservationAttemptSource(),
      limits: options.limits ?? DEFAULT_SUPPORT_LIMITS,
    });
    return { store, custody, support, service, carriersPublished: () => carriers };
  }

  async close(opened: OpenedCustody): Promise<void> {
    await opened.store.close();
    this.#stores.delete(opened.store);
  }

  async dispose(): Promise<void> {
    await Promise.allSettled([...this.#stores].map(async (store) => await store.close()));
    this.#stores.clear();
    await Promise.all(this.#directories.splice(0).map(async (path) => await rm(path, { recursive: true })));
  }
}

/** Writes `count` independent commits under fixture refs and returns their ids. */
export function writerCommits(path: string, count: number): string[] {
  const tree = emptyTree(path);
  const commits: string[] = [];
  for (let index = 0; index < count; index++) {
    const commit = git(path, ['commit-tree', tree, '-m', `writer ${index}`]);
    git(path, ['update-ref', `refs/warp/${FIXTURE_GRAPH}/writers/w${index}`, commit]);
    commits.push(commit);
  }
  return commits;
}

/** A basis tree holding its own distinct frontier blob, unreachable except through custody. */
export function basisTree(path: string, label: string): string {
  const blob = git(path, ['hash-object', '-w', '--stdin'], `frontier ${label}`);
  return git(path, ['mktree'], `100644 blob ${blob}\tfrontier\n`);
}

export function blob(path: string, content: string): string {
  return git(path, ['hash-object', '-w', '--stdin'], content);
}

export function emptyTree(path: string): string {
  return git(path, ['mktree'], '');
}

export function readBindings(basis: string): ObservationBindings {
  return bindings(basis, null);
}

export function writeBindings(basis: string, predecessor: string | null = null): ObservationBindings {
  return bindings(basis, new ObservationWritePremise({ intents: FIXTURE_DIGEST, writerId: 'writer-1', predecessor }));
}

function bindings(basis: string, writePremise: ObservationWritePremise | null): ObservationBindings {
  return new ObservationBindings({
    basis,
    observer: 'people/alice',
    question: new ObservationQuestion('node-property', 1),
    purpose: 'todo/display',
    budget: new ObservationBudget({ records: 10, bytes: 1024, work: 100 }),
    evidence: [new ObservationEvidenceBinding('authority', FIXTURE_DIGEST)],
    writePremise,
  });
}

export function readCore(label: string): ObservationReceiptCore {
  return new ObservationReceiptCore({
    family: 'observation', variant: 'completed', outcome: new TextEncoder().encode(`outcome ${label}`),
  });
}

export function writeCore(label: string): ObservationReceiptCore {
  return new ObservationReceiptCore({
    family: 'write', variant: 'retained', outcome: new TextEncoder().encode(`write ${label}`),
  });
}

export function sources(
  writerHeads: readonly string[] = [],
  dependencies: readonly ObservationDependency[] = [],
): ObservationSupportSources {
  return { writerHeads: stream(writerHeads), dependencies: stream(dependencies) };
}

export async function* stream<T>(values: readonly T[]): AsyncGenerator<T> {
  yield* values;
}

export function collectGarbage(path: string): void {
  git(path, ['reflog', 'expire', '--expire=now', '--all']);
  git(path, ['gc', '--prune=now', '--quiet']);
}

export function removeFixtureRefs(path: string): void {
  const refs = git(path, ['for-each-ref', '--format=%(refname)', `refs/warp/${FIXTURE_GRAPH}/writers/`]);
  for (const ref of refs.split('\n').filter((name) => name.length > 0)) {
    git(path, ['update-ref', '-d', ref]);
  }
}

export function treeDependency(oid: string): ObservationDependency {
  return new ObservationDependency('tree', oid);
}

export function blobDependency(oid: string): ObservationDependency {
  return new ObservationDependency('blob', oid);
}
