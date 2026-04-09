import { describe, expect, it, vi } from 'vitest';
import WriterError from '../../../../src/domain/errors/WriterError.ts';
import { PatchSession } from '../../../../src/domain/warp/PatchSession.ts';

function createSession() {
  const builder = {
    ops: [{}],
    setEdgeProperty: vi.fn(),
    attachContent: vi.fn().mockResolvedValue(undefined),
    clearContent: vi.fn(),
    attachEdgeContent: vi.fn().mockResolvedValue(undefined),
    clearEdgeContent: vi.fn(),
    build: vi.fn().mockReturnValue({ ops: ['built'] }),
    commit: vi.fn().mockResolvedValue('sha123'),
  };

  const session = new PatchSession({
    builder,
    persistence: /** @type {any} */ ({}),
    graphName: 'events',
    writerId: 'alice',
    expectedOldHead: null,
  });

  return { builder, session };
}

describe('PatchSession', () => {
  it('delegates setEdgeProperty and returns the session for chaining', () => {
    const { builder, session } = createSession();

    const result = session.setEdgeProperty('a', 'b', 'links', 'weight', 3);

    expect(result).toBe(session);
    expect(builder.setEdgeProperty).toHaveBeenCalledWith('a', 'b', 'links', 'weight', 3);
  });

  it('delegates attachContent and returns the session', async () => {
    const { builder, session } = createSession();

    const result = await session.attachContent('node:1', 'hello', { mime: 'text/plain', size: 5 });

    expect(result).toBe(session);
    expect(builder.attachContent).toHaveBeenCalledWith('node:1', 'hello', { mime: 'text/plain', size: 5 });
  });

  it('delegates clearContent and returns the session', () => {
    const { builder, session } = createSession();

    const result = session.clearContent('node:1');

    expect(result).toBe(session);
    expect(builder.clearContent).toHaveBeenCalledWith('node:1');
  });

  it('delegates attachEdgeContent and returns the session', async () => {
    const { builder, session } = createSession();
    const bytes = new Uint8Array([1, 2, 3]);

    const result = await session.attachEdgeContent('a', 'b', 'links', bytes);

    expect(result).toBe(session);
    expect(builder.attachEdgeContent).toHaveBeenCalledWith('a', 'b', 'links', bytes, undefined);
  });

  it('delegates clearEdgeContent and returns the session', () => {
    const { builder, session } = createSession();

    const result = session.clearEdgeContent('a', 'b', 'links');

    expect(result).toBe(session);
    expect(builder.clearEdgeContent).toHaveBeenCalledWith('a', 'b', 'links');
  });

  it('classifies string commit failures as PERSIST_WRITE_FAILED', async () => {
    const { builder, session } = createSession();
    builder.commit.mockRejectedValue('boom');

    await expect(session.commit()).rejects.toMatchObject({
      code: 'PERSIST_WRITE_FAILED',
      message: 'Failed to persist patch: boom',
    });
  });

  it('classifies non-CAS advanced-ref errors as WRITER_REF_ADVANCED', async () => {
    const { builder, session } = createSession();
    builder.commit.mockRejectedValue(new Error('writer ref has advanced unexpectedly'));

    await expect(session.commit()).rejects.toMatchObject({
      code: 'WRITER_REF_ADVANCED',
    });
  });

  it('preserves the original cause on classified commit failures', async () => {
    const { builder, session } = createSession();
    const cause = new Error('Concurrent commit detected while writing patch');
    builder.commit.mockRejectedValue(cause);

    try {
      await session.commit();
      expect.unreachable('commit should fail');
    } catch (err) {
      expect(err).toBeInstanceOf(WriterError);
      expect(err).toMatchObject({ code: 'WRITER_REF_ADVANCED', cause });
    }
  });
});
