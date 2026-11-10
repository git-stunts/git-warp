import { describe, expect, it } from 'vitest';
import ConeBasis from '../../../../src/domain/services/cone/ConeBasis.ts';
import ConeFrontier from '../../../../src/domain/services/cone/ConeFrontier.ts';
import ConeRoot from '../../../../src/domain/services/cone/ConeRoot.ts';
import ConeWriterPosition from '../../../../src/domain/services/cone/ConeWriterPosition.ts';
import GraphOrdinal from '../../../../src/domain/retained/GraphOrdinal.ts';
import ManifestCommitment from '../../../../src/domain/retained/ManifestCommitment.ts';
import ManifestOrdinal from '../../../../src/domain/retained/ManifestOrdinal.ts';
import OrdinalGeometry from '../../../../src/domain/retained/OrdinalGeometry.ts';
import RetainedGraphManifest, { RETAINED_GRAPH_MANIFEST_SCHEMA } from '../../../../src/domain/retained/RetainedGraphManifest.ts';

const LAYOUT = 'test layout\n';
const ROOT = ConeRoot.at('b'.repeat(40));
const position = (character: string, lamport: number): ConeWriterPosition => new ConeWriterPosition(character.repeat(40), lamport);
const frontier = (entries: ReadonlyArray<readonly [string, ConeWriterPosition]>): ConeFrontier => new ConeFrontier(new Map(entries));
const BASIS = new ConeBasis(ROOT, frontier([['w1', position('1', 3)], ['w2', position('2', 5)]]));
const manifestOf = (basis: ConeBasis = BASIS, layout: string = LAYOUT): RetainedGraphManifest =>
  new RetainedGraphManifest({ layout, geometry: OrdinalGeometry.dotPages(), basis });

/** The schema-1 commitment of {@link BASIS} under {@link LAYOUT}: a persisted identity, pinned byte for byte. */
const GOLDEN_COMMITMENT = '8effa309a54cbdc83c0cec6934205ff43597ac57bf24e510fa790295bd6d4550';

describe('RetainedGraphManifest (#815)', () => {
  it('binds schema, layout, geometry and writer frontier under one deterministic commitment', () => {
    const manifest = manifestOf();
    expect(RETAINED_GRAPH_MANIFEST_SCHEMA).toBe(1);
    expect(manifest.schema).toBe(1);
    expect(manifest.layout).toBe(LAYOUT);
    expect(manifest.basis.equals(BASIS)).toBe(true);
    expect(manifest.geometry.equals(OrdinalGeometry.dotPages())).toBe(true);
    expect(manifest.commitment).toBeInstanceOf(ManifestCommitment);
    expect(manifest.commitment.toString()).toBe(GOLDEN_COMMITMENT);
    expect(Object.isFrozen(manifest)).toBe(true);
  });

  it('rebuilds the same commitment from equal parts, whatever order the frontier was assembled in', () => {
    const reordered = new ConeBasis(ConeRoot.at('b'.repeat(40)), frontier([['w2', position('2', 5)], ['w1', position('1', 3)]]));
    expect(manifestOf(reordered).commitment.equals(manifestOf().commitment)).toBe(true);
    expect(manifestOf(reordered).equals(manifestOf())).toBe(true);
  });

  it('constructs the same manifest across a wide frontier in either insertion order', () => {
    const writerCount = 22_000;
    const writers = new Map<string, ConeWriterPosition>();
    const head = position('1', 1);
    for (let index = 0; index < writerCount; index++) {
      writers.set(`writer-${String(index).padStart(5, '0')}`, head);
    }
    const forward = new ConeBasis(ROOT, new ConeFrontier(writers));
    const reversed = new ConeBasis(ROOT, new ConeFrontier(new Map([...writers].reverse())));
    expect(() => manifestOf(forward)).not.toThrow();
    const manifest = manifestOf(forward);
    expect(manifest.basis.frontier.entries()).toHaveLength(writerCount);
    expect(manifest.equals(manifestOf(reversed))).toBe(true);
    expect(manifest.foldsWriter('writer-21999')).toBe(true);
  });

  it('changes its commitment when the layout or the frontier changes', () => {
    const base = manifestOf().commitment;
    const variants = [
      manifestOf(BASIS, 'other layout\n'),
      manifestOf(new ConeBasis(ROOT, BASIS.frontier.advanced('w2', position('3', 6)))),
      manifestOf(new ConeBasis(ROOT, BASIS.frontier.advanced('w3', position('3', 1)))),
      manifestOf(new ConeBasis(ROOT, frontier([['w1', position('1', 3)]]))),
    ];
    const commitments = new Set([base.toString(), ...variants.map((variant) => variant.commitment.toString())]);
    expect(commitments.size).toBe(variants.length + 1);
    expect(variants.every((variant) => !variant.equals(manifestOf()))).toBe(true);
  });

  it('keeps one commitment whatever record-trie root folded the frontier: the root is a physical artifact of fold order', () => {
    const base = manifestOf().commitment;
    expect(manifestOf(new ConeBasis(ConeRoot.at('c'.repeat(40)), BASIS.frontier)).commitment.equals(base)).toBe(true);
    expect(manifestOf(new ConeBasis(ConeRoot.empty(), BASIS.frontier)).commitment.equals(base)).toBe(true);
  });

  it('keeps field boundaries in the commitment: a writer id cannot absorb the start of its sha', () => {
    const left = manifestOf(new ConeBasis(ROOT, frontier([['w1a', new ConeWriterPosition('a'.repeat(40), 3)]])));
    const right = manifestOf(new ConeBasis(ROOT, frontier([['w1', new ConeWriterPosition('a'.repeat(41), 3)]])));
    expect(left.commitment.equals(right.commitment)).toBe(false);
  });

  it('gives an ordinal meaning only for the writer chains it folds, and pins it to the manifest', () => {
    const manifest = manifestOf();
    const ordinal = new GraphOrdinal({ kind: 'node', writerId: 'w1', counter: 9 });
    expect(manifest.foldsWriter('w1')).toBe(true);
    const stranger = new GraphOrdinal({ kind: 'node', writerId: 'w9', counter: 1 });
    expect(manifest.foldsWriter('w9')).toBe(false);
    expect(() => manifest.requireFoldedWriter(stranger)).toThrow(expect.objectContaining({ code: 'E_RETAINED_WRITER_NOT_FOLDED' }));
    const pinned = manifest.pin(ordinal);
    expect(pinned).toBeInstanceOf(ManifestOrdinal);
    expect(pinned.commitment.equals(manifest.commitment)).toBe(true);
    expect(pinned.ordinal.equals(ordinal)).toBe(true);
    expect(Object.isFrozen(pinned)).toBe(true);
    expect(() => manifest.pin(stranger)).toThrow(expect.objectContaining({ code: 'E_RETAINED_WRITER_NOT_FOLDED' }));
  });

  it('checks writer membership only: the frontier carries no counter high-water, so a counter past it pins and resolves as missing', () => {
    const beyond = new GraphOrdinal({ kind: 'node', writerId: 'w1', counter: Number.MAX_SAFE_INTEGER });
    expect(manifestOf().pin(beyond).ordinal.equals(beyond)).toBe(true);
  });

  it('refuses incomplete parts and geometries the record layout does not store', () => {
    expect(() => manifestOf(BASIS, '')).toThrow(expect.objectContaining({ code: 'E_RETAINED_MANIFEST_INVALID' }));
    // @ts-expect-error -- an empty decoded object is not a validated basis.
    expect(() => new RetainedGraphManifest({ layout: LAYOUT, geometry: OrdinalGeometry.dotPages(), basis: {} }))
      .toThrow(expect.objectContaining({ code: 'E_RETAINED_MANIFEST_INVALID' }));
    // @ts-expect-error -- an empty decoded object is not validated geometry.
    expect(() => new RetainedGraphManifest({ layout: LAYOUT, geometry: {}, basis: BASIS }))
      .toThrow(expect.objectContaining({ code: 'E_RETAINED_MANIFEST_INVALID' }));
    const alternate = OrdinalGeometry.of({ version: 2, segmentCapacity: 2 ** 16, pageSpan: 64 });
    expect(() => new RetainedGraphManifest({ layout: LAYOUT, geometry: alternate, basis: BASIS }))
      .toThrow(expect.objectContaining({ code: 'E_RETAINED_GEOMETRY_UNSUPPORTED' }));
  });
});

describe('ManifestCommitment and ManifestOrdinal (#815)', () => {
  it('accept only a 64-hex digest and a graph ordinal', () => {
    expect(() => new ManifestCommitment('A'.repeat(64))).toThrow(expect.objectContaining({ code: 'E_RETAINED_MANIFEST_INVALID' }));
    expect(() => new ManifestCommitment('a'.repeat(63))).toThrow(expect.objectContaining({ code: 'E_RETAINED_MANIFEST_INVALID' }));
    const commitment = new ManifestCommitment('a'.repeat(64));
    expect(commitment.equals(new ManifestCommitment('a'.repeat(64)))).toBe(true);
    // @ts-expect-error -- an empty decoded object is not a validated ordinal.
    expect(() => new ManifestOrdinal(commitment, {})).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_INVALID' }));
    // @ts-expect-error -- an empty decoded object is not a validated commitment.
    expect(() => new ManifestOrdinal({}, new GraphOrdinal({ kind: 'node', writerId: 'w', counter: 1 })))
      .toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_INVALID' }));
  });
});
