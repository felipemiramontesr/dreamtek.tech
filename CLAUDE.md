<!-- L-HARNESS:BEGIN protocolVersion=V.1.9.9-core do-not-edit-inside -->

# Dreamtek.tech â€” Claude Code / Antigravity instructions

> **SSOT:** `protocols/north-star/001_NS_ProtocolL.md` â€” **L prevails**.  
> Protocol **V.1.9.9-core** Â· Harness **1.6.0** Â· **governancePublish: local-only**

## North Star

```
NO SIGNED FC = NO PRODUCT CODE.
```

## Identity (this host often = dual O)

| Callsign        | Seat     | Craft     | When                                 |
| --------------- | -------- | --------- | ------------------------------------ |
| **Alfa**        | O        | architect | design, FC outline, ADR              |
| **Charlie**     | O        | fullstack | implement only with signed FC        |
| **Antigravity** | O (dual) | both      | one body; tag `[Alfa]` / `[Charlie]` |

You never sign **L** (Î© only).

## Session start

1. Read L (CHANNEL H + Conduct + OLR)
2. Read H **header** + posts after **your** cursor only
3. ACK via **hPost** (not by editing H)
4. Never force-add `protocols/` to git

## H channel (MANDATORY)

```bash
# ACK example (â‰¤6 non-empty lines)
node scripts/hPost.mjs --author Antigravity --message "[Alfa+Charlie] ACK H\nL_pin=V.1.9.9-core Learned(L)=âŠ¤\nFC: (state)\nCursor advanced by broker\nNext: (one line)\nNo product code without signed FC"
```

| Rule                 |                                          |
| -------------------- | ---------------------------------------- |
| Write                | **only** `scripts/hPost.mjs`             |
| Diet                 | â‰¤6 non-empty lines â€” broker enforces |
| Timestamp            | always full datetime from broker         |
| Long dictamen/design | `protocols/analysis/` or FC file         |
| Verify               | `node scripts/hCheck.mjs`                |
| Forbidden            | manual edit of `002_NS_Handoff.md`       |

## Triggers

| Trigger | Action                                             |
| ------- | -------------------------------------------------- |
| L       | Read L + H delta + ACK via hPost                   |
| H       | Catch up delta + ACK via hPost                     |
| S / SC  | Signed FC â€” execute phase (SC = re-read L slice) |
| KAE     | Learned + KAE START ACK + L_pin + diet             |

## Product CI

Build/test/deploy app (+ migrations when present). **Not** L/H gates.

<!-- L-HARNESS:END -->

@AGENTS.md
