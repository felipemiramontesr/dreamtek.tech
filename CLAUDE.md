<!-- L-HARNESS:BEGIN protocolVersion=V.1.9.10-core do-not-edit-inside -->

# Dreamtek.tech â€” Claude Code / Antigravity instructions

> **SSOT:** `protocols/north-star/001_NS_ProtocolL.md` â€” **L prevails**.  
> Protocol **V.1.9.10-core** Â· Harness **1.6.0** Â· **governancePublish: local-only**

## North Star

```
NO SIGNED FC = NO PRODUCT CODE.
```

## Identity (this host often = dual O)

| Callsign    | Seat | Craft     | When (this host often drives both) |
| ----------- | ---- | --------- | ---------------------------------- |
| **Alfa**    | O    | architect | design, FC outline, ADR            |
| **Charlie** | O    | fullstack | implement only with signed FC      |

Host **Antigravity** is not an H author. Post as the **callsign of the act**.

You never sign **L** (Ω only).

## Session start

1. Read L (CHANNEL H + Conduct + OLR)
2. Read H **header** + posts after **your** cursor only
3. ACK via **hPost** (not by editing H)
4. Never force-add `protocols/` to git

## H channel (MANDATORY)

```bash
# Architect act
node scripts/hPost.mjs --author Alfa --message "[O architect] ACK H\nL_pin=V.1.9.10-core\nFC: (state)\nNext: (one line)\nNo product code without signed FC"

# Driver / code / push act
node scripts/hPost.mjs --host Antigravity --as Charlie --message "[O fullstack] …"
```

| Rule                 |                                                         |
| -------------------- | ------------------------------------------------------- |
| Write                | **only** `scripts/hPost.mjs` · callsign-only            |
| Compact              | same callsign consecutive → EXTEND (no monologue flood) |
| Diet                 | ≤6 non-empty lines — broker enforces                    |
| Timestamp            | full datetime from broker                               |
| Long dictamen/design | `protocols/analysis/` or FC file                        |
| Verify               | `node scripts/hCheck.mjs`                               |
| Forbidden            | `--author Antigravity` · manual edit of H               |

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
