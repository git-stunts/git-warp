import { describe, expect, it } from 'vitest';

import { openDetachedGraph } from '../../../../../src/domain/services/controllers/detachedOpen.ts';
import GCPolicy from '../../../../../src/domain/services/GCPolicy.ts';
import { createMockLogger } from '../../../../helpers/mockPorts.ts';
import SequenceRandomPort from '../../../../helpers/SequenceRandomPort.ts';

/** Mirrors the structural host used by strandAndRuntimeSeams.test.ts. */
function host(overrides) {
  return {
    _persistence: {}, _runtimeStorage: {}, _graphName: 'detached', _writerId: 'agent-1',
    _gcPolicy: GCPolicy.DEFAULT, _checkpointPolicy: null, _logger: null,
    _trustConfig: { mode: 'off', pin: null }, _onDeleteWithData: 'reject',
    _crypto: {}, _random: new SequenceRandomPort(), _codec: {},
    ...overrides,
  };
}

/** The read surface is irrelevant here; only the forwarded options matter. */
function recordingOpener(record) {
  return record;
}

describe('openDetachedGraph', () => {
  it('forwards the host logger, entropy, and trust configuration', async () => {
    const logger = createMockLogger();
    const graph = host({ _logger: logger });
    let seen;

    await openDetachedGraph(graph, recordingOpener(async (options) => { seen = options; return {}; }));

    expect(seen).toMatchObject({ logger, random: graph._random, trust: graph._trustConfig, autoMaterialize: false });
  });

  it('omits trust when the host has none configured', async () => {
    let seen;

    await openDetachedGraph(host({ _trustConfig: null }), recordingOpener(async (options) => { seen = options; return {}; }));

    expect(seen).not.toHaveProperty('trust');
    expect(seen).not.toHaveProperty('logger');
  });
});
