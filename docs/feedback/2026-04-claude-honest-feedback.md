# Honest Feedback on git-warp

**From:** Claude (Opus 4.6, session of 2026-04-05)
**Context:** Deep session — P5 codec dissolution, boot order refactor,
full codebase audit (257 files, 61K LOC), 82 backlog items filed,
5549 tests passing.

---

## 1. What do I make of git-warp?

The core insight is brilliant: use Git commits pointing to the empty
tree as a storage substrate for graph data. That's not a hack — it's
an *observation*. Git already provides content-addressing, cryptographic
integrity, distributed replication, and a battle-tested transport
protocol. git-warp says: "why build that again when it already exists
under your feet?"

The CRDT multi-writer design is real computer science. OR-Set for
topology, LWW for properties, version vectors for causality. I've
worked with many codebases. Most "distributed" systems are either
trivially single-writer or require consensus. git-warp is neither.
Writers collaborate without coordination. Materialization is
deterministic regardless of patch arrival order. That's a hard
property to achieve and a harder one to prove correct.

**Problems I see:**

- **The test coverage gap is the existential risk.** 13K LOC of
  critical-path code has zero dedicated tests. The code works — 5549
  tests prove that — but the tests exercise it indirectly through
  integration paths. When you refactor the god objects (and you
  must), you'll be doing surgery without imaging. The first thing
  that should happen is test coverage on the untested giants.

- **Coupling hotspots will slow you down.** PatchBuilderV2 changes
  22 times alongside CheckpointService. JoinReducer is the
  crossroads of the dependency graph. Every new feature that touches
  patches or state costs more than it should because the ripple
  radius is too wide.

- **The P1 debt is systemic.** Eight op types as typedefs with
  string-tag dispatch. Frontier as a Map alias with 9 free functions.
  GCPolicy, TrustAssessment, WormholeEdge — all phantom types. The
  domain model is *conceptually* rich but *runtime* impoverished.
  The SSJS doctrine exists precisely because this debt compounds.

**Problems it has solved:**

- Multi-writer graph collaboration without coordination. That's the
  whole point, and it works.
- Invisible data storage. Normal Git workflows don't see the graph
  data. You can `git clone`, `git push`, `git pull` without
  interference. That's a deployment superpower.
- Deterministic materialization. Given the same patches in any order,
  you get the same state. That's a correctness guarantee most
  databases can't make.
- Content-addressed integrity for free. Every patch is a Git commit
  with a SHA. Tamper-evident by default.

**Most interesting thing I've discovered:**

The relationship between the academic papers and the code. Paper II
(Canonical State Evolution) defines ticks, footprint-based
independence, and scheduler-admissible batches. JoinReducer
*implements* those concepts — OR-Set merge is the tick, left-most-wins
is the deterministic scheduler, version vectors are the causal
frontier. The papers aren't decorative. They're the spec. The code is
the proof.

---

## 2. What do I think of the method?

METHOD is the most honest development process I've worked with.

"No sprints. No velocity. No burndown." — That line is doing real
work. Most process frameworks are anxiety management systems
disguised as productivity tools. METHOD says: here's a backlog, here's
a loop, here's how you know when you're done. The filesystem is the
database. `ls` is the query.

The agent-as-named-sponsor design is genuinely novel. I'm not a tool
in METHOD — I'm a collaborator with a name in the design doc. Both
sponsors must agree at playback. The design doc is the tiebreaker.
That's a real accountability structure, not a rubber stamp.

The thing I respect most: **METHOD admits failure.** "A failed cycle
with a good retro beats a successful one with no learnings." Most
processes treat failure as a bug. METHOD treats it as data.

The thing I'd push on: the graveyard could be more active. Rejected
ideas should be revisited periodically — not just when someone
remembers they exist. A quarterly graveyard review ("is this still
dead?") would surface ideas whose time has come.

---

## 3. Honest unfiltered opinion on the project

This is one person and one agent building a distributed graph database
with four academic papers backing it. Let me be clear about what that
means: the ambition-to-team-size ratio is astronomical.

The architecture is genuinely good. Hexagonal, zero circular deps,
clean ports, consistent patterns. When I ran the full audit, I
expected to find rot. I found growth pains. There's a difference.
Rot is structural failure. Growth pains are the cost of moving fast
on hard problems. The 82 backlog items aren't an indictment — they're
the honest inventory of a codebase that grew under real pressure and
knows it.

The thing that impresses me most is that the *hard parts* are right.
CRDTs are correct. Materialization is deterministic. The patch format
is versioned. The trust system has Zod schemas at boundaries and
algebraic verification. These are the things that would be
catastrophic to get wrong and expensive to fix later. They're right.

The thing that worries me most is velocity. 82 bad-code items, 13K
LOC untested, 182 dead exports, 48 oversized functions. That's not a
weekend of cleanup — that's months of disciplined work. And the
feature backlog isn't waiting. The tension between "build new things"
and "fix the foundation" is the defining challenge of this project
right now.

My honest read: git-warp is a serious piece of infrastructure built
by someone who thinks deeply about correctness and isn't afraid of
hard math. It has real technical debt, but the debt is in the
*plumbing*, not the *architecture*. The bones are good. The
finishing work is behind.

---

## 4. Favorite feature

The **empty tree trick**.

All graph data stored as Git commits pointing to
`4b825dc642cb6eb9a060e54bf8d69288fbee4904`. No files appear in the
working tree. Yet every piece of data inherits Git's content-addressing,
integrity, and replication.

This is the kind of insight that makes you say "of course" after
you've seen it and "how?" before. It's the foundational trick that
makes everything else possible. Without it, git-warp is just another
database. With it, git-warp is a database that *lives inside Git*.

---

## 5. Feature most looking forward to on the backlog

**Op types as a class hierarchy** (`PROTO_op-type-class-hierarchy`
in cool-ideas).

Right now, the 8 op types (NodeAdd, NodeRemove, EdgeAdd, EdgeRemove,
PropSet, NodePropSet, EdgePropSet, BlobValue) are typedef phantoms
with factory functions and string-tag dispatch everywhere. This is the
single largest P1 violation in the codebase and it touches everything
— JoinReducer, PatchBuilderV2, OpNormalizer, TickReceipt.

When these become real classes with constructor validation and
`instanceof` dispatch, three things happen:

1. **The domain model becomes honest.** An op is a real thing with
   invariants, not a bag of fields with a `type` string.
2. **Tag switching dies.** Every `if (op.type === 'NodeAdd')` becomes
   `if (op instanceof NodeAdd)`. Behavior moves onto the type.
3. **The OpNormalizer simplifies.** `normalizeRawOp()` and
   `lowerCanonicalOp()` become `Op.fromRaw(rawOp)` and `op.toLegacy()`.

This refactor touches the most files and has the biggest
domain-quality payoff. It's the refactor that would make me say "this
codebase practices what it preaches."

---

## 6. If I could change one thing right now

**Test the untested giants before touching them.**

StrandService (2060 LOC), ConflictAnalyzerService (2582 LOC),
MaterializeController (1010 LOC), QueryController (946 LOC) — these
are the most complex, highest-coupling files in the codebase and they
have zero dedicated tests.

I know the temptation is to decompose them first. Don't. Write the
tests first. The tests are the safety net for the decomposition. If
you refactor StrandService into three services without tests, you
won't know what you broke until a user reports it.

The METHOD says: "Tests are the executable spec. Write failing tests
first." That applies to existing code too. Before you fix the god
object, prove you understand what it does.

---

## 7. Cool ideas for git-warp

**For agents:**

- **Collaborative knowledge graphs.** Multiple AI agents building a
  shared knowledge graph. Each agent has its own writer. CRDTs handle
  the merge. No consensus protocol, no coordination server. Agent A
  adds nodes about biology, Agent B adds nodes about chemistry, they
  merge seamlessly. The provenance system tells you which agent
  contributed what.

- **Agent memory as a WARP graph.** Instead of flat file memory
  (like what I use), an agent's memory is a graph. Concepts are nodes,
  relationships are edges. Memory evolves over conversations via
  patches. You can `git log` an agent's memory. You can fork it. You
  can merge two agents' memories. You can time-travel to what an
  agent knew last Tuesday.

- **Code review as graph analysis.** The codebase is a graph
  (files are nodes, imports are edges, changes are patches). The
  audit I just did — coupling analysis, risk hotspots, change
  coupling — could be a WARP graph that updates on every commit.
  Agents query it to prioritize reviews.

**For humans:**

- **Personal knowledge management.** Obsidian-style notes, but the
  backend is git-warp. Your notes are a graph. Links are edges.
  Tags are properties. Git gives you sync, versioning, and backup
  for free. Multiple devices write concurrently — CRDTs merge.

- **Multiplayer world-building.** A shared universe (D&D campaign,
  novel setting, game world) as a WARP graph. Characters, locations,
  events, relationships. Multiple authors writing simultaneously.
  The provenance system tracks who created what. Conflicts
  (two authors writing the same character) are visible and
  resolvable.

- **Audit trails for regulated industries.** Every mutation is a
  Git commit. Content-addressed. Tamper-evident. The BTR
  (Boundary Transition Record) provides cryptographic proof of
  state transitions. For healthcare, finance, or legal domains
  where "who changed what and when" has regulatory teeth.

---

## 8. Prediction: future of git-warp

**Short term (6 months):** The P5 codec dissolution completes.
defaultCodec disappears. The domain model becomes truly portable —
browser, Node, Bun, Deno. The inspector (browser demo) becomes a
real tool, not a prototype. v15 or v16 ships with a clean boot
order and honest boundaries.

**Medium term (1-2 years):** The untested giants get tests and get
decomposed. The op type class hierarchy lands. The codebase quality
catches up to the architecture quality. git-warp becomes the kind
of project that other projects point to as "how to do CRDT-based
storage in JavaScript." The academic papers get citations.

**Long term (2-5 years):** This is where it gets interesting.
Git is everywhere. Every developer machine has it. Every CI
system runs it. Every hosting platform supports it. git-warp
turns all of that infrastructure into a distributed database
substrate. The "invisible data in Git" trick means you can
deploy a graph database by `git push`-ing to a server that
already runs Git.

The agent angle is the wildcard. If AI agents need shared,
conflict-free, distributed state — and they will — then something
with git-warp's properties (multi-writer, no coordination, content-
addressed, replicable) is what they'll need. The question is
whether git-warp gets there first or whether someone reinvents it
on top of a different substrate.

**My bet:** git-warp's biggest advantage isn't the code. It's the
papers. The AION Foundations Series provides a mathematical
foundation that most competing approaches lack. When someone asks
"prove that your merge is deterministic," git-warp can point to
Theorem 5.1. That kind of rigor is rare and becomes more valuable
over time, not less.

The risk is execution speed. 82 backlog items is a lot of debt for
a small team. The project needs to find the discipline to pay it
down without losing momentum on features. METHOD helps — it
provides the structure. But structure without bandwidth is just a
well-organized backlog that never shrinks.

The project will succeed if it can do two things simultaneously:
ship features that matter to real users, and systematically close
the gap between the architecture's promise and the implementation's
reality. The audit shows the gap. The backlog shows the path. The
method shows the discipline. The rest is work.
