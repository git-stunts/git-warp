import { describe, expect, it } from 'vitest';
import OwnershipPosition from '../../helpers/structuralAttachments/OwnershipPosition.ts';
import OwnedAttachment from '../../helpers/structuralAttachments/OwnedAttachment.ts';
import AttachmentAtom from '../../helpers/structuralAttachments/AttachmentAtom.ts';
import StructuralAttachmentState from '../../helpers/structuralAttachments/StructuralAttachmentState.ts';
import AttachmentUpdate from '../../helpers/structuralAttachments/AttachmentUpdate.ts';
import SkeletonRewrite from '../../helpers/structuralAttachments/SkeletonRewrite.ts';
import AttachmentContractTick from '../../helpers/structuralAttachments/AttachmentContractTick.ts';
import type { StateTransition } from '../../helpers/structuralAttachments/StructuralAttachmentState.ts';

// Independent finite ownership expectations derived from Paper I def:warp-graph
// and Paper II def:ndnc / rem:atomicity. This is not a production conformance claim.
const OWNER_KINDS: readonly ('node' | 'edge')[] = ['node', 'edge'];
const rootNode = new OwnershipPosition('root', 'node', 'owner');
const rootEdge = new OwnershipPosition('root', 'edge', 'owner');
const nodeLeaf = new OwnershipPosition('node-child', 'node', 'leaf');
const edgeLeaf = new OwnershipPosition('edge-child', 'edge', 'leaf');

function family(): StructuralAttachmentState {
  return new StructuralAttachmentState({
    graphs: ['root', 'node-child', 'edge-child'], roots: ['root'],
    positions: [rootNode, rootEdge, nodeLeaf, edgeLeaf],
    owned: [new OwnedAttachment(rootNode, 'node-child'), new OwnedAttachment(rootEdge, 'edge-child')],
    // Equal immutable values, separate owners and lineage occurrences.
    atoms: [new AttachmentAtom(nodeLeaf, 'shared-storage-value'), new AttachmentAtom(edgeLeaf, 'shared-storage-value')],
  });
}

function admitted(result: StateTransition): StructuralAttachmentState {
  expect(result.kind).toBe('admitted');
  if (result.kind !== 'admitted') throw new Error('Expected admitted reference transition');
  return result.state;
}

describe('finite structural attachment ownership contract (#903)', () => {
  it('requires complete finite closure and explicit roots without aliasing mutable inputs', () => {
    const graphs = ['root', 'child'];
    const positions = [rootNode];
    const owned = [new OwnedAttachment(rootNode, 'child')];
    const state = new StructuralAttachmentState({ graphs, roots: ['root'], positions, owned });
    graphs.push('unadmitted'); positions.pop(); owned.pop();
    expect(state.graphs).toEqual(['root', 'child']);
    expect(state.positions).toEqual([rootNode]);
    expect(state.owned.map((link) => link.child)).toEqual(['child']);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.positions)).toBe(true);
    expect(Object.isFrozen(rootNode)).toBe(true);
    expect(() => new StructuralAttachmentState({ graphs: ['root'], roots: ['root'], positions: [rootNode],
      owned: [new OwnedAttachment(rootNode, 'missing')] })).toThrow('Incomplete ownership');
    expect(() => new StructuralAttachmentState({ graphs: ['root'], roots: [], positions: [rootNode], owned: [] })).toThrow('Missing explicit root');
  });

  it('rejects direct and indirect containment cycles for both owner kinds', () => {
    for (const kind of OWNER_KINDS) {
      const a = new OwnershipPosition('a', kind, 'slot');
      const b = new OwnershipPosition('b', kind, 'slot');
      expect(() => new StructuralAttachmentState({ graphs: ['a'], roots: [], positions: [a],
        owned: [new OwnedAttachment(a, 'a')] })).toThrow('Structural containment cycle');
      expect(() => new StructuralAttachmentState({ graphs: ['a', 'b'], roots: [], positions: [a, b],
        owned: [new OwnedAttachment(a, 'b'), new OwnedAttachment(b, 'a')] })).toThrow('Structural containment cycle');
    }
  });

  it('rejects shared occurrence ownership but permits distinct lineages sharing an opaque value', () => {
    expect(() => new StructuralAttachmentState({ graphs: ['root', 'child'], roots: ['root'],
      positions: [rootNode, rootEdge], owned: [new OwnedAttachment(rootNode, 'child'), new OwnedAttachment(rootEdge, 'child')] })).toThrow('Duplicate ownership identity');
    const state = family();
    expect(state.owned.map((link) => link.child)).toEqual(['node-child', 'edge-child']);
    expect(state.path(nodeLeaf)).toEqual([rootNode.key, nodeLeaf.key]);
    expect(state.path(edgeLeaf)).toEqual([rootEdge.key, edgeLeaf.key]);
    expect(state.value(nodeLeaf)).toBe(state.value(edgeLeaf));
    const changed = admitted(state.edit(nodeLeaf, 'new-node-value'));
    expect(changed.value(nodeLeaf)).toBe('new-node-value');
    expect(changed.value(edgeLeaf)).toBe('shared-storage-value');
    expect(state.value(nodeLeaf)).toBe('shared-storage-value');
  });

  it('keeps possibly cyclic external/live identifiers opaque instead of upgrading them to ownership', () => {
    const state = new StructuralAttachmentState({ graphs: ['root'], roots: ['root'],
      positions: [rootNode, rootEdge], owned: [], atoms: [
        new AttachmentAtom(rootNode, 'external:root/owner'), new AttachmentAtom(rootEdge, 'live:root/owner'),
      ] });
    for (const position of [rootNode, rootEdge]) {
      expect(state.descends(position)).toBe(false);
      expect(state.detach(position).kind).toBe('admitted');
      expect(state.transport([{ source: position, targets: [] }]).kind).toBe('admitted');
    }
    expect(state.owned).toEqual([]);
  });

  it('protects empty structural children at root level but permits nested atomic owner deletion', () => {
    for (const kind of OWNER_KINDS) {
      const owner = new OwnershipPosition('root', kind, 'owner');
      const empty = new StructuralAttachmentState({ graphs: ['root', 'empty'], roots: ['root'],
        positions: [owner], owned: [new OwnedAttachment(owner, 'empty')] });
      expect(empty.transport([{ source: owner, targets: [] }])).toEqual({ kind: 'refused', reason: 'descendant-delete-or-clone' });
    }
    const state = family();
    const changed = admitted(state.transport([{ source: nodeLeaf, targets: [] }]));
    expect(changed.has(nodeLeaf)).toBe(false);
    expect(changed.owned.map((link) => link.child)).toEqual(['node-child', 'edge-child']);
    expect(changed.has(edgeLeaf)).toBe(true);
  });

  it('refuses implicit structural detach, replacement, deletion and cloning symmetrically', () => {
    const state = family();
    for (const owner of [rootNode, rootEdge]) {
      expect(state.detach(owner)).toEqual({ kind: 'refused', reason: 'descendant-detach' });
      expect(state.edit(owner, 'replacement')).toEqual({ kind: 'refused', reason: 'descendant-replace' });
      expect(state.transport([{ source: owner, targets: [] }])).toEqual({ kind: 'refused', reason: 'descendant-delete-or-clone' });
      const copy = new OwnershipPosition(owner.graph, owner.kind, 'copy');
      expect(state.transport([{ source: owner, targets: [owner, copy] }])).toEqual({ kind: 'refused', reason: 'descendant-delete-or-clone' });
    }
    expect(state.positions).toEqual([rootNode, rootEdge, nodeLeaf, edgeLeaf]);
    expect(state.owned.map((link) => link.child)).toEqual(['node-child', 'edge-child']);
    const copied = new OwnershipPosition(nodeLeaf.graph, nodeLeaf.kind, 'copy');
    const atomCopy = admitted(state.transport([{ source: nodeLeaf, targets: [nodeLeaf, copied] }]));
    expect(atomCopy.value(copied)).toBe('shared-storage-value');
    expect(admitted(state.detach(nodeLeaf)).value(nodeLeaf)).toBeNull();
  });

  it('transports protected node and edge attachments through unique preserved images and commutes with local updates', () => {
    for (const [owner, leaf, child] of [[rootNode, nodeLeaf, 'node-child'], [rootEdge, edgeLeaf, 'edge-child']]) {
      if (!(owner instanceof OwnershipPosition) || !(leaf instanceof OwnershipPosition) || typeof child !== 'string') throw new Error('Invalid witness tuple');
      const state = family();
      const image = new OwnershipPosition(owner.graph, owner.kind, 'preserved-image');
      const tracking = [{ source: owner, targets: [image] }];
      const updateThenTransport = admitted(admitted(state.edit(leaf, 'updated')).transport(tracking));
      const transportThenUpdate = admitted(admitted(state.transport(tracking)).edit(leaf, 'updated'));
      for (const result of [updateThenTransport, transportThenUpdate]) {
        expect(result.owned.find((link) => link.owner.key === image.key)?.child).toBe(child);
        expect(result.path(leaf)).toEqual([image.key, leaf.key]);
        expect(result.value(leaf)).toBe('updated');
        expect(result.has(owner)).toBe(false);
        expect(result.graphs).toEqual(['root', 'node-child', 'edge-child']);
      }
      expect(updateThenTransport.positions).toEqual(transportThenUpdate.positions);
      expect(updateThenTransport.owned).toEqual(transportThenUpdate.owned);
    }
  });

  it('refuses merged, cross-kind and cross-occurrence images rather than losing lineage', () => {
    const state = family();
    expect(state.transport([{ source: rootNode, targets: [rootEdge] }])).toEqual({ kind: 'refused', reason: 'invalid-preserved-image' });
    expect(state.transport([{ source: rootNode, targets: [nodeLeaf] }])).toEqual({ kind: 'refused', reason: 'invalid-preserved-image' });
    const collision = new OwnershipPosition(nodeLeaf.graph, 'node', 'other');
    const sameGraph = new StructuralAttachmentState({ ...state, positions: [...state.positions, collision] });
    expect(sameGraph.transport([{ source: nodeLeaf, targets: [collision] }])).toEqual({ kind: 'refused', reason: 'noninjective-transport' });
    expect(state.transport([{ source: rootNode, targets: [rootNode] }, { source: rootNode, targets: [rootNode] }])).toEqual({ kind: 'refused', reason: 'duplicate-tracking' });
  });

  it('publishes independent node/edge updates with identical expected values in every order and declares complete paths', () => {
    for (const reverse of [false, true]) {
      const state = family();
      const node = new AttachmentUpdate('node', nodeLeaf, 'node-result');
      const edge = new AttachmentUpdate('edge', edgeLeaf, 'edge-result');
      const result = new AttachmentContractTick(state, reverse ? [edge, node] : [node, edge]).commit(state);
      expect(result.state.value(nodeLeaf)).toBe('node-result');
      expect(result.state.value(edgeLeaf)).toBe('edge-result');
      expect(result.state.positions).toEqual(state.positions);
      expect(result.state.owned).toEqual(state.owned);
      expect(result.receipt).toEqual({ basis: state, selected: ['edge', 'node'], published: ['edge', 'node'], rejected: [], abort: null,
        paths: [[rootEdge.key, edgeLeaf.key], [rootNode.key, nodeLeaf.key]] });
    }
  });

  it('records deterministic attachment conflicts and delete/use blockers without deleting a selected update', () => {
    const state = family();
    const result = new AttachmentContractTick(state, [new AttachmentUpdate('b', nodeLeaf, 'loser'),
      new SkeletonRewrite('c', [{ source: nodeLeaf, targets: [] }]), new AttachmentUpdate('a', nodeLeaf, 'winner')]).commit(state);
    expect(result.state.value(nodeLeaf)).toBe('winner');
    expect(result.state.has(nodeLeaf)).toBe(true);
    expect(result.receipt.selected).toEqual(['a']);
    expect(result.receipt.published).toEqual(['a']);
    expect(result.receipt.rejected).toEqual([{ id: 'b', reason: 'conflict', blocker: 'a' }, { id: 'c', reason: 'conflict', blocker: 'a' }]);
  });

  it('allows shared preserved structure and attachment update plus skeleton transport in either serialisation', () => {
    for (const skeletonFirst of [false, true]) {
      const state = family();
      const image = new OwnershipPosition('root', 'node', 'image');
      const update = new AttachmentUpdate(skeletonFirst ? 'b' : 'a', nodeLeaf, 'transported-result');
      const skeleton = new SkeletonRewrite(skeletonFirst ? 'a' : 'b', [{ source: rootNode, targets: [image] }]);
      const result = new AttachmentContractTick(state, [skeleton, update]).commit(state);
      expect(result.receipt.published).toEqual(['a', 'b']);
      expect(result.receipt.abort).toBeNull();
      expect(result.state.value(nodeLeaf)).toBe('transported-result');
      expect(result.state.path(nodeLeaf)).toEqual([image.key, nodeLeaf.key]);
      expect(result.state.owned.map((link) => link.child)).toEqual(['node-child', 'edge-child']);
    }
  });

  it('includes enclosing owners in delete/use conflicts for node and edge descendant updates', () => {
    for (const [owner, leaf] of [[rootNode, nodeLeaf], [rootEdge, edgeLeaf]]) {
      if (owner === undefined || leaf === undefined) throw new Error('Missing witness position');
      const state = family();
      const result = new AttachmentContractTick(state, [new SkeletonRewrite('z', [{ source: owner, targets: [] }]),
        new AttachmentUpdate('a', leaf, 'winner')]).commit(state);
      expect(result.state.value(leaf)).toBe('winner');
      expect(result.receipt.published).toEqual(['a']);
      expect(result.receipt.abort).toBeNull();
      expect(result.receipt.rejected).toEqual([{ id: 'z', reason: 'conflict', blocker: 'a' }]);
    }
  });

  it('rolls back earlier selected updates when later node or edge descendant deletion fails', () => {
    for (const owner of [rootNode, rootEdge]) {
      const state = family();
      const independentLeaf = owner === rootNode ? edgeLeaf : nodeLeaf;
      const update = new AttachmentUpdate('a-update', independentLeaf, 'must-not-publish');
      const deletion = new SkeletonRewrite('z-delete', [{ source: owner, targets: [] }]);
      const result = new AttachmentContractTick(state, [deletion, update]).commit(state);
      expect(result.state).toBe(state);
      expect(result.receipt.basis).toBe(state);
      expect(result.state.value(independentLeaf)).toBe('shared-storage-value');
      expect(result.receipt.selected).toEqual(['a-update', 'z-delete']);
      expect(result.receipt.published).toEqual([]);
      expect(result.receipt.abort).toBe('descendant-delete-or-clone');
    }
  });

  it('refuses stale bases, missing owners and duplicate scheduler identifiers without a partial publication', () => {
    const state = family();
    const current = admitted(state.edit(edgeLeaf, 'newer'));
    const tick = new AttachmentContractTick(state, [new AttachmentUpdate('edit', nodeLeaf, 'stale')]);
    const stale = tick.commit(current);
    expect(stale.state).toBe(current);
    expect(stale.receipt.basis).toBe(state);
    expect(stale.receipt).toEqual({ basis: state, selected: [], published: [], rejected: [], paths: [], abort: 'stale-basis' });
    const missing = new OwnershipPosition('root', 'node', 'missing');
    const failed = new AttachmentContractTick(state, [new AttachmentUpdate('a', nodeLeaf, 'private'), new AttachmentUpdate('z', missing, 'bad')]).commit(state);
    expect(failed.state).toBe(state);
    expect(failed.receipt.published).toEqual([]);
    expect(failed.receipt.abort).toBe('missing-owner');
    expect(() => new AttachmentContractTick(state, [new AttachmentUpdate('same', nodeLeaf, 'a'), new AttachmentUpdate('same', edgeLeaf, 'b')])).toThrow('Duplicate candidate identity');
  });
});
