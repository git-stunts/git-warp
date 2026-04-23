# Retro — 0051 Content-Access Duplication

## Outcome

`hill met`

The repo no longer carries `SLUDGE_content-access-duplication` as a live
foundation task in `v17`.

That is honest because the implementation duplication was already materially
reduced into `src/domain/services/controllers/QueryContent.ts`. The only
remaining work is a public capability surface choice around `NodeContent` /
`EdgeContent`, and that belongs under
`API_migrate-consumers-to-capabilities`.

## What changed

- removed the stale live backlog card
- updated the `v17` release ledger so it explains why the card is closed
- updated the capability-migration note so it explicitly owns the deferred
  content accessor surface
- added a small docs ratchet to keep those two truths aligned

## Why this is better

It removes a duplicate planning surface.

The repo no longer claims there is still a separate sludge cleanup to do when
the real remaining work is a public API migration decision already owned by
another trunk.

## Next

Keep burning down the `v17` cleanup lane by removing stale residue and blocked
duplicate cards before they harden into fake release work.
