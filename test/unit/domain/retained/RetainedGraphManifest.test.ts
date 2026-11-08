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
const GOLDEN_COMMITMENT = 'ebec3e464858ed0466fef238457c5f1195b1110e0b67314bac55d403d2452082';

describe('RetainedGraphManifest (#815)', () => {
  it('binds schema, layout, geometry, record-trie root and frontier under one deterministic commitment', () => {
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

  it('changes its commitment when any bound part changes', () => {
    const base = manifestOf().commitment;
    const variants = [
      manifestOf(BASIS, 'other layout\n'),
      manifestOf(new ConeBasis(ConeRoot.at('c'.repeat(40)), BASIS.frontier)),
      manifestOf(new ConeBasis(ConeRoot.empty(), BASIS.frontier)),
      manifestOf(new ConeBasis(ROOT, BASIS.frontier.advanced('w2', position('3', 6)))),
      manifestOf(new ConeBasis(ROOT, BASIS.frontier.advanced('w3', position('3', 1)))),
      manifestOf(new ConeBasis(ROOT, frontier([['w1', position('1', 3)]]))),
    ];
    const commitments = new Set([base.toString(), ...variants.map((variant) => variant.commitment.toString())]);
    expect(commitments.size).toBe(variants.length + 1);
    expect(variants.every((variant) => !variant.equals(manifestOf()))).toBe(true);
  });

  it('keeps field boundaries in the commitment: a layout cannot absorb the root', () => {
    const left = manifestOf(new ConeBasis(ROOT, ConeFrontier.empty()), 'ab');
    const right = manifestOf(new ConeBasis(ROOT, ConeFrontier.empty()), 'a');
    expect(left.commitment.equals(right.commitment)).toBe(false);
  });

  it('gives an ordinal meaning only for the writer chains it folds, and pins it to the manifest', () => {
    const manifest = manifestOf();
    const ordinal = new GraphOrdinal({ kind: 'node', writerId: 'w1', counter: 9 });
    expect(manifest.contains(ordinal)).toBe(true);
    const stranger = new GraphOrdinal({ kind: 'node', writerId: 'w9', counter: 1 });
    expect(manifest.contains(stranger)).toBe(false);
    expect(() => manifest.requireOrdinal(stranger)).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_OUT_OF_RANGE' }));
    const pinned = manifest.pin(ordinal);
    expect(pinned).toBeInstanceOf(ManifestOrdinal);
    expect(pinned.commitment.equals(manifest.commitment)).toBe(true);
    expect(pinned.ordinal.equals(ordinal)).toBe(true);
    expect(Object.isFrozen(pinned)).toBe(true);
    expect(() => manifest.pin(stranger)).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_OUT_OF_RANGE' }));
  });

  it('refuses incomplete parts and geometries the record layout does not store', () => {
    expect(() => manifestOf(BASIS, '')).toThrow(expect.objectContaining({ code: 'E_RETAINED_MANIFEST_INVALID' }));
    expect(() => new RetainedGraphManifest({ layout: LAYOUT, geometry: OrdinalGeometry.dotPages(), basis: untyped<ConeBasis>('{}') }))
      .toThrow(expect.objectContaining({ code: 'E_RETAINED_MANIFEST_INVALID' }));
    expect(() => new RetainedGraphManifest({ layout: LAYOUT, geometry: untyped<OrdinalGeometry>('{}'), basis: BASIS }))
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
    expect(() => new ManifestOrdinal(commitment, untyped<GraphOrdinal>('{}'))).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_INVALID' }));
    expect(() => new ManifestOrdinal(untyped<ManifestCommitment>('{}'), new GraphOrdinal({ kind: 'node', writerId: 'w', counter: 1 })))
      .toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_INVALID' }));
  });
});

/** A value whose runtime shape contradicts its static type, as a corrupt decode would produce. */
function untyped<T>(json: string): T {
  const value: T = JSON.parse(json);
  return value;
}
