import ContinuumGeneratedFamilyInventory from './ContinuumGeneratedFamilyInventory.ts';
import ContinuumGeneratedFamilyInventoryEntry from './ContinuumGeneratedFamilyInventoryEntry.ts';

const CONTINUUM_FAMILY_VERSION = '0.1.0';
const PROFILED_FIXTURE_WITNESSED = 'profiled-fixture-witnessed';
const AUTHORED_ONLY = 'authored-only';

/** Builds the current Continuum/Wesley generated-family readiness inventory. */
export default function createCurrentContinuumGeneratedFamilyInventory(): ContinuumGeneratedFamilyInventory {
  return new ContinuumGeneratedFamilyInventory({
    entries: [
      receiptFamilyEntry(),
      settlementFamilyEntry(),
      neighborhoodCoreFamilyEntry(),
      runtimeBoundaryFamilyEntry(),
    ],
  });
}

/** Returns the current receipt-family readiness row. */
function receiptFamilyEntry(): ContinuumGeneratedFamilyInventoryEntry {
  return new ContinuumGeneratedFamilyInventoryEntry({
    familyId: 'receipt-family',
    version: CONTINUUM_FAMILY_VERSION,
    authoredSchemaPath: 'schemas/continuum-receipt-family.graphql',
    status: PROFILED_FIXTURE_WITNESSED,
    gitWarpSourceFacts: 'TickReceipt, DeliveryObservation, ReceiptShard',
    warpTtdConsumerNeed: 'receipt shell summary and delivery facts',
    openCut: 'replace fixture vectors with live sibling-runtime receipt publication',
  });
}

/** Returns the current settlement-family readiness row. */
function settlementFamilyEntry(): ContinuumGeneratedFamilyInventoryEntry {
  return new ContinuumGeneratedFamilyInventoryEntry({
    familyId: 'settlement-family',
    version: CONTINUUM_FAMILY_VERSION,
    authoredSchemaPath: 'schemas/continuum-settlement-family.graphql',
    status: PROFILED_FIXTURE_WITNESSED,
    gitWarpSourceFacts: 'PatchDiff, conflict traces, import candidates, writer frontier state',
    warpTtdConsumerNeed: 'merge and import inspection',
    openCut: 'prove live settlement values from git-warp suffix/import flows',
  });
}

/** Returns the current neighborhood-core-family readiness row. */
function neighborhoodCoreFamilyEntry(): ContinuumGeneratedFamilyInventoryEntry {
  return new ContinuumGeneratedFamilyInventoryEntry({
    familyId: 'neighborhood-core-family',
    version: CONTINUUM_FAMILY_VERSION,
    authoredSchemaPath: 'schemas/continuum-neighborhood-core-family.graphql',
    status: AUTHORED_ONLY,
    gitWarpSourceFacts: 'graph name, writer refs, frontiers, worldline participation facts',
    warpTtdConsumerNeed: 'participant catalog and neighborhood focus',
    openCut: 'add Wesley profile and fixture witness before projection-ready support',
  });
}

/** Returns the current runtime-boundary-family readiness row. */
function runtimeBoundaryFamilyEntry(): ContinuumGeneratedFamilyInventoryEntry {
  return new ContinuumGeneratedFamilyInventoryEntry({
    familyId: 'runtime-boundary-family',
    version: CONTINUUM_FAMILY_VERSION,
    authoredSchemaPath: 'schemas/continuum-runtime-boundary-family.graphql',
    status: AUTHORED_ONLY,
    gitWarpSourceFacts: 'read basis, materialize results, patch suffixes, import outcomes',
    warpTtdConsumerNeed: 'reading envelopes, suffix shells, and admission-chain facts',
    openCut: 'add Wesley profile and live witnessed suffix exchange/admission proof',
  });
}
