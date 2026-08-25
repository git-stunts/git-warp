import type {
  ApplicationHandle,
  ApplicationHandleInput,
  AssetHandle,
  WorkspaceCheckpointResult,
  WorkspaceCompoundScope,
} from '@git-stunts/git-cas';
import type MaterializationRoots from '../../domain/materialization/MaterializationRoots.ts';
import MaterializationRoot from '../../domain/materialization/MaterializationRoot.ts';
import BundleHandle from '../../domain/storage/BundleHandle.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type { RetainMaterializationRequest } from '../../ports/MaterializationStorePort.ts';
import {
  MATERIALIZATION_DESCRIPTOR_MAX_BYTES,
  materializationDescriptorData,
} from './GitCasMaterializationDescriptor.ts';
import { materializationMembers } from './GitCasMaterializationBundle.ts';
import {
  replaceReplayBasisRoot,
  type default as GitCasMaterializationReplayBasis,
} from './GitCasMaterializationReplayBasis.ts';
import {
  replaceProvenanceSupportRoot,
  type default as GitCasMaterializationProvenanceSupport,
} from './GitCasMaterializationProvenanceSupport.ts';
import {
  requireCompoundRetention,
  type GitCasStagingWorkspace,
} from './GitCasMaterializationWorkspace.ts';
import { requireDescriptorSize } from './GitCasMaterializationStoreWitness.ts';
import { storageError } from './GitCasMaterializationStoreValidation.ts';

const MATERIALIZATION_DESCRIPTOR_AND_BUNDLE_OPERATIONS = 2;
const SUPPORT_ASSET_AND_BUNDLE_OPERATIONS = 2;
const SUPPORT_BUNDLE_MAX_MEMBERS = 1;

type SupportBundleRequest = Readonly<{
  members: Iterable<[string, ApplicationHandleInput]>;
  limits: Readonly<{ maxMembers: number }>;
}>;

type SupportAssetRequest = Parameters<GitCasStagingWorkspace['assets']['put']>[0];

type SupportRootPlan = Readonly<{
  asset: SupportAssetRequest;
  label: string;
  members: (asset: AssetHandle) => SupportBundleRequest['members'];
  replace: (roots: MaterializationRoots, bundle: ApplicationHandle) => MaterializationRoots;
}>;

type ScopedMaterializationPlan = Readonly<{
  request: RetainMaterializationRequest;
  stateHash: string | null;
  supportRoots: readonly SupportRootPlan[];
}>;

export type StagedMaterializationBundle = Readonly<{
  bundle: ApplicationHandle;
  roots: MaterializationRoots;
}>;

/** Stages support roots, descriptor, and terminal bundle in one bounded admission. */
export default class GitCasMaterializationBundleAdmission {
  readonly #codec: CodecPort;
  readonly #laneName: string;
  readonly #provenanceSupport: GitCasMaterializationProvenanceSupport;
  readonly #replayBasis: GitCasMaterializationReplayBasis;

  constructor(options: {
    codec: CodecPort;
    laneName: string;
    provenanceSupport: GitCasMaterializationProvenanceSupport;
    replayBasis: GitCasMaterializationReplayBasis;
  }) {
    this.#codec = options.codec;
    this.#laneName = options.laneName;
    this.#provenanceSupport = options.provenanceSupport;
    this.#replayBasis = options.replayBasis;
  }

  async stage(
    workspace: GitCasStagingWorkspace,
    request: RetainMaterializationRequest,
    stateHash: string | null
  ): Promise<StagedMaterializationBundle> {
    const supportRoots = this.#supportRootPlans(request);
    const plan = Object.freeze({ request, stateHash, supportRoots });
    const admitted = await workspace.batch({
      maxOperations: materializationAdmissionOperationBound(supportRoots),
      operation: async (scope) => await this.#stageInScope(scope, plan),
      retain: (prepared) => [prepared.bundle.toString()],
    });
    requireCompoundRetention(admitted.retention);
    requireRetainedTerminalBundle(admitted.retention, admitted.value.bundle);
    return admitted.value;
  }

  async #stageInScope(
    scope: WorkspaceCompoundScope,
    plan: ScopedMaterializationPlan
  ): Promise<StagedMaterializationBundle> {
    const roots = await stageSupportRoots(scope, plan.request.roots, plan.supportRoots);
    const descriptorPage = await this.#stageDescriptor(scope, { ...plan, roots });
    const bundles = await scope.bundles.putOrderedBatch({
      bundles: [{ members: materializationMembers(descriptorPage.toString(), roots) }],
    });
    return Object.freeze({
      bundle: requireSingleHandle(bundles, 'materialization bundle'),
      roots,
    });
  }

  async #stageDescriptor(
    scope: WorkspaceCompoundScope,
    plan: ScopedMaterializationPlan & Readonly<{ roots: MaterializationRoots }>
  ): Promise<ApplicationHandle> {
    const descriptorBytes = this.#codec.encode(
      materializationDescriptorData({
        coordinate: plan.request.coordinate,
        stateHash: plan.stateHash,
        laneName: this.#laneName,
        roots: plan.roots,
      })
    );
    requireDescriptorSize(descriptorBytes);
    const pages = await scope.pages.putBatch({
      pages: [{ source: descriptorBytes, maxBytes: MATERIALIZATION_DESCRIPTOR_MAX_BYTES }],
    });
    return requireSingleHandle(pages, 'descriptor page');
  }

  #supportRootPlans(request: RetainMaterializationRequest): readonly SupportRootPlan[] {
    const plans: SupportRootPlan[] = [];
    if (request.replayBasis !== undefined) {
      plans.push(this.#replayBasisPlan(request.replayBasis));
    }
    if (request.provenanceSupport !== undefined) {
      plans.push(this.#provenanceSupportPlan(request.provenanceSupport));
    }
    return Object.freeze(plans);
  }

  #replayBasisPlan(
    replayBasis: NonNullable<RetainMaterializationRequest['replayBasis']>
  ): SupportRootPlan {
    return Object.freeze({
      asset: this.#replayBasis.assetRequest(replayBasis),
      label: 'replay basis',
      members: (asset) => this.#replayBasis.bundleMembers(asset),
      replace: (roots, bundle) => replaceReplayBasisRoot(roots, retainedRoot(bundle)),
    });
  }

  #provenanceSupportPlan(
    provenance: NonNullable<RetainMaterializationRequest['provenanceSupport']>
  ): SupportRootPlan {
    return Object.freeze({
      asset: this.#provenanceSupport.assetRequest(provenance),
      label: 'provenance support',
      members: (asset) => this.#provenanceSupport.bundleMembers(asset),
      replace: (roots, bundle) => replaceProvenanceSupportRoot(roots, retainedRoot(bundle)),
    });
  }
}

async function stageSupportRoots(
  scope: WorkspaceCompoundScope,
  initial: MaterializationRoots,
  plans: readonly SupportRootPlan[]
): Promise<MaterializationRoots> {
  if (plans.length === 0) {
    return initial;
  }
  const assets = await scope.assets.putBatch({ assets: plans.map((plan) => plan.asset) });
  requireHandleCardinality(assets.length, plans.length, 'support asset');
  const bundles = await scope.bundles.putOrderedBatch({
    bundles: plans.map((plan, index) =>
      supportBundleRequest(plan, requireHandleAt(assets, index, `${plan.label} asset`))
    ),
  });
  requireHandleCardinality(bundles.length, plans.length, 'support bundle');
  return plans.reduce(
    (roots, plan, index) =>
      plan.replace(roots, requireHandleAt(bundles, index, `${plan.label} bundle`)),
    initial
  );
}

function supportBundleRequest(plan: SupportRootPlan, asset: AssetHandle): SupportBundleRequest {
  return Object.freeze({
    members: plan.members(asset),
    limits: { maxMembers: SUPPORT_BUNDLE_MAX_MEMBERS },
  });
}

function materializationAdmissionOperationBound(supportRoots: readonly SupportRootPlan[]): number {
  return MATERIALIZATION_DESCRIPTOR_AND_BUNDLE_OPERATIONS +
    Number(supportRoots.length > 0) * SUPPORT_ASSET_AND_BUNDLE_OPERATIONS;
}

function retainedRoot(handle: ApplicationHandle): MaterializationRoot {
  return MaterializationRoot.retained(new BundleHandle(handle.toString()));
}

function requireHandleAt<THandle extends ApplicationHandle>(
  handles: readonly THandle[],
  index: number,
  kind: string
): THandle {
  const handle = handles[index];
  if (handle === undefined) {
    throw storageError(`git-cas compound admission omitted the ${kind}`);
  }
  return handle;
}

function requireHandleCardinality(actual: number, expected: number, kind: string): void {
  if (actual !== expected) {
    throw storageError(`git-cas compound admission returned the wrong ${kind} count`);
  }
}

function requireSingleHandle<THandle extends ApplicationHandle>(
  handles: readonly THandle[],
  kind: string,
): THandle {
  const handle = requireHandleAt(handles, 0, kind);
  requireHandleCardinality(handles.length, 1, kind);
  return handle;
}

function requireRetainedTerminalBundle(
  retention: WorkspaceCheckpointResult,
  bundle: ApplicationHandle
): void {
  const expected = bundle.toString();
  if (!retention.handles.some((handle) => handle.toString() === expected)) {
    throw storageError('git-cas compound admission omitted the materialization bundle');
  }
}
