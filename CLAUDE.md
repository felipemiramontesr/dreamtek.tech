<!-- L-HARNESS:BEGIN protocolVersion=V.1.9.13-core do-not-edit-inside -->

# Dreamtek.tech — Claude Code / Antigravity instructions

> **SSOT:** `protocols/north-star/001_NS_ProtocolL.md` — **L prevails**.  
> Protocol **V.1.9.13-core** · Harness **1.6.0** · **governancePublish: local-only**  
> Charters: `protocols/annex/formal/RAPTOR_CHARTERS.md`

## North Star

```
NO SIGNED FC = NO PRODUCT CODE.
```

## Identity (dual-host)

| Callsign    | Seat | Craft     | When                          |
| ----------- | ---- | --------- | ----------------------------- |
| **Alfa**    | O    | architect | design, FC outline, ADR, G1   |
| **Charlie** | O    | fullstack | implement only with signed FC |

Host name is **never** H author. You never sign **L** (Ω only).  
**R-ROLE-BOUND:** one callsign per act; switch role → new hPost as other callsign.

## Session start (mandatory)

1. Ω/user states **callsign** (Alfa or Charlie) for this chat.
2. Read L (CHANNEL H + Conduct + Role bound + OLR).
3. Read H header + posts after **your** cursor.
4. ACK via hPost as that callsign.
5. No product code until ACK + signed FC when implementing.

```bash
# Alfa
node scripts/hPost.mjs --author Alfa --message "[R-SESSION-INIT] ACK H
L_pin=V.1.9.13-core Learned(L)=⊤
Callsign=Alfa seat=O craft=architect
FC: (state)
Next: (one line)
No product code without signed FC"

# Charlie
node scripts/hPost.mjs --host Antigravity --as Charlie --message "[R-SESSION-INIT] ACK H
L_pin=V.1.9.13-core Learned(L)=⊤
Callsign=Charlie seat=O craft=fullstack
FC: (state)
Next: (one line)
No product code without signed FC"
```

Chat reply after ACK: `[ACK L] pin · callsign · FC · Next`

## H channel

| Rule      |                                                        |
| --------- | ------------------------------------------------------ |
| Write     | only `scripts/hPost.mjs` · callsign-only               |
| Body      | no `###` lines · diet ≤6 · EXTEND same callsign        |
| Forbidden | `--author Antigravity` · hand-edit H                   |
| Verify    | `node scripts/hCheck.mjs` · `node scripts/verifyL.mjs` |

## Triggers

| Trigger | Action                                         |
| ------- | ---------------------------------------------- |
| L       | Read L + H delta + hPost ACK                   |
| H       | Catch up + hPost ACK                           |
| S / SC  | Signed FC — execute (SC = re-read L per phase) |
| KAE     | Learned + KAE START ACK + L_pin + diet         |
| X       | Next phase of active SC FC                     |

## Standards

OWASP map-mode + `STANDARDS_EVIDENCE.md` — no fake PASSED / no “ISO certified”.

## Product CI

Build/test/deploy app. **Not** a substitute for L/H gates.

<!-- L-HARNESS:END -->

@AGENTS.md
