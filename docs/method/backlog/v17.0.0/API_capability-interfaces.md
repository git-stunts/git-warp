# Write capability interfaces for WarpGraph API

Define the public contract for each domain capability as a TypeScript
interface in `src/domain/capabilities/`. 71 public methods across 9
capabilities:

- `QueryCapability` (20 methods)
- `PatchCapability` (8 methods)
- `MaterializeCapability` (5 methods)
- `SyncCapability` (9 methods)
- `StrandCapability` (14 methods)
- `CheckpointCapability` (5 methods)
- `ProvenanceCapability` (3 methods)
- `ComparisonCapability` (5 methods)
- `SubscriptionCapability` (2 methods)
- `LifecycleCapability` (dispose, inspect, version)

Each interface is the PORT for its domain. SSTS says interfaces are
for ports. Controllers implement them.
