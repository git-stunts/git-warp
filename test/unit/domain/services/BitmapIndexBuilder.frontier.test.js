import { describe, it, expect } from 'vitest';
import BitmapIndexBuilder from '../../../../src/domain/services/BitmapIndexBuilder.js';
import { decode as cborDecode } from '../../../../src/infrastructure/codecs/CborCodec.js';

/**
 * GK/IDX/1 — Store frontier in index metadata at build time.
 *
 * frontier.cbor (authoritative) and frontier.json (debug) are added
 * to the bitmap index tree when a frontier Map is provided to serialize().
 */

describe('BitmapIndexBuilder frontier metadata (GK/IDX/1)', () => {
  it('no frontier option → no frontier files in output', async () => {
    const builder = new BitmapIndexBuilder();
    builder.registerNode('aabbcc');

    const tree = await builder.serialize();

    expect(tree['frontier.cbor']).toBeUndefined();
    expect(tree['frontier.json']).toBeUndefined();
  });

  it('serialize() without options → no frontier files', async () => {
    const builder = new BitmapIndexBuilder();
    builder.registerNode('aabbcc');

    const tree = await builder.serialize({});

    expect(tree['frontier.cbor']).toBeUndefined();
    expect(tree['frontier.json']).toBeUndefined();
  });

  it('with frontier → frontier.cbor and frontier.json present', async () => {
    const builder = new BitmapIndexBuilder();
    builder.registerNode('aabbcc');

    const frontier = new Map([
      ['writer-a', 'sha-aaa'],
      ['writer-b', 'sha-bbb'],
    ]);

    const tree = await builder.serialize({ frontier });

    expect(tree['frontier.cbor']).toBeInstanceOf(Buffer);
    expect(tree['frontier.json']).toBeInstanceOf(Buffer);
  });

  it('CBOR roundtrip: decode → verify envelope structure', async () => {
    const builder = new BitmapIndexBuilder();
    const frontier = new Map([
      ['writer-b', 'sha-bbb'],
      ['writer-a', 'sha-aaa'],
    ]);

    const tree = await builder.serialize({ frontier });
    const envelope = /** @type {any} */ (cborDecode(tree['frontier.cbor']));

    expect(envelope.version).toBe(1);
    expect(envelope.writerCount).toBe(2);
    expect(envelope.frontier).toEqual({
      'writer-a': 'sha-aaa',
      'writer-b': 'sha-bbb',
    });
  });

  it('JSON matches CBOR content', async () => {
    const builder = new BitmapIndexBuilder();
    const frontier = new Map([
      ['writer-b', 'sha-bbb'],
      ['writer-a', 'sha-aaa'],
    ]);

    const tree = await builder.serialize({ frontier });
    const cborEnvelope = cborDecode(tree['frontier.cbor']);
    const jsonEnvelope = JSON.parse(tree['frontier.json'].toString('utf-8'));

    expect(jsonEnvelope).toEqual(cborEnvelope);
  });

  it('frontier keys are sorted in output', async () => {
    const builder = new BitmapIndexBuilder();
    const frontier = new Map([
      ['zulu', 'sha-z'],
      ['alpha', 'sha-a'],
      ['mike', 'sha-m'],
    ]);

    const tree = await builder.serialize({ frontier });
    const envelope = JSON.parse(tree['frontier.json'].toString('utf-8'));
    const keys = Object.keys(envelope.frontier);

    expect(keys).toEqual(['alpha', 'mike', 'zulu']);
  });

  it('empty frontier → writerCount: 0, frontier: {}', async () => {
    const builder = new BitmapIndexBuilder();
    const frontier = new Map();

    const tree = await builder.serialize({ frontier });
    const envelope = /** @type {any} */ (cborDecode(tree['frontier.cbor']));

    expect(envelope.version).toBe(1);
    expect(envelope.writerCount).toBe(0);
    expect(envelope.frontier).toEqual({});
  });

  it('existing shards unaffected by frontier addition', async () => {
    const builder = new BitmapIndexBuilder();
    builder.registerNode('aabbcc');
    builder.addEdge('aabbcc', 'aaddee');

    const treeWithout = await builder.serialize();
    const treeWith = await builder.serialize({
      frontier: new Map([['w1', 'sha1']]),
    });

    // All non-frontier entries should be identical
    for (const key of Object.keys(treeWithout)) {
      expect(treeWith[key]).toBeDefined();
      expect(treeWith[key].equals(treeWithout[key])).toBe(true);
    }

    // Frontier files are extra
    expect(treeWith['frontier.cbor']).toBeDefined();
    expect(treeWith['frontier.json']).toBeDefined();
  });
});
