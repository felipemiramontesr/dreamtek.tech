# 🌐 Dreamtek.tech

**Landing Page Corporativa Oficial** – _Desarrollo Web, Mobile Apps, Ciberseguridad._

Este proyecto consolida la infraestructura web _High-End_ de Dreamtek, operando bajo la meta-arquitectura de **Next.js 15+ (App Router)** combinado exhaustivamente con **React 19**, **TypeScript estricto**, y **Tailwind CSS v4 (Glassmorphism & Antigravity UI)**.

---

## 🛠 Entorno de Desarrollo y Requisitos Previos

Antes de arrancar el sistema, asegúrate de poseer:

- Node.js versión `20.10.x` o superior.
- Gestor de paquetes `npm` u `pnpm`.

## 🚀 Despliegue Rápido (Local)

1. Instala las dependencias nucleares:

   ```bash
   npm install
   ```

2. Ejecuta el entorno de compilación (Turbopack en caliente):

   ```bash
   npm run dev
   ```

3. Visualiza la aplicación en [http://localhost:3000](http://localhost:3000).

---

## 🛡 Suite de Calidad y Ciberseguridad Integrada

Hemos configurado un motor industrial para salvaguardar la pureza del código, basándonos en **Prettier, ESLint estricto, Husky (Git Hooks) y Vitest**. Cada vez que realices un `git commit`, Husky pausará el sistema y auditará tu código automáticamente.

### Comandos de QA Profesionales

- **`npm run test`**: Lanza la suite de Pruebas Unitarias guiadas por _Vitest_. Escanea componentes aislados.
- **`npm run format`**: Sobrescribe y purga todos los archivos para encajarlos forzosamente dentro de las reglas estrictas de tabulación y limpieza estipuladas en `.prettierrc`.
- **`npm run lint`**: Activa los Sniffers para detectar antipatrones de React y de TypeScript.

## 📖 Arquitectura de UI y Variables Críticas

- **Patrón Visual (Glassmorphism):** El sistema utiliza utilidades encapsuladas (`class="glass-panel"`) definidas en `src/app/globals.css`.
- **Colores Corporativos Base:**
  - `Deep Space` (Fondo): `#00213D`
  - `Teck Red` (Acento/Acción): `#FF2D00`
- **Tipografía Oficial:** `PP Neue Montreal` incrustada localmente bajo peso Book, Medium, Italic y Bold sin dependencias externas.
- **Protocolos de Seguridad Web:** Implementados activamente al nivel de Servidor gracias al Middleware `src/proxy.ts` que inyecta _Content-Security-Policy_, previniendo inyecciones dinámicas e inhabilitando Cross-Site Scripting.

> Elaborado y automatizado por Antigravity Systems. 🛸
