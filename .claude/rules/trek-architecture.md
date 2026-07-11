# TREK Architecture Reference

## Repository Layout

```
TREK/
  client/        React 19 SPA — Vite, Tailwind, Zustand, Leaflet/Mapbox GL
  server/        NestJS 11 API — Express, SQLite (better-sqlite3), WebSocket (ws)
  shared/        Shared TypeScript library — types, i18n, utilities (tsdown)
  plugin-sdk/    External plugin SDK
  charts/        Helm chart for Kubernetes deployment
  wiki/          Wiki documentation
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 24 |
| Frontend | React 19, Vite, Tailwind CSS |
| Backend | NestJS 11, Express |
| Database | SQLite via better-sqlite3 |
| Real-time | WebSocket (ws) |
| Auth | JWT, OAuth 2.1, OIDC, Passkeys (WebAuthn), TOTP MFA |
| Maps | Leaflet, Mapbox GL |
| Weather | Open-Meteo (no API key) |
| Testing | Vitest (unit/integration), Playwright (e2e) |
| i18n | 20 languages, custom parity checker |
| Container | Docker (multi-stage, multi-arch), Docker Compose, Helm |

## Key Commands

| Command | Scope |
|---------|-------|
| `npm install` | Install all workspace dependencies |
| `npm run build` | Build shared → server → client |
| `npm test` | All workspace tests |
| `npm run test:cov` | Coverage (server + client) |
| `npm run lint` | ESLint all workspaces |
| `npm run format:check` | Prettier check |
| `npm run dev` | Dev server with hot reload |

## Protected Areas

- `.github/workflows/**` — CI/CD pipelines
- `.agents/**` — Agent workflow control plane
- `.claude/**` — Claude Code configuration
- `server/**/migrations/**` — Database migrations
- `**/*secret*` — Secrets files
- `docker-compose.yml` — Deployment configuration

## Branch Strategy

- `dev` — Development, all PRs target this
- `main` — Production releases, push triggers Docker + Helm release
- `ai/<issue>-<slug>` — Agent implementation branches
- `ai-plan/<issue>-<slug>` — Agent plan branches
