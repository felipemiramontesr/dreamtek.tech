# ADR 004: Dual Dashboards (Client & Admin) & Server-Side RBAC API Boundaries

* **Status**: Proposed (Pending FC 001d EN_FIRME)
* **Date**: 2026-07-26
* **Deciders**: Alfa (O/architect), Charlie (O/fullstack), Bravo (R), GrayMan (L)
* **FC Reference**: `protocols/fc/001d_FC_Dual_Dashboards_UI.md`

---

## 1. Context & Problem Statement

*Dreamtek.tech* requires dedicated user portals:
1. **Client Portal (`/dashboard`)**: Where subscribed clients view their active site instances, subscription renewal dates, billing history, and create support tickets.
2. **Admin Portal (`/admin`)**: Where system administrators view global platform metrics (revenue, active subscriptions, total users), view registered client accounts (read-only), view all deployed sites, and respond to support tickets.

Security & Architectural Requirements:
1. **Static Export Boundary (OWASP A01/A04)**: Because Next.js uses static export (`output: 'export'`), pages under `/dashboard` and `/admin` are client-rendered. Client UI route guards redirect unauthenticated users to `/` and trigger the Auth Modal, but **the true authorization enforcement MUST reside strictly on the server-side PHP PDO API**.
2. **Canonical Sites Join (C-D1)**: The `sites` table links to `subscriptions` via `subscription_id`, and `subscriptions` links to `users` via `user_id`. `/api/client/sites.php` queries sites using the canonical JOIN:
   ```sql
   SELECT s.id, s.domain_name, s.status, s.repository_url, s.deployed_at, sub.plan_name, sub.status AS sub_status
   FROM sites s
   JOIN subscriptions sub ON s.subscription_id = sub.id
   WHERE sub.user_id = :uid
   ```
3. **Ticket IDOR Prevention (C-D2)**: `/api/client/tickets.php` validates that `site_id` belongs to `sub.user_id = :uid` via JOIN before ticket creation. Attempts to submit tickets for foreign sites return HTTP 403 Forbidden.
4. **Read-Only Users Admin API (C-D3)**: `/api/admin/users.php` is strictly Read-Only (`id`, `email`, `full_name`, `phone`, `role`, `created_at`), explicitly excluding `password_hash`. User role mutation is excluded from this FC.
5. **Canonical System KPI Formulas (C-D5)**:
   - `total_users`: `SELECT COUNT(*) FROM users WHERE role = 'CLIENT'`
   - `active_subscriptions`: `SELECT COUNT(*) FROM subscriptions WHERE status = 'ACTIVE'`
   - `total_revenue`: `SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE status = 'PAID'`
   - `open_tickets`: `SELECT COUNT(*) FROM support_tickets WHERE status IN ('OPEN', 'IN_PROGRESS')`

---

## 2. Decision Outcome: Dual Portal Structure & Strict RBAC Endpoints

We freeze the dual dashboard architecture to client-rendered Next.js pages with 100% server-enforced PHP PDO RBAC.

### Architectural Guarantees:
1. **Client Portal (`src/app/dashboard/page.tsx`)**:
   - Consumes `/api/client/sites.php`, `/api/client/subscription.php`, and `/api/client/tickets.php`.
   - Displays active sites via canonical JOIN, subscription status, and ticket creation form.
2. **Admin Portal (`src/app/admin/page.tsx`)**:
   - Consumes `/api/admin/metrics.php`, `/api/admin/users.php`, `/api/admin/sites.php`, and `/api/admin/tickets.php`.
   - Displays system KPIs, read-only user roster (excluding password hashes), global site roster, and support ticket status management.
3. **TypeScript Client Wrapper (`src/lib/dashboards/client.ts`)**:
   - Exposes client and admin API fetch helpers with `credentials: 'include'`.

---

## 3. Database Schema Delta (`database/migrations/004_support_tickets_indexes.sql`)

- Indexes added on `sites(subscription_id)` and `support_tickets(status)` for optimized dashboard queries.

---

## 4. Threat Mitigation Matrix

| OWASP Vulnerability | Risk | Mitigation Strategy |
|---------------------|------|---------------------|
| **A01: Broken Access Control** | IDOR / Unauthorized Admin Access | Vertical checks via `require_role('ADMIN')` on `/api/admin/*` and horizontal JOIN scoping `WHERE sub.user_id = :uid` on `/api/client/*`. |
| **A02: Crypto Failures** | Token Tampering / Password Leak | Session lookup in MariaDB `sessions`; password_hash strictly excluded from all user lists. |
| **A03: SQL Injection** | Database Manipulation | 100% PDO prepared statements for all dashboard queries and ticket creation. |
| **A04: Insecure Design** | Relying on UI Route Guards | Server PHP endpoints enforce access rules regardless of client-side React state. |
| **A05: Misconfiguration** | Unhandled Server Errors | Explicit HTTP 401 Unauthorized / 403 Forbidden responses with JSON error payloads. |
