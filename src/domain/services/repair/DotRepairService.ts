import WarpError from '../../errors/WarpError.ts';
import type DotCollision from '../../repair/DotCollision.ts';
import DotRepairRecord, { type DotRepairPolicy } from '../../repair/DotRepairRecord.ts';
import { computeChecksum } from '../../utils/checksumUtils.ts';
import { REPAIR_WRITER_PREFIX } from '../../utils/WriterId.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type DotRepairStorePort from '../../../ports/DotRepairStorePort.ts';
import type { PatchSession } from '../../warp/PatchSession.ts';

const REPAIR_KIND = 'git-warp-dot-repair';
const LANE_SCOPE = 'lane';

export type DotRepairMember = Readonly<{ target: string; visible: boolean; commits: readonly string[] }>;

export type DotRepairOption = Readonly<{ policy: DotRepairPolicy; reAdds: readonly string[] | 'selected'; consequence: string }>;

/** One recorded collision, what each repair policy would do to it, and whether a repair already resolved it. */
export type DotRepairPreview = Readonly<{
  dot: string;
  scope: string;
  members: readonly DotRepairMember[];
  repairable: boolean;
  resolvedBy: string | null;
  options: readonly DotRepairOption[];
}>;

export type DotRepairPlan = Readonly<{ dot: string; policy: DotRepairPolicy; targets?: readonly string[] }>;

type VisibleState = Readonly<{
  nodeAlive: { contains(element: string): boolean };
  edgeAlive: { contains(element: string): boolean };
}>;

/** The runtime surface a repair reads and writes through. */
export type DotRepairHost = Readonly<{
  graphName: string;
  writerId: string;
  crypto: CryptoPort;
  store: DotRepairStorePort | null;
  materialize: () => Promise<VisibleState>;
  getFrontier: () => Promise<Map<string, string>>;
  commitAs: (writerId: string, build: (patch: PatchSession) => void) => Promise<string>;
  /** The writer's patch commits, oldest first. */
  writerCommits: (writerId: string) => Promise<readonly string[]>;
}>;

/**
 * Explicit, previewed and recorded repair of duplicate dots (#1022). A
 * repair appends ordinary patches under `repair.<writer>`, never rewriting
 * history. Re-adding members with fresh dots protects them from removes of
 * the shared dot, which also means a remove an offline replica already holds
 * no longer hides them: the preview says so before anything is written.
 */
export default class DotRepairService {
  readonly #host: DotRepairHost;

  constructor(host: DotRepairHost) {
    this.#host = host;
  }

  async preview(): Promise<readonly DotRepairPreview[]> {
    const store = this.#requireStore();
    const [collisions, repairs, state] = await Promise.all([store.collisions(), store.repairs(), this.#host.materialize()]);
    return collisions.map((collision) => {
      const repairable = collision.scope === LANE_SCOPE;
      const members = membersOf(collision, repairable ? state : null);
      return Object.freeze({
        dot: collision.dot,
        scope: collision.scope,
        members,
        repairable,
        resolvedBy: repairs.find((repair) => repair.dot === collision.dot && repair.status === 'applied')?.repairId ?? null,
        options: repairable ? optionsFor(collision.dot, members) : [],
      });
    });
  }

  async apply(plan: DotRepairPlan): Promise<DotRepairRecord> {
    const store = this.#requireStore();
    const collision = (await store.collisions()).find((candidate) => candidate.dot === plan.dot && candidate.scope === LANE_SCOPE);
    if (collision === undefined) {
      throw repairError(`No lane collision on dot ${plan.dot} is recorded`, 'E_DOT_REPAIR_UNKNOWN', { dot: plan.dot });
    }
    const targets = targetsFor(plan, membersOf(collision, await this.#host.materialize()));
    const repairWriter = `${REPAIR_WRITER_PREFIX}${this.#host.writerId}`;
    const repairId = await computeChecksum({
      kind: REPAIR_KIND, graph: this.#host.graphName, dot: plan.dot, policy: plan.policy, targets, repairWriter,
    }, this.#host.crypto);
    const pending = await this.#pending(store, { repairId, dot: plan.dot, policy: plan.policy, targets, repairWriter });
    if (pending.status === 'applied') { return pending; }
    const commit = await this.#committedSince(pending) ?? await this.#host.commitAs(repairWriter, (patch) => {
      for (const target of targets) { addTarget(patch, target); }
    });
    const applied = new DotRepairRecord({ ...pending, status: 'applied', commits: [commit] });
    await store.writeRepair(applied);
    return applied;
  }

  /** The existing record, or a new pending one written before anything is committed. */
  async #pending(
    store: DotRepairStorePort,
    repair: Pick<DotRepairRecord, 'repairId' | 'dot' | 'policy' | 'targets' | 'repairWriter'>,
  ): Promise<DotRepairRecord> {
    const existing = await store.readRepair(repair.repairId);
    if (existing !== null) { return existing; }
    const pending = new DotRepairRecord({
      ...repair,
      inputFrontier: Object.fromEntries(await this.#host.getFrontier()),
      status: 'pending',
      parentHead: (await this.#host.writerCommits(repair.repairWriter)).at(-1) ?? null,
      commits: [],
    });
    await store.writeRepair(pending);
    return pending;
  }

  /** The repair commit an interrupted apply already made: the one right after the recorded parent. */
  async #committedSince(pending: DotRepairRecord): Promise<string | null> {
    const commits = await this.#host.writerCommits(pending.repairWriter);
    const index = pending.parentHead === null ? 0 : commits.indexOf(pending.parentHead) + 1;
    return commits[index] ?? null;
  }

  #requireStore(): DotRepairStorePort {
    if (this.#host.store === null) {
      throw repairError('This runtime has no repair store', 'E_DOT_REPAIR_UNAVAILABLE', {});
    }
    return this.#host.store;
  }
}

function membersOf(collision: DotCollision, state: VisibleState | null): DotRepairMember[] {
  return collision.members.map((target) => Object.freeze({
    target,
    visible: state !== null && (target.includes('\0') ? state.edgeAlive.contains(target) : state.nodeAlive.contains(target)),
    commits: collision.sites.filter((site) => site.target === target).map((site) => site.commit),
  }));
}

function optionsFor(dot: string, members: readonly DotRepairMember[]): DotRepairOption[] {
  return [
    {
      policy: 'separate',
      reAdds: members.filter((member) => member.visible).map((member) => member.target),
      consequence: `Every visible member gets its own dot, and visible state does not change. Later removes no longer hide other members. A remove that observed only ${dot}, including one an offline replica already holds, no longer hides any member.`,
    },
    {
      policy: 'restore',
      reAdds: 'selected',
      consequence: `The selected members become visible with their own dot, including members a remove of ${dot} already hid. Unselected members keep only ${dot}, so the next remove of it hides them.`,
    },
  ];
}

function targetsFor(plan: DotRepairPlan, members: readonly DotRepairMember[]): string[] {
  return plan.policy === 'separate' ? visibleTargets(plan.dot, members) : selectedTargets(plan, members);
}

function visibleTargets(dot: string, members: readonly DotRepairMember[]): string[] {
  const visible = members.filter((member) => member.visible).map((member) => member.target);
  if (visible.length === 0) {
    throw repairError(`No member of ${dot} is visible to separate; use restore`, 'E_DOT_REPAIR_EMPTY', { dot });
  }
  return visible;
}

function selectedTargets(plan: DotRepairPlan, members: readonly DotRepairMember[]): string[] {
  const known = new Set(members.map((member) => member.target));
  const selected = [...new Set(plan.targets ?? [])].sort();
  if (selected.length === 0 || selected.some((target) => !known.has(target))) {
    throw repairError(`restore needs targets that share ${plan.dot}`, 'E_DOT_REPAIR_TARGETS', { dot: plan.dot, targets: selected });
  }
  return selected;
}

function addTarget(patch: PatchSession, target: string): void {
  const [from, to, label, ...rest] = target.split('\0');
  if (to !== undefined && label !== undefined && from !== undefined && rest.length === 0) {
    patch.addEdge(from, to, label);
    return;
  }
  patch.addNode(target);
}

function repairError(message: string, code: string, context: Record<string, string | readonly string[]>): WarpError {
  return new WarpError(message, code, { context });
}
