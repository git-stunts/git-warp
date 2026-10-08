# #957 observation custody plan

Status: selected implementation plan, not an implemented fix or acceptance result. Source anchor: CAS feature stack `83c4b2cf51d60ed736797d90d371c08b2158e3eb`; main remains `ceb58e656ec5bc85f0ae5991bf2a55599693bbb3`. Mainline merging is paused. #957 will be a dependent feature PR on #986, preserving its independently useful bootstrap correction.

## Verified custody gap

RuntimeHost starts its observed Lamport maximum at zero. PatchDiscovery selects the own writer tip plus that process-local maximum. PatchBuilder.prepareWriteBasis restores the own predecessor, but ordinary property intents have no removal targets and skip the foreign journal observation. A public read in another process cannot update this new process's field.

GraphCoordinateRef embeds the exact frontier in a canonical coordinate string. PatchBuilderCausalBasis retains that string in a WeakMap and WriteAdmissionRuntime puts it in the returned admission evaluation. PatchCommitter constructs a Patch with clock, membership context, operations, reads/writes and entity admissions. Patch has no retained observed patch-frontier field; CborPatchJournalAdapter encodes only that Patch into the storage-owned bundle. A returned admission coordinate alone does not establish durable patch custody.

PatchController increments the host vector after each commit. Do not assume that writer a's context is one merely because its first node used dot one; preserve the actual validated counter values in its patch. VersionVector counters and Lamport values remain separate. Compare against the actual source contexts and operation dots in tests.

## Selected observation and persistence mechanism

At public live-write preparation, explicitly capture writer-head references and read the corresponding immutable decoded journal patches. Pin the own writer to the builder's expected predecessor; foreign changes after capture remain unobserved. Ref names without inspected patches do not establish observation. Treat the capture as a set of specifically inspected heads, not a claim of an atomic cross-writer ref transaction or complete history replay.

Construct one protected runtime-backed observation value containing the exact writer/patch frontier, the maximum validated observed Lamport and the joined membership contexts/dots from those same inputs. Merge it with the own predecessor context and retained process knowledge. Advance the new patch clock beyond the observed clock floor, preserving the existing own-ref CAS. Validate safe clock advancement and identity mismatches; return the public typed refusal without publishing a patch when required evidence is invalid.

Persist the exact observed frontier as additive optional patch metadata, carried by a validated immutable domain value and decoded at the adapter boundary. Keep existing schema interpretation, EventIds, parent chains, membership counters and LWW tie-breaks. Old patches remain readable when the optional metadata is absent. Prove that existing readers ignore the additive metadata without changing their interpreted operation content; do not assume compatibility from TypeScript alone. Rehydrate retained metadata and context through the existing journal on restart, independently of a live RuntimeHost object. The returned admission evaluation must identify the same captured frontier that the durable patch records.

Use existing storage-owned publication: the new metadata enters the patch asset inside the same immutable bundle and single writer-ref CAS as its operations. Do not introduce a separate mutable observation ref or a second publication that could tear from the admitted write. Do not add foreign Git parents: the current journal enforces linear per-writer parentage.

## Required proof before readiness

- Both formats retain the existing starvation RED and pass the complete observed-write law after the correction.
- Independent reopen and CLI repair show the new value, exact patch frontier and context; a further write preserves inherited observation.
- Compare clock, membership counters and retained patch identities independently, including contexts that differ numerically from Lamport values.
- Stale same-writer publication refuses; concurrent captures and unseen replicas preserve their actual observation boundaries and deterministic LWW resolution.
- Malformed metadata, wrong identities, stale coordinates and unsafe clock advancement return typed refusals without ref changes.
- Existing data, legacy readers, stored identities, low-level callbacks, strands and current bounded removal behavior retain their contracts.
- Capture reads are measured and resource-bounded; no hidden whole-state materialization or arbitrary new success-by-refusal profile substitutes for the required workflow.
- Exact-head regression, relevant full gates and current independent review pass. No narrow golden test alone completes the task.

Read the complete TypeScript policies before implementation. Keep new parsing in adapters and validated runtime values in core. Remove touched casts, retain all required public compatibility, and obtain full touched-code coverage where refactoring is necessary. Record any contradiction in the selected mechanism before coding around it; this plan does not establish proofs that have not been executed.

## Signing boundary qualification

BTR canonical signing is an existing fixed projection of operation content, clock, context and original patch SHA. Adding observation metadata to that projection would change signing bytes and break old verifiers. Keep its canonical wire/signing contract unchanged. The observation remains in the authoritative patch asset, cryptographically identified by the SHA already carried in the provenance entry. BTR projection alone does not assert that it carries the complete observation record; resolve the original journal coordinate for that custody proof. Sync normalization must preserve the validated optional frontier when it returns a reconstructed current Patch.

## Selected cached membership

A cached membership removal uses the frontier paired with that snapshot, not a newer enumeration of live refs. The builder captures state and its paired frontier synchronously on its first snapshot access, preserving existing callbacks that prepare materialization after builder creation. Preparation validates those selected heads and records them with the removal. Newer foreign additions remain concurrent. Live ordinary writes capture current heads. Legacy manually constructed builders that provide cached state without a frontier retain their prior selected-state behavior; that compatibility path does not invent durable frontier evidence.
