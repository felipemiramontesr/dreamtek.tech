# ADR 003: Onboarding Wizard Pipeline & Stripe Payment Gateway Integration

* **Status**: Accepted
* **Date**: 2026-07-26
* **Deciders**: Alfa (O/architect), Charlie (O/fullstack), Bravo (R), GrayMan (L)
* **FC Reference**: `protocols/fc/001c_FC_Onboarding_Wizard_and_Checkout.md`

---

## 1. Context & Problem Statement

*Dreamtek.tech* requires an automated client onboarding pipeline within the "Escolta WEB" modal.
When a user clicks "INICIAR MI POSICIONAMIENTO WEB", the modal transitions into an interactive 5-step onboarding wizard:
1. Lead Identity Capture (Name, Company, WhatsApp, Email).
2. Visual Template Selection (Corporate, Services, E-commerce).
3. Domain Soft-Check (.com / .mx availability check only).
4. Order Summary & Stripe Checkout (Monthly $2,899 + VAT / Annual $2,599 + VAT).
5. Initial Site Information & Asset Submission.

Security & Architectural Requirements:
1. **Gateway Freeze (C-C1)**: Single provider selected — **Stripe Checkout & Webhooks**. MercadoPago is explicitly excluded from this FC.
2. **Native Webhook Signature Verification (C-C2 / OWASP A01)**: Stripe webhooks MUST verify the `Stripe-Signature` header using `STRIPE_WEBHOOK_SECRET` (`whsec_...`). Canonical event frozen to `checkout.session.completed` (C-C-R3).
3. **Idempotency & Order Lifecycle (C-C3 / OWASP A04)**: `orders.payment_gateway_id` enforced with a `UNIQUE` constraint. `session.php` creates `orders` with status `pending` passing `metadata[order_id]`. Webhook performs strict `pending -> paid` transition.
4. **Server-Side Price Authority (C-C4)**: Canonical prices stored as server constants ($2,899.00 MXN + 16% VAT = $3,362.84 MXN monthly; $2,599.00 MXN x 12 + 16% VAT = $36,178.08 MXN annual). Client price manipulation attempts are rejected.
5. **Domain Soft-Check & SSRF Protection (C-C5 / OWASP A10)**: Domain check is strictly a soft-check (DNS `checkdnsrr` / WHOIS lookup) without domain reservation/charging. Domain input is validated against hostname regex `/^[a-zA-Z0-9-]+\.(com|mx|com\.mx)$/`. Private/internal IPs (`169.254.169.254`, `127.0.0.1`, `10.0.0.0/8`) are strictly forbidden.
6. **Post-Checkout Session Delivery (C-C-R1)**: Webhook performs server-to-server order update. Client redirect to `success_url` invokes `/api/checkout/verify_success.php?session_id={CHECKOUT_SESSION_ID}` which verifies `paid` order status in MariaDB, provisions user with random BCRYPT hashed password (C-C-R4), creates opaque session, and issues `dreamtek_session` HTTP-Only cookie to the browser.
7. **Lead Hygiene & Unique Email (C-C-R2)**: `leads.email` has a `UNIQUE` key constraint for reliable PDO `ON DUPLICATE KEY UPDATE` behavior. `lead.php` applies 10/15m rate limiting.

---

## 2. Decision Outcome: Stripe Gateway & Server-Side Price Authority

We freeze the payment and onboarding architecture to **Stripe Checkout & Native Webhook Verification**.

### Architectural Guarantees:
1. **Canonical Pricing Constants**:
   - Monthly Base: `$2,899.00 MXN` + 16% VAT = `$3,362.84 MXN`
   - Annual Base: `$31,188.00 MXN` + 16% VAT = `$36,178.08 MXN` (Billed as `$2,599.00 MXN/month + VAT`)
2. **Secret Isolation**:
   - `STRIPE_SECRET_KEY` (`sk_live_...` / `sk_test_...`) and `STRIPE_WEBHOOK_SECRET` (`whsec_...`) stored exclusively in `public/api/.env`. Zero keys in JS bundle (OWASP A02).

---

## 3. Database Schema Delta (`database/migrations/003_leads_and_templates.sql`)

- **Table `leads`**: `id`, `email` (UNIQUE), `full_name`, `phone`, `company`, `step_reached`, `created_at`, `updated_at`.
- **Table `templates`**: `id` (VARCHAR), `name`, `category`, `preview_image_url`, `description`.
- **Seed `database/seeds/002_templates_seed.sql`**: Initial seeds for `corporate`, `services`, `ecommerce` templates.
- **Table `orders`**: UNIQUE index on `payment_gateway_id`.

---

## 4. Threat Mitigation Matrix

| OWASP Vulnerability | Risk | Mitigation Strategy |
|---------------------|------|---------------------|
| **A01: Access Control** | Payment Spoofing / Replay | Native `Stripe-Signature` header verification using `STRIPE_WEBHOOK_SECRET`. |
| **A02: Crypto Failures** | Secret Leakage | Stripe private keys stored exclusively in `public/api/.env`. |
| **A03: SQL Injection** | Query Manipulation | 100% PDO prepared statements for leads, orders, and domain checks. |
| **A04: Insecure Design** | Double Billing / Replay | `UNIQUE` constraint on `orders.payment_gateway_id` + server price validation. |
| **A05: Misconfiguration** | Invalid Webhook Handling | Explicit HTTP 400 response for invalid signatures; HTTP 200 only for validly processed events. |
| **A10: SSRF** | Outbound Probe Abuse | Strict domain regex validation `/^[a-zA-Z0-9-]+\.(com|mx|com\.mx)$/` + blocking private IP ranges. |
