// SPDX-License-Identifier: Apache-2.0

import { DeterminismBan } from './DeterminismBan.ts';
import { InlineQuarantine } from './InlineQuarantine.ts';

/**
 * The JSON.stringify ban is the same rule as Semgrep's
 * `ts-no-json-stringify-in-core` (docs/ANTI_SLUDGE_DECISIONS.md section 3
 * merged the two). The policy quarantines that rule under 0025B, so this ban
 * matches the calls that rule matches and honours that rule's inline
 * quarantine markers. No other ban has an exception.
 */
const JSON_STRINGIFY_QUARANTINE = new InlineQuarantine('ts-no-json-stringify-in-core');

/**
 * Nondeterministic APIs banned in src/domain/** (docs/ANTI_SLUDGE_POLICY.md
 * section 9). Conservative and intentionally annoying: on a false positive,
 * refactor.
 */
export const DOMAIN_DETERMINISM_BANS: readonly DeterminismBan[] = Object.freeze([
  // Wall clock
  DeterminismBan.absolute('Date.now()', /\bDate\.now\b/),
  DeterminismBan.absolute('new Date()', /\bnew Date\b/),
  DeterminismBan.absolute('performance.now()', /\bperformance\.now\b/),

  // Randomness
  DeterminismBan.absolute('Math.random()', /\bMath\.random\b/),
  DeterminismBan.absolute('crypto.randomUUID()', /\bcrypto\.randomUUID\b/),
  DeterminismBan.absolute('crypto.getRandomValues()', /\bcrypto\.getRandomValues\b/),

  // Key-order-dependent serialization
  DeterminismBan.quarantinedBy(
    'JSON.stringify() — use canonicalStringify for deterministic output',
    /\bJSON\.stringify\s*\(/,
    JSON_STRINGIFY_QUARANTINE,
  ),

  // Process and environment
  DeterminismBan.absolute('process.env', /\bprocess\.env\b/),
  DeterminismBan.absolute('process.pid', /\bprocess\.pid\b/),
  DeterminismBan.absolute('process.hrtime', /\bprocess\.hrtime\b/),

  // Timers
  DeterminismBan.absolute('setTimeout — use ClockPort', /\bsetTimeout\b/),
  DeterminismBan.absolute('setInterval — use ClockPort', /\bsetInterval\b/),
]);
