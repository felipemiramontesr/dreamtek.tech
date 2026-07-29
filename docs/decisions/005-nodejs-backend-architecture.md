# ADR 005: Migración de Backend de PHP PDO a Servidor API Node.js (TypeScript)

* **Estado:** Aprobado
* **Fecha:** 2026-07-29
* **Autores:** Alfa (O), Charlie (O), GrayMan (L)
* **Revisores:** Bravo (R)

---

## Contexto y Alcance

Originalmente, los contratos FC 001a, FC 001b, FC 001c y FC 001d contemplaban endpoints PHP PDO dentro de `public/api/`. Sin embargo, para mejorar el mantenimiento, garantizar tipado estricto extremo a extremo (TypeScript End-to-End), facilitar las pruebas de integración y aprovechar el motor nativo **Hostinger Deploy Web App [JS]**, se ha acordado migrar la capa de servicios API a un servidor Node.js independiente.

## Decisión de Arquitectura

1. **Tecnología del Backend**:
   * Servidor **Node.js (TypeScript)** construido con **Express.js**.
   * Conector de Base de Datos: **`mysql2/promise`** con pool de conexiones asíncronas apuntando a MariaDB (`dreamtek` en local, `u701509674_dreamtek` en Hostinger).
   * Autenticación: JWT / Cookies `HttpOnly`, `SameSite=Lax`, `Secure` con hashing `bcryptjs`.
   * Integración con Stripe: SDK oficial `@stripe/stripe-js` / `stripe` en Node.js para checkout sessions y firmas de webhook.

2. **Despliegue e Infraestructura**:
   * El backend Node.js se ubicará en el directorio `/server` del repositorio de GitHub.
   * En Hostinger se desplegará mediante el módulo nativo **Deploy Web App [JS]** vinculado directamente al subdominio **`apiv1.dreamtek.tech`**.

3. **CORS & Seguridad**:
   * Permitir peticiones únicamente desde el origen autorizado `https://dreamtek.tech` (y `http://localhost:3000` en desarrollo).
   * Headers de seguridad activados mediante middleware de Express (Helmet, CORS con credenciales habilitadas).

## Consecuencias

* **Positivas**:
  * Eliminación de duplicidad de interfaces y DTOs entre cliente y servidor.
  * Pruebas de integración automatizadas nativas con Vitest y Supertest.
  * Despliegue continuo (CI/CD) simplificado mediante la integración nativa de GitHub en Hostinger.
* **Negativas / Mitigación**:
  * Es necesario refactorizar los scripts PHP PDO existentes en `/public/api` a controladores TypeScript en `/server/src/routes`.

## Matriz de Rutas Migradas

| Categoría | Ruta Express (Node.js) | Método | Descripción |
| :--- | :--- | :--- | :--- |
| **Health** | `/api/v1/health` | GET | Diagnóstico de salud del servicio |
| **Auth** | `/api/v1/auth/login` | POST | Autenticación y emisión de cookie JWT |
| **Auth** | `/api/v1/auth/logout` | POST | Cierre de sesión y revocación de cookie |
| **Auth** | `/api/v1/auth/me` | GET | Perfil de usuario autenticado actual |
| **Onboarding** | `/api/v1/onboarding/lead` | POST | Registro de prospecto |
| **Onboarding** | `/api/v1/onboarding/domain` | POST | Verificación suave de disponibilidad de dominio |
| **Checkout** | `/api/v1/checkout/session` | POST | Creación de Stripe Checkout Session |
| **Checkout** | `/api/v1/checkout/webhook` | POST | Webhook receptor de Stripe |
| **Client** | `/api/v1/client/sites` | GET | Sitios asignados al usuario (`sub.user_id = :uid`) |
| **Admin** | `/api/v1/admin/users` | GET | Listado de usuarios (Read-Only) |
| **Admin** | `/api/v1/admin/metrics` | GET | Métricas KPI del sistema |
