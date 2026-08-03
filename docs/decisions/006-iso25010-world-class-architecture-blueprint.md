# 🏛️ ADR 006: BLUEPRINT DE ARQUITECTURA TARGET Y ROADMAP ISO/IEC 25010

**Autor:** Alfa — Arquitecto Senior (Raptors Core)  
**Status:** PROPOSED ROADMAP (FAVORABLE CONDICIONADO por Bravo)  
**Supercedes:** N/A  
**Estándar:** ISO/IEC 25010 Software Quality Model · Protocolo L V.1.9.10-core  
**Fecha:** 2026-08-03

---

## 🎯 DISTINCIÓN IMPORTANTE: ESTADO AS-IS VS ESTADO OBJETIVO (TO-BE)

Este documento define la **Hoja de Ruta de Arquitectura Target (TO-BE)** para llevar a **Dreamtek.tech** a estándares enterprise globales.

- **Estado Actual (AS-IS - 2026-08-03)**:
  - Frontend: Next **16** con `output: 'export'` (estático).
  - API Backend: Servidor Express monolítico bajo `server/src/routes/`.
  - Autenticación: JWT HS512 simétrico en Cookie HttpOnly.
  - Persistencia: Instancia MariaDB 11.x con pool de conexiones `mysql2`.
  - Middleware: CORS permisivo básico (`index.ts`).

- **Estado Objetivo (TO-BE Roadmap ISO 25010)**:
  - Patrón Hexagonal por dominios (`domain/`, `use-cases/`, `adapters/`).
  - Caching Multi-Nivel (L1 Memory, L2 Redis).
  - Hardening Zero-Trust (CORS fail-closed, Helmet, Rate Limiter, HMAC webhooks).
  - Despliegue en contenedores OCI aislados con Probes `/healthz` y `/readyz`.

```
                    ┌─────────────────────────────────────────────────────────┐
                    │               CLIENT LAYER (Edge / Browser)             │
                    │   Next.js 16 App Router · WCAG 2.1 AA · i18n (ES/EN)   │
                    └────────────────────────────┬────────────────────────────┘
                                                 │ TLS 1.3 / HTTP/2
                                                 ▼
                    ┌─────────────────────────────────────────────────────────┐
                    │            API GATEWAY & ZERO-TRUST SECURITY            │
                    │   Rate Limiting · Helmet · WAF · CORS Fail-Closed       │
                    └────────────────────────────┬────────────────────────────┘
                                                 │
                   ┌─────────────────────────────┴─────────────────────────────┐
                   ▼                                                           ▼
┌──────────────────────────────────────┐                   ┌──────────────────────────────────────┐
│       COMMAND SIDE (Write DDD)       │                   │       QUERY SIDE (Read Model)        │
│   Node.js 24 Express · Domain Core   │                   │   Distributed L1/L2 Redis Cache     │
│   AES-256 Envelope Encryption       │                   │   Static ISR / Edge CDN Workers      │
└──────────────────┬───────────────────┘                   └──────────────────┬───────────────────┘
                   │                                                          │
                   └─────────────────────────────┬────────────────────────────┘
                                                 ▼
                    ┌─────────────────────────────────────────────────────────┐
                    │               DATA & PERSISTENCE LAYER                  │
                    │   MariaDB 11.x Cluster (Primary + Read Replicas Pool)   │
                    │   Append-Only Audit Log · Failure-Closed Cryptography   │
                    └─────────────────────────────────────────────────────────┘
```

---

## 📋 HOJA DE RUTA DE IMPLEMENTACIÓN POR FEATURE CONTRACTS (FCs)

Para evitar desalineaciones o entregas masivas monolíticas, el blueprint se ejecutará en **Feature Contracts (FCs)** atómicos firmados:

1. **FC 001h (P0 - Security Hardening)**:
   - Restricción estricta de CORS (fail-closed allowlist).
   - Integración de `helmet` para headers de seguridad (HSTS, CSP, X-Frame-Options).
   - Middleware `express-rate-limit` en rutas críticas (`/api/v1/auth`, `/api/v1/contact`, `/api/v1/onboarding`).
   - Bitácora de auditoría append-only para autenticación y transacciones.

2. **FC 001i (P1 - OpenAPI 3.1 & Contract Validation)**:
   - Definición de esquemas Zod en frontera y publicación de OpenAPI 3.1 en `/docs`.

3. **FC 001j (P2 - Performance & Resilience Probes)**:
   - Graceful shutdown de 10s y endpoints de salud `/healthz` y `/readyz`.
   - Caching L1 In-Memory para datos estáticos y diccionarios.

4. **FC 001k (P3 - Multi-Tier Scale & Redis)**:
   - Evaluación e integración de Redis L2 ante métricas empíricas de carga.

---

> _ADR 006 aceptado como Hoja de Ruta Target bajo dictamen FAVORABLE CONDICIONADO por Auditoría R (Bravo)._
