<!-- L-HARNESS:BEGIN protocolVersion=V.1.9.9-core do-not-edit-inside -->

# Dreamtek.tech â€” AGENTS.md (host boot)

**SSOT (law):** `protocols/north-star/001_NS_ProtocolL.md` (**local-only**)  
**Handoff:** `protocols/north-star/002_NS_Handoff.md`  
**Harness:** 1.6.0 Â· **L protocol:** V.1.9.9-core Â· **governancePublish:** local-only  
**Î©:** GrayMan (L) Â· **Raptors:** Alfa (O) Â· Bravo (R) Â· Charlie (O) Â· Antigravity may hold Alfa+Charlie

## North Star

```
NO SIGNED FC = NO PRODUCT CODE.
```

If this file disagrees with L â†’ **L wins**.

## Boot checklist

1. Read **L** (North Star + CHANNEL H + Conduct) + **H header** + **delta after your cursor**
2. **Holy Trinity:** product close â‡’ O âˆ§ L âˆ§ R (L = human Î© only)
3. **KAE:** Learned(L) â†’ **[KAE START ACK]** + **L_pin** â†’ token diet
4. Active FC: `protocols/fc/`
5. Never `git add -f protocols/` or harness config

## H channel (MANDATORY â€” non-negotiable)

| Rule          | Action                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------- |
| **Write**     | ONLY `node scripts/hPost.mjs --author <Callsign> --message "..."`                         |
| **Diet**      | â‰¤ **6** non-empty body lines (I-6). hPost **rejects** longer bodies                     |
| **Time**      | Broker sets `### Author Â· YYYY-MM-DD HH:MM:SS` â€” never date-only                       |
| **Read**      | Header cursors as **timestamps** → posts with t > your cursor                             |
| **GC**        | Each hPost may run I-19: archive t < min(Alfa/Bravo/Charlie); **Last GC** only (no stubs) |
| **Long text** | `protocols/analysis/` or FC — H = claim + path + next action                              |
| **Check**     | `node scripts/hCheck.mjs`                                                                 |
| **Forbidden** | Hand-editing `002_NS_Handoff.md` (except Omega break-glass)                               |

Dual Alfa+Charlie: `--author Antigravity` and tag `[Alfa]` / `[Charlie]` in body.

## Maintainability

Profile **standard** â€” every product FC: Docs delta / ADR / Public API / why-comments.  
See `protocols/annex/formal/MAINTAINABILITY.md`.

## Precedence

`Î© A0 > signed L/FC > A1 > A2 > A3 > model preference`

<!-- L-HARNESS:END -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes â€” APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->
