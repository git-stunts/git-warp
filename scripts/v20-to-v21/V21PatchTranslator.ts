import { Dot } from '../../src/domain/crdt/Dot.ts';
import VersionVector from '../../src/domain/crdt/VersionVector.ts';
import Patch from '../../src/domain/types/Patch.ts';
import EdgeAdd from '../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../src/domain/types/ops/EdgeRemove.ts';
import NodeAdd from '../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../src/domain/types/ops/NodeRemove.ts';
import type { PatchOp } from '../../src/domain/types/ops/unions.ts';
import type V21StrandView from './V21StrandView.ts';
import type { V21AddSite, V21Origin } from './V21StrandView.ts';

type Bag = Readonly<Record<string, unknown>>;

/** A strand whose legacy identities cannot be translated without guessing. */
export class V21TranslationBlocked extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

/**
 * Re-keys one legacy strand's patches into v21 identities (#1015).
 *
 * - Its own adds move from the legacy key `<name>` to its mint id.
 * - A remove's observed legacy dot fans out to every identity that dot
 *   denoted in the strand's view, so collateral deletions stay deleted.
 * - Context entries split by origin when a lane writer and a strand share a
 *   legacy key.
 * - Admission origins keep their original bytes; the provenance record
 *   resolves them.
 */
export default class V21PatchTranslator {
  readonly #view: V21StrandView;
  readonly #name: string;
  readonly #mints: ReadonlyMap<string, string>;

  /** `mints` maps each converted strand name in the view to its v21 mint id spelling. */
  constructor(view: V21StrandView, name: string, mints: ReadonlyMap<string, string>) {
    this.#view = view;
    this.#name = name;
    this.#mints = mints;
  }

  get ownMint(): string {
    return this.#mintOf(this.#name);
  }

  patch(patch: Patch): Patch {
    return new Patch({
      schema: patch.schema,
      writer: this.ownMint,
      lamport: patch.lamport,
      context: this.context(VersionVector.from(patch.context)),
      ops: patch.ops.map((op) => this.#op(op)),
      reads: patch.reads,
      writes: patch.writes,
      entityAdmissions: patch.entityAdmissions,
      observedFrontier: patch.observedFrontier,
    });
  }

  /** A queued intent's stored JSON, translated the same way. */
  intent(raw: Bag): Bag {
    const patch = bagOf(raw['patch'], 'queued intent patch');
    const ops = Array.isArray(patch['ops']) ? patch['ops'] : [];
    return Object.freeze({
      ...raw,
      patch: Object.freeze({
        ...patch,
        writer: this.ownMint,
        context: Object.fromEntries(this.context(VersionVector.from(contextRecord(patch['context'])))),
        ops: ops.map((op) => this.#rawOp(bagOf(op, 'queued intent op'))),
      }),
    });
  }

  /** Every v21 identity the legacy dot denoted in this strand's view. */
  dot(legacyDot: string): string[] {
    const sites = this.#view.sites(legacyDot);
    if (sites.length === 0) { return [this.#unseen(legacyDot)]; }
    return [...new Set(sites.map((site) => this.#identity(site)))].sort();
  }

  context(context: VersionVector): Map<string, number> {
    const translated = new Map<string, number>();
    for (const [key, counter] of context.entries()) {
      for (const [identity, value] of this.#contextEntry(key, counter)) {
        if (value > 0) { translated.set(identity, Math.max(translated.get(identity) ?? 0, value)); }
      }
    }
    return translated;
  }

  #contextEntry(key: string, counter: number): Array<[string, number]> {
    const strandHere = this.#view.hasStrand(key) || key === this.#name;
    if (!strandHere) { return [[key, counter]]; }
    const entries: Array<[string, number]> = [];
    const strandOrigin: V21Origin = { kind: 'strand', name: key };
    entries.push([this.#mintOf(key), Math.min(counter, this.#view.maxCounter(strandOrigin, key))]);
    if (this.#view.hasLaneWriter(key)) {
      entries.push([key, Math.min(counter, this.#view.maxCounter({ kind: 'lane', writerId: key }, key))]);
    }
    return entries;
  }

  #op(op: PatchOp): PatchOp {
    if (op instanceof NodeAdd) { return new NodeAdd(op.node, this.#ownDot(op.dot)); }
    if (op instanceof EdgeAdd) { return new EdgeAdd({ from: op.from, to: op.to, label: op.label, dot: this.#ownDot(op.dot) }); }
    if (op instanceof NodeRemove) { return new NodeRemove(op.node, op.observedDots.flatMap((dot) => this.dot(dot))); }
    if (op instanceof EdgeRemove) {
      return new EdgeRemove({ from: op.from, to: op.to, label: op.label, observedDots: op.observedDots.flatMap((dot) => this.dot(dot)) });
    }
    return op;
  }

  #rawOp(op: Bag): Bag {
    const translated: Record<string, unknown> = { ...op };
    if (op['dot'] !== undefined) {
      const dot = bagOf(op['dot'], 'queued intent dot');
      translated['dot'] = { ...dot, writerId: this.#ownDot(new Dot(String(dot['writerId']), Number(dot['counter']))).writerId };
    }
    if (Array.isArray(op['observedDots'])) {
      translated['observedDots'] = op['observedDots'].flatMap((dot) => this.dot(String(dot)));
    }
    return Object.freeze(translated);
  }

  #ownDot(dot: Dot): Dot {
    if (dot.writerId !== this.#name) {
      throw new V21TranslationBlocked(`strand '${this.#name}' carries an add dot ${Dot.encode(dot)} it did not mint`);
    }
    return new Dot(this.ownMint, dot.counter);
  }

  #identity(site: V21AddSite): string {
    return site.origin.kind === 'lane' ? site.dot : `${this.#mintOf(site.origin.name)}:${site.counter}`;
  }

  /** A dot with no add in the view deleted nothing here; it keeps the key's own owner. */
  #unseen(legacyDot: string): string {
    const dot = Dot.decode(legacyDot);
    return dot.writerId === this.#name ? `${this.ownMint}:${dot.counter}` : legacyDot;
  }

  #mintOf(name: string): string {
    const mint = this.#mints.get(name);
    if (mint === undefined) {
      throw new V21TranslationBlocked(`strand '${this.#name}' reads strand '${name}', which is not converted`);
    }
    return mint;
  }
}

function bagOf(value: unknown, label: string): Bag {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new V21TranslationBlocked(`${label} is not an object`);
  }
  return value as Bag;
}

function contextRecord(value: unknown): Record<string, number> {
  const record: Record<string, number> = {};
  if (typeof value !== 'object' || value === null) { return record; }
  for (const [key, counter] of Object.entries(value)) {
    if (typeof counter === 'number') { record[key] = counter; }
  }
  return record;
}
