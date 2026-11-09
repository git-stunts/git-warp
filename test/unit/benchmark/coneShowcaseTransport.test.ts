import { describe, expect, it } from 'vitest';

import parseColdOpenResult, { formatColdOpenResult } from '../../../benchmarks/cone-showcase/ColdOpenResultParser.ts';
import MarginCorpus from '../../../benchmarks/cone-showcase/MarginCorpus.ts';
import matchesCorpus from '../../../benchmarks/cone-showcase/MarginMembership.ts';
import { Margins, MarginsUnavailable } from '../../../benchmarks/cone-showcase/Margins.ts';

const COMPLETE = 'cone-margins-v1\tcompleted\td0\nthread\tt0\tc0\nend\td0\t1\t1\n';

describe('cold membership transport', () => {
  it('decodes the actual thread and comment identities', () => {
    const read = parseColdOpenResult(COMPLETE, 'd0');
    expect(read).toBeInstanceOf(Margins);
    if (!(read instanceof Margins)) throw new TypeError('expected actual membership');
    expect(read.documentId).toBe('d0');
    expect([...read.threads]).toEqual([['t0', ['c0']]]);
    expect(matchesCorpus(read, 'd0', new MarginCorpus(1))).toBe(true);
  });

  it('writes an exact independently specified transport', () => {
    expect(formatColdOpenResult('d0', new Margins('d0', new Map([['t0', ['c0']]])))).toBe(COMPLETE);
  });

  it('detects wrong membership even when counts and completion claims agree', () => {
    const read = parseColdOpenResult(COMPLETE.replace('c0\n', 'c99\n'), 'd0');
    if (!(read instanceof Margins)) throw new TypeError('expected actual membership');
    expect(matchesCorpus(read, 'd0', new MarginCorpus(1))).toBe(false);
  });

  it('does not treat an empty completed read as the nonempty corpus', () => {
    const read = parseColdOpenResult('cone-margins-v1\tcompleted\td0\nend\td0\t0\t0\n', 'd0');
    if (!(read instanceof Margins)) throw new TypeError('expected actual membership');
    expect(matchesCorpus(read, 'd0', new MarginCorpus(1))).toBe(false);
  });

  it('preserves a refused read and its context as incomplete', () => {
    const read = parseColdOpenResult('cone-margins-v1\tincomplete\td0\nreason\tobserver\trefused\tno%20page\nend\td0\t0\t0\n', 'd0');
    expect(read).toBeInstanceOf(MarginsUnavailable);
    if (!(read instanceof MarginsUnavailable)) throw new TypeError('expected incomplete read');
    expect([read.observer, read.status, read.reason]).toEqual(['observer', 'refused', 'no page']);
  });

  it.each([
    COMPLETE.slice(0, -1),
    COMPLETE + COMPLETE,
    COMPLETE.replace('end\td0\t1\t1', 'end\td0\t-1\t1'),
    COMPLETE.replace('end\td0\t1\t1', 'end\td0\t1\t2'),
    COMPLETE.replace('thread\tt0\tc0', 'thread\tt0\tc0,c0'),
    COMPLETE.replace('thread\tt0\tc0\n', 'thread\tt0\tc0\nthread\tt0\tc1\n'),
    COMPLETE.replace('completed', 'invented'),
    COMPLETE.replace('end\td0', 'end\td1'),
    COMPLETE.replace('thread\tt0\tc0', 'thread\tbad-thread\tc0'),
    'cone-margins-v1\tincomplete\td0\nreason\tobserver\trefused\t%ZZ\nend\td0\t0\t0\n',
  ])('refuses malformed or incomplete child output', (output) => {
    expect(() => parseColdOpenResult(output, 'd0')).toThrow();
  });

  it('rejects output for a different requested document', () => {
    expect(() => parseColdOpenResult(COMPLETE, 'd1')).toThrow();
  });

  it('keeps captured membership stable when its source or returned map changes', () => {
    const source = new Map([['t0', ['c0']]]);
    const margins = new Margins('d0', source);
    source.set('t1', ['c1']);
    const view = margins.threads;
    if (view instanceof Map) view.clear();
    expect([...margins.threads]).toEqual([['t0', ['c0']]]);
  });
});
