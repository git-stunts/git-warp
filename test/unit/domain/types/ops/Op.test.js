import { describe, it, expect } from 'vitest';
import { Dot } from '../../../../../src/domain/crdt/Dot.js';
import Op from '../../../../../src/domain/types/ops/Op.js';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.js';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.js';
import EdgeAdd from '../../../../../src/domain/types/ops/EdgeAdd.js';
import EdgeRemove from '../../../../../src/domain/types/ops/EdgeRemove.js';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.js';
import EdgePropSet from '../../../../../src/domain/types/ops/EdgePropSet.js';
import PropSet from '../../../../../src/domain/types/ops/PropSet.js';
import BlobValue from '../../../../../src/domain/types/ops/BlobValue.js';

describe('Op base class', () => {
  it('cannot be instantiated directly', () => {
    expect(() => new Op('NodeAdd')).toThrow();
  });

  it('is the prototype of all op subclasses', () => {
    const dot = new Dot('w', 1);
    const ops = [
      new NodeAdd('n1', dot),
      new NodeRemove('n1', ['w:1']),
      new EdgeAdd({ from: 'n1', to: 'n2', label: 'rel', dot }),
      new EdgeRemove({ from: 'n1', to: 'n2', label: 'rel', observedDots: ['w:1'] }),
      new NodePropSet('n1', 'key', 'val'),
      new EdgePropSet({ from: 'n1', to: 'n2', label: 'rel', key: 'key', value: 'val' }),
      new PropSet('n1', 'key', 'val'),
      new BlobValue('n1', 'abc123'),
    ];

    for (const op of ops) {
      expect(op).toBeInstanceOf(Op);
    }
  });
});

describe('NodeAdd', () => {
  it('constructs with valid nodeId and dot', () => {
    const dot = new Dot('alice', 1);
    const op = new NodeAdd('user:alice', dot);

    expect(op.type).toBe('NodeAdd');
    expect(op.node).toBe('user:alice');
    expect(op.dot).toBe(dot);
  });

  it('is frozen', () => {
    const dot = new Dot('alice', 1);
    const op = new NodeAdd('user:alice', dot);

    expect(Object.isFrozen(op)).toBe(true);
  });

  it('is instanceof Op and NodeAdd', () => {
    const dot = new Dot('alice', 1);
    const op = new NodeAdd('user:alice', dot);

    expect(op).toBeInstanceOf(Op);
    expect(op).toBeInstanceOf(NodeAdd);
  });

  it('is NOT instanceof other op classes', () => {
    const dot = new Dot('alice', 1);
    const op = new NodeAdd('user:alice', dot);

    expect(op).not.toBeInstanceOf(EdgeAdd);
    expect(op).not.toBeInstanceOf(NodeRemove);
    expect(op).not.toBeInstanceOf(PropSet);
  });

  it('throws on empty nodeId', () => {
    const dot = new Dot('alice', 1);
    expect(() => new NodeAdd('', dot)).toThrow();
  });

  it('throws on non-string nodeId', () => {
    const dot = new Dot('alice', 1);
    expect(() => new NodeAdd(/** @type {any} */ (42), dot)).toThrow();
    expect(() => new NodeAdd(/** @type {any} */ (null), dot)).toThrow();
  });

  it('throws when dot is not a Dot instance', () => {
    expect(() => new NodeAdd('n1', /** @type {any} */ ({ writerId: 'w', counter: 1 }))).toThrow();
  });

  it('rejects nodeId containing NUL byte', () => {
    const dot = new Dot('alice', 1);
    expect(() => new NodeAdd('user\x00alice', dot)).toThrow();
  });

  it('rejects nodeId starting with \\x01 prefix', () => {
    const dot = new Dot('alice', 1);
    expect(() => new NodeAdd('\x01user:alice', dot)).toThrow(/reserved prefix/);
  });
});

describe('NodeRemove', () => {
  it('constructs with valid nodeId and observedDots', () => {
    const op = new NodeRemove('user:alice', ['alice:1', 'bob:2']);

    expect(op.type).toBe('NodeRemove');
    expect(op.node).toBe('user:alice');
    expect(op.observedDots).toEqual(['alice:1', 'bob:2']);
  });

  it('is frozen', () => {
    const op = new NodeRemove('user:alice', ['alice:1']);
    expect(Object.isFrozen(op)).toBe(true);
  });

  it('freezes the observedDots array', () => {
    const dots = ['alice:1', 'bob:2'];
    const op = new NodeRemove('user:alice', dots);
    expect(Object.isFrozen(op.observedDots)).toBe(true);
  });

  it('is instanceof Op and NodeRemove', () => {
    const op = new NodeRemove('user:alice', []);
    expect(op).toBeInstanceOf(Op);
    expect(op).toBeInstanceOf(NodeRemove);
  });

  it('throws on empty nodeId', () => {
    expect(() => new NodeRemove('', [])).toThrow();
  });

  it('throws when observedDots is not an array', () => {
    expect(() => new NodeRemove('n1', /** @type {any} */ ('alice:1'))).toThrow();
  });

  it('throws when observedDots contains an empty string', () => {
    expect(() => new NodeRemove('n1', [''])).toThrow(/observedDots\[0\]/);
  });

  it('accepts empty observedDots array', () => {
    const op = new NodeRemove('user:alice', []);
    expect(op.observedDots).toEqual([]);
  });

  it('rejects nodeId containing NUL byte', () => {
    expect(() => new NodeRemove('user\x00alice', [])).toThrow(/NUL/);
  });

  it('rejects nodeId starting with \\x01 prefix', () => {
    expect(() => new NodeRemove('\x01user:alice', [])).toThrow(/reserved prefix/);
  });
});

describe('EdgeAdd', () => {
  it('constructs with valid from, to, label, and dot', () => {
    const dot = new Dot('alice', 1);
    const op = new EdgeAdd({ from: 'user:alice', to: 'user:bob', label: 'follows', dot });

    expect(op.type).toBe('EdgeAdd');
    expect(op.from).toBe('user:alice');
    expect(op.to).toBe('user:bob');
    expect(op.label).toBe('follows');
    expect(op.dot).toBe(dot);
  });

  it('is frozen', () => {
    const dot = new Dot('alice', 1);
    const op = new EdgeAdd({ from: 'user:alice', to: 'user:bob', label: 'follows', dot });
    expect(Object.isFrozen(op)).toBe(true);
  });

  it('is instanceof Op and EdgeAdd', () => {
    const dot = new Dot('alice', 1);
    const op = new EdgeAdd({ from: 'user:alice', to: 'user:bob', label: 'follows', dot });
    expect(op).toBeInstanceOf(Op);
    expect(op).toBeInstanceOf(EdgeAdd);
    expect(op).not.toBeInstanceOf(NodeAdd);
  });

  it('throws on empty from', () => {
    const dot = new Dot('alice', 1);
    expect(() => new EdgeAdd({ from: '', to: 'n2', label: 'rel', dot })).toThrow();
  });

  it('throws on empty to', () => {
    const dot = new Dot('alice', 1);
    expect(() => new EdgeAdd({ from: 'n1', to: '', label: 'rel', dot })).toThrow();
  });

  it('throws on empty label', () => {
    const dot = new Dot('alice', 1);
    expect(() => new EdgeAdd({ from: 'n1', to: 'n2', label: '', dot })).toThrow();
  });

  it('throws when dot is not a Dot instance', () => {
    expect(() => new EdgeAdd({ from: 'n1', to: 'n2', label: 'rel', dot: /** @type {any} */ ({ writerId: 'w', counter: 1 }) })).toThrow();
  });

  it('rejects from/to/label containing NUL byte', () => {
    const dot = new Dot('alice', 1);
    expect(() => new EdgeAdd({ from: 'n\x001', to: 'n2', label: 'rel', dot })).toThrow();
    expect(() => new EdgeAdd({ from: 'n1', to: 'n\x002', label: 'rel', dot })).toThrow();
    expect(() => new EdgeAdd({ from: 'n1', to: 'n2', label: 'r\x00l', dot })).toThrow();
  });

  it('rejects from/to/label starting with \\x01 prefix', () => {
    const dot = new Dot('alice', 1);
    expect(() => new EdgeAdd({ from: '\x01n1', to: 'n2', label: 'rel', dot })).toThrow(/reserved prefix/);
    expect(() => new EdgeAdd({ from: 'n1', to: '\x01n2', label: 'rel', dot })).toThrow(/reserved prefix/);
    expect(() => new EdgeAdd({ from: 'n1', to: 'n2', label: '\x01rel', dot })).toThrow(/reserved prefix/);
  });
});

describe('EdgeRemove', () => {
  it('constructs with valid from, to, label, and observedDots', () => {
    const op = new EdgeRemove({ from: 'user:alice', to: 'user:bob', label: 'follows', observedDots: ['alice:1'] });

    expect(op.type).toBe('EdgeRemove');
    expect(op.from).toBe('user:alice');
    expect(op.to).toBe('user:bob');
    expect(op.label).toBe('follows');
    expect(op.observedDots).toEqual(['alice:1']);
  });

  it('is frozen', () => {
    const op = new EdgeRemove({ from: 'n1', to: 'n2', label: 'rel', observedDots: [] });
    expect(Object.isFrozen(op)).toBe(true);
  });

  it('freezes the observedDots array', () => {
    const op = new EdgeRemove({ from: 'n1', to: 'n2', label: 'rel', observedDots: ['w:1'] });
    expect(Object.isFrozen(op.observedDots)).toBe(true);
  });

  it('is instanceof Op and EdgeRemove', () => {
    const op = new EdgeRemove({ from: 'n1', to: 'n2', label: 'rel', observedDots: [] });
    expect(op).toBeInstanceOf(Op);
    expect(op).toBeInstanceOf(EdgeRemove);
  });

  it('throws on empty from', () => {
    expect(() => new EdgeRemove({ from: '', to: 'n2', label: 'rel', observedDots: [] })).toThrow();
  });

  it('throws on empty to', () => {
    expect(() => new EdgeRemove({ from: 'n1', to: '', label: 'rel', observedDots: [] })).toThrow();
  });

  it('throws on empty label', () => {
    expect(() => new EdgeRemove({ from: 'n1', to: 'n2', label: '', observedDots: [] })).toThrow();
  });

  it('throws when observedDots is not an array', () => {
    expect(() => new EdgeRemove({ from: 'n1', to: 'n2', label: 'rel', observedDots: /** @type {any} */ ('w:1') })).toThrow();
  });

  it('throws when observedDots contains an empty string', () => {
    expect(() => new EdgeRemove({ from: 'n1', to: 'n2', label: 'rel', observedDots: [''] })).toThrow(/observedDots\[0\]/);
  });

  it('rejects from/to/label containing NUL byte', () => {
    expect(() => new EdgeRemove({ from: 'n\x001', to: 'n2', label: 'rel', observedDots: [] })).toThrow(/NUL/);
    expect(() => new EdgeRemove({ from: 'n1', to: 'n\x002', label: 'rel', observedDots: [] })).toThrow(/NUL/);
    expect(() => new EdgeRemove({ from: 'n1', to: 'n2', label: 'r\x00l', observedDots: [] })).toThrow(/NUL/);
  });

  it('rejects from/to/label starting with \\x01 prefix', () => {
    expect(() => new EdgeRemove({ from: '\x01n1', to: 'n2', label: 'rel', observedDots: [] })).toThrow(/reserved prefix/);
    expect(() => new EdgeRemove({ from: 'n1', to: '\x01n2', label: 'rel', observedDots: [] })).toThrow(/reserved prefix/);
    expect(() => new EdgeRemove({ from: 'n1', to: 'n2', label: '\x01rel', observedDots: [] })).toThrow(/reserved prefix/);
  });
});

describe('NodePropSet', () => {
  it('constructs with valid node, key, value', () => {
    const op = new NodePropSet('user:alice', 'name', 'Alice');

    expect(op.type).toBe('NodePropSet');
    expect(op.node).toBe('user:alice');
    expect(op.key).toBe('name');
    expect(op.value).toBe('Alice');
  });

  it('is frozen', () => {
    const op = new NodePropSet('n1', 'k', 'v');
    expect(Object.isFrozen(op)).toBe(true);
  });

  it('is instanceof Op and NodePropSet', () => {
    const op = new NodePropSet('n1', 'k', 'v');
    expect(op).toBeInstanceOf(Op);
    expect(op).toBeInstanceOf(NodePropSet);
    expect(op).not.toBeInstanceOf(EdgePropSet);
    expect(op).not.toBeInstanceOf(PropSet);
  });

  it('throws on empty node', () => {
    expect(() => new NodePropSet('', 'k', 'v')).toThrow();
  });

  it('throws on empty key', () => {
    expect(() => new NodePropSet('n1', '', 'v')).toThrow();
  });

  it('accepts null value', () => {
    const op = new NodePropSet('n1', 'k', null);
    expect(op.value).toBeNull();
  });

  it('accepts object value', () => {
    const op = new NodePropSet('n1', 'k', { nested: true });
    expect(op.value).toEqual({ nested: true });
  });

  it('accepts number value', () => {
    const op = new NodePropSet('n1', 'age', 42);
    expect(op.value).toBe(42);
  });

  it('rejects node containing NUL byte', () => {
    expect(() => new NodePropSet('n\x001', 'k', 'v')).toThrow(/NUL/);
  });

  it('rejects key containing NUL byte', () => {
    expect(() => new NodePropSet('n1', 'k\x00ey', 'v')).toThrow(/NUL/);
  });

  it('rejects node starting with \\x01 prefix', () => {
    expect(() => new NodePropSet('\x01n1', 'k', 'v')).toThrow(/reserved prefix/);
  });
});

describe('EdgePropSet', () => {
  it('constructs with valid from, to, label, key, value', () => {
    const op = new EdgePropSet({ from: 'user:alice', to: 'user:bob', label: 'follows', key: 'since', value: '2026-01-01' });

    expect(op.type).toBe('EdgePropSet');
    expect(op.from).toBe('user:alice');
    expect(op.to).toBe('user:bob');
    expect(op.label).toBe('follows');
    expect(op.key).toBe('since');
    expect(op.value).toBe('2026-01-01');
  });

  it('is frozen', () => {
    const op = new EdgePropSet({ from: 'n1', to: 'n2', label: 'rel', key: 'k', value: 'v' });
    expect(Object.isFrozen(op)).toBe(true);
  });

  it('is instanceof Op and EdgePropSet', () => {
    const op = new EdgePropSet({ from: 'n1', to: 'n2', label: 'rel', key: 'k', value: 'v' });
    expect(op).toBeInstanceOf(Op);
    expect(op).toBeInstanceOf(EdgePropSet);
    expect(op).not.toBeInstanceOf(NodePropSet);
    expect(op).not.toBeInstanceOf(PropSet);
  });

  it('throws on empty from', () => {
    expect(() => new EdgePropSet({ from: '', to: 'n2', label: 'rel', key: 'k', value: 'v' })).toThrow();
  });

  it('throws on empty to', () => {
    expect(() => new EdgePropSet({ from: 'n1', to: '', label: 'rel', key: 'k', value: 'v' })).toThrow();
  });

  it('throws on empty label', () => {
    expect(() => new EdgePropSet({ from: 'n1', to: 'n2', label: '', key: 'k', value: 'v' })).toThrow();
  });

  it('throws on empty key', () => {
    expect(() => new EdgePropSet({ from: 'n1', to: 'n2', label: 'rel', key: '', value: 'v' })).toThrow();
  });

  it('accepts null value', () => {
    const op = new EdgePropSet({ from: 'n1', to: 'n2', label: 'rel', key: 'k', value: null });
    expect(op.value).toBeNull();
  });

  it('rejects from/to/label/key containing NUL byte', () => {
    expect(() => new EdgePropSet({ from: 'n\x001', to: 'n2', label: 'rel', key: 'k', value: 'v' })).toThrow(/NUL/);
    expect(() => new EdgePropSet({ from: 'n1', to: 'n\x002', label: 'rel', key: 'k', value: 'v' })).toThrow(/NUL/);
    expect(() => new EdgePropSet({ from: 'n1', to: 'n2', label: 'r\x00l', key: 'k', value: 'v' })).toThrow(/NUL/);
    expect(() => new EdgePropSet({ from: 'n1', to: 'n2', label: 'rel', key: 'k\x00ey', value: 'v' })).toThrow(/NUL/);
  });

  it('rejects from/to/label/key starting with \\x01 prefix', () => {
    expect(() => new EdgePropSet({ from: '\x01n1', to: 'n2', label: 'rel', key: 'k', value: 'v' })).toThrow(/reserved prefix/);
    expect(() => new EdgePropSet({ from: 'n1', to: '\x01n2', label: 'rel', key: 'k', value: 'v' })).toThrow(/reserved prefix/);
    expect(() => new EdgePropSet({ from: 'n1', to: 'n2', label: '\x01rel', key: 'k', value: 'v' })).toThrow(/reserved prefix/);
    expect(() => new EdgePropSet({ from: 'n1', to: 'n2', label: 'rel', key: '\x01k', value: 'v' })).toThrow(/reserved prefix/);
  });
});

describe('PropSet (raw/wire format)', () => {
  it('constructs with valid node, key, value', () => {
    const op = new PropSet('user:alice', 'name', 'Alice');

    expect(op.type).toBe('PropSet');
    expect(op.node).toBe('user:alice');
    expect(op.key).toBe('name');
    expect(op.value).toBe('Alice');
  });

  it('is frozen', () => {
    const op = new PropSet('n1', 'k', 'v');
    expect(Object.isFrozen(op)).toBe(true);
  });

  it('is instanceof Op and PropSet', () => {
    const op = new PropSet('n1', 'k', 'v');
    expect(op).toBeInstanceOf(Op);
    expect(op).toBeInstanceOf(PropSet);
    expect(op).not.toBeInstanceOf(NodePropSet);
    expect(op).not.toBeInstanceOf(EdgePropSet);
  });

  it('throws on empty node', () => {
    expect(() => new PropSet('', 'k', 'v')).toThrow();
  });

  it('throws on empty key', () => {
    expect(() => new PropSet('n1', '', 'v')).toThrow();
  });

  it('rejects key containing NUL byte', () => {
    expect(() => new PropSet('n1', 'k\x00ey', 'v')).toThrow(/NUL/);
  });

  it('accepts edge-property encoded node (\\x01 prefix)', () => {
    const op = new PropSet('\x01n1\x00n2\x00rel', 'k', 'v');
    expect(op.node).toBe('\x01n1\x00n2\x00rel');
  });
});

describe('BlobValue', () => {
  it('constructs with valid node and oid', () => {
    const op = new BlobValue('user:alice', 'abc123def456');

    expect(op.type).toBe('BlobValue');
    expect(op.node).toBe('user:alice');
    expect(op.oid).toBe('abc123def456');
  });

  it('is frozen', () => {
    const op = new BlobValue('n1', 'oid123');
    expect(Object.isFrozen(op)).toBe(true);
  });

  it('is instanceof Op and BlobValue', () => {
    const op = new BlobValue('n1', 'oid123');
    expect(op).toBeInstanceOf(Op);
    expect(op).toBeInstanceOf(BlobValue);
    expect(op).not.toBeInstanceOf(NodeAdd);
  });

  it('throws on empty node', () => {
    expect(() => new BlobValue('', 'oid')).toThrow();
  });

  it('throws on empty oid', () => {
    expect(() => new BlobValue('n1', '')).toThrow();
  });

  it('throws on non-string oid', () => {
    expect(() => new BlobValue('n1', /** @type {any} */ (42))).toThrow();
  });

  it('rejects node containing NUL byte', () => {
    expect(() => new BlobValue('n\x001', 'oid123')).toThrow(/NUL/);
  });

  it('rejects node starting with \\x01 prefix', () => {
    expect(() => new BlobValue('\x01n1', 'oid123')).toThrow(/reserved prefix/);
  });
});

describe('cross-class instanceof isolation', () => {
  it('no op is instanceof a sibling class', () => {
    const dot = new Dot('w', 1);
    const all = [
      new NodeAdd('n1', dot),
      new NodeRemove('n1', []),
      new EdgeAdd({ from: 'n1', to: 'n2', label: 'r', dot }),
      new EdgeRemove({ from: 'n1', to: 'n2', label: 'r', observedDots: [] }),
      new NodePropSet('n1', 'k', 'v'),
      new EdgePropSet({ from: 'n1', to: 'n2', label: 'r', key: 'k', value: 'v' }),
      new PropSet('n1', 'k', 'v'),
      new BlobValue('n1', 'oid'),
    ];
    const classes = [NodeAdd, NodeRemove, EdgeAdd, EdgeRemove, NodePropSet, EdgePropSet, PropSet, BlobValue];

    for (let i = 0; i < all.length; i++) {
      for (let j = 0; j < classes.length; j++) {
        if (i === j) {
          expect(all[i]).toBeInstanceOf(classes[j]);
        } else {
          expect(all[i]).not.toBeInstanceOf(classes[j]);
        }
      }
    }
  });

  it('all ops share the Op base', () => {
    const dot = new Dot('w', 1);
    const all = [
      new NodeAdd('n1', dot),
      new NodeRemove('n1', []),
      new EdgeAdd({ from: 'n1', to: 'n2', label: 'r', dot }),
      new EdgeRemove({ from: 'n1', to: 'n2', label: 'r', observedDots: [] }),
      new NodePropSet('n1', 'k', 'v'),
      new EdgePropSet({ from: 'n1', to: 'n2', label: 'r', key: 'k', value: 'v' }),
      new PropSet('n1', 'k', 'v'),
      new BlobValue('n1', 'oid'),
    ];

    for (const op of all) {
      expect(op).toBeInstanceOf(Op);
      expect(typeof op.type).toBe('string');
      expect(op.type.length).toBeGreaterThan(0);
    }
  });
});
