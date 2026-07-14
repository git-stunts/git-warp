import { describe, it, expect, vi } from 'vitest';
import InMemoryGraphAdapter from '../../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import { openMemoryRuntimeHostProduct as openRuntimeHostProduct } from '../../../helpers/MemoryRuntimeHost.ts';
import { createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';

describe('_buildViewFromResult', () => {
  it('logs warning when index build fails (H7)', async () => {
    const runtimeHost = await openRuntimeHostProduct({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'build-view',
      writerId: 'writer-1',
    });
    const warn = vi.fn();
    const host = {
      _cachedViewHash: null,
      _viewService: {
        build: () => { throw new Error('test build failure'); },
        applyDiff: () => { throw new Error('test build failure'); },
      },
      _logger: { warn },
      _logicalIndex: 'before',
      _propertyReader: 'before',
      _cachedIndexTree: 'before',
      _materializedGraph: null,
      _indexDegraded: false,
    };

    const state = createEmptyState();
    runtimeHost._buildViewFromResult.call(host, { state, stateHash: 'hash123' });

    expect(warn).toHaveBeenCalledOnce();
    const firstCall = warn.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall?.[0]).toContain('index build failed');
    expect(host._logicalIndex).toBeNull();
    expect(host._propertyReader).toBeNull();
    expect(host._cachedIndexTree).toBeNull();
  });

  it('does not log when no logger is set (H7 graceful)', async () => {
    const runtimeHost = await openRuntimeHostProduct({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'build-view',
      writerId: 'writer-1',
    });
    const host = {
      _cachedViewHash: null,
      _viewService: {
        build: () => { throw new Error('test build failure'); },
        applyDiff: () => { throw new Error('test build failure'); },
      },
      _logger: null,
      _logicalIndex: 'before',
      _propertyReader: 'before',
      _cachedIndexTree: 'before',
      _materializedGraph: null,
      _indexDegraded: false,
    };

    const state = createEmptyState();
    // Should not throw
    runtimeHost._buildViewFromResult.call(host, { state, stateHash: 'hash456' });
    expect(host._logicalIndex).toBeNull();
  });
});
