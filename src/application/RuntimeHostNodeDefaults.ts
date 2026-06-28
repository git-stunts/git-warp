import {
  installRuntimeHostCodecResolver,
  installRuntimeHostCryptoResolver,
  installRuntimeHostTrustCryptoResolver,
} from '../domain/warp/RuntimeHostPortResolvers.ts';
import defaultCodec from '../infrastructure/codecs/CborCodec.ts';
import NodeCryptoAdapter from '../infrastructure/adapters/NodeCryptoAdapter.ts';
import TrustCryptoAdapter from '../infrastructure/adapters/TrustCryptoAdapter.ts';
import { installDefaultRuntimeHostCommitMessageCodec } from './RuntimeHostCommitMessageCodecDefaults.ts';

const DEFAULT_NODE_CRYPTO = new NodeCryptoAdapter();
const DEFAULT_TRUST_CRYPTO = new TrustCryptoAdapter();
Object.freeze(DEFAULT_NODE_CRYPTO);
Object.freeze(DEFAULT_TRUST_CRYPTO);

export function installDefaultRuntimeHostNodePorts(): void {
  installRuntimeHostCodecResolver(() => defaultCodec);
  installRuntimeHostCryptoResolver(() => DEFAULT_NODE_CRYPTO);
  installRuntimeHostTrustCryptoResolver(() => DEFAULT_TRUST_CRYPTO);
  installDefaultRuntimeHostCommitMessageCodec();
}
