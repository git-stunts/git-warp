# Structural attachment ownership

This is the normative ownership and mutation contract for [#903](https://github.com/git-stunts/git-warp/issues/903). Its executable reference model specifies finite ownership admission, preservation, transport, conflicts and atomic failure. It is not a recursive Runtime API or a proof that the shipped engine implements Paper II ticks. Reference encoding belongs to [#819](https://github.com/git-stunts/git-warp/issues/819), bounded traversal to [#820](https://github.com/git-stunts/git-warp/issues/820), and retention/doctor enforcement to [#821](https://github.com/git-stunts/git-warp/issues/821).

## Author requirements and implementation status

The sources are James Ross's [Paper I, pinned at `977efe6a`](https://github.com/flyingrobots/aion-paper-01-warp/blob/977efe6a61b13df3e3c1ef84cf8e78a4e469ca09/paper/main.tex) and [Paper II, pinned at `aced1597`](https://github.com/flyingrobots/aion-paper-02-worldlines/blob/aced1597b28cee137fe7a898870cf5b694534eaf/paper/main.tex), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The operational choices below adapt those requirements for git-warp; they do not imply author endorsement or reproduce a categorical proof.

| Source requirement | Contract consequence | Evidence boundary |
| --- | --- | --- |
| Paper I `def:warp-graph`: atoms or finite skeletons with vertex and edge attachments, constructed inductively | Structural ownership must have finite, closed, acyclic containment; node and edge positions have the same laws | Finite ownership projection in the reference model; graph-reference decoding is #819 |
| Paper I `def:depth`: atoms have depth zero; an empty skeleton has depth one | An empty owned graph still counts as descended structure | Empty-child node and edge refusal witnesses |
| Paper II `def:attachment-step`: local attachment changes keep the enclosing skeleton | Updates identify a complete occurrence path and preserve the enclosing positions | Update/transport commutation witnesses |
| Paper II `def:ndnc`: a position whose attached WARP has nonzero depth is neither deleted nor given multiple preserved images | Descent depends on the attachment at the position, not the position's absolute nesting level | Node/edge deletion and cloning refusals |
| Paper II `def:independence`, `def:leftmost`, `rem:atomicity`: delete/use independence, deterministic selection, atomic abort | Conflicting candidates have stable rejection reasons; a failed selected batch publishes no state changes | Reference scheduler and rollback receipts |

The current package stages, attaches, replaces, clears and streams opaque bytes through Runtime/Lane. An asset identifier, MIME label, property containing an identifier, or a convergent CRDT patch is not evidence of structural ownership. Existing packed consumers prove byte lifecycle and publication behavior. They do not prove DPOI matches, gluing conditions, a deterministic tick scheduler, or recursive lineage transport. The reference witnesses below likewise establish only the specified ownership projection, not those production capabilities.

## Values, occurrences and admission

An atom is opaque: scalar data, bytes, or an external identifier can be an atomic payload. A pinned external reference names immutable external state; a live reference is resolved against a separately captured coordinate. Neither owns the referenced graph, grants mutation authority, or promises recursive retention. Their reference network may contain cycles; following it is a traversal operation governed by #820.

A structural attachment is an owned graph occurrence beneath exactly one node or edge position. Occurrence identity and lineage are distinct from immutable storage identity. Two independently admitted occurrences may share the same immutable stored value, but they have different occurrence identities and paths. Copying an identifier must not create a second owner of the same occurrence. Replacing a value must not silently reuse or duplicate its lineage. This single-parent occurrence discipline is a git-warp operational choice; Paper I's value algebra itself does not specify storage identities.

Admission requires a finite set of occurrence identities, valid owner positions, and complete containment links. Every link must name an occurrence in that set; each child has at most one incoming ownership link; no occurrence contains itself directly or indirectly. Every component has an explicit root, including detached roots. A complete finite closure with these checks supplies a well-foundedness witness. An unresolved locator, caller-supplied depth, truncated scan, or absence of a discovered cycle is insufficient. Skeleton wiring may itself be cyclic; only structural containment is required to be acyclic. Encoding or resolving this proof without unbounded traversal is an implementation obligation for #819/#820, not supplied here.

An attachment path is the sequence of owner positions from its root occurrence to the changed slot. Each position carries its occurrence identity, owner kind and owner identity; node and edge namespaces are distinct. These are semantic fields, not a prescribed wire encoding. Admission and receipts must identify the path and captured basis. Display names and content-address sharing cannot substitute for this identity.

## Preservation and mutation

An attachment-only mutation changes a payload inside the selected occurrence while preserving every enclosing skeleton position and owned occurrence identity. A skeleton mutation supplies a tracking map from old positions to successor positions. Each position carrying structural descent must have exactly one preserved image of the same owner kind. Transport moves its attachment assignment to that image without allocating another occurrence or changing the descendant's identity. Transport must also be injective: merging two ownership positions must not discard either lineage.

Apply protection at each affected local skeleton, including inside descendants. A nested position holding an atom is not protected merely because its path is long; a root-level position holding an owned graph is protected. The publication candidate must satisfy the rule against the captured basis and its proposed successor, so attaching a child and deleting its owner cannot hide descent through ordering.

| Operation | Atom, byte asset, or external reference | Structural descent | Retention consequence |
| --- | --- | --- | --- |
| Delete owner | May remove the association under the owner's normal lifecycle law | Refuse deletion of any protected position, including an empty graph attachment | Historical facts remain; physical collection requires the appropriate retention policy |
| Detach / clear attachment | May clear the current association | Refuse implicit detachment of owned descendants | No automatic recursive release; #821 must retain still-owned occurrences |
| Replace attachment | May replace the value with explicit owner/path and provenance | Refuse whole-subtree replacement that loses lineage; use an admitted internal attachment update or single-image transport | Replacement of bytes is not a release of structural lineage |
| Preserve / transport | Preserve the association along the tracking map | Require one injective, same-kind image; preserve descendant identities and paths under reindexing | Retention follows the preserved ownership path |
| Copy owner/value | A fresh owner may share an immutable opaque value | Refuse multiple images or multiple owners of one occurrence | Shared storage does not become a new retention/lineage promise |
| External / live reference update | Replace the reference value under its own authority and captured-coordinate rules | Cannot silently upgrade a reference into ownership | External reachability is not an owned retention root |

These are conservative admission rules, not an invented garbage collector or transfer API. A future operation that intentionally releases or copies a structural lineage needs an explicit governed transition and evidence preserving this contract; it is not admitted by an ordinary clear/copy today. The paper's no-delete/no-clone condition constrains skeleton transport. The additional refusal of implicit structural detach/replace is this contract's operational rule against hiding destructive ownership changes in the attachment plane.

## Conflicts, atomicity and receipts

Every candidate declares the positions it uses, deletes and writes, including the enclosing path needed by an attachment update. Shared use of preserved structure is allowed. Delete/use interference in either direction conflicts; two writes to the same attachment slot also conflict. Overlapping attachment updates are serialized by a deterministic policy, not justified by skeleton independence alone. Unrelated attachment positions may update independently, including a node and edge sharing an enclosing graph.

The reference policy sorts unique candidate identifiers by JavaScript's UTF-16 code-unit lexical order and greedily accepts independent candidates. A rejected candidate records its identifier, stable reason and accepted blocker. This makes the witness reproducible; it is a chosen contract policy, not a claim that git-warp's multi-writer CRDT materializer runs the Paper II scheduler. Alternative production policies require an equally deterministic admitted result and truthful receipt.

A batch is validated against one captured immutable basis. Publication against a changed basis refuses with a stale-basis outcome. Applying the selected candidates occurs privately; if any fails, the observable successor is the original state and the receipt records the abort. Selection and publication are separate facts: selected identifiers may be present in an aborted receipt, but its published set is empty. Successful publication records all selected candidates, their affected paths, and conflict rejections. Reference receipts retain the captured immutable state by identity; a stale-basis receipt identifies that original basis, not the newer state that refused publication. Storage objects staged during failure are not graph publication; durable retention/cleanup belongs to #821.

Canonical transport of a preserved attachment commutes with its independent local update in the reference projection. This does not establish the full Paper II theorem: production DPOI rule/match validation, typed graph isomorphism, interface/gluing conditions, scheduler completeness, tick-event posets, persistence and failure recovery remain outside this proof. No claim of Paper II compliance follows from these witnesses or ordinary CRDT convergence.

## Executable contract witnesses

`test/unit/specs/StructuralAttachments.test.ts` runs through the existing stable unit shard and normal unit CI. Its model under `test/helpers/structuralAttachments/` is test-only, immutable, and finite; it projects ownership positions and containment links rather than implementing graph-reference storage or a full typed open graph rewriting engine. The mutation candidates do not create new containment links; admission of a supplied complete ownership forest is checked separately.

The witness compares results with independently stated occurrence/position/payload expectations. It covers direct and indirect cycle rejection, multiple-owner rejection, shared immutable values with distinct lineage, node/edge symmetry, empty-child protection, destructive detach/replace/copy refusal, preservation and transport, attachment path disclosure, independent update permutations, deterministic conflicts, stale-basis refusal and rollback after a later selected operation fails. Mutation controls must demonstrate that removing cycle/descendant/atomicity checks breaks those expectations. Tests, controls and probes execute only in COPY-based Docker images without host repository or Git-directory mounts.

Acceptance of this contract does not complete #819, #820 or #821. Those implementations must consume the laws directly and provide their own encoding, bounded execution, authority, retention and production integration evidence. Byte examples and migration guidance remain owned by #904.
