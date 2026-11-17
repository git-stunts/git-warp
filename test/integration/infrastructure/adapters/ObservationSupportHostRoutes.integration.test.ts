import { afterEach, describe, expect, it } from 'vitest';
import type { AssetCapability } from '@git-stunts/git-cas';
import Plumbing from '@git-stunts/plumbing';
import { GitRepositoryLockedError } from '@git-stunts/plumbing/errors';
import ObservationSupportUnavailableError from '../../../../src/domain/errors/ObservationSupportUnavailableError.ts';
import ObservationCustodyIdentity from '../../../../src/domain/services/custody/ObservationCustodyIdentity.ts';
import type ObservationDependency from '../../../../src/domain/services/custody/ObservationDependency.ts';
import GitCasObservationSupportAdapter, { type ObservationSupportHistory } from '../../../../src/infrastructure/adapters/GitCasObservationSupportAdapter.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import ObservationCustodyFixture, {
  DEFAULT_SUPPORT_LIMITS, FIXTURE_ATTEMPT, FIXTURE_DIGEST, FIXTURE_GRAPH, basisTree, blob, blobDependency, claimOf, stream, writerCommits,
} from '../../../helpers/ObservationCustodyFixture.ts';
import SeededRandomPort from '../../../helpers/SeededRandomPort.ts';

const fixture = new ObservationCustodyFixture();
afterEach(async () => {
  await fixture.dispose();
});

const IDENTITY = new ObservationCustodyIdentity(FIXTURE_ATTEMPT, FIXTURE_DIGEST);
const LOCKED = new GitRepositoryLockedError('Git command failed: repository is locked', 'ExecutionOrchestrator.orchestrate', { code: 128, stderr: 'fatal: Unable to create index.lock' });

/** Which call beneath the support host should meet the held lock: its name and what it was asked for. */
type FaultPoint = (call: 'execute' | 'readTreeObjectEntries' | 'assets.put', detail: string) => boolean;

/**
 * A real repository's Git and git-cas capabilities, with one held lock injected beneath the support
 * host at the first call `point` selects. Every route the support adapter takes must reach Git through
 * the host, so the lock must come back typed as unavailable (#1109; Safety Review F3, mutants 01-05).
 */
async function supportFaultingAt(path: string, point: FaultPoint): Promise<GitCasObservationSupportAdapter> {
  const { store } = await fixture.open(path, { limit: 2 });
  const real = new GitTimelineHistoryAdapter({ plumbing: await Plumbing.createDefault({ cwd: path }) });
  let fired = false;
  const meet = (call: Parameters<FaultPoint>[0], detail: string): void => {
    if (!fired && point(call, detail)) {
      fired = true;
      throw LOCKED;
    }
  };
  const history: ObservationSupportHistory = {
    plumbing: {
      execute: async (options) => {
        meet('execute', `${options.args.join(' ')}\n${typeof options.input === 'string' ? options.input : ''}`);
        return await real.plumbing.execute(options);
      },
    },
    readBlob: async (oid) => await real.readBlob(oid),
    readTreeObjectEntries: async (oid) => {
      meet('readTreeObjectEntries', oid);
      return await real.readTreeObjectEntries(oid);
    },
    readRef: async (ref) => await real.readRef(ref),
    deleteRef: async (ref) => {
      await real.deleteRef(ref);
    },
  };
  const assets: Pick<AssetCapability, 'put'> = {
    put: async (options) => {
      meet('assets.put', options.slug);
      return await store.assets.put(options);
    },
  };
  return new GitCasObservationSupportAdapter({
    publications: store.publications, assets, history,
    crypto: new NodeCryptoAdapter(), random: new SeededRandomPort(), codec, graphName: FIXTURE_GRAPH, limits: DEFAULT_SUPPORT_LIMITS,
  });
}

async function retained(support: GitCasObservationSupportAdapter, basis: string, dependencies: readonly ObservationDependency[] = []): Promise<void> {
  await support.retain({ identity: IDENTITY, basis, claim: await claimOf(dependencies), isCancelled: () => false, dependencies: stream(dependencies) });
}

describe('every Git and git-cas route of observation support goes through the support host (#1109)', () => {
  it('types a held lock met while staging the carrier root (assets.put)', async () => {
    const path = await fixture.repository('sha1');
    const basis = basisTree(path, 'assets', writerCommits(path, 2));
    const support = await supportFaultingAt(path, (call) => call === 'assets.put');

    await expect(retained(support, basis)).rejects.toMatchObject({ code: 'E_OBSERVATION_SUPPORT_UNAVAILABLE', cause: LOCKED });
  });

  it('types a held lock met by the frontier history checking its heads and anchors', async () => {
    const path = await fixture.repository('sha1');
    const heads = writerCommits(path, 2);
    const basis = basisTree(path, 'frontier', heads);
    const [head = ''] = heads;
    const support = await supportFaultingAt(path, (call, detail) => call === 'execute' && detail.startsWith('cat-file --batch-check') && detail.includes(head));

    await expect(retained(support, basis)).rejects.toBeInstanceOf(ObservationSupportUnavailableError);
  });

  it('types a held lock met by the support-page fast-import writer', async () => {
    const path = await fixture.repository('sha1');
    const basis = basisTree(path, 'pages', writerCommits(path, 1));
    const dependency = blobDependency(blob(path, 'a page dependency'));
    const support = await supportFaultingAt(path, (call, detail) => call === 'execute' && detail.startsWith('fast-import'));

    await expect(retained(support, basis, [dependency])).rejects.toBeInstanceOf(ObservationSupportUnavailableError);
  });

  it('types a held lock met by the dependency pages checking their objects', async () => {
    const path = await fixture.repository('sha1');
    const basis = basisTree(path, 'dependencies', writerCommits(path, 1));
    const dependency = blobDependency(blob(path, 'a checked dependency'));
    const support = await supportFaultingAt(path, (call, detail) => call === 'execute' && detail.startsWith('cat-file --batch-check') && detail.includes(dependency.oid));

    await expect(retained(support, basis, [dependency])).rejects.toBeInstanceOf(ObservationSupportUnavailableError);
  });

  it('types a held lock met reading the basis tree', async () => {
    const path = await fixture.repository('sha1');
    const basis = basisTree(path, 'basis', writerCommits(path, 1));
    const support = await supportFaultingAt(path, (call, detail) => call === 'readTreeObjectEntries' && detail === basis);

    await expect(retained(support, basis)).rejects.toBeInstanceOf(ObservationSupportUnavailableError);
  });
});
