import type CryptoPort from '../../../ports/CryptoPort.ts';
import { coneObstructionFailure } from '../../api/ConeObstructionFailure.ts';
import { isContentIntentDescriptor, type default as Intent } from '../../api/Intent.ts';
import type IntentSequence from '../../api/IntentSequence.ts';
import { applyIntentSequenceToPatch } from '../../api/IntentSequenceRuntime.ts';
import { inspectPublishedIntentSequence } from '../../api/PublishedIntentSequence.ts';
import UnpublishedWriteReceipt from '../../api/UnpublishedWriteReceipt.ts';
import type WarpWriteGrant from '../../api/WarpWriteGrant.ts';
import WriteOccurrence from '../../api/WriteOccurrence.ts';
import { operationalWriteFailure } from '../../api/WriteRuntime.ts';
import WarpError from '../../errors/WarpError.ts';
import { canonicalStringify } from '../../utils/canonicalStringify.ts';
import { textEncode } from '../../utils/bytes.ts';
import { readPatchBuilderCausalBasis } from '../admission/PatchBuilderCausalBasis.ts';
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
import LoweredConeWrite from './LoweredConeWrite.ts';
import PatchEntryFold from './PatchEntryFold.ts';
import { writeRaceOf } from './writeRaceOf.ts';

/** The registered purpose every write's premises are read under. */
export const WRITE_PURPOSE = 'git-warp:purpose/write-admission/v1';
const WRITE_QUESTION = new ObservationQuestion('git-warp:question/write-premise', 1);
const WRITE_LAW = 'git-warp:admission-law/cone-write/v1';

type LoweringRequest = {
  readonly writer: string;
  readonly sequence: IntentSequence;
  readonly grant: WarpWriteGrant;
};

/**
 * Reads a write's premises from one fixed cone basis and lowers its intents
 * (#1051). Nothing here reserves or publishes, so every failure is known unpublished.
 */
export default class ConeWriteLowering {
  readonly #graph: string;
  readonly #cone: ConeLaneBasis;
  readonly #openPatch: (writer: string) => Promise<PatchBuilder>;
  readonly #content: ContentStagingAuthority;
  readonly #crypto: CryptoPort;

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
    const builder = await this.#openPatch(request.writer);
    const premise = await this.#cone.writePremise();
    if (premise instanceof ConeObstruction) {
      return this.#unpublished(request.writer, coneObstructionFailure(premise));
    }
    try {
      return await this.#loweredOnto({ request, builder, premise });
    } catch (error) {
      if (error instanceof WarpError) {
        return this.#loweringFailure(request.writer, error);
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
    await builder.prepareConeWriteBasis(coneWriteTargets(request.sequence), premise);
    applyIntentSequenceToPatch(request.sequence, builder, this.#content);
    if (builder.ops.length > request.grant.budget.work) {
      return new UnpublishedWriteReceipt({ graph: this.#graph, writer: request.writer, cause: 'budget-exhausted' });
    }
    const races = builder.coneWriteRaces();
    const predecessor = readPatchBuilderCausalBasis(builder).expectedParentSha;
    return new LoweredConeWrite({
      writer: request.writer, builder, races: races.plurality.map(writeRaceOf),
      admission: races.isEmpty() ? 'derived' : 'plural',
      bindings: await this.#bindings({ request, basis: premise.stored.revision, predecessor }),
      occurrences: occurrencesOf(request.sequence, builder),
      fold: new PatchEntryFold(this.#cone, predecessor),
    });
  }

  async #bindings(fields: {
    readonly request: LoweringRequest;
    readonly basis: string;
    readonly predecessor: string | null;
  }): Promise<ObservationBindings> {
    const { writer, sequence, grant } = fields.request;
    const [intents, authority, law] = await Promise.all([
      digestOf(this.#crypto, descriptorBytes(sequence)),
      digestOf(this.#crypto, textEncode(grant.authority)),
      digestOf(this.#crypto, textEncode(WRITE_LAW)),
    ]);
    return new ObservationBindings({
      basis: fields.basis, observer: `writer:${writer}`, question: WRITE_QUESTION, purpose: WRITE_PURPOSE,
      budget: new ObservationBudget(grant.budget),
      evidence: [new ObservationEvidenceBinding('authority', authority), new ObservationEvidenceBinding('law', law)],
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
    const failure = operationalWriteFailure(error);
    if (failure === null) {
      throw error;
    }
    return new UnpublishedWriteReceipt({ graph: this.#graph, writer, cause: failure.reason.code, repairHints: failure.repairHints });
  }

  #unpublished(writer: string, failure: ReturnType<typeof coneObstructionFailure>): UnpublishedWriteReceipt {
    return new UnpublishedWriteReceipt({ graph: this.#graph, writer, cause: failure.reason, repairHints: failure.repairHints });
  }
}

function descriptorBytes(sequence: IntentSequence): Uint8Array {
  return textEncode(canonicalStringify(sequence.descriptor));
}

function occurrencesOf(sequence: IntentSequence, builder: PatchBuilder): readonly WriteOccurrence[] {
  return inspectPublishedIntentSequence(sequence, builder.build())
    .map(({ intent, subject }) => new WriteOccurrence(sequence.intents.indexOf(intent), subject));
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
