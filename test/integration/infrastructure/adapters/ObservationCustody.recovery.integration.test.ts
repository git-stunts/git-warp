import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import Plumbing from '@git-stunts/plumbing';
import ContentAddressableStore from '@git-stunts/git-cas';
import { afterEach, describe, expect, it } from 'vitest';
import CustodyAcknowledged from '../../../../src/domain/services/custody/CustodyAcknowledged.ts';
import ObservationAdmitted from '../../../../src/domain/services/custody/ObservationAdmitted.ts';
import ObservationAttemptId from '../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationCustodyIdentity from '../../../../src/domain/services/custody/ObservationCustodyIdentity.ts';
import ObservationDigest from '../../../../src/domain/services/custody/ObservationDigest.ts';
import ObservationPrepared from '../../../../src/domain/services/custody/ObservationPrepared.ts';
import ObservationPublicationEvidence from '../../../../src/domain/services/custody/ObservationPublicationEvidence.ts';
import ObservationPublicationPermission from '../../../../src/domain/services/custody/ObservationPublicationPermission.ts';
import ObservationReconciled from '../../../../src/domain/services/custody/ObservationReconciled.ts';
import ObservationRefused from '../../../../src/domain/services/custody/ObservationRefused.ts';
import ObservationSupportLimits from '../../../../src/domain/services/custody/ObservationSupportLimits.ts';
import ObservationUnavailable from '../../../../src/domain/services/custody/ObservationUnavailable.ts';
import ObservationUnretained from '../../../../src/domain/services/custody/ObservationUnretained.ts';
import ResolvedObservation from '../../../../src/domain/services/custody/ResolvedObservation.ts';
import RetainedObservation from '../../../../src/domain/services/custody/RetainedObservation.ts';
import GitCasObservationCustodyAdapter from '../../../../src/infrastructure/adapters/GitCasObservationCustodyAdapter.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import FaultingObservationCustody from '../../../helpers/FaultingObservationCustody.ts';
import ObservationCustodyFixture, {
  DEFAULT_SUPPORT_LIMITS,
  basisTree,
  collectGarbage,
  git,
  narrowed,
  readBindings,
  readCore,
  removeFixtureRefs,
  sources,
  writeBindings,
  writeCore,
  writerCommits,
} from '../../../helpers/ObservationCustodyFixture.ts';

const fixture = new ObservationCustodyFixture();

afterEach(async () => {
  await fixture.dispose();
});

function limitsWith(changes: Partial<ConstructorParameters<typeof ObservationSupportLimits>[0]>): ObservationSupportLimits {
  return new ObservationSupportLimits({
    writers: DEFAULT_SUPPORT_LIMITS.writers,
    dependencies: DEFAULT_SUPPORT_LIMITS.dependencies,
    frontierBytes: DEFAULT_SUPPORT_LIMITS.frontierBytes,
    work: DEFAULT_SUPPORT_LIMITS.work,
    ...changes,
  });
}

async function listed(service: { attempts(phase: 'reserved' | 'armed'): AsyncGenerator<object> }, phase: 'reserved' | 'armed'): Promise<readonly object[]> {
  const items: object[] = [];
  for await (const item of service.attempts(phase)) {
    items.push(item);
  }
  return items;
}

describe.each(['sha1', 'sha256'])('observation custody recovery (%s)', (format) => {
  it('rebuilds a settled Coordinate after a restart from nothing but its identity', async () => {
    const path = await fixture.repository(format);
    let faults: FaultingObservationCustody | null = null;
    const first = await fixture.open(path, {
      limit: 2,
      wrap: (custody) => {
        faults = new FaultingObservationCustody(custody);
        return faults;
      },
    });
    const { attempt } = narrowed(await first.service.begin(writeBindings(basisTree(path, 'crash', writerCommits(path, 3)))), ObservationAdmitted);
    const prepared = narrowed(await first.service.prepare(attempt, sources()), ObservationPrepared);
    narrowed(await first.service.authorizePublication(prepared), ObservationPublicationPermission);
    const commit = writerCommits(path, 1)[0] ?? '';
    const core = writeCore('lost with the process');
    narrowed(faults, FaultingObservationCustody).inject({ operation: 'settle', when: 'after' });
    expect(await first.service.settle(attempt, { core, publication: new ObservationPublicationEvidence('writer-1', commit) }))
      .toEqual(new ObservationUnretained(attempt, 'settlement-unacknowledged'));
    const identity = new ObservationCustodyIdentity(new ObservationAttemptId(attempt.identity.attemptId.value), new ObservationDigest(attempt.identity.binding.hex));
    await fixture.close(first);

    const second = await fixture.open(path, { limit: 2 });
    const recovered = narrowed(await second.service.recoverCoordinate(identity), RetainedObservation);
    removeFixtureRefs(path);
    collectGarbage(path);
    const resolved = narrowed(await second.service.resolve(recovered.coordinate), ResolvedObservation);
    expect(resolved.core()).toEqual(recovered.core());
    expect(await second.service.recoverCoordinate(identity)).toEqual(recovered);
  });

  it('opens custody for every legal graph name, with nested names kept apart', async () => {
    const path = await fixture.repository(format);
    const plumbing = await Plumbing.createDefault({ cwd: path });
    const store = ContentAddressableStore.createCbor({ plumbing, applicationRefPrefixes: ['refs/warp/'] });
    const crypto = new NodeCryptoAdapter();
    const opened = await fixture.open(path, { limit: 2 });
    const { attempt } = narrowed(await opened.service.begin(readBindings(basisTree(path, 'names'))), ObservationAdmitted);
    for (const graphName of ['MyGraph', 'my_graph', 'a', 'a/observations']) {
      const custody = await GitCasObservationCustodyAdapter.open({ reservations: store.reservations, graphName, limit: 1, crypto });
      if (!(custody instanceof GitCasObservationCustodyAdapter)) {
        throw new Error(`Custody did not open for ${graphName}`);
      }
      expect(await custody.reserve(attempt.identity)).toBeInstanceOf(CustodyAcknowledged);
    }
    await store.close();
  });

  it('finds and frees a reservation a crash stranded, and frees nothing armed', async () => {
    const path = await fixture.repository(format);
    const first = await fixture.open(path, { limit: 1 });
    const { attempt: stranded } = narrowed(await first.service.begin(writeBindings(basisTree(path, 'stranded'))), ObservationAdmitted);
    await fixture.close(first);

    const second = await fixture.open(path, { limit: 1 });
    expect(await second.service.begin(readBindings(basisTree(path, 'blocked')))).toEqual(new ObservationRefused('capacity-full'));
    expect(await listed(second.service, 'reserved')).toEqual([stranded.identity]);
    expect(await second.service.abandon(stranded.identity)).toEqual(new ObservationReconciled('cancelled'));
    expect(await listed(second.service, 'reserved')).toEqual([]);

    const { attempt } = narrowed(await second.service.begin(writeBindings(basisTree(path, 'armed'))), ObservationAdmitted);
    const prepared = narrowed(await second.service.prepare(attempt, sources()), ObservationPrepared);
    narrowed(await second.service.authorizePublication(prepared), ObservationPublicationPermission);
    expect(await listed(second.service, 'armed')).toEqual([attempt.identity]);
    expect(await second.service.abandon(attempt.identity)).toBeInstanceOf(ObservationRefused);
    expect(await second.service.begin(readBindings(basisTree(path, 'still-blocked')))).toEqual(new ObservationRefused('capacity-full'));
  });

  it('ends an armed write that did not publish, keeping its slot', async () => {
    const path = await fixture.repository(format);
    const opened = await fixture.open(path, { limit: 1 });
    const { attempt } = narrowed(await opened.service.begin(writeBindings(basisTree(path, 'stale'))), ObservationAdmitted);
    const prepared = narrowed(await opened.service.prepare(attempt, sources()), ObservationPrepared);
    expect(await opened.service.settleFailedPublication(attempt, writeCore('stale'))).toEqual(new ObservationRefused('not-armed'));
    narrowed(await opened.service.authorizePublication(prepared), ObservationPublicationPermission);
    const ended = narrowed(await opened.service.settleFailedPublication(attempt, writeCore('stale')), RetainedObservation);
    expect(await opened.service.settleFailedPublication(attempt, writeCore('stale'))).toEqual(ended);
    const resolved = narrowed(await opened.service.resolve(ended.coordinate), ResolvedObservation);
    expect(resolved.record.publication).toBeNull();
    expect(await opened.service.begin(readBindings(basisTree(path, 'full')))).toEqual(new ObservationRefused('capacity-full'));
  });

  it('reports lowered limits as limits on an issued Coordinate, undone by restoring them', async () => {
    const path = await fixture.repository(format);
    const first = await fixture.open(path, { limit: 2 });
    const { attempt } = narrowed(await first.service.begin(readBindings(basisTree(path, 'limits', writerCommits(path, 3)))), ObservationAdmitted);
    narrowed(await first.service.prepare(attempt, sources()), ObservationPrepared);
    const { coordinate } = narrowed(await first.service.settle(attempt, { core: readCore('limits'), publication: null }), RetainedObservation);
    await fixture.close(first);

    const fewer = await fixture.open(path, { limit: 2, limits: limitsWith({ writers: 1 }) });
    expect(await fewer.service.resolve(coordinate)).toEqual(new ObservationUnavailable('support-limit'));
    const smaller = await fixture.open(path, { limit: 2, limits: limitsWith({ frontierBytes: 1 }) });
    expect(await smaller.service.resolve(coordinate)).toEqual(new ObservationUnavailable('support-limit'));
    const poorer = await fixture.open(path, { limit: 2, limits: limitsWith({ work: 0 }) });
    expect(await poorer.service.resolve(coordinate)).toEqual(new ObservationUnavailable('work-limit'));
    const restored = await fixture.open(path, { limit: 2 });
    expect(await restored.service.resolve(coordinate)).toBeInstanceOf(ResolvedObservation);
  });

  it('reports removed evidence as unreadable to a store that did not write it', async () => {
    const path = await fixture.repository(format);
    const first = await fixture.open(path, { limit: 2 });
    const basis = basisTree(path, 'removed');
    const { attempt } = narrowed(await first.service.begin(readBindings(basis)), ObservationAdmitted);
    narrowed(await first.service.prepare(attempt, sources()), ObservationPrepared);
    const { coordinate } = narrowed(await first.service.settle(attempt, { core: readCore('removed'), publication: null }), RetainedObservation);
    await fixture.close(first);
    await rm(join(path, 'objects', basis.slice(0, 2), basis.slice(2)));

    const fresh = await fixture.open(path, { limit: 2 });
    expect(await fresh.service.resolve(coordinate)).toEqual(new ObservationUnavailable('evidence-unreadable'));
  });
});
