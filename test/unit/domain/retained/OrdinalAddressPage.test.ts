import { describe, expect, it } from 'vitest';
import ConeDotClaim from '../../../../src/domain/services/cone/ConeDotClaim.ts';
import ConeDotPage from '../../../../src/domain/services/cone/ConeDotPage.ts';
import ConeRecordKey from '../../../../src/domain/services/cone/ConeRecordKey.ts';
import { encodeEdgeKey } from '../../../../src/domain/services/KeyCodec.ts';
import GraphOrdinal from '../../../../src/domain/retained/GraphOrdinal.ts';
import OrdinalAddress from '../../../../src/domain/retained/OrdinalAddress.ts';
import OrdinalAddressPage from '../../../../src/domain/retained/OrdinalAddressPage.ts';
import OrdinalGeometry from '../../../../src/domain/retained/OrdinalGeometry.ts';

const GEOMETRY = OrdinalGeometry.dotPages();
const owned = (...owners: string[]): ConeDotClaim => owners.reduce((claim, owner) => claim.withOwner(owner), ConeDotClaim.none());
const nodeOrdinal = (counter: number, writerId = 'w1'): GraphOrdinal => new GraphOrdinal({ kind: 'node', writerId, counter });

function nodePage(pageIndex: number, claims: ReadonlyArray<readonly [number, ConeDotClaim]>): OrdinalAddressPage {
  return new OrdinalAddressPage(GEOMETRY, new ConeDotPage({ set: 'node', writerId: 'w1', pageIndex, claims: new Map(claims) }));
}

describe('OrdinalAddress (#815)', () => {
  it('is a typed reference from an ordinal to the record of its own kind', () => {
    const address = new OrdinalAddress(nodeOrdinal(1), ConeRecordKey.forNode('a'));
    expect(address.record.equals(ConeRecordKey.forNode('a'))).toBe(true);
    expect(address.ordinal.equals(nodeOrdinal(1))).toBe(true);
    expect(Object.isFrozen(address)).toBe(true);
    expect(address.equals(new OrdinalAddress(nodeOrdinal(1), ConeRecordKey.forNode('a')))).toBe(true);
    expect(address.equals(new OrdinalAddress(nodeOrdinal(2), ConeRecordKey.forNode('a')))).toBe(false);
    expect(address.equals(new OrdinalAddress(nodeOrdinal(1), ConeRecordKey.forNode('b')))).toBe(false);
  });

  it('fails closed when the record is of another kind', () => {
    expect(() => new OrdinalAddress(nodeOrdinal(1), ConeRecordKey.forEdge(encodeEdgeKey('a', 'b', 'l'))))
      .toThrow(expect.objectContaining({ code: 'E_RETAINED_ADDRESS_KIND_MISMATCH' }));
    expect(() => new OrdinalAddress(nodeOrdinal(1), ConeRecordKey.forAdmissionTally('w1')))
      .toThrow(expect.objectContaining({ code: 'E_RETAINED_ADDRESS_KIND_MISMATCH' }));
  });
});

describe('OrdinalAddressPage (#815)', () => {
  it('names the one dot-page record that holds an ordinal', () => {
    expect(OrdinalAddressPage.keyOf(nodeOrdinal(300), GEOMETRY).equals(ConeRecordKey.forDotPage('node', 'w1', 1))).toBe(true);
    const edge = new GraphOrdinal({ kind: 'edge', writerId: 'w2', counter: 5 });
    expect(OrdinalAddressPage.keyOf(edge, GEOMETRY).equals(ConeRecordKey.forDotPage('edge', 'w2', 0))).toBe(true);
  });

  it('resolves an owned ordinal to its element record without opening the record', () => {
    const page = nodePage(1, [[256, owned('a')], [300, owned('b')]]);
    expect(page.covers(nodeOrdinal(300))).toBe(true);
    expect(page.covers(nodeOrdinal(3))).toBe(false);
    expect(page.covers(nodeOrdinal(300, 'w2'))).toBe(false);
    expect(page.covers(new GraphOrdinal({ kind: 'edge', writerId: 'w1', counter: 300 }))).toBe(false);
    expect(page.resolve(nodeOrdinal(300)).record.equals(ConeRecordKey.forNode('b'))).toBe(true);
    expect(page.addresses().map((address) => address.ordinal.counter)).toEqual([256, 300]);
    const edgeKey = encodeEdgeKey('a', 'b', 'links');
    const edges = new OrdinalAddressPage(GEOMETRY, new ConeDotPage({ set: 'edge', writerId: 'w1', pageIndex: 0, claims: new Map([[4, owned(edgeKey)]]) }));
    expect(edges.resolve(new GraphOrdinal({ kind: 'edge', writerId: 'w1', counter: 4 })).record.equals(ConeRecordKey.forEdge(edgeKey))).toBe(true);
  });

  it('fails closed on a missing, removed-only or duplicated address', () => {
    const page = nodePage(0, [[1, owned('a', 'b')], [2, ConeDotClaim.none().withRemover('c')]]);
    expect(() => page.resolve(nodeOrdinal(1))).toThrow(expect.objectContaining({ code: 'E_RETAINED_ADDRESS_DUPLICATE' }));
    expect(() => page.resolve(nodeOrdinal(2))).toThrow(expect.objectContaining({ code: 'E_RETAINED_ADDRESS_MISSING' }));
    expect(() => page.resolve(nodeOrdinal(3))).toThrow(expect.objectContaining({ code: 'E_RETAINED_ADDRESS_MISSING' }));
    expect(() => page.addresses()).toThrow(expect.objectContaining({ code: 'E_RETAINED_ADDRESS_DUPLICATE' }));
  });

  it('refuses an ordinal the page does not hold, naming a kind mismatch apart from a misplaced ordinal', () => {
    const page = nodePage(0, [[1, owned('a')]]);
    expect(() => page.resolve(new GraphOrdinal({ kind: 'edge', writerId: 'w1', counter: 1 })))
      .toThrow(expect.objectContaining({ code: 'E_RETAINED_ADDRESS_KIND_MISMATCH' }));
    expect(() => page.resolve(nodeOrdinal(1, 'w2'))).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_INVALID' }));
    expect(() => page.resolve(nodeOrdinal(256))).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_INVALID' }));
  });

  it('enumerates only owned ordinals: a removed-only claim is not an address (S4)', () => {
    const page = nodePage(0, [[1, owned('a')], [2, ConeDotClaim.none().withRemover('c')], [3, owned('b')]]);
    expect(page.addresses().map((address) => address.ordinal.counter)).toEqual([1, 3]);
  });

  it('refuses anything but a cone dot page (D6)', () => {
    expect(() => new OrdinalAddressPage(GEOMETRY, untyped<ConeDotPage>('{"set":"node","writerId":"w1","pageIndex":0}')))
      .toThrow(expect.objectContaining({ code: 'E_RETAINED_PAGE_INVALID' }));
  });

  it('refuses a page whose span differs from the geometry', () => {
    const alternate = OrdinalGeometry.of({ version: 2, segmentCapacity: 2 ** 16, pageSpan: 64 });
    expect(() => new OrdinalAddressPage(alternate, ConeDotPage.empty('node', 'w1', 0)))
      .toThrow(expect.objectContaining({ code: 'E_RETAINED_GEOMETRY_UNSUPPORTED' }));
  });
});

/** A value whose runtime shape contradicts its static type, as a corrupt decode would produce. */
function untyped<T>(json: string): T {
  const value: T = JSON.parse(json);
  return value;
}
