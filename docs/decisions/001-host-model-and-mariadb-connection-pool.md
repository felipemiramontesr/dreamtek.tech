# ADR 001: Host Model Architecture & MariaDB Connection Management

* **Status**: Accepted
* **Date**: 2026-07-25
* **Deciders**: Alfa (O/architect), Charlie (O/fullstack), Bravo (R), GrayMan (L)
* **FC Reference**: `protocols/fc/001a_FC_DB_Schema_and_Host_Model.md`

---

## 1. Context & Problem Statement

*Dreamtek.tech* operates a high-speed landing page built with Next.js 16 (React 19) compiled as a static HTML export (`output: 'export'`) for optimal CDN performance.
To support dynamic capabilities (onboarding, user accounts, subscription billing, and ticket management), the application requires a persistent database (MariaDB) hosted on Hostinger.

We need a clear runtime host model decision that:
1. Preserves the Next.js static HTML export for the public landing page.
2. Provides secure, low-latency access to Hostinger MariaDB (`localhost:3306`).
3. Prevents client-side JS bundle credential leakage (OWASP A05).
4. Prevents SQL Injection (OWASP A03) via parameterized queries.
5. Manages database connection pool limits (`max_connections`) on Hostinger.

---

## 2. Decision Outcome: Frozen Runtime Stack (PHP 8.x PDO API)

We freeze the backend API runtime to **PHP 8.x PDO** located under `public/api/` (matching Hostinger's native stack and the existing `public/api/smtp_config.php`).

### Architectural Guarantees:
1. **Frontend**: Next.js static HTML/JS export served directly via Hostinger CDN.
2. **Backend API**: PHP 8.x scripts under `public/api/` consuming MariaDB on `localhost:3306`.
3. **Database Connection Reuse**: PDO persistent connections (`PDO::ATTR_PERSISTENT => true`) with connection timeout (`PDO::ATTR_TIMEOUT => 5`) to prevent exceeding Hostinger `max_connections`.
4. **Parameterized Prepared Statements**: 100% of SQL queries use PDO prepared statements (`$stmt->execute([':param' => $value])`) to prevent SQL Injection (OWASP A03).
5. **Strict Server-Side Boundary**: Database credentials reside strictly in `public/api/.env` on the server. No database driver or credentials can be imported into the Next.js client bundle (OWASP A05 / OWASP A02).

---

## 3. Database Environments Matrix

| Environment | Host | Driver / Mechanism | Credentials Source | CI / Automated Test Behavior |
|-------------|------|--------------------|--------------------|------------------------------|
| **Production** | Hostinger `localhost:3306` | PHP 8.x PDO Persistent | `public/api/.env` (Hostinger env) | Live execution on server |
| **Local Dev** | Local MariaDB `localhost:3306` | PHP PDO / Local CLI | `.env.local` | Local migration & integration testing |
| **CI (GitHub Actions)** | GHA Runner | Vitest Query Mock & PHP Syntax Lint (`php -l`) | Mocked | Unit query verification; skip live DB if `MARIADB_HOST` absent |

---

## 4. Foreign Key & Integrity Policy

All foreign keys defined in DDL migrations MUST declare explicit referential actions:
- `ON DELETE RESTRICT`
- `ON UPDATE CASCADE`
- Explicit indexes MUST be created on all foreign key columns to ensure query execution performance.

---

## 5. Security & Threat Mitigation Notes

- **A02 (Cryptographic Failures)**: Database passwords and JWT secrets reside exclusively in `.env` files protected by `.gitignore` and web server deny rules (`.htaccess` / server config denying direct web access to `.env`).
- **A03 (Injection)**: String concatenation in SQL statements is strictly prohibited. All queries MUST use PDO prepared statements.
- **A05 (Security Misconfiguration)**: `public/api/.env` is not publicly web-accessible. API endpoints return generic JSON error messages without exposing raw database stack traces or system paths.
