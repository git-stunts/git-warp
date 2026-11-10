import {
  installRuntimeHostCommitMessageCodecResolver,
  installRuntimeHostClockResolver,
  installRuntimeHostCodecResolver,
  installRuntimeHostCryptoResolver,
  installRuntimeHostRandomResolver,
  installRuntimeHostTrustCryptoResolver,
} from '../domain/warp/RuntimeHostPortResolvers.ts';
import defaultCodec from '../infrastructure/codecs/CborCodec.ts';
import NodeCryptoAdapter from '../infrastructure/adapters/NodeCryptoAdapter.ts';
import HostRandomAdapter from '../infrastructure/adapters/HostRandomAdapter.ts';
import HostClockAdapter from '../infrastructure/adapters/HostClockAdapter.ts';
import TrustCryptoAdapter from '../infrastructure/adapters/TrustCryptoAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';

import type ClockPort from '../ports/ClockPort.ts';
import type CodecPort from '../ports/CodecPort.ts';
import type CommitMessageCodecPort from '../ports/CommitMessageCodecPort.ts';
import type CryptoPort from '../ports/CryptoPort.ts';
import type RandomPort from '../ports/RandomPort.ts';
import type TrustCryptoPort from '../ports/TrustCryptoPort.ts';

const DEFAULT_NODE_CRYPTO = new NodeCryptoAdapter();
const DEFAULT_TRUST_CRYPTO = new TrustCryptoAdapter();
const DEFAULT_HOST_RANDOM = new HostRandomAdapter();
const DEFAULT_HOST_CLOCK = new HostClockAdapter();
Object.freeze(DEFAULT_NODE_CRYPTO);
Object.freeze(DEFAULT_TRUST_CRYPTO);
Object.freeze(DEFAULT_HOST_RANDOM);
Object.freeze(DEFAULT_HOST_CLOCK);

export type RuntimeHostNodePorts = {
  readonly codec: CodecPort;
  readonly crypto: CryptoPort;
  readonly random: RandomPort;
  readonly clock: ClockPort;
  readonly trustCrypto: TrustCryptoPort;
  readonly commitMessageCodec: CommitMessageCodecPort;
};

const DEFAULT_NODE_PORTS: RuntimeHostNodePorts = Object.freeze({
  codec: defaultCodec,
  crypto: DEFAULT_NODE_CRYPTO,
  random: DEFAULT_HOST_RANDOM,
  clock: DEFAULT_HOST_CLOCK,
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
  installRuntimeHostRandomResolver(() => ports.random);
  installRuntimeHostClockResolver(() => ports.clock);
  installRuntimeHostTrustCryptoResolver(() => ports.trustCrypto);
  installRuntimeHostCommitMessageCodecResolver(() => ports.commitMessageCodec);
}
