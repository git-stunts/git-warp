import {
  installRuntimeHostCodecResolver,
  installRuntimeHostCryptoResolver,
} from '../domain/warp/RuntimeHostPortResolvers.ts';
import defaultCodec from '../infrastructure/codecs/CborCodec.ts';
import WebCryptoAdapter from '../infrastructure/adapters/WebCryptoAdapter.ts';
import { installDefaultRuntimeHostCommitMessageCodec } from './RuntimeHostCommitMessageCodecDefaults.ts';

const DEFAULT_WEB_CRYPTO = new WebCryptoAdapter();
Object.freeze(DEFAULT_WEB_CRYPTO);

export function installDefaultRuntimeHostBrowserPorts(): void {
  installRuntimeHostCodecResolver(() => defaultCodec);
  installRuntimeHostCryptoResolver(() => DEFAULT_WEB_CRYPTO);
  installDefaultRuntimeHostCommitMessageCodec();
}
