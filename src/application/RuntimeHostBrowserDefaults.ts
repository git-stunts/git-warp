import {
  installRuntimeHostClockResolver,
  installRuntimeHostCodecResolver,
  installRuntimeHostCryptoResolver,
  installRuntimeHostRandomResolver,
} from '../domain/warp/RuntimeHostPortResolvers.ts';
import defaultCodec from '../infrastructure/codecs/CborCodec.ts';
import WebCryptoAdapter from '../infrastructure/adapters/WebCryptoAdapter.ts';
import HostRandomAdapter from '../infrastructure/adapters/HostRandomAdapter.ts';
import HostClockAdapter from '../infrastructure/adapters/HostClockAdapter.ts';
import { installDefaultRuntimeHostCommitMessageCodec } from './RuntimeHostCommitMessageCodecDefaults.ts';

const DEFAULT_WEB_CRYPTO = new WebCryptoAdapter();
const DEFAULT_HOST_RANDOM = new HostRandomAdapter();
const DEFAULT_HOST_CLOCK = new HostClockAdapter();
Object.freeze(DEFAULT_WEB_CRYPTO);
Object.freeze(DEFAULT_HOST_RANDOM);
Object.freeze(DEFAULT_HOST_CLOCK);

export function installDefaultRuntimeHostBrowserPorts(): void {
  installRuntimeHostCodecResolver(() => defaultCodec);
  installRuntimeHostCryptoResolver(() => DEFAULT_WEB_CRYPTO);
  installRuntimeHostRandomResolver(() => DEFAULT_HOST_RANDOM);
  installRuntimeHostClockResolver(() => DEFAULT_HOST_CLOCK);
  installDefaultRuntimeHostCommitMessageCodec();
}
