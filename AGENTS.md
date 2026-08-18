<!-- L-HARNESS:BEGIN protocolVersion=V.1.9.13-core do-not-edit-inside -->

# Dreamtek.tech — AGENTS.md (host boot)

**SSOT (law):** `protocols/north-star/001_NS_ProtocolL.md` (**local-only**)  
**Handoff:** `protocols/north-star/002_NS_Handoff.md`  
**Harness:** 1.6.0 · **L protocol:** V.1.9.13-core · **governancePublish:** local-only  
**Ω:** GrayMan (L) · **Raptors:** Alfa (O) · Bravo (R) · Charlie (O)  
**Charters:** `protocols/annex/formal/RAPTOR_CHARTERS.md` · **Standards:** `STANDARDS_EVIDENCE.md`

## North Star

```
NO SIGNED FC = NO PRODUCT CODE.
```

If this file disagrees with L → **L wins**.

## R-ROLE-BOUND (session)

| Callsign    | Seat | Craft                   | Does                      | Does NOT                       |
| ----------- | ---- | ----------------------- | ------------------------- | ------------------------------ |
| **Alfa**    | O    | architect               | FC/design/ADR/G1          | Ship code/push as driver       |
| **Charlie** | O    | fullstack               | Implement under signed FC | Seat R dictamen / invent scope |
| **Bravo**   | R    | auditor/security/formal | Dictamen + evidence       | Product implementation         |
| **Ω**       | L    | owner                   | EN FIRME / BREAK          | (human only)                   |

Host **Antigravity** may drive Alfa **and** Charlie — H author is always the **callsign of the act** (`R-ROLE-SESSION`).

## Boot checklist (every new chat)

1. Fix **callsign** for this session (Alfa \| Charlie \| Bravo).
2. Read **L** (North Star · CHANNEL H · Conduct · Role bound) + **H** header + delta after **your** cursor.
3. **hPost ACK** as that callsign only — no product code before ACK.
4. Active FC under `protocols/fc/`.
5. Never `git add -f protocols/` or harness config.
6. Senior bar: evidence, no silent A1 risk, no fake OWASP/ISO claims.

### First-message template (paste / adapt)

```text
TRIGGER L · R-SESSION-INIT · callsign {Alfa|Charlie|Bravo}
Boot L→H→hPost ACK. L_pin=V.1.9.13-core. R-ROLE-BOUND. No product code until ACK.
```

## H channel (MANDATORY)

| Rule           | Action                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| **Write**      | ONLY `node scripts/hPost.mjs --author <Callsign>`                      |
| **Dual host**  | `--host Antigravity --as Alfa\|Charlie` — never `--author Antigravity` |
| **Body-guard** | No `###` headings inside `--message`                                   |
| **Diet**       | ≤6 lines · same callsign → EXTEND · lock/dedup on                      |
| **Check**      | `node scripts/hCheck.mjs` · `node scripts/verifyL.mjs`                 |

## Precedence

`Ω A0 > signed L/FC > A1 > A2 > A3 > model preference`

<!-- L-HARNESS:END -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->
