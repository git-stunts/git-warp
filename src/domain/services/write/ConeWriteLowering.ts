import type CryptoPort from '../../../ports/CryptoPort.ts';
import { coneObstructionFailure } from '../../api/ConeObstructionFailure.ts';
import { isContentIntentDescriptor, type default as Intent } from '../../api/Intent.ts';
import type IntentSequence from '../../api/IntentSequence.ts';
import { applyIntentSequenceToPatch } from '../../api/IntentSequenceRuntime.ts';
import { inspectPublishedIntentSequence } from '../../api/PublishedIntentSequence.ts';
import UnpublishedWriteReceipt from '../../api/UnpublishedWriteReceipt.ts';
import type WarpWriteGrant from '../../api/WarpWriteGrant.ts';
import WriteOccurrence from '../../api/WriteOccurrence.ts';
import { invalidObservationMetadata, operationalWriteFailure } from '../../api/WriteRuntime.ts';
import ConeStoreUnavailableError from '../../errors/ConeStoreUnavailableError.ts';
import WarpError from '../../errors/WarpError.ts';
import WriteHistoryCorruptError from '../../errors/WriteHistoryCorruptError.ts';
import { canonicalStringify } from '../../utils/canonicalStringify.ts';
import { textEncode } from '../../utils/bytes.ts';
import { readPatchBuilderCausalBasis } from '../admission/PatchBuilderCausalBasis.ts';
import type ConeBasis from '../cone/ConeBasis.ts';
import type ConeLaneBasis from '../cone/ConeLaneBasis.ts';
import ConeObstruction from '../cone/ConeObstruction.ts';
import type ConeWritePremise from '../cone/ConeWritePremise.ts';
import ConeWriteTargets, { type ConeWriteEdgeTarget } from '../cone/ConeWriteTargets.ts';
import type ContentStagingAuthority from '../ContentStagingAuthority.ts';
import ObservationBindings from '../custody/ObservationBindings.ts';
import ObservationBudget from '../custody/ObservationBudget.ts';
import ObservationDependencyClaim from '../custody/ObservationDependencyClaim.ts';
import ObservationEvidenceBinding from '../custody/ObservationEvidenceBinding.ts';
import { digestOf } from '../custody/observationDigestOf.ts';
import ObservationQuestion from '../custody/ObservationQuestion.ts';
import ObservationWritePremise from '../custody/ObservationWritePremise.ts';
import type { PatchBuilder } from '../PatchBuilder.ts';
import ConeWriteKnowledge from './ConeWriteKnowledge.ts';
import LoweredConeWrite from './LoweredConeWrite.ts';
import PatchEntryFold from './PatchEntryFold.ts';
import { writeRaceOf } from './writeRaceOf.ts';

/** The registered purpose every write's premises are read under. */
export const WRITE_PURPOSE = 'git-warp:purpose/write-admission/v1';
const WRITE_QUESTION = new ObservationQuestion('git-warp:question/write-premise', 1);
const WRITE_LAW = 'git-warp:admission-law/cone-write/v1';
const BASIS_UNAVAILABLE = 'write-basis-unavailable';
const PREMISE_UNAVAILABLE = 'write-premise-unavailable';

type LoweringRequest = {
  readonly writer: string;
  readonly sequence: IntentSequence;
  readonly grant: WarpWriteGrant;
};

/**
 * Reads a write's premises from one fixed cone basis and lowers its intents
 * (#1051). Nothing here reserves or publishes, so a receipt it returns is known unpublished.
 */
export default class ConeWriteLowering {
  readonly #graph: string;
  readonly #cone: ConeLaneBasis;
  readonly #openPatch: (writer: string) => Promise<PatchBuilder>;
  readonly #content: ContentStagingAuthority;
  readonly #crypto: CryptoPort;
  readonly #knowledge = new ConeWriteKnowledge();

  constructor(fields: {
    readonly graph: string;
    readonly cone: ConeLaneBasis;
    readonly openPatch: (writer: string) => Promise<PatchBuilder>;
    readonly content: ContentStagingAuthority;
    readonly crypto: CryptoPort;
  }) {
    this.#graph = fields.graph;
    this.#cone = fields.cone;
    this.#openPatch = fields.openPatch;
    this.#content = fields.content;
    this.#crypto = fields.crypto;
    Object.freeze(this);
  }

  async lower(request: LoweringRequest): Promise<LoweredConeWrite | UnpublishedWriteReceipt> {
    const refused = this.#overBudget(request);
    if (refused !== null) {
      return refused;
    }
    const opened = await this.#opened(request.writer);
    if (opened instanceof UnpublishedWriteReceipt) {
      return opened;
    }
    const { builder, premise } = opened;
    try {
      return await this.#loweredOnto({ request, builder, premise });
    } catch (error) {
      if (error instanceof WarpError) {
        return this.#loweringFailure(request.writer, error);
      }
      throw error;
    }
  }

  /**
   * Nothing has been reserved, so an unavailable store here leaves a write known not to
   * have published (#1079). Any other failure, a defect or corruption, rejects.
   */
  async #opened(writer: string): Promise<{ readonly builder: PatchBuilder; readonly premise: ConeWritePremise } | UnpublishedWriteReceipt> {
    try {
      const builder = await this.#openPatch(writer);
      const premise = await this.#cone.writePremise();
      return premise instanceof ConeObstruction ? this.#unpublished(writer, coneObstructionFailure(premise)) : { builder, premise };
    } catch (error) {
      if (error instanceof ConeStoreUnavailableError) {
        return new UnpublishedWriteReceipt({ graph: this.#graph, writer, cause: BASIS_UNAVAILABLE });
      }
      throw error;
    }
  }

  async #loweredOnto(run: {
    readonly request: LoweringRequest;
    readonly builder: PatchBuilder;
    readonly premise: ConeWritePremise;
  }): Promise<LoweredConeWrite | UnpublishedWriteReceipt> {
    const { request, builder, premise } = run;
    const targets = coneWriteTargets(request.sequence);
    const seen = this.#knowledge.seen(premise.from);
    const observed = targets.readsRecords() ? premise.basis : seen;
    const unread = await this.#premiseRead({ writer: request.writer, builder, targets, premise, observed });
    if (unread !== null) {
      return unread;
    }
    applyIntentSequenceToPatch(request.sequence, builder, this.#content);
    if (builder.ops.length > request.grant.budget.work) {
      return new UnpublishedWriteReceipt({ graph: this.#graph, writer: request.writer, cause: 'budget-exhausted' });
    }
    const races = builder.coneWriteRaces();
    const predecessor = readPatchBuilderCausalBasis(builder).expectedParentSha;
    return new LoweredConeWrite({
      writer: request.writer, builder, races: races.plurality.map(writeRaceOf),
      admission: races.isEmpty() ? 'derived' : 'plural',
      bindings: await this.#bindings({ request, basis: premise.stored.revision, predecessor, observed }),
      occurrences: occurrencesOf(request.sequence, builder),
      fold: new PatchEntryFold(this.#cone, predecessor),
    });
  }

  /**
   * Reads the premise records from the store (#1079). Nothing is reserved yet, so an
   * unavailable store leaves a write known not to have published. An expected write
   * refusal keeps its own cause. A defect, a broken invariant or corruption rejects:
   * corrupt patch history becomes `WriteHistoryCorruptError`, not a missing-basis refusal.
   */
  async #premiseRead(run: {
    readonly writer: string;
    readonly builder: PatchBuilder;
    readonly targets: ConeWriteTargets;
    readonly premise: ConeWritePremise;
    readonly observed: ConeBasis;
  }): Promise<UnpublishedWriteReceipt | null> {
    try {
      await run.builder.prepareConeWriteBasis(run.targets, run.premise, run.observed);
      return null;
    } catch (error) {
      if (error instanceof ConeStoreUnavailableError) {
        return new UnpublishedWriteReceipt({ graph: this.#graph, writer: run.writer, cause: PREMISE_UNAVAILABLE });
      }
      if (!(error instanceof WarpError)) {
        throw error;
      }
      return this.#premiseRefusal(run.writer, error);
    }
  }

  /** An expected write refusal keeps its own cause; corrupt history and anything else reject. */
  #premiseRefusal(writer: string, error: WarpError): UnpublishedWriteReceipt {
    if (invalidObservationMetadata(error)) {
      throw new WriteHistoryCorruptError(error);
    }
    const refused = this.#operational(writer, error);
    if (refused === null) {
      throw error;
    }
    return refused;
  }

  async #bindings(fields: {
    readonly request: LoweringRequest;
    readonly basis: string;
    readonly predecessor: string | null;
    readonly observed: ConeBasis;
  }): Promise<ObservationBindings> {
    const { writer, sequence, grant } = fields.request;
    const [intents, authority, law, observed] = await Promise.all([
      digestOf(this.#crypto, descriptorBytes(sequence)),
      digestOf(this.#crypto, textEncode(grant.authority)),
      digestOf(this.#crypto, textEncode(WRITE_LAW)),
      digestOf(this.#crypto, observedFrontierBytes(fields.observed, { writer, predecessor: fields.predecessor })),
    ]);
    return new ObservationBindings({
      basis: fields.basis, observer: `writer:${writer}`, question: WRITE_QUESTION, purpose: WRITE_PURPOSE,
      budget: new ObservationBudget(grant.budget),
      evidence: [
        new ObservationEvidenceBinding('authority', authority),
        new ObservationEvidenceBinding('law', law),
        // A blind write may observe less than the retained basis: this is the patch's own frontier.
        new ObservationEvidenceBinding('dependency', observed),
      ],
      dependencies: ObservationDependencyClaim.NONE,
      writePremise: new ObservationWritePremise({ intents, writerId: writer, predecessor: fields.predecessor }),
    });
  }

  #overBudget({ writer, sequence, grant }: LoweringRequest): UnpublishedWriteReceipt | null {
    const targets = coneWriteTargets(sequence);
    const records = targets.nodes.length + targets.edges.length + targets.registerNodes.length;
    const within = records <= grant.budget.records && descriptorBytes(sequence).length <= grant.budget.bytes;
    return within ? null : new UnpublishedWriteReceipt({ graph: this.#graph, writer, cause: 'budget-exhausted' });
  }

  #loweringFailure(writer: string, error: WarpError): UnpublishedWriteReceipt {
    const refused = this.#operational(writer, error);
    if (refused === null) {
      throw error;
    }
    return refused;
  }

  /** An expected write refusal, with its own cause and repair; null for any other failure. */
  #operational(writer: string, error: WarpError): UnpublishedWriteReceipt | null {
    const failure = operationalWriteFailure(error);
    return failure === null
      ? null
      : new UnpublishedWriteReceipt({ graph: this.#graph, writer, cause: failure.reason.code, repairHints: failure.repairHints });
  }

  #unpublished(writer: string, failure: ReturnType<typeof coneObstructionFailure>): UnpublishedWriteReceipt {
    return new UnpublishedWriteReceipt({ graph: this.#graph, writer, cause: failure.reason, repairHints: failure.repairHints });
  }
}

/** The frontier the patch records: what was observed, with the writer's own head pinned to its predecessor. */
function observedFrontierBytes(observed: ConeBasis, own: { readonly writer: string; readonly predecessor: string | null }): Uint8Array {
  const heads = new Map(observed.writerHeads());
  if (own.predecessor === null) {
    heads.delete(own.writer);
  } else {
    heads.set(own.writer, own.predecessor);
  }
  return textEncode(canonicalStringify(Object.fromEntries(heads)));
}

function descriptorBytes(sequence: IntentSequence): Uint8Array {
  return textEncode(canonicalStringify(sequence.descriptor));
}

/** An intent may appear twice, so each occurrence claims the next position its intent holds. */
function occurrencesOf(sequence: IntentSequence, builder: PatchBuilder): readonly WriteOccurrence[] {
  let position = -1;
  return inspectPublishedIntentSequence(sequence, builder.build()).map(({ intent, subject }) => {
    position = sequence.intents.indexOf(intent, position + 1);
    return new WriteOccurrence(position, subject);
  });
}

/** The entities a write must observe before lowering, read from cone records. */
function coneWriteTargets(sequence: IntentSequence): ConeWriteTargets {
  const targets = sequence.intents.map(coneWriteTarget);
  return new ConeWriteTargets({
    nodes: targets.flatMap((target) => (typeof target === 'string' ? [target] : [])),
    edges: targets.flatMap((target) => (target === null || typeof target === 'string' ? [] : [target])),
    registerNodes: sequence.intents.flatMap((intent) => registerTarget(intent) ?? []),
  });
}

/** The node whose registers one intent sets by name: a property set, or an entity admission with a supplied subject. */
function registerTarget({ descriptor }: Intent): string | null {
  if (descriptor.kind === 'property.set') { return descriptor.subject; }
  return descriptor.kind === 'entity.add' && 'subject' in descriptor ? descriptor.subject : null;
}

/** The node or edge one intent must observe, or null for a blind intent. */
function coneWriteTarget({ descriptor }: Intent): string | ConeWriteEdgeTarget | null {
  if (descriptor.kind === 'node.remove') { return descriptor.subject; }
  if (descriptor.kind === 'edge.remove') { return descriptor; }
  if (!isContentIntentDescriptor(descriptor)) { return null; }
  return 'subject' in descriptor ? descriptor.subject : descriptor;
}
