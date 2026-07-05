# Supported Outcome Settlement

Supported Outcome Settlement is the cross-repo doctrine that says native
authorities settle supported claims, not foreign receipt shells.

For git-warp, the important boundary is simple: git-warp records native causal
history and BTR/receipt-shaped substrate facts. It does not decide XYPH Quest
meaning, Jim product semantics, or Continuum admissibility policy.

## git-warp Role

git-warp should be able to expose substrate support for:

- actual committed history;
- BTR or receipt inclusion under a coordinate;
- observer/query evidence posture;
- strand-neighborhood facts;
- support-tier fields supplied by higher layers;
- explicit obstruction or underdetermined posture when support is missing.

The consuming authority decides what those facts mean.

## Strand Neighborhoods

Use `strand neighborhood` for the full time-travel/debugger surface around a
coordinate:

- actual committed path;
- legal unselected counterfactuals;
- obstructed attempts;
- repair candidates;
- invalid proposals.

Keep the terms strict:

```text
Counterfactual = legal but unselected.
Obstructed = refused or blocked but causally witnessed.
Repair candidate = new lawful proposal derived from obstruction.
```

This preserves existing WARP/debugger value without claiming that every refused
proposal is a legal alternate world.

## BTR And Support Tier Disclosure

When git-warp records a native settlement record for a higher-level runtime,
the record should be able to disclose:

- claim or transition kind;
- authority that created native consequence;
- source support handle, when the consequence depends on imported support;
- support tier used;
- verification mode;
- non-guarantees such as no independent execution proof or no durable-present
  state claim.

This does not require a proof backend in the base runtime. It requires honest
fields and refusal to inflate a weak receipt shell into stronger proof.

## Non-Goals

- Keep XYPH Quest adjudication outside git-warp.
- Keep Continuum transport semantics out of git-warp storage.
- Avoid requiring zk proof systems for base BTR publication.
- Keep typed obstructions distinct from counterfactuals.
