import { describe, expect, it } from 'vitest';
import WarpAppDefault, {
  InMemoryGraphAdapter,
  WarpApp,
  WarpCore,
} from '../../../legacy.ts';
import * as publicApi from '../../../legacy.ts';

function openOptions(graphName: string, writerId: string): Parameters<typeof WarpCore.open>[0] {
  return {
    persistence: new InMemoryGraphAdapter(),
    graphName,
    writerId,
  };
}

describe('public facade split', () => {
  it('exports WarpApp as the default compatibility facade without WarpRuntime', () => {
    expect(WarpAppDefault).toBe(WarpApp);
    expect(publicApi.WarpApp).toBe(WarpApp);
    expect(publicApi.WarpCore).toBe(WarpCore);
    expect(Object.prototype.hasOwnProperty.call(publicApi, 'WarpRuntime')).toBe(false);
  });

  it('opens WarpApp as a curated facade with an explicit WarpCore escape hatch', async () => {
    const app = await WarpApp.open(openOptions('facade-app', 'writer-app'));

    expect(app).toBeInstanceOf(WarpApp);
    expect(app.graphName).toBe('facade-app');
    expect(app.writerId).toBe('writer-app');
    expect(app.core()).toBeInstanceOf(WarpCore);
    expect('materialize' in app).toBe(false);
    expect('getNodes' in app).toBe(false);
    expect('query' in app).toBe(false);
  });

  it('opens WarpCore as the explicit compatibility escape hatch', async () => {
    const core = await WarpCore.open(openOptions('facade-core', 'writer-core'));

    expect(core).toBeInstanceOf(WarpCore);
    expect(core.graphName).toBe('facade-core');
    expect(core.writerId).toBe('writer-core');
    expect(typeof core.createPatch).toBe('function');
    expect(typeof core.materialize).toBe('function');
  });
});
