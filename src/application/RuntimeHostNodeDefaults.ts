import {
  installRuntimeHostCommitMessageCodecResolver,
  installRuntimeHostCodecResolver,
  installRuntimeHostCryptoResolver,
  installRuntimeHostTrustCryptoResolver,
} from '../domain/warp/RuntimeHostPortResolvers.ts';
import defaultCodec from '../infrastructure/codecs/CborCodec.ts';
import NodeCryptoAdapter from '../infrastructure/adapters/NodeCryptoAdapter.ts';
import TrustCryptoAdapter from '../infrastructure/adapters/TrustCryptoAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';

import type CodecPort from '../ports/CodecPort.ts';
import type CommitMessageCodecPort from '../ports/CommitMessageCodecPort.ts';
import type CryptoPort from '../ports/CryptoPort.ts';
import type TrustCryptoPort from '../ports/TrustCryptoPort.ts';

const DEFAULT_NODE_CRYPTO = new NodeCryptoAdapter();
const DEFAULT_TRUST_CRYPTO = new TrustCryptoAdapter();
Object.freeze(DEFAULT_NODE_CRYPTO);
Object.freeze(DEFAULT_TRUST_CRYPTO);

export type RuntimeHostNodePorts = {
  readonly codec: CodecPort;
  readonly crypto: CryptoPort;
  readonly trustCrypto: TrustCryptoPort;
  readonly commitMessageCodec: CommitMessageCodecPort;
};

const DEFAULT_NODE_PORTS: RuntimeHostNodePorts = Object.freeze({
  codec: defaultCodec,
  crypto: DEFAULT_NODE_CRYPTO,
  trustCrypto: DEFAULT_TRUST_CRYPTO,
  commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
});

export function getDefaultRuntimeHostNodePorts(): RuntimeHostNodePorts {
  return DEFAULT_NODE_PORTS;
}

export function installDefaultRuntimeHostNodePorts(): void {
  const ports = getDefaultRuntimeHostNodePorts();
  installRuntimeHostCodecResolver(() => ports.codec);
  installRuntimeHostCryptoResolver(() => ports.crypto);
  installRuntimeHostTrustCryptoResolver(() => ports.trustCrypto);
  installRuntimeHostCommitMessageCodecResolver(() => ports.commitMessageCodec);
}
