# ADR 007: Production Database Migrations Strategy via Self-Hosted Runner & Hostinger Remote IP Whitelist

- **Status:** ⏳ **PROPOSED (Alfa O)**
- **Date:** 2026-08-04
- **Deciders:** Alfa (O Architect), Bravo (R Auditor), GrayMan (L Ω)
- **Technical Area:** `database/migrations`, `ci-cd/self-hosted-runner`, `security/network-whitelisting`
- **Standards:** ISO/IEC 25010 (Security, Reliability, Maintainability, Auditability)

---

## 1. Context & Problem Statement

En la arquitectura de **Dreamtek.tech**, el servidor backend Express Node 24 y el almacenamiento persistente MariaDB operan en producción bajo infraestructura Hostinger / VPS Cloud.

A medida que evolucionan las funciones del sistema (autenticación, suscripciones Stripe, onboarding de prospectos, logs inmutables de auditoría `004_security_audit_logs.sql`), se requiere un mecanismo **seguro, auditable, automatizado e idempotente** para aplicar migraciones de esquema SQL a la base de datos de producción sin exponer credenciales críticas a runners públicos de terceros ni permitir accesos remotos no autorizados.

---

## 2. Proposed Architecture & Decision

**Alfa (O Architect)** aprueba y formaliza la propuesta técnica del Usuario/GrayMan:

### A. Estrategia de Control de Red (Network Access Control)

1. **Hostinger Remote MySQL Whitelist**: Se habilita el acceso remoto a MariaDB en Hostinger restringido exclusivamente a la dirección IP pública autorizada de la estación de desarrollo / runner local.
2. **Tunneling / Direct TLS**: La comunicación entre el runner y la BD de producción se efectúa sobre SSL/TLS cifrado (`mariadb` SSL mode) o túnel SSH directo.

### B. Runner de GitHub Actions Soberano (Self-Hosted Runner)

1. **Ejecución Local Segura**: Las migraciones a producción se ejecutan mediante un **Self-Hosted Runner** de GitHub Actions instalado en la máquina autorizada de desarrollo (`runs-on: self-hosted`).
2. **Cero Exposición de Secretos**: Las credenciales de producción (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`) permanecen almacenadas en el entorno local o en GitHub Repository Secrets con acceso restringido.

### C. Motor de Migraciones Idempotente (`scripts/migrate.mjs`)

1. **Tabla de Control `schema_migrations`**: Se mantiene la tabla meta `schema_migrations (id, version, filename, execution_time_ms, executed_at, checksum)`.
2. **Ejecución Secuencial y Transaccional**: El script lee la carpeta `database/migrations/*.sql` en orden alfanumérico estricto (`001_...`, `002_...`, `003_...`, `004_...`).
3. **Idempotencia**: Cada script SQL contiene cláusulas `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` o es verificado contra `schema_migrations` antes de ser ejecutado. Si una migración ya fue aplicada, el runner la omite automáticamente.

---

## 3. Workflow de CI/CD (`.github/workflows/db-migrate.yml`)

```yaml
name: Database Migrations (Production)

on:
  workflow_dispatch:
    inputs:
      reason:
        description: 'Razón de la migración en producción'
        required: true
        default: 'Despliegue de nuevo hito FC'

jobs:
  migrate:
    name: Run MariaDB Production Migrations
    runs-on: self-hosted
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js 24
        uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Run Migration Script
        env:
          DB_HOST: ${{ secrets.PROD_DB_HOST }}
          DB_USER: ${{ secrets.PROD_DB_USER }}
          DB_PASSWORD: ${{ secrets.PROD_DB_PASSWORD }}
          DB_NAME: ${{ secrets.PROD_DB_NAME }}
          DB_PORT: ${{ secrets.PROD_DB_PORT }}
        run: node scripts/migrate.mjs --env production
```

---

## 4. Consequences & ISO 25010 Compliance

### Pros:

- **Seguridad (ISO 25010 Security)**: Eliminación del riesgo de exposición de credenciales DB en runners públicos de GitHub Actions. Acceso DB bloqueado en Hostinger para cualquier IP no incluida en la lista blanca.
- **Trazabilidad (Protocol L)**: Registro exacto en `schema_migrations` del timestamp, nombre de archivo y checksum de cada migración aplicada.
- **Confiabilidad (ISO 25010 Reliability)**: Rollbacks seguros y ejecución transaccional garantizando que fallos a mitad de migración no dejen la BD en estado inconsistente.

### Cons / Mitigaciones:

- **IP Dinámica del Desarrollador**: Si la IP pública del ISP cambia, el acceso remoto a Hostinger rechazará la conexión.
  - _Mitigación_: Script CLI nativo `scripts/updateHostingerIp.mjs` usando API Hostinger para actualizar automáticamente la IP autorizada en la lista blanca previa a la migración.
