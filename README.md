# vue-project

This template should help get you started developing with Vue 3 in Vite.

## Project structure (MVC)

`src/` is split into three buckets:

- **`model/`** — state and data: `stores/` (Pinia), `data/` (static JSON/data), `services/` (business logic, calculations, API/DB access — formerly `lib/`).
- **`view/`** — UI: `views/` (route-level pages), `components/` (reusable UI pieces), `gl/` (canvas/3D rendering), `styles/`.
- **`controller/`** — flow control: `router/` (routes + navigation guards).

`App.vue` and `main.js` stay at `src/` root and wire the three together. When adding code: new state/business logic goes in `model/`, new screens/widgets go in `view/`, new routing/navigation logic goes in `controller/`.

> Note: a few files are referenced across the app but not yet present on this branch (e.g. `model/stores/user.js`, `model/services/db/`, `model/services/{groq,planner,clock,geo,hours}.js`, `model/data/origins.js`, some `view/components/*` and `view/views/*`). These are pending from other in-progress branches, not part of this restructure.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
pnpm install
```

### Compile and Hot-Reload for Development

```sh
pnpm dev
```

### Compile and Minify for Production

```sh
pnpm build
```

### Run Unit Tests with [Vitest](https://vitest.dev/)

```sh
pnpm test:unit
```

### Run End-to-End Tests with [Playwright](https://playwright.dev)

```sh
# Install browsers for the first run
npx playwright install

# When testing on CI, must build the project first
pnpm build

# Runs the end-to-end tests
pnpm test:e2e
# Runs the tests only on Chromium
pnpm test:e2e --project=chromium
# Runs the tests of a specific file
pnpm test:e2e tests/example.spec.ts
# Runs the tests in debug mode
pnpm test:e2e --debug
```
