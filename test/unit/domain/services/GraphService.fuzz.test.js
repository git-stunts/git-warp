import { describe, it, expect } from 'vitest';
import GraphService from '../../../../src/domain/services/GraphService.js';

describe('GraphService Fuzz Testing', () => {
  const service = new GraphService({ persistence: {} });

  const adversarialPayloads = [
    { name: 'Null Bytes', content: 'data\0with\0nulls' },
    { name: 'Emoji Chaos', content: '🔥🚀💀' },
    { name: 'Control Characters', content: '\x01\x02\x03\x04\x05' },
    { name: 'Fake Header Lines', content: 'abc1234567890\nAuthor\nDate\nParent\nActual Message' },
    { name: 'Massive Blob', content: 'A'.repeat(1024 * 1024) }, // 1MB message
    { name: 'Mixed Newlines', content: '\r\n\n\r' }
  ];

  adversarialPayloads.forEach(({ name, content }) => {
    it(`should accurately recover the payload: ${name}`, () => {
      // Construct a raw block as it would come from git log with 0x1E
      const rawBlock = `f7e8d9\nJames\n2026-01-28\nparent123\n${content}`;

      const parsed = service._parseNode(rawBlock);

      expect(parsed).not.toBeNull();
      expect(parsed.message).toBe(content);
      expect(parsed.sha).toBe('f7e8d9');
    });
  });
});
