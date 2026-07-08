# The Vault · Ops

**Internal operations panel for a Magic: The Gathering store on Shopify** — an embedded Shopify Admin app that orchestrates automated bots (inventory, pricing, price arbitrage), an order‑fulfillment pipeline, a product cache, and WhatsApp webhooks, all driven through a private backend.

![React Router](https://img.shields.io/badge/React_Router-7-CA4245?logo=reactrouter&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Shopify App](https://img.shields.io/badge/Shopify-App-95BF47?logo=shopify&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Node](https://img.shields.io/badge/Node-%E2%89%A520-5FA04E?logo=nodedotjs&logoColor=white)

**Language / Idioma:** **English** · [Español](#español)

> **Note on scope.** This repository is the **frontend + integration layer** (an embedded Shopify app that also acts as an authenticated backend‑for‑frontend). The heavy lifting — the bots, job queue and data processing — lives in a **separate, private FastAPI service** that is intentionally not part of this repo.

---

## Overview

The Vault is a Magic: The Gathering (MTG) card shop running on Shopify. Day‑to‑day operations — loading supplier inventory, keeping prices competitive, spotting cheap cards to restock, and preparing customer orders — used to be manual and spreadsheet‑driven.

**The Vault · Ops** turns those workflows into a single embedded admin panel. Store staff open it from inside Shopify Admin and launch/monitor long‑running jobs, review buying opportunities, and process orders — without leaving Shopify.

## Features

### 📦 Orders (`Pedidos`)
- Loads pending Shopify orders and lists their line items.
- Lets the operator **assign suppliers** to each item (allocations) before fulfilling.
- Runs a server‑side **fulfillment pipeline**: updates inventory, generates an Excel picking sheet, and tags the order as `alistado` (prepared) — with granular error states (`blocked`, `excel_error`, `allocation_error`, `validation_error`).
- Supports **dry‑run**, non‑physical items, and idempotency guards so an order is never processed twice.

### ⚡ Cache
- Manages a local product cache kept in sync with Shopify.
- Query a card, view cache **stats**, list **pending** and **not‑found** items, browse the activity **log**, and invalidate entries.

### 🤖 Bots
A consistent **background‑job model** across all bots: launch → poll every 3 s → live progress bar, phase label, current card, ETA (estimated from the previous completed run), and one‑click cancel, plus a run history.

| Bot | What it does |
| --- | --- |
| **Inventory** (`inventario`) | Upload a supplier CSV/Excel → validate with a preview (rows/columns) → bulk‑load cards into inventory by SKU, finish and collector number, with a per‑card success/failure report. |
| **Prices** (`precios`) | Scans the store's prices against **StarCityGames (SCG)** as a reference and flags items that need repricing. |
| **Arbitrage** (`piratas`) | Runs several crawlers that hunt MTG cards priced **below SCG** across external stores and rank the best buying opportunities by profit margin and priority (HIGH/MEDIUM/LOW). Includes foil detection, Scryfall card imagery, optional **Telegram** alerts, and Excel export. |

### 🔔 Webhooks
- **Shopify**: `app/uninstalled` and `app/scopes_update` (GDPR/lifecycle).
- **Meta WhatsApp**: webhook verification (GET) and message‑status events (`sent`, `delivered`, `read`, `failed`), proxied to the backend.

## Architecture

```
                         ┌───────────────────────────┐
                         │       Shopify Admin        │
                         │  (embedded · App Bridge)   │
                         └─────────────┬──────────────┘
                                       │  OAuth · GraphQL Admin API
                                       ▼
        ┌──────────────────────────────────────────────────────┐
        │             the-vault-ops   (this repo)               │
        │    React Router 7 · TypeScript · Prisma (sessions)    │
        │                                                       │
        │    UI modules  ──▶  /api/*   authenticated BFF proxy  │
        └───────────────────────────┬──────────────────────────┘
                                     │  x-api-key
                                     ▼
        ┌──────────────────────────────────────────────────────┐
        │      Private FastAPI backend  (not in this repo)      │
        │      bots · job queue · inventory · pricing · orders  │
        └───────────────────────────┬──────────────────────────┘
                                     │
     external  ───▶   Scryfall  ·  StarCityGames  ·  Telegram  ·  Meta WhatsApp
```

- **Embedded app** built with `@shopify/shopify-app-react-router`; session tokens handled via App Bridge, sessions persisted with Prisma.
- The app's own `/api/*` and `/webhook/*` routes act as an **authenticated backend‑for‑frontend (BFF)**: the browser never talks to the private backend directly — the server routes attach the `x-api-key` and forward the request. This keeps the backend credentials off the client.
- Long‑running work is modeled as **jobs** with a uniform contract: `POST …/scan|upload` → `job_id`, then `GET …/jobs`, `GET …/jobs/:id`, `POST …/jobs/:id/cancelar`.

## Tech stack

- **Framework:** React Router 7 (framework mode, migrated from Remix), TypeScript, Vite.
- **Shopify:** `@shopify/shopify-app-react-router`, App Bridge, GraphQL Admin API, app extensions workspace.
- **Data:** Prisma ORM with SQLite for Shopify session storage.
- **UI:** Tailwind CSS v4, shadcn/ui, Radix UI, Lucide icons; custom dark "vault" theme.
- **Files:** ExcelJS for picking sheets / exports.
- **Runtime:** Node ≥ 20.19; Dockerfile included.

## Project structure

```
app/
├─ routes/
│  ├─ app._index.tsx              # Landing: Orders · Cache · Bots
│  ├─ app.pedidos.tsx             # Orders module (UI)
│  ├─ app.cache.*.tsx             # Cache module (UI)
│  ├─ app.bots.{inventario,precios,piratas}.tsx
│  ├─ api.pedidos.ts              # BFF: orders
│  ├─ api.{inventario,precios,piratas}.*.ts   # BFF: bot jobs
│  ├─ api.cache.*.ts              # BFF: cache
│  └─ webhook{s}.*.ts             # Shopify + Meta WhatsApp webhooks
├─ components/ui/                 # shadcn/ui components
└─ shopify.server.ts              # Shopify app config & auth
prisma/schema.prisma              # Session model
extensions/                       # Shopify app extensions (workspace)
```

## Getting started

### Prerequisites
- Node.js ≥ 20.19
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started)
- A Shopify Partner account + development store
- Access to the private backend (or a compatible API implementing the `/orders`, `/inventory`, `/precios`, `/piratas`, `/cache` and `/webhook/whatsapp` endpoints)

### Install

```bash
npm install
npm run setup   # prisma generate + migrate deploy
```

### Environment variables

Create a `.env` file (never commit it — it is git‑ignored):

| Variable | Description |
| --- | --- |
| `THEVAULT_API_URL` | Base URL of the private backend (e.g. `http://localhost:8000`) |
| `THEVAULT_API_KEY` | API key sent as `x-api-key` to the backend |
| `SHOPIFY_API_KEY` | Shopify app client id (public identifier) |
| `SHOPIFY_API_SECRET` | Shopify app secret — **keep private** |
| `SHOPIFY_APP_URL` | Public app URL / dev tunnel |

> During local development, `shopify app dev` provisions the Shopify variables and a tunnel for you.

### Develop

```bash
npm run dev     # shopify app dev — installs on your dev store and opens a tunnel
```

### Build & run

```bash
npm run build
npm run start   # serves ./build/server/index.js
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Local development with the Shopify CLI |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run setup` | Prisma generate + migrate deploy |
| `npm run lint` | ESLint |
| `npm run typecheck` | React Router typegen + `tsc --noEmit` |
| `npm run deploy` | Deploy app config/extensions to Shopify |

## Security

Secrets live only in `.env` (git‑ignored and never committed). The repository is protected by:
- a **gitleaks** pre‑commit hook (`githooks/`) that blocks commits containing secrets, and
- a **gitleaks GitHub Action** that scans every push and pull request.

Enable the local hook once per clone (requires [gitleaks](https://github.com/gitleaks/gitleaks) installed):

```bash
git config core.hooksPath githooks
```

The Shopify `client_id` in `shopify.app.toml` is a public identifier by design; the real secret (`SHOPIFY_API_SECRET`) is never stored in the repo.

## Status

Private internal tool, published as a portfolio reference. The companion backend is proprietary and not included.

---

# Español

**Panel de operaciones para una tienda de Magic: The Gathering en Shopify** — una app embebida en el Shopify Admin que orquesta bots automatizados (inventario, precios, arbitraje de precios), un flujo de alistamiento de pedidos, un caché de productos y webhooks de WhatsApp, todo a través de un backend privado.

**Idioma / Language:** **Español** · [English](#the-vault--ops)

> **Sobre el alcance.** Este repositorio es la **capa de frontend + integración** (una app embebida de Shopify que además actúa como *backend‑for‑frontend* autenticado). El trabajo pesado — los bots, la cola de jobs y el procesamiento de datos — vive en un **servicio FastAPI privado aparte** que, a propósito, no forma parte de este repo.

---

## Visión general

The Vault es una tienda de cartas de Magic: The Gathering (MTG) montada sobre Shopify. Las tareas del día a día — cargar inventario de proveedores, mantener precios competitivos, detectar cartas baratas para reabastecer y alistar los pedidos de clientes — solían ser manuales y basadas en hojas de cálculo.

**The Vault · Ops** convierte esos flujos en un único panel embebido. El personal lo abre desde el propio Shopify Admin para lanzar y monitorear procesos largos, revisar oportunidades de compra y procesar pedidos, sin salir de Shopify.

## Funcionalidades

### 📦 Pedidos
- Carga los pedidos pendientes de Shopify y lista sus ítems.
- Permite **asignar proveedores** a cada ítem (allocations) antes de alistar.
- Ejecuta un **pipeline de alistamiento** en el servidor: actualiza inventario, genera un Excel de picking y etiqueta el pedido como `alistado`, con estados de error detallados (`blocked`, `excel_error`, `allocation_error`, `validation_error`).
- Soporta **dry‑run**, ítems no físicos y protección de idempotencia para no procesar dos veces el mismo pedido.

### ⚡ Cache
- Administra un caché local de productos sincronizado con Shopify.
- Consulta una carta, ve **estadísticas** del caché, lista **pendientes** y **no encontradas**, revisa el **registro** de actividad e invalida entradas.

### 🤖 Bots
Un mismo modelo de **jobs en segundo plano** para todos los bots: lanzar → *polling* cada 3 s → barra de progreso en vivo, fase actual, carta en curso, ETA (estimado a partir de la última corrida completada) y cancelación con un clic, además de historial de corridas.

| Bot | Qué hace |
| --- | --- |
| **Inventario** | Sube un CSV/Excel de proveedor → valida con vista previa (filas/columnas) → carga cartas al inventario por SKU, acabado y número de coleccionista, con reporte de éxito/fallo por carta. |
| **Precios** | Escanea los precios de la tienda contra **StarCityGames (SCG)** como referencia y marca los ítems que necesitan reprecio. |
| **Piratas** (arbitraje) | Ejecuta varios rastreadores que cazan cartas por **debajo del precio de SCG** en tiendas externas y rankean las mejores oportunidades de compra por margen y prioridad (ALTA/MEDIA/BAJA). Incluye detección de *foil*, imágenes de Scryfall, alertas opcionales por **Telegram** y exportación a Excel. |

### 🔔 Webhooks
- **Shopify**: `app/uninstalled` y `app/scopes_update` (ciclo de vida / GDPR).
- **Meta WhatsApp**: verificación del webhook (GET) y eventos de estado de mensajes (`sent`, `delivered`, `read`, `failed`), reenviados al backend.

## Arquitectura

```
                         ┌───────────────────────────┐
                         │       Shopify Admin        │
                         │  (embebida · App Bridge)   │
                         └─────────────┬──────────────┘
                                       │  OAuth · GraphQL Admin API
                                       ▼
        ┌──────────────────────────────────────────────────────┐
        │             the-vault-ops   (este repo)               │
        │    React Router 7 · TypeScript · Prisma (sesiones)    │
        │                                                       │
        │    Módulos UI  ──▶  /api/*   proxy BFF autenticado    │
        └───────────────────────────┬──────────────────────────┘
                                     │  x-api-key
                                     ▼
        ┌──────────────────────────────────────────────────────┐
        │      Backend FastAPI privado  (fuera de este repo)    │
        │      bots · cola de jobs · inventario · precios · pedidos │
        └───────────────────────────┬──────────────────────────┘
                                     │
     externos  ─▶   Scryfall  ·  StarCityGames  ·  Telegram  ·  Meta WhatsApp
```

- **App embebida** con `@shopify/shopify-app-react-router`; tokens de sesión vía App Bridge y sesiones persistidas con Prisma.
- Las rutas `/api/*` y `/webhook/*` actúan como **backend‑for‑frontend (BFF) autenticado**: el navegador nunca habla directo con el backend privado — las rutas del servidor agregan la `x-api-key` y reenvían la petición. Así las credenciales del backend no llegan al cliente.
- El trabajo largo se modela como **jobs** con un contrato uniforme: `POST …/scan|upload` → `job_id`, luego `GET …/jobs`, `GET …/jobs/:id`, `POST …/jobs/:id/cancelar`.

## Stack técnico

- **Framework:** React Router 7 (framework mode, migrado desde Remix), TypeScript, Vite.
- **Shopify:** `@shopify/shopify-app-react-router`, App Bridge, GraphQL Admin API, workspace de extensiones.
- **Datos:** Prisma ORM con SQLite para el almacenamiento de sesiones de Shopify.
- **UI:** Tailwind CSS v4, shadcn/ui, Radix UI, íconos Lucide; tema oscuro "vault" propio.
- **Archivos:** ExcelJS para hojas de picking / exportaciones.
- **Runtime:** Node ≥ 20.19; incluye Dockerfile.

## Estructura del proyecto

```
app/
├─ routes/
│  ├─ app._index.tsx              # Inicio: Pedidos · Cache · Bots
│  ├─ app.pedidos.tsx             # Módulo Pedidos (UI)
│  ├─ app.cache.*.tsx             # Módulo Cache (UI)
│  ├─ app.bots.{inventario,precios,piratas}.tsx
│  ├─ api.pedidos.ts              # BFF: pedidos
│  ├─ api.{inventario,precios,piratas}.*.ts   # BFF: jobs de bots
│  ├─ api.cache.*.ts              # BFF: cache
│  └─ webhook{s}.*.ts             # Webhooks de Shopify + Meta WhatsApp
├─ components/ui/                 # Componentes shadcn/ui
└─ shopify.server.ts              # Configuración y auth de la app Shopify
prisma/schema.prisma              # Modelo Session
extensions/                       # Extensiones de app Shopify (workspace)
```

## Puesta en marcha

### Requisitos
- Node.js ≥ 20.19
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started)
- Cuenta de Shopify Partner + tienda de desarrollo
- Acceso al backend privado (o una API compatible que implemente los endpoints `/orders`, `/inventory`, `/precios`, `/piratas`, `/cache` y `/webhook/whatsapp`)

### Instalación

```bash
npm install
npm run setup   # prisma generate + migrate deploy
```

### Variables de entorno

Crea un archivo `.env` (nunca lo subas — está en `.gitignore`):

| Variable | Descripción |
| --- | --- |
| `THEVAULT_API_URL` | URL base del backend privado (ej. `http://localhost:8000`) |
| `THEVAULT_API_KEY` | API key enviada como `x-api-key` al backend |
| `SHOPIFY_API_KEY` | Client id de la app Shopify (identificador público) |
| `SHOPIFY_API_SECRET` | Secreto de la app Shopify — **mantener privado** |
| `SHOPIFY_APP_URL` | URL pública de la app / túnel de desarrollo |

> En desarrollo local, `shopify app dev` provee las variables de Shopify y el túnel por ti.

### Desarrollo

```bash
npm run dev     # shopify app dev — instala en tu tienda de desarrollo y abre un túnel
```

### Build y ejecución

```bash
npm run build
npm run start   # sirve ./build/server/index.js
```

## Scripts

| Script | Propósito |
| --- | --- |
| `npm run dev` | Desarrollo local con la Shopify CLI |
| `npm run build` | Build de producción |
| `npm run start` | Sirve el build de producción |
| `npm run setup` | Prisma generate + migrate deploy |
| `npm run lint` | ESLint |
| `npm run typecheck` | Typegen de React Router + `tsc --noEmit` |
| `npm run deploy` | Despliega config/extensiones a Shopify |

## Seguridad

Los secretos viven solo en `.env` (ignorado por git y nunca commiteado). El repositorio está protegido por:
- un hook **pre‑commit de gitleaks** (`githooks/`) que bloquea commits con secretos, y
- una **GitHub Action de gitleaks** que escanea cada push y pull request.

Activa el hook local una vez por clon (requiere [gitleaks](https://github.com/gitleaks/gitleaks) instalado):

```bash
git config core.hooksPath githooks
```

El `client_id` de Shopify en `shopify.app.toml` es un identificador público por diseño; el secreto real (`SHOPIFY_API_SECRET`) nunca se guarda en el repo.

## Estado

Herramienta interna privada, publicada como referencia de portafolio. El backend que la acompaña es propietario y no se incluye.
