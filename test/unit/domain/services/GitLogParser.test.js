import { describe, it, expect, beforeEach } from 'vitest';
import GitLogParser, { RECORD_SEPARATOR } from '../../../../src/domain/services/GitLogParser.js';
import GraphNode from '../../../../src/domain/entities/GraphNode.js';

describe('GitLogParser', () => {
  /** @type {any} */
  /** @type {any} */
  let parser;

  beforeEach(() => {
    parser = new GitLogParser();
  });

  describe('RECORD_SEPARATOR', () => {
    it('exports the ASCII null character constant', () => {
      expect(RECORD_SEPARATOR).toBe('\x00');
    });
  });

  describe('parse()', () => {
    it('parses a single node from stream', async () => {
      const stream = (async function* () {
        yield 'sha1\nauthor1\ndate1\n\nmessage1\x00';
      })();

      const nodes = [];
      for await (const node of parser.parse(stream)) {
        nodes.push(node);
      }

      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toBeInstanceOf(GraphNode);
      expect(nodes[0].sha).toBe('sha1');
      expect(nodes[0].author).toBe('author1');
      expect(nodes[0].date).toBe('date1');
      expect(nodes[0].message).toBe('message1');
      expect(nodes[0].parents).toEqual([]);
    });

    it('parses multiple nodes from stream', async () => {
      const stream = (async function* () {
        yield 'sha1\nauthor1\ndate1\nparent1\nmessage1\x00';
        yield 'sha2\nauthor2\ndate2\nparent2a parent2b\nmessage2\x00';
      })();

      const nodes = [];
      for await (const node of parser.parse(stream)) {
        nodes.push(node);
      }

      expect(nodes).toHaveLength(2);
      expect(nodes[0].sha).toBe('sha1');
      expect(nodes[0].parents).toEqual(['parent1']);
      expect(nodes[1].sha).toBe('sha2');
      expect(nodes[1].parents).toEqual(['parent2a', 'parent2b']);
    });

    it('handles records split across chunks', async () => {
      const stream = (async function* () {
        yield 'sha1\nau';
        yield 'thor1\ndate1\n\nmess';
        yield 'age1\x00';
      })();

      const nodes = [];
      for await (const node of parser.parse(stream)) {
        nodes.push(node);
      }

      expect(nodes).toHaveLength(1);
      expect(nodes[0].sha).toBe('sha1');
      expect(nodes[0].author).toBe('author1');
      expect(nodes[0].message).toBe('message1');
    });

    it('handles UTF-8 sequences split across chunk boundaries', async () => {
      // UTF-8 encoding of 🔥 is 4 bytes: F0 9F 94 A5
      const emoji = '🔥';
      const emojiBytes = Buffer.from(emoji, 'utf-8');

      const stream = (async function* () {
        // Split the emoji across two chunks
        yield Buffer.concat([Buffer.from('sha1\nauthor\ndate\n\n'), emojiBytes.subarray(0, 2)]);
        yield Buffer.concat([emojiBytes.subarray(2), Buffer.from('\x00')]);
      })();

      const nodes = [];
      for await (const node of parser.parse(stream)) {
        nodes.push(node);
      }

      expect(nodes).toHaveLength(1);
      expect(nodes[0].message).toBe('🔥');
    });

    it('handles final block without trailing separator', async () => {
      const stream = (async function* () {
        yield 'sha1\nauthor\ndate\n\nmessage';
      })();

      const nodes = [];
      for await (const node of parser.parse(stream)) {
        nodes.push(node);
      }

      expect(nodes).toHaveLength(1);
      expect(nodes[0].message).toBe('message');
    });

    it('skips invalid records in stream', async () => {
      const stream = (async function* () {
        yield 'sha1\nauthor\ndate\n\nmessage1\x00';
        yield 'invalid\x00'; // Too few lines
        yield 'sha3\nauthor\ndate\n\nmessage3\x00';
      })();

      const nodes = [];
      for await (const node of parser.parse(stream)) {
        nodes.push(node);
      }

      expect(nodes).toHaveLength(2);
      expect(nodes[0].sha).toBe('sha1');
      expect(nodes[1].sha).toBe('sha3');
    });

    it('handles empty stream', async () => {
      const stream = (async function* () {})();

      const nodes = [];
      for await (const node of parser.parse(stream)) {
        nodes.push(node);
      }

      expect(nodes).toHaveLength(0);
    });

    it('handles stream with only whitespace', async () => {
      const stream = (async function* () {
        yield '   \n\n   ';
      })();

      const nodes = [];
      for await (const node of parser.parse(stream)) {
        nodes.push(node);
      }

      expect(nodes).toHaveLength(0);
    });

    it('handles message containing 0x1E in stream parsing', async () => {
      const messageWith0x1E = 'Data\x1ESeparated\x1EValues';
      // The record separator is now \x00, so \x1E in message is fine
      const stream = (async function* () {
        yield `sha1\nauthor\ndate\n\n${messageWith0x1E}\x00`;
      })();

      const nodes = [];
      for await (const node of parser.parse(stream)) {
        nodes.push(node);
      }

      expect(nodes).toHaveLength(1);
      expect(nodes[0].message).toBe(messageWith0x1E);
      expect(nodes[0].message).toContain('\x1E');
    });
  });

  describe('parseNode()', () => {
    it('parses a valid block with all fields', () => {
      const block = 'abc123\nJohn Doe\n2026-01-28\nparent1 parent2\nCommit message';
      const node = parser.parseNode(block);

      expect(node).toBeInstanceOf(GraphNode);
      expect(node.sha).toBe('abc123');
      expect(node.author).toBe('John Doe');
      expect(node.date).toBe('2026-01-28');
      expect(node.parents).toEqual(['parent1', 'parent2']);
      expect(node.message).toBe('Commit message');
    });

    it('parses root commit with no parents', () => {
      const block = 'abc123\nAuthor\nDate\n\nMessage';
      const node = parser.parseNode(block);

      expect(node.parents).toEqual([]);
    });

    it('returns null for block with too few lines', () => {
      expect(parser.parseNode('sha\nauthor\ndate')).toBeNull();
      expect(parser.parseNode('sha\nauthor')).toBeNull();
      expect(parser.parseNode('sha')).toBeNull();
      expect(parser.parseNode('')).toBeNull();
    });

    it('returns null for block with empty SHA', () => {
      const block = '\nAuthor\nDate\n\nMessage';
      expect(parser.parseNode(block)).toBeNull();
    });

    it('returns null for block with empty message', () => {
      const block = 'sha\nAuthor\nDate\n\n';
      expect(parser.parseNode(block)).toBeNull();
    });

    describe('message preservation', () => {
      it('preserves whitespace-only messages', () => {
        const block = 'sha\nAuthor\nDate\n\n   ';
        const node = parser.parseNode(block);

        expect(node).not.toBeNull();
        expect(node.message).toBe('   ');
      });

      it('preserves leading and trailing whitespace', () => {
        const block = 'sha\nAuthor\nDate\n\n  hello world  ';
        const node = parser.parseNode(block);

        expect(node.message).toBe('  hello world  ');
      });

      it('preserves multi-line messages with internal whitespace', () => {
        const block = 'sha\nAuthor\nDate\n\n  line1  \n\n  line2  ';
        const node = parser.parseNode(block);

        expect(node.message).toBe('  line1  \n\n  line2  ');
      });

      it('preserves newlines in message', () => {
        const block = 'sha\nAuthor\nDate\n\nLine 1\nLine 2\nLine 3';
        const node = parser.parseNode(block);

        expect(node.message).toBe('Line 1\nLine 2\nLine 3');
      });

      it('correctly parses message containing 0x1E record separator character', () => {
        // 0x1E is the ASCII record separator - it should be preserved in messages
        const messageWith0x1E = 'Line 1\x1ELine 2\x1ELine 3';
        const block = `sha123\nAuthor Name\n2026-01-28\nparent1\n${messageWith0x1E}`;
        const node = parser.parseNode(block);

        expect(node).not.toBeNull();
        expect(node.sha).toBe('sha123');
        expect(node.message).toBe(messageWith0x1E);
        expect(node.message).toContain('\x1E');
      });
    });

    describe('adversarial payloads', () => {
      const adversarialPayloads = [
        { name: 'Null Bytes', content: 'data\0with\0nulls' },
        { name: 'Emoji Chaos', content: '🔥🚀💀' },
        { name: 'Control Characters', content: '\x01\x02\x03\x04\x05' },
        { name: 'Fake Header Lines', content: 'abc1234567890\nAuthor\nDate\nParent\nActual Message' },
        { name: 'Massive Blob', content: 'A'.repeat(1024 * 1024) },
        { name: 'Mixed Newlines', content: '\r\n\n\r' },
        { name: 'Unicode Edge Cases', content: '\uFEFF\u200B\u00A0' },
        { name: 'SQL Injection Attempt', content: "'; DROP TABLE nodes; --" },
        { name: 'Path Traversal Attempt', content: '../../../etc/passwd' },
      ];

      adversarialPayloads.forEach(({ name, content }) => {
        it(`accurately recovers payload: ${name}`, () => {
          const block = `f7e8d9\nJames\n2026-01-28\nparent123\n${content}`;
          const node = parser.parseNode(block);

          expect(node).not.toBeNull();
          expect(node.message).toBe(content);
          expect(node.sha).toBe('f7e8d9');
        });
      });
    });
  });
});
