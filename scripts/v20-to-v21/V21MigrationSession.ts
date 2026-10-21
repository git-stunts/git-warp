import { getDefaultRuntimeHostNodePorts } from '../../src/application/RuntimeHostNodeDefaults.ts';
import GitCasRepositoryAdapter from '../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import { openDefaultGitPlumbing } from '../../src/infrastructure/adapters/GitPlumbingRuntimeAdapter.ts';
import GitTimelineHistoryAdapter from '../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import V21LateWrites, { type V21LateWriteReport } from './V21LateWrites.ts';
import V21Migration, { type V21MigrationOutcome } from './V21Migration.ts';
import V21MigrationRecordStore from './V21MigrationRecord.ts';

/** One repository opened for the v20-to-v21 migration (#1015). */
export default class V21MigrationSession {
  readonly #history: GitTimelineHistoryAdapter;
  readonly #repository: GitCasRepositoryAdapter;

  private constructor(history: GitTimelineHistoryAdapter, repository: GitCasRepositoryAdapter) {
    this.#history = history;
    this.#repository = repository;
  }

  static async open(repositoryPath: string): Promise<V21MigrationSession> {
    const plumbing = await openDefaultGitPlumbing(repositoryPath);
    const history = new GitTimelineHistoryAdapter({ plumbing });
    return new V21MigrationSession(history, new GitCasRepositoryAdapter({ plumbing, history }));
  }

  /** Graph names with a substrate marker or legacy writer refs under `refs/warp/`. */
  async graphs(): Promise<string[]> {
    const names = new Set<string>();
    for (const ref of await this.#history.listRefs('refs/warp/')) {
      const [, , graph, family] = ref.split('/');
      if (graph !== undefined && (family === 'substrate-version' || family === 'writers')) { names.add(graph); }
    }
    return [...names].sort();
  }

  async migrate(graph: string, assignOwners: ReadonlyMap<string, string>): Promise<V21MigrationOutcome> {
    return await this.#migration(graph).run(graph, assignOwners);
  }

  /** Legacy writes that arrived after `graph` was migrated. */
  async lateWrites(graph: string): Promise<V21LateWriteReport | null> {
    const record = await new V21MigrationRecordStore(this.#history, graph).read();
    if (record === null) { return null; }
    const ports = getDefaultRuntimeHostNodePorts();
    const services = this.#services(graph);
    return await new V21LateWrites({
      history: this.#history, codec: ports.commitMessageCodec, journal: services.patchJournal, strands: services.strands,
    }).report(record);
  }

  async close(): Promise<void> {
    try {
      await this.#repository.close();
    } finally {
      await this.#history.close();
    }
  }

  #migration(graph: string): V21Migration {
    const ports = getDefaultRuntimeHostNodePorts();
    return new V21Migration({
      history: this.#history, services: this.#services(graph), codec: ports.commitMessageCodec, crypto: ports.crypto,
    });
  }

  #services(graph: string): ReturnType<GitCasRepositoryAdapter['createMigrationStorageServices']> {
    const ports = getDefaultRuntimeHostNodePorts();
    return this.#repository.createMigrationStorageServices({
      timelineName: graph, codec: ports.codec, crypto: ports.crypto, commitMessageCodec: ports.commitMessageCodec,
    });
  }
}
