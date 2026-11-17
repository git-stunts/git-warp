import { describe, expect, it } from 'vitest';

import {
  frontierRecordsEqual,
  frontierToRecord,
} from '../../../../../src/domain/services/strand/StrandDescriptorValidation.ts';

describe('StrandDescriptorValidation frontier records', () => {
  it('orders a frontier record by writer id whatever order the map was built in', () => {
    const frontier = new Map([['carol', 'c'.repeat(40)], ['alice', 'a'.repeat(40)], ['bob', 'b'.repeat(40)]]);

    // Oracle: a frontier record is digested, so its key order is the code-unit order of writer ids.
    expect(Object.keys(frontierToRecord(frontier))).toEqual(['alice', 'bob', 'carol']);
  });

  it('treats records with the same pairs in a different key order as equal', () => {
    const left = { alice: 'a'.repeat(40), bob: 'b'.repeat(40) };
    const right = { bob: 'b'.repeat(40), alice: 'a'.repeat(40) };

    expect(frontierRecordsEqual(left, right)).toBe(true);
  });
});
