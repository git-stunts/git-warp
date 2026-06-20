import { describe, expect, it } from 'vitest';

import StrandController, {
  type StrandHost,
} from '../../../../../src/domain/services/controllers/StrandController.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../../src/domain/services/codec/WarpMessageCodec.ts';
import InMemoryGraphAdapter from '../../../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import CryptoPort from '../../../../../src/ports/CryptoPort.ts';

import type Patch from '../../../../../src/domain/types/Patch.ts';
import type { HashablePayload } from '../../../../../src/domain/types/conflict/HashablePayload.ts';

class StrandControllerCrypto extends CryptoPort {
  async hash(_algorithm: string, _data: string | Uint8Array): Promise<string> {
    return 'digest';
  }

  async hmac(_algorithm: string, _key: string | Uint8Array, _data: string | Uint8Array): Promise<Uint8Array> {
    return new Uint8Array();
  }

  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    return a.byteLength === b.byteLength;
  }
}

function createStrandHost(): StrandHost {
  return {
    _graphName: 'strand-host-interface',
    _persistence: new InMemoryGraphAdapter(),
    _crypto: new StrandControllerCrypto(),
    _loadPatchChainFromSha: async (_sha: string): Promise<Array<{ patch: Patch; sha: string }>> => [],
    _loadWriterPatches: async (_writerId: string): Promise<Array<{ patch: Patch; sha: string }>> => [],
    _maxObservedLamport: 0,
    _provenanceIndex: null,
    _provenanceDegraded: false,
    _cachedCeiling: null,
    _cachedFrontier: null,
    _lastFrontier: null,
    _setMaterializedState: async () => undefined,
    getFrontier: async () => new Map<string, string>(),
    _patchInProgress: false,
    _stateDirty: false,
    _cachedViewHash: null,
    _cachedState: null,
    _patchJournal: null,
    _patchBlobStorage: null,
    _blobStorage: null,
    _commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    _logger: null,
    _codec: {
      encode(_value: HashablePayload): Uint8Array {
        return new Uint8Array();
      },
    },
    _onDeleteWithData: 'warn',
  };
}

describe('StrandController host interface', () => {
  it('constructs from the named controller capability interface', () => {
    const host = createStrandHost();
    const controller = new StrandController(host);

    expect(controller._host).toBe(host);
  });
});
