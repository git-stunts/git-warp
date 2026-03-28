# Computational Holography, BTRs, and WARP Optics

**Status:** DESIGN
**Date:** 2026-03-27
**Scope:** Clarify how replay boundaries, BTRs, receipts, and optic-style
rewrite semantics fit together

---

## Purpose

Several closely related concepts are easy to collapse into one vague idea:

- tick receipt
- tick patch
- witness
- provenance payload
- computational holography
- boundary transition record (BTR)
- wormhole
- optic

They are related, but they are not interchangeable.

This note records the intended separation and then explains how
**computational holography** and **WARP optics** fit together as complementary
layers:

- optics govern the lawful shape of a local rewrite
- holography governs the replay-sufficient boundary encoding of a worldline
  segment

The aim is to keep the implementation and docs honest as git-warp evolves.

---

## Source Alignment

This note is aligned to the terminology used in Papers II and III of the AION
series as collected in:

- `/Users/james/git/aion-papers-1_to_5.txt`

In particular:

- Paper II defines the tick receipt as an observational refinement of a tick
- Paper III distinguishes replay-sufficient patches from explanatory receipts
- Paper III defines computational holography, boundary encodings, BTRs, and
  wormholes

---

## Core Distinction

The most important split is:

- **receipt** explains why a tick happened that way
- **patch** is sufficient to replay what happened

So:

\[
\texttt{TickReceipt} \supseteq \texttt{TickPatch?}
\]

is **not** the right mental model.

The better model is:

\[
\texttt{TickPatch}
\text{ is the replay witness, while }
\texttt{TickReceipt}
\text{ is the explanatory refinement.}
\]

They may be bundled together in one concrete record, but they serve different
semantic roles.

---

## Glossary

### Tick Receipt

A **TickReceipt** is the full causal explanation of one tick.

It may include:

- the candidate events considered
- the accepted events
- the rejected events
- the blocking / scheduling poset
- rejection reasons
- stable identifiers and metadata

Question answered:

> Why did the tick happen that way?

Operational role:

- debugging
- audit
- TTD explanation
- conflict analysis

The committed successor state does not depend on the extra explanatory
structure in the receipt once the committed batch is fixed.

### Tick Patch

A **TickPatch** is the compact, replay-sufficient record for one committed tick.

It should contain enough information to advance:

\[
\Apply(U_i, \mu_i) = U_{i+1}
\]

without repeating the scheduler search.

Question answered:

> What happened, in the minimal form required to replay it?

Operational role:

- deterministic replay
- storage
- replication
- boundary encoding

In the language of the papers, this is the prescriptive view.

### Witness

A **Witness** is the minimal information required to make a local rewrite
lawful for the purpose at hand.

Depending on the purpose, the witness may be:

- sufficient for deterministic replay
- sufficient for local inversion
- sufficient for lawful reassembly into the whole

In the current AION holography story, the tick patch is the replay witness.

If git-warp later formalizes local reversibility more strongly, the minimal
rewrite witness may become a stricter object than the current patch format.

### Provenance Payload

A **ProvenancePayload** is an ordered sequence of replay-sufficient tick patches:

\[
P = (\mu_0, \ldots, \mu_{n-1})
\]

It is the linear boundary history across a worldline segment.

Question answered:

> Which replay-sufficient steps take this boundary state to that boundary state?

Operational role:

- replay
- composition
- prefix sharing
- slicing
- wormhole construction

### Boundary Encoding

A **BoundaryEncoding** is:

\[
B = (U_0, P)
\]

where:

- \(U_0\) is the input boundary state
- \(P\) is the provenance payload

This is the minimal semantic object needed by the computational holography
theorem in Paper III.

### Computational Holography

**Computational Holography** is the theorem or property that a replay-sufficient
boundary encoding determines the interior worldline segment:

\[
(U_0, P) \Longrightarrow U_0, U_1, \ldots, U_n
\]

In plain language:

> the bulk derivation volume is recoverable from the boundary

This is not the same as “there exists a log.”

It only holds when:

- the replay operation is deterministic
- the patch boundary is sufficient
- the patch boundary is stable under replay

### Hologram

This term is useful in implementation language, but the papers do not define a
separate formal object named `Hologram`.

Within git-warp, the safest intended meaning is:

> a replay-sufficient boundary representation of a worldline segment

So the best mapping is:

- **semantic hologram** = the replay-sufficient boundary object
- typically either the boundary encoding \((U_0, P)\) itself or an equivalent
  compact carrier of that same information

This means:

- a hologram is **not** the same thing as a receipt
- a hologram is much closer to the patch / payload / boundary family

### Boundary Transition Record (BTR)

A **Boundary Transition Record** is the concrete engineering package around a
replay-sufficient boundary segment.

Paper III gives the shape:

\[
\mathrm{BTR} =
(h_{\mathrm{in}}, h_{\mathrm{out}}, U_0, P, t, \kappa)
\]

where it binds:

- input boundary identity
- output boundary identity
- input state
- replay payload
- timestamp or monotone counter
- authentication material

Question answered:

> What is the verifiable, portable, tamper-evident package for this boundary
> transition?

Operational role:

- checkpoint / resume
- content-addressed indexing
- tamper evidence
- replication
- wormhole carrier

So:

- the **holographic content** is the replay-sufficient boundary
- the **BTR** is the concrete signed / hashed record that carries it

### Wormhole

A **Wormhole** is a compressed carrier for a multi-tick worldline segment.

It packages a sub-payload:

\[
P_{i:k} = (\mu_i, \ldots, \mu_{i+k-1})
\]

between two boundary states:

\[
U_i \Rightarrow^k U_{i+k}
\]

Question answered:

> How do we treat an already-verified multi-tick segment as one handle without
> losing provenance?

Operational role:

- compression
- checkpointing
- shared-prefix reuse
- partial materialization

Wormholes are semantically redundant but operationally useful.

---

## Where WARP Optics Fits

The optic picture answers a different question from holography.

Optics ask:

> What is the lawful shape of a local transformation of part of a whole?

The current working WARP mapping is:

- **whole**: a `WarpState` or other replay-relevant state object
- **projection**: an `Observer` over a `Worldline` or `Braid`
- **focus**: the rewrite footprint
- **local transformation**: the admitted rewrite bundle
- **residual / witness**: the information needed for lawful reassembly or local
  inversion
- **reassembly**: producing the next whole

So the optic layer is about one lawful step, not yet about a packaged worldline
segment.

In compact form:

\[
\text{Observer}
\;\to\;
\text{Focused visible region}
\;\to\;
\text{Rewrite}
\;\to\;
\text{Next whole}
\]

with witness data sufficient to make that step lawful.

---

## Optics Versus Holography

The clean split is:

### Optics

Optics are about:

- locality
- focus
- lawful update
- reassembly
- witness / residual structure
- composition of transformations

Question answered:

> How does one rewrite act on part of the world?

### Computational Holography

Computational holography is about:

- boundary sufficiency
- replay of a finite worldline segment
- compression of interior derivation volume into a boundary artifact
- composition of tick patches into a replayable payload

Question answered:

> How can a whole causal segment be reconstructed from its replay-sufficient
> boundary?

So:

- optics is the **local rewrite law**
- holography is the **segment-level replay law**

They are complementary, not competing.

---

## How They Compose

The intended stack is:

1. **Observer / Lens layer**
   Determines what is visible and at what aperture.

2. **Optic / Rewrite layer**
   Determines how a lawful local transformation acts on a focused region.

3. **Tick Patch layer**
   Records a replay-sufficient witness of the committed transformation.

4. **Tick Receipt layer**
   Optionally records the explanatory causal refinement of that same tick.

5. **Payload layer**
   Concatenates replay-sufficient steps into a worldline segment.

6. **Holographic boundary layer**
   States that the input boundary plus payload is sufficient to recover the
   interior segment.

7. **BTR layer**
   Packages that boundary segment into a content-addressed, tamper-evident
   artifact.

This is the clean relationship:

\[
\text{optic} \;\Rightarrow\; \text{replay witness} \;\Rightarrow\;
\text{payload} \;\Rightarrow\; \text{holographic boundary} \;\Rightarrow\;
\text{BTR}
\]

---

## The Right Way To Talk About It

The following statements are aligned:

- A tick receipt is an explanatory refinement of one tick.
- A tick patch is a replay-sufficient witness of one tick.
- A provenance payload is a worldline segment expressed as replay-sufficient
  tick patches.
- Computational holography says the boundary encoding \((U_0, P)\) determines
  the interior replay.
- A BTR is the concrete package that carries and authenticates that boundary.
- WARP optics describes the lawful structure of the local rewrites that those
  tick patches witness.

The following statements are misleading and should be avoided:

- “the receipt is the hologram”
- “the BTR is just a receipt”
- “holography means we logged everything”
- “optics and holography are the same theory”

---

## Implications For git-warp

If git-warp adopts this language cleanly, then:

1. `TickReceipt` should remain the explanatory / audit noun
2. replay-sufficient per-tick data should be named and treated distinctly from
   the receipt
3. `BTR` should remain a boundary / packaging noun, not a synonym for receipt
4. any future `Hologram` implementation noun should refer to replay-sufficient
   boundary content, not scheduler explanation
5. optic-style reasoning should be used to clarify rewrite locality, witnesses,
   and lawful composition, while holography should be used to clarify replay,
   slicing, prefix forks, and wormholes

---

## Working Summary

The shortest correct summary is:

> WARP optics explains the lawful shape of one local rewrite; computational
> holography explains why a replay-sufficient boundary can recover an entire
> worldline segment; and the BTR is the concrete artifact that packages that
> holographic boundary for storage, verification, and transport.
