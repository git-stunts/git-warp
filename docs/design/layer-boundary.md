# Layer Boundary

**One rule:** the graph is inert, observers describe, application
logic acts. If you're confused about where something belongs, this
page settles it.

---

## Layer 1: Substrate

**What lives here:** Graph structure. Nodes, edges, properties.
Patches. Materialization. Worldlines. Observers. Query and traversal.
CRDT merge. Provenance index. Checkpoints. Seek/time-travel.

**Who writes:** Participants (writers). A writer is a causal actor
with a writer ID and a ref under `refs/warp/<graph>/writers/<id>`.

**Who reads:** Observers. An observer is a functor
`O : Hist(U, R) -> Tr` that maps histories to traces. Read-only.
Never writes. Deterministic for the same input.

**Deterministic?** Yes. Always. Given the same initial state and
patches, materialization produces the same result regardless of who
is observing, what sinks are configured, or what externalization
policy is active.

**What replay changes:** Nothing. Replay produces the same graph
state. That's the point.

---

## Layer 2: Host-Domain Infrastructure

**What lives here:** Externalization policies. Effect pipeline.
Multiplex sink. Sink adapters (console, chunk, no-op). Delivery
observation traces. In-memory emission logs.

**Who uses it:** Applications that want managed outbound delivery.
This is "batteries included" infrastructure that any WARP app would
need. It is not substrate.

**Who writes:** Nobody writes to the graph from this layer. The
pipeline and sinks operate entirely outside the graph. They receive
observer descriptions and produce external side effects (console
output, file writes, webhook calls).

**Deterministic?** No. Delivery depends on which sinks are
configured, whether external services are available, and the active
externalization policy. Two replicas with different configurations
produce different delivery outcomes.

**What replay changes:** The externalization policy switches to
`REPLAY_LENS`. Sinks record `outcome: 'suppressed'` instead of
delivering. The graph is unaffected.

---

## Layer 3: Application / Product

**What lives here:** Product meaning. Policy. Governance. Which
effect kinds matter. Whether delivery outcomes get re-imported into
the graph as causal truth. Domain semantics.

**Who writes:** Application writers. If a product wants "delivery
acknowledged" to be causal truth, a writer writes a patch containing
that fact. Not an observer. Not the pipeline. A writer.

**Who decides:** The application. git-warp provides structure and
observation. The application decides what structure means and what
to do about it.

**Deterministic?** Depends on the application. The graph truth the
application reads is deterministic. What the application does with
it is the application's business.

---

## The Boundary Rules

### Observers never write

If an observer writes to the graph, graph state depends on who is
watching. Determinism dies. This is non-negotiable.

If you need to record something in the graph based on what an
observer saw, the pattern is:

1. Observer sees something (read-only projection)
2. Observer emits a structural description (trace)
3. Application logic receives the description
4. Application logic instructs a **writer** to write a patch
5. The writer writes. Causal act by a participant.

The observer never touches the graph. The application bridges
observer output to writer input.

### The graph never acts

Nothing about graph structure causes anything. Effect nodes exist
because a writer put them there. Delivery edges exist because a
writer recorded them. The graph is the record. Application logic is
the cause.

### Externalization is application policy

Whether an observer-discovered fact gets pushed into the external
world is governed by the application's `ExternalizationPolicy`. The
substrate does not externalize. The substrate provides structure and
projection. The application decides what to do.

### Replay changes externalization, not truth

During replay:
- **Graph truth:** unchanged. Same patches, same state.
- **Observer output:** unchanged. Same projection, same traces.
- **Externalization:** suppressed. The policy says don't push to the
  external world.

The suppression is visible in the host-domain delivery trace. It is
NOT visible in the graph (the graph doesn't know about
externalization). If the application wants suppression recorded in
the graph, a writer writes it.

---

## Quick Reference

| Question | Answer |
|---|---|
| Can an observer write to the graph? | **No.** |
| Can a sink write to the graph? | **No.** Sinks are external I/O. |
| Can the pipeline write to the graph? | **No.** It's host-domain infra. |
| Who writes to the graph? | **Writers** (participants with writer IDs). |
| Is delivery tracking in the graph? | **Only if an application writer puts it there.** |
| Does replay change graph state? | **No.** |
| Does replay change delivery behavior? | **Yes.** Externalization is suppressed. |
| Where does delivery suppression live? | **Host-domain trace** (in-memory / chunk log). Not in the graph. |
| Does warp-ttd depend on the pipeline? | **No.** warp-ttd is its own observer. Reads graph truth directly. |
