# Worked Example: One WARP Tick As Optic, Witness, Receipt, and BTR Boundary

**Status:** DESIGN
**Date:** 2026-03-27
**Scope:** Make the relation between local rewrite law, replay witness,
explanatory receipt, and holographic boundary concrete

---

## Purpose

The note [holography-and-warp-optics.md](./holography-and-warp-optics.md)
separates the nouns cleanly. This note does the next useful thing: run one
small concrete tick all the way through the stack.

The goal is not to prove a full formalism. The goal is to make the mapping easy
to reason about:

- `Observer`
- `Lens`
- footprint
- local rewrite
- witness
- `TickReceipt`
- `TickPatch`
- provenance payload
- holographic boundary
- `BTR`

---

## Scenario

Assume:

- canonical `Worldline` `W_live`
- speculative `Strand` `S_review` forked from `W_live` at tick `41`
- current speculative state \(U_{41}^{S}\)
- an observer named `taskBoard`
- a lens that exposes only task-board-relevant entities and fields

At the current speculative frontier, the visible task state includes:

- node `task:42`
- properties:
  - `title = "Draft ADR"`
  - `status = "open"`
  - `owner = "alice"`
- node `user:alice`
- edge `task:42 -assigned_to-> user:alice`

Now a speculative intent is queued:

> mark `task:42` done and record who completed it

For the purpose of the example, let the admitted rewrite perform:

- `status := "done"`
- add edge `task:42 -completed_by-> user:alice`

---

## 1. Observer And Lens

The observer is a projection over the strand:

\[
\pi_{\texttt{taskBoard}} : S_{\texttt{review}} \to V_{\texttt{taskBoard}}
\]

where the lens/aperture may be thought of as:

- match `task:*`
- include neighboring `user:*` nodes only when operationally relevant
- expose only a bounded field family such as:
  - `title`
  - `status`
  - `owner`

Important:

- the observer is not the rewrite
- the observer computes the view in which the rewrite is interpreted
- a narrower lens means more hidden context and therefore potentially more
  witness burden when reasoning about reversibility

---

## 2. Footprint As Focus Boundary

The rewrite footprint is the focused region inside the visible whole.

For this example, a reasonable normalized footprint is:

- reads:
  - node `task:42`
  - property `task:42.status`
  - node `user:alice`
- writes:
  - property `task:42.status`
  - edge `task:42 -completed_by-> user:alice`
- affects:
  - node `task:42`
  - node `user:alice`

This is the optic-style focus boundary. It tells the runtime:

- what part of the whole is in play
- where interference must be checked
- what another queued intent must avoid to be admitted in the same tick

---

## 3. Local Rewrite

Call the local rewrite \(r_{\texttt{completeTask}}\).

At the focused region it acts like:

\[
r_{\texttt{completeTask}} :
(a = \texttt{task-open})
\to
(b = \texttt{task-done})
\]

More concretely, on the focused visible region:

- before:
  - `task:42.status = "open"`
  - no `completed_by` edge
- after:
  - `task:42.status = "done"`
  - `task:42 -completed_by-> user:alice`

This is the local optic action.

It is not yet the whole next state. The next whole only exists after
reassembly.

---

## 4. Reassembly Into The Whole

Let \(U_{41}^{S}\) be the whole speculative state before the tick.

The rewrite plus residual context yields:

\[
\sigma(U_{41}^{S}, r_{\texttt{completeTask}}, \omega)
=
U_{42}^{S}
\]

where:

- \(\sigma\) is the reintegration step
- \(\omega\) is the witness or residual information required by the chosen
  semantics

In current git-warp terms, the whole is a `WarpState`, and reassembly means:

- apply the exact admitted change to the focused region
- preserve the untouched remainder of the state
- produce the next immutable materialized snapshot

---

## 5. Witness

Now distinguish the **witness** from the **receipt**.

For deterministic replay, the witness for this one committed tick should be the
minimal information required to advance the state without re-running scheduler
search.

A plausible replay witness for this example is:

- rule-pack / policy identifier
- accepted match key for `completeTask(task:42, user:alice)`
- exact property delta:
  - `task:42.status: "open" -> "done"`
- exact structural delta:
  - add edge `task:42 -completed_by-> user:alice`
- attachment delta, if any
- commit flag

This is close to the Paper III notion of a **tick patch** as replay witness.

If we later want local inversion, the witness may need to be slightly richer,
for example explicitly recording overwritten prior values in a more canonical
form.

---

## 6. Tick Receipt

Now add explanatory structure.

Assume there was a second queued intent in the same strand:

> reassign `task:42` to `user:bob`

If that second intent overlaps the admitted footprint, the tick receipt may
record:

- all candidates considered in this tick
- accepted:
  - `completeTask(task:42, user:alice)`
- rejected:
  - `reassignTask(task:42, user:bob)`
- blocking relation:
  - `completeTask(...) \prec_{\mathrm{blk}} reassignTask(...)`
- metadata:
  - stable IDs
  - rejection reason
  - scheduling key order

This gives the explanation:

> the tick committed the completion rewrite, and the reassignment rewrite was
> excluded because its footprint overlapped with the already-admitted change

That is a **TickReceipt**.

It is richer than the replay witness.

---

## 7. Tick Patch

The committed **TickPatch** for this example is the prescriptive artefact for
the admitted step.

It should be sufficient to replay:

\[
\Apply(U_{41}^{S}, \mu_{41}) = U_{42}^{S}
\]

without recomputing the original search space.

The patch may optionally embed parts of the receipt, but it is not required to
carry the entire explanatory structure.

So:

- patch answers:
  - what happened, in replay-sufficient form?
- receipt answers:
  - why did it happen that way?

---

## 8. One-Tick Payload

For a one-tick worldline segment, the provenance payload is just:

\[
P = (\mu_{41})
\]

For a longer segment, it becomes:

\[
P = (\mu_{41}, \mu_{42}, \ldots, \mu_{n-1})
\]

The payload is linear across ticks even if each tick carries internal
partial-order explanation inside its receipt.

This is the first place where the local optic story becomes a segment-level
replay story.

---

## 9. Holographic Boundary

Now define the boundary encoding:

\[
B = (U_{41}^{S}, P)
\]

For this one-tick case, computational holography says:

\[
(U_{41}^{S}, (\mu_{41}))
\Longrightarrow
U_{41}^{S}, U_{42}^{S}
\]

In plain language:

> the replay-sufficient boundary determines the interior transition

For a longer payload:

\[
(U_0, (\mu_0, \ldots, \mu_{n-1}))
\Longrightarrow
U_0, U_1, \ldots, U_n
\]

This is why holography is not the same thing as the local optic.

- the optic explains one lawful local rewrite
- holography explains why a boundary sequence of replay witnesses reconstructs
  the full worldline segment

---

## 10. BTR Packaging

Now package the one-tick boundary into a BTR-like artifact:

\[
\mathrm{BTR}_{41} =
(h_{\mathrm{in}}, h_{\mathrm{out}}, U_{41}^{S}, (\mu_{41}), t, \kappa)
\]

where:

- \(h_{\mathrm{in}} = \Hash(U_{41}^{S})\)
- \(h_{\mathrm{out}} = \Hash(U_{42}^{S})\)
- \(t\) is a monotone counter or timestamp
- \(\kappa\) authenticates the record

This is now:

- indexable
- content-addressable
- tamper-evident
- replayable
- verifiable

The BTR is therefore not “the optic” and not “the receipt.”

It is the concrete carrier for the holographic boundary of that committed
segment.

---

## Compact Stack

For this one example, the layers are:

1. `Observer` / `Lens`
   - compute the visible aperture

2. footprint
   - define the focus boundary

3. local rewrite
   - update the focused region

4. witness
   - retain enough information to replay or otherwise justify the lawful step

5. `TickReceipt`
   - retain the full explanatory causal refinement

6. `TickPatch`
   - retain the replay-sufficient committed step

7. payload
   - concatenate committed replay witnesses across ticks

8. holographic boundary
   - pair input boundary with payload

9. `BTR`
   - package the boundary segment into a verifiable transport/storage artifact

---

## Why This Matters

This worked example sharpens the relationship between the theories:

- **optics** describes the lawful local shape of the rewrite
- **receipts** describe the explanatory causal refinement of the chosen tick
- **patches** carry the replay-sufficient witness of the committed tick
- **computational holography** says the boundary sequence of those replay
  witnesses determines the interior segment
- **BTRs** are the concrete boundary packages that store and authenticate that
  holographic content

If git-warp keeps those layers distinct, the nouns stay honest.

If git-warp collapses them into one overloaded record or one overloaded word,
the design will drift again.

---

## Immediate Naming Implications

This example strengthens confidence in the following public nouns:

- `Worldline`
- `Observer`
- `Lens`
- `Witness`
- `TickReceipt`
- `TickPatch`
- `BTR`

It also suggests that:

- `Hologram` can be a good implementation noun if it refers to replay-sufficient
  boundary content rather than explanatory receipts
- `Strand` is a clearer speculative-lane noun than `Strand` if the API
  leans harder into worldline family semantics

The example does **not** by itself settle the root-system noun (`WarpRuntime`
versus `WarpSystem` or another alternative), because that object sits above the
local rewrite law described here.
