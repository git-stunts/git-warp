import { describe, expect, it } from 'vitest';
import { GitPersistenceAdapter } from '@git-stunts/git-cas';
import { CommandSession, GitMktreeSession, GitPlumbingError, GitProtocolError } from '@git-stunts/plumbing';
import { Readable } from 'node:stream';
import { TextEncoder } from 'node:util';

const OID = 'a'.repeat(40);
const TREE = [`100644 blob ${'b'.repeat(40)}\tcontent`];

function command(failure) {
  let finish;
  const finished = new Promise((resolve) => { finish = resolve; });
  function settle({ code, terminated }) {
    finish({ code, error: null, signal: null, stderr: '', terminated, timedOut: false });
  }
  return new CommandSession({
    stdoutStream: Readable.from([new TextEncoder().encode(`${OID}\n`)]),
    finished,
    write: async () => { if (failure !== null) { throw failure; } },
    closeInput: async () => { settle({ code: 0, terminated: false }); },
    terminate: () => { settle({ code: 1, terminated: true }); },
  });
}

function fixture(failures) {
  let openings = 0;
  const persistence = new GitPersistenceAdapter({
    plumbing: {
      openMktreeSession: async () => {
        const failure = failures[openings] ?? null;
        openings += 1;
        return new GitMktreeSession(command(failure));
      },
    },
    policy: { execute: (operation) => operation() },
    sessionIdleTimeoutMs: 60_000,
  });
  return { persistence, openings: () => openings };
}

function brokenPipe() {
  return Object.assign(new Error('broken pipe'), { code: 'EPIPE' });
}

describe('mktree transport recovery', () => {
  it.each(['one tree', 'tree batch'])('reopens the process once for a broken pipe writing %s', async (mode) => {
    const { persistence, openings } = fixture([brokenPipe()]);
    try {
      const result = mode === 'one tree'
        ? await persistence.writeTree(TREE)
        : await persistence.writeTrees([TREE]);
      expect(result).toEqual(mode === 'one tree' ? OID : [OID]);
      expect(openings()).toBe(2);
    } finally {
      await persistence.close();
    }
  });

  it('also recovers when process completion wins the race with the next write', async () => {
    const failure = new GitPlumbingError('input closed', 'write', { code: 'SESSION_INPUT_CLOSED' });
    const { persistence, openings } = fixture([failure]);
    try {
      await expect(persistence.writeTree(TREE)).resolves.toBe(OID);
      expect(openings()).toBe(2);
    } finally {
      await persistence.close();
    }
  });

  it('reports a typed failure after two broken processes, without an unbounded retry', async () => {
    const { persistence, openings } = fixture([brokenPipe(), brokenPipe()]);
    try {
      await expect(persistence.writeTree(TREE)).rejects.toBeInstanceOf(GitProtocolError);
      expect(openings()).toBe(2);
    } finally {
      await persistence.close();
    }
  });

  it('preserves other write failures and does not retry them', async () => {
    const failure = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const { persistence, openings } = fixture([failure]);
    try {
      await expect(persistence.writeTree(TREE)).rejects.toBe(failure);
      expect(openings()).toBe(1);
    } finally {
      await persistence.close();
    }
  });

  it('preserves a producer failure even when it has the same error code', async () => {
    const failure = brokenPipe();
    const session = new GitMktreeSession(command(null));
    async function* entries() {
      yield { mode: '100644', type: 'blob', oid: 'b'.repeat(40), name: 'content' };
      throw failure;
    }
    try {
      await expect(session.write(entries())).rejects.toBe(failure);
    } finally {
      await session.terminate();
    }
  });
});
