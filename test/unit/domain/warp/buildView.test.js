import { describe, it, expect, vi } from 'vitest';
import { _buildView } from '../../../../src/domain/warp/materializeAdvanced.methods.js';
import { createEmptyStateV5 } from '../../../../src/domain/services/JoinReducer.js';

describe('_buildView', () => {
  it('logs warning when index build fails (H7)', () => {
    const warn = vi.fn();
    const ctx = {
      _cachedViewHash: null,
      _viewService: {
        build: () => { throw new Error('test build failure'); },
      },
      _logger: { warn },
      _logicalIndex: 'before',
      _propertyReader: 'before',
      _cachedIndexTree: 'before',
      _materializedGraph: {},
    };

    _buildView.call(/** @type {import('../../../../src/domain/WarpRuntime.js').default} */ (/** @type {unknown} */ (ctx)), createEmptyStateV5(), 'hash123');

    expect(warn).toHaveBeenCalledOnce();
    const firstCall = warn.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall?.[0]).toContain('index build failed');
    expect(ctx._logicalIndex).toBeNull();
    expect(ctx._propertyReader).toBeNull();
    expect(ctx._cachedIndexTree).toBeNull();
  });

  it('does not log when no logger is set (H7 graceful)', () => {
    const ctx = {
      _cachedViewHash: null,
      _viewService: {
        build: () => { throw new Error('test build failure'); },
      },
      _logger: null,
      _logicalIndex: 'before',
      _propertyReader: 'before',
      _cachedIndexTree: 'before',
      _materializedGraph: {},
    };

    // Should not throw
    _buildView.call(/** @type {import('../../../../src/domain/WarpRuntime.js').default} */ (/** @type {unknown} */ (ctx)), createEmptyStateV5(), 'hash456');
    expect(ctx._logicalIndex).toBeNull();
  });
});
