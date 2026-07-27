/* @generated from schemas/v19-public-vocabulary.graphql by Wesley. Do not edit. */

import { V19_MCP_CAPABILITIES } from './V19McpCapabilities.generated.ts';
import {
  V19_PUBLIC_NOUNS,
  V19_PUBLIC_VOCABULARY,
} from './V19PublicVocabulary.generated.ts';

export { V19_PUBLIC_NOUNS };

export const V19_CAPABILITY_CONTRACT = {
  ...V19_PUBLIC_VOCABULARY,
  mcp: V19_MCP_CAPABILITIES,
} as const;
