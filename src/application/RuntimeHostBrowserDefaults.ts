import {
  installRuntimeHostCodecResolver,
  installRuntimeHostCryptoResolver,
  installRuntimeHostRandomResolver,
} from '../domain/warp/RuntimeHostPortResolvers.ts';
import defaultCodec from '../infrastructure/codecs/CborCodec.ts';
import WebCryptoAdapter from '../infrastructure/adapters/WebCryptoAdapter.ts';
import HostRandomAdapter from '../infrastructure/adapters/HostRandomAdapter.ts';
import { installDefaultRuntimeHostCommitMessageCodec } from './RuntimeHostCommitMessageCodecDefaults.ts';

const DEFAULT_WEB_CRYPTO = new WebCryptoAdapter();
const DEFAULT_HOST_RANDOM = new HostRandomAdapter();
Object.freeze(DEFAULT_WEB_CRYPTO);
Object.freeze(DEFAULT_HOST_RANDOM);

export function installDefaultRuntimeHostBrowserPorts(): void {
  installRuntimeHostCodecResolver(() => defaultCodec);
  installRuntimeHostCryptoResolver(() => DEFAULT_WEB_CRYPTO);
  installRuntimeHostRandomResolver(() => DEFAULT_HOST_RANDOM);
  installDefaultRuntimeHostCommitMessageCodec();
}
