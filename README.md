# 🌐 Dreamtek.tech

**Landing Page Corporativa Oficial** – _Desarrollo Web, Mobile Apps, Ciberseguridad._

Este proyecto consolida la infraestructura web _High-End_ de Dreamtek, operando bajo la meta-arquitectura de **Next.js 16 (App Router)** combinado exhaustivamente con **React 19**, **TypeScript estricto**, **Tailwind CSS v4 (Glassmorphism & Antigravity UI)**, **Vitest (Coverage v8)** y **Oxlint (Linter ultrarrápido en Rust)**.

---

## 🛠 Entorno de Desarrollo y Requisitos Previos

Antes de arrancar el sistema, asegúrate de poseer:

- Node.js versión `20.10.x` o superior.
- Gestor de paquetes `npm`.

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

## 🛡 Suite de Calidad, TDD y Oxlint Integrado

Hemos configurado un motor industrial para salvaguardar la pureza del código, basándonos en **Oxlint (Linter en Rust)**, **Prettier**, **Husky (Git Hooks)** y **Vitest (Coverage v8)**.

### Comandos de QA Profesionales

- **`npm run test`**: Lanza la suite completa de Pruebas Unitarias guiadas por _Vitest_.
- **`npm run test:coverage`**: Ejecuta la batería de pruebas generando reporte de cobertura de código v8 (`html`, `json`, `text`).
- **`npm run lint:oxlint`**: Ejecuta el análisis estático de código en milisegundos con _Oxlint_ (Rust-based).
- **`npm run format`**: Sobrescribe y purga todos los archivos para encajarlos estrictamente dentro de las reglas de `.prettierrc`.
- **`npm run format:check`**: Verifica el estado del formateo del código sin modificar archivos.
- **`npm run build`**: Ejecuta la compilación de producción de Next.js y optimiza las imágenes estáticas.

## 📖 Arquitectura de UI y Variables Críticas

- **Patrón Visual (Glassmorphism):** El sistema utiliza utilidades encapsuladas (`glass-panel`, `glass-panel-hover`) definidas en `src/app/globals.css`.
- **Colores Corporativos Base:**
  - `Deep Space` (Fondo): `#00213D`
  - `Teck Red` (Acento/Acción): `#FF2D00`
- **Tipografía Oficial:** `PP Neue Montreal` incrustada localmente bajo peso Book, Medium, Italic y Bold sin dependencias externas.
- **Internacionalización (i18n):** Sistema ligero basado en diccionarios estáticos (`src/i18n/dictionaries/es.ts` y `en.ts`).

> Elaborado y automatizado por Antigravity Systems. 🛸
