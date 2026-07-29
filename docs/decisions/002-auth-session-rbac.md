# ADR 002: Authentication Engine, Opaque Session Store & RBAC

* **Status**: Accepted
* **Date**: 2026-07-25
* **Deciders**: Alfa (O/architect), Charlie (O/fullstack), Bravo (R), GrayMan (L)
* **FC Reference**: `protocols/fc/001b_FC_Auth_Engine_and_RBAC.md`

---

## 1. Context & Problem Statement

*Dreamtek.tech* requires a secure authentication and authorization mechanism for client accounts and internal administration.
The authentication model must operate under a Next.js static export (`output: 'export'`) communicating with a PHP 8.x PDO backend hosted on Hostinger.

Security requirements:
1. Prevent XSS token theft (OWASP A02): Prohibition of localStorage / sessionStorage for credentials.
2. Prevent session hijacking and unrevocable tokens (OWASP A01 / A07): Avoid JWTs or cleartext user ID cookies.
3. Mitigate brute-force attacks (OWASP A07): Rate limiting attempts.
4. Enforce strict Role-Based Access Control (`CLIENT` vs `ADMIN`).

---

## 2. Decision Outcome: Opaque DB-Backed Session Store & HTTP-Only Cookies

We freeze the session management architecture to **Option (A): Opaque 256-bit Session Tokens backed by MariaDB `sessions` table**.

### Architectural Guarantees:
1. **Cookie Configuration**:
   - Name: `dreamtek_session`
   - Attributes: `HttpOnly; Secure (prod); SameSite=Strict; Path=/api/; Max-Age=86400`
   - Value: Random 64-character hexadecimal token (256-bit entropy).
2. **Server-Side Session Table (`sessions`)**:
   - `token_hash`: SHA-256 hash of the session token stored in MariaDB (`VARCHAR(64)` indexed).
   - `user_id`: Reference to `users.id` with `ON DELETE CASCADE`.
   - `expires_at`: Expiration timestamp (24h default TTL).
3. **Session Lifecycle & Invalidation**:
   - **Login**: Generates new session token, records `token_hash` in `sessions`, sets `Set-Cookie`.
   - **Logout**: Deletes session record from `sessions` table AND sets `Max-Age=0` on cookie.
   - **Authentication Check**: Middleware verifies `token_hash` in `sessions` table and checks `expires_at > NOW()`.
4. **Password Hashing**:
   - Algorithm: `PASSWORD_BCRYPT` with cost factor 12. Password length min 8 chars.
5. **Rate Limiting Store (`login_attempts`)**:
   - MariaDB table tracking IP address, target email, and timestamp.
   - Max 5 failed attempts per IP/email window within 15 minutes. Returns HTTP 429 Too Many Requests.
6. **ADMIN Bootstrap Policy**:
   - Public registration (`/api/auth/register.php`) ONLY creates users with `role = 'CLIENT'`.
   - Creation of `ADMIN` role users is strictly prohibited via public endpoints and is executed via seed script `database/seeds/001_admin_bootstrap.sql`.

---

## 3. Threat Mitigation Matrix

| OWASP Vulnerability | Risk | Mitigation Strategy |
|---------------------|------|---------------------|
| **A01: Broken Access Control** | Privilege Escalation / IDOR | Middleware `require_role('ADMIN')` enforces strict RBAC; sessions bound to DB user record. |
| **A02: Cryptographic Failures** | Secret / Token Leakage | HTTP-Only SameSite=Strict cookies; zero tokens stored in localStorage; SHA-256 token hashing; BCRYPT cost 12 password hashing. |
| **A03: SQL Injection** | Query Compromise | 100% PDO prepared statements across all auth and session queries. |
| **A07: Auth Failures** | Brute Force / Session Hijacking | IP/email rate limiting (5 attempts/15 min); session ID regeneration on login; server-side session deletion on logout. |
