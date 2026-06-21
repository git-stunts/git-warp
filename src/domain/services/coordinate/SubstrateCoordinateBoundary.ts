/**
 * SubstrateCoordinateBoundary — stable lane, coordinate, and capability nouns.
 *
 * @module domain/services/coordinate/SubstrateCoordinateBoundary
 */

export type SubstrateLaneKind = 'worldline' | 'strand' | 'braid';
export type SubstrateCoordinateKind = 'live' | 'frontier' | 'checkpoint' | 'strand-base';
export type SubstrateCapabilityAuthority = 'substrate' | 'session-policy';

export const SUBSTRATE_LANE_KINDS: readonly SubstrateLaneKind[] = Object.freeze([
  'worldline',
  'strand',
  'braid',
]);

export const SUBSTRATE_COORDINATE_KINDS: readonly SubstrateCoordinateKind[] = Object.freeze([
  'live',
  'frontier',
  'checkpoint',
  'strand-base',
]);

export const SUBSTRATE_CAPABILITY_NAMES: readonly string[] = Object.freeze([
  'worldline.commit',
  'worldline.live',
  'worldline.seek',
  'worldline.observer',
  'worldline.optic',
  'strand.create',
  'strand.braid',
  'strand.patch',
  'strand.intent',
  'coordinate.compare',
  'coordinate.transfer-plan',
  'sync.exchange',
]);

export const SESSION_POLICY_CAPABILITY_NAMES: readonly string[] = Object.freeze([
  'debugger.cursor',
  'debugger.layout',
  'debugger.selection',
  'debugger.theme',
  'session.history',
  'session.shortcut',
]);

function includesName(names: readonly string[], name: string): boolean {
  return names.includes(name);
}

export default class SubstrateCoordinateBoundary {
  readonly laneKinds = SUBSTRATE_LANE_KINDS;
  readonly coordinateKinds = SUBSTRATE_COORDINATE_KINDS;
  readonly substrateCapabilities = SUBSTRATE_CAPABILITY_NAMES;
  readonly sessionPolicyCapabilities = SESSION_POLICY_CAPABILITY_NAMES;

  authorityFor(capabilityName: string): SubstrateCapabilityAuthority | null {
    if (includesName(SUBSTRATE_CAPABILITY_NAMES, capabilityName)) {
      return 'substrate';
    }
    if (includesName(SESSION_POLICY_CAPABILITY_NAMES, capabilityName)) {
      return 'session-policy';
    }
    return null;
  }
}
