import { clearInterval, setInterval } from 'node:timers';
import { afterEach, describe, expect, it } from 'vitest';
import ObservationAdmitted from '../../../../src/domain/services/custody/ObservationAdmitted.ts';
import type ObservationAttempt from '../../../../src/domain/services/custody/ObservationAttempt.ts';
import ObservationIndeterminate from '../../../../src/domain/services/custody/ObservationIndeterminate.ts';
import ObservationKnownUnpublished from '../../../../src/domain/services/custody/ObservationKnownUnpublished.ts';
import ObservationPrepared from '../../../../src/domain/services/custody/ObservationPrepared.ts';
import ObservationPublicationEvidence from '../../../../src/domain/services/custody/ObservationPublicationEvidence.ts';
import ObservationPublicationPermission from '../../../../src/domain/services/custody/ObservationPublicationPermission.ts';
import ObservationReconcileOnly from '../../../../src/domain/services/custody/ObservationReconcileOnly.ts';
import ObservationUnretained from '../../../../src/domain/services/custody/ObservationUnretained.ts';
import ObservationReconciled from '../../../../src/domain/services/custody/ObservationReconciled.ts';
import ObservationSupportLimits from '../../../../src/domain/services/custody/ObservationSupportLimits.ts';
import ObservationRefused from '../../../../src/domain/services/custody/ObservationRefused.ts';
import ResolvedObservation from '../../../../src/domain/services/custody/ResolvedObservation.ts';
import RetainedObservation from '../../../../src/domain/services/custody/RetainedObservation.ts';
import { OBSERVATION_CARRIER_BATCH } from '../../../../src/infrastructure/adapters/GitCasObservationSupportAdapter.ts';
import FaultingObservationCustody from '../../../helpers/FaultingObservationCustody.ts';
import ObservationCustodyFixture, {
  type OpenedCustody,
  FIXTURE_ATTEMPT,
  basisTree,
  narrowed,
  readBindings,
  readCore,
  sources,
  writeBindings,
  writeCore,
  writerCommits,
  preparationOf,
} from '../../../helpers/ObservationCustodyFixture.ts';

const fixture = new ObservationCustodyFixture();

afterEach(async () => {
  await fixture.dispose();
});

type Faulted = OpenedCustody & { readonly faults: FaultingObservationCustody };

async function faulted(path: string, limit: number): Promise<Faulted> {
  let faults: FaultingObservationCustody | null = null;
  const opened = await fixture.open(path, {
    limit,
    wrap: (custody) => {
      faults = new FaultingObservationCustody(custody);
      return faults;
    },
  });
  return { ...opened, faults: narrowed(faults, FaultingObservationCustody) };
}

/** A producer's effect: counted, and performed only with a fresh permission. */
class CountedEffect {
  invocations = 0;
  readonly #commit: string;

  constructor(commit: string) {
    this.#commit = commit;
  }

  perform(outcome: object): string | null {
    if (!(outcome instanceof ObservationPublicationPermission)) {
      return null;
    }
    this.invocations += 1;
    return this.#commit;
  }
}

async function preparedWrite(opened: Faulted, label: string, path: string): Promise<ObservationAttempt> {
  const { attempt } = narrowed(await opened.service.begin(writeBindings(basisTree(path, label))), ObservationAdmitted);
  narrowed(await opened.service.prepare(attempt, sources()), ObservationPrepared);
  return attempt;
}

describe.each(['sha1', 'sha256'])('observation custody at durable fault boundaries (%s)', (format) => {
  it('never admits twice after a reservation acknowledgement is lost', async () => {
    const path = await fixture.repository(format);
    const opened = await faulted(path, 1);
    const bindings = readBindings(basisTree(path, 'reserve'));
    const attemptId = FIXTURE_ATTEMPT;
    opened.faults.inject({ operation: 'reserve', when: 'after' });
    expect(await opened.service.resume(attemptId, bindings)).toBeInstanceOf(ObservationIndeterminate);
    expect(narrowed(await opened.service.resume(attemptId, bindings), ObservationAdmitted).phase).toBe('reserved');
    expect(await opened.service.begin(readBindings(basisTree(path, 'second')))).toEqual(new ObservationRefused('capacity-full'));
  });

  it('recovers a preparation whose acknowledgement was lost, keeping its original roots', async () => {
    const path = await fixture.repository(format);
    const opened = await faulted(path, 2);
    const { attempt } = narrowed(await opened.service.begin(readBindings(basisTree(path, 'prepare', writerCommits(path, 70)))), ObservationAdmitted);
    opened.faults.inject({ operation: 'prepare', when: 'after' });
    expect(await opened.service.prepare(attempt, sources())).toBeInstanceOf(ObservationIndeterminate);
    const recovered = narrowed(await opened.service.prepare(attempt, sources()), ObservationPrepared);
    expect(recovered.roots.parents).toHaveLength(1);
    const retained = narrowed(await opened.service.settle(attempt, { core: readCore('p'), publication: null }), RetainedObservation);
    expect(await opened.service.resolve(retained.coordinate)).toBeInstanceOf(ResolvedObservation);
  });

  it('re-verifies a recovered unarmed preparation under current limits, and never arms what fails', async () => {
    const path = await fixture.repository(format);
    const first = await faulted(path, 2);
    const bindings = readBindings(basisTree(path, 'lowered', writerCommits(path, 3)));
    const { attempt } = narrowed(await first.service.begin(bindings), ObservationAdmitted);
    first.faults.inject({ operation: 'prepare', when: 'after' });
    expect(await first.service.prepare(attempt, sources())).toBeInstanceOf(ObservationIndeterminate);
    await fixture.close(first);

    const limits = new ObservationSupportLimits({ writers: 8, dependencies: 8, frontierBytes: 1024 * 1024, work: 2 });
    const lowered = await fixture.open(path, { limit: 2, limits });
    const resumed = narrowed(await lowered.service.resume(attempt.identity.attemptId, bindings), ObservationAdmitted);
    expect(resumed.phase).toBe('prepared');
    expect(await lowered.service.prepare(resumed.attempt, sources())).toEqual(new ObservationRefused('work-limit'));
    await fixture.close(lowered);

    const restored = await fixture.open(path, { limit: 2 });
    narrowed(await restored.service.prepare(resumed.attempt, sources()), ObservationPrepared);
  });

  it('settles a publication an earlier process made, after its arm acknowledgement was lost', async () => {
    const path = await fixture.repository(format);
    const opened = await faulted(path, 2);
    const attempt = await preparedWrite(opened, 'lost-ack', path);
    opened.faults.inject({ operation: 'arm', when: 'after' });
    expect(await opened.service.authorizePublication(preparationOf(attempt))).toBeInstanceOf(ObservationIndeterminate);
    const publication = new ObservationPublicationEvidence('writer-1', writerCommits(path, 1)[0] ?? '');
    const retained = narrowed(await opened.service.settle(attempt, { core: writeCore('lost-ack'), publication }), RetainedObservation);
    expect(await opened.service.resolve(retained.coordinate)).toBeInstanceOf(ResolvedObservation);
  });

  it('reuses the verified construction when preparation never reached the store', async () => {
    const path = await fixture.repository(format);
    const opened = await faulted(path, 2);
    const { attempt } = narrowed(await opened.service.begin(readBindings(basisTree(path, 'unsent', writerCommits(path, 70)))), ObservationAdmitted);
    opened.faults.inject({ operation: 'prepare', when: 'before' });
    expect(await opened.service.prepare(attempt, sources())).toBeInstanceOf(ObservationIndeterminate);
    const published = opened.carriersPublished();
    narrowed(await opened.service.prepare(attempt, sources()), ObservationPrepared);
    expect(opened.carriersPublished()).toBe(published);
  });

  it.each(['before', 'after'] as const)('performs no effect when an arm acknowledgement is lost %s', async (when) => {
    const path = await fixture.repository(format);
    const opened = await faulted(path, 2);
    const attempt = await preparedWrite(opened, `arm-${when}`, path);
    const effect = new CountedEffect(writerCommits(path, 1)[0] ?? '');
    opened.faults.inject({ operation: 'arm', when });
    expect(effect.perform(await opened.service.authorizePublication(preparationOf(attempt)))).toBeNull();
    expect(effect.invocations).toBe(0);
    if (when === 'after') {
      expect(await opened.service.authorizePublication(preparationOf(attempt))).toBeInstanceOf(ObservationReconcileOnly);
      expect(effect.invocations).toBe(0);
      expect(await opened.service.cancel(attempt)).toBeInstanceOf(ObservationReconcileOnly);
    } else {
      expect(effect.perform(await opened.service.authorizePublication(preparationOf(attempt)))).not.toBeNull();
      expect(effect.invocations).toBe(1);
    }
  });

  it('completes a settlement whose acknowledgement was lost, without a second effect', async () => {
    const path = await fixture.repository(format);
    const opened = await faulted(path, 2);
    const attempt = await preparedWrite(opened, 'settle', path);
    const effect = new CountedEffect(writerCommits(path, 1)[0] ?? '');
    const commit = effect.perform(await opened.service.authorizePublication(preparationOf(attempt))) ?? '';
    const outcome = { core: writeCore('settled'), publication: new ObservationPublicationEvidence('writer-1', commit) };
    opened.faults.inject({ operation: 'settle', when: 'after' });
    expect(await opened.service.settle(attempt, outcome)).toEqual(new ObservationUnretained(attempt, 'settlement-unacknowledged'));
    expect(narrowed(await opened.service.reconcile(attempt), ObservationReconciled).phase).toBe('settled');
    const retained = narrowed(await opened.service.settle(attempt, outcome), RetainedObservation);
    expect(await opened.service.resolve(retained.coordinate)).toBeInstanceOf(ResolvedObservation);
    expect(effect.invocations).toBe(1);

    const different = { core: writeCore('rewritten'), publication: outcome.publication };
    expect(await opened.service.settle(attempt, different)).toEqual(new ObservationUnretained(attempt, 'settlement-conflict'));
  });

  it('does not treat a cancel it could not confirm as known-unpublished', async () => {
    const path = await fixture.repository(format);
    const opened = await faulted(path, 2);
    const attempt = await preparedWrite(opened, 'cancel', path);
    opened.faults.inject({ operation: 'cancel', when: 'after' });
    expect(await opened.service.cancel(attempt)).toBeInstanceOf(ObservationIndeterminate);
    expect(await opened.service.cancel(attempt)).toBeInstanceOf(ObservationKnownUnpublished);
    expect(await opened.service.authorizePublication(preparationOf(attempt))).toBeInstanceOf(ObservationKnownUnpublished);
  });

  it('lets a late read settlement lose to a cancel that already won', async () => {
    const path = await fixture.repository(format);
    const opened = await faulted(path, 2);
    const { attempt } = narrowed(await opened.service.begin(readBindings(basisTree(path, 'late'))), ObservationAdmitted);
    narrowed(await opened.service.prepare(attempt, sources()), ObservationPrepared);
    expect(await opened.service.cancel(attempt)).toBeInstanceOf(ObservationKnownUnpublished);
    expect(await opened.service.settle(attempt, { core: readCore('late'), publication: null })).toBeInstanceOf(ObservationKnownUnpublished);
    expect(await opened.service.prepare(attempt, sources())).toBeInstanceOf(ObservationKnownUnpublished);
  });

  it('stops and awaits its owned builder before cancelling', async () => {
    const path = await fixture.repository(format);
    const opened = await faulted(path, 2);
    const { attempt } = narrowed(await opened.service.begin(writeBindings(basisTree(path, 'owned', writerCommits(path, 200)))), ObservationAdmitted);
    let reachedFirstCarrier: () => void = () => undefined;
    const firstCarrier = new Promise<void>((resolve) => {
      reachedFirstCarrier = resolve;
    });
    const watching = setInterval(() => {
      if (opened.carriersPublished() > 0) {
        reachedFirstCarrier();
      }
    }, 1);
    const preparing = opened.service.prepare(attempt, sources());
    await firstCarrier;
    clearInterval(watching);
    const cancelled = await opened.service.cancel(attempt);
    const carriersAtCancel = opened.carriersPublished();
    expect(cancelled).toBeInstanceOf(ObservationKnownUnpublished);
    expect(await preparing).toEqual(new ObservationRefused('cancelled'));
    expect(opened.carriersPublished()).toBe(carriersAtCancel);
    expect(carriersAtCancel).toBeLessThan(4);
    expect(await opened.service.authorizePublication(preparationOf(attempt))).toBeInstanceOf(ObservationKnownUnpublished);
  });

  it('never publishes more than one batch of heads in a carrier', async () => {
    const path = await fixture.repository(format);
    const opened = await faulted(path, 2);
    const { attempt } = narrowed(await opened.service.begin(readBindings(basisTree(path, 'bounded', writerCommits(path, 200)))), ObservationAdmitted);
    narrowed(await opened.service.prepare(attempt, sources()), ObservationPrepared);
    expect(opened.carriersPublished()).toBe(Math.ceil(200 / OBSERVATION_CARRIER_BATCH));
  });

  it('changes nothing when a reservation never reaches the store', async () => {
    const path = await fixture.repository(format);
    const opened = await faulted(path, 2);
    const bindings = readBindings(basisTree(path, 'before-reserve'));
    opened.faults.inject({ operation: 'reserve', when: 'before' });
    expect(await opened.service.resume(FIXTURE_ATTEMPT, bindings)).toBeInstanceOf(ObservationIndeterminate);
    expect(narrowed(await opened.service.resume(FIXTURE_ATTEMPT, bindings), ObservationAdmitted).phase).toBe('reserved');
  });

  it.each(['settle', 'cancel', 'reconcile'] as const)('changes nothing when %s never reaches the store', async (operation) => {
    const path = await fixture.repository(format);
    const opened = await faulted(path, 2);
    const { attempt } = narrowed(await opened.service.begin(readBindings(basisTree(path, `before-${operation}`))), ObservationAdmitted);
    narrowed(await opened.service.prepare(attempt, sources()), ObservationPrepared);
    opened.faults.inject({ operation, when: 'before' });
    const outcome = { core: readCore('before'), publication: null };
    const faultedStep = {
      settle: async () => await opened.service.settle(attempt, outcome),
      cancel: async () => await opened.service.cancel(attempt),
      reconcile: async () => await opened.service.reconcile(attempt),
    };
    expect(await faultedStep[operation]()).toBeInstanceOf(ObservationIndeterminate);
    const retained = narrowed(await opened.service.settle(attempt, outcome), RetainedObservation);
    expect(await opened.service.resolve(retained.coordinate)).toBeInstanceOf(ResolvedObservation);
  });

  it('completes reconciliation whose acknowledgement was lost', async () => {
    const path = await fixture.repository(format);
    const opened = await faulted(path, 2);
    const { attempt } = narrowed(await opened.service.begin(readBindings(basisTree(path, 'after-reconcile'))), ObservationAdmitted);
    narrowed(await opened.service.prepare(attempt, sources()), ObservationPrepared);
    opened.faults.inject({ operation: 'reconcile', when: 'after' });
    expect(await opened.service.reconcile(attempt)).toBeInstanceOf(ObservationIndeterminate);
    expect(narrowed(await opened.service.reconcile(attempt), ObservationReconciled).phase).toBe('prepared');
  });

  it('surfaces a publication reported against a cancellation that won', async () => {
    const path = await fixture.repository(format);
    const opened = await faulted(path, 2);
    const attempt = await preparedWrite(opened, 'contradicted', path);
    expect(await opened.service.cancel(attempt)).toBeInstanceOf(ObservationKnownUnpublished);
    const outcome = await opened.service.settle(attempt, {
      core: writeCore('c'), publication: new ObservationPublicationEvidence('writer-1', writerCommits(path, 1)[0] ?? ''),
    });
    expect(outcome).toBeInstanceOf(ObservationIndeterminate);
    expect(outcome).toMatchObject({ cause: { code: 'E_OBSERVATION_CUSTODY_CONTRADICTED' } });
  });
});
