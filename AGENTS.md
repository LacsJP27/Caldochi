# AGENTS.md
> Last updated: 2026-09-23 | Session: 1

## Project Overview

**What this is:** Caldochi is a calendar app that suggests daily schedules from a user's activities and existing commitments. The project is intentionally a learning vehicle for HTTP, API design, databases, testing, observability, security, and deployment.

**Status:** Prototype

**How to run locally:**

```bash
npm ci                 # install every workspace from the root package-lock.json
npm run dev:api
npm run dev:web
npm test
npm run test:db        # needs the local Supabase stack (see Database tests)
npm run build
```

The root `package-lock.json` is the only lockfile. Run npm from the repo root and target a package with `--workspace`, e.g. `npm install zod --workspace @caldochi/api` (`-D` for dev dependencies). Don't use `npm install --prefix api`: it treats `api/` as a standalone project and recreates `api/package-lock.json` and a nested `api/node_modules`.

---

## Architecture

The repository is moving toward a monorepo with a Vite React SPA, a Fastify API, a reminder worker, shared packages, and Supabase/Postgres. The first API slice is deliberately database-free:

```text
[web/] -- HTTP/JSON --> [api/ Fastify] --> [future: auth, recurrence, database]
                              |
                              +--> /api/healthz
```

**Directory structure:**

```text
web/       Vite + React SPA
api/       Fastify + TypeScript HTTP service
worker/    planned reminder scheduler
db/        planned raw SQL migrations
packages/  planned shared types and date/recurrence helpers
```

**Key dependencies:**

| Library | Why it's here |
|---|---|
| Fastify | HTTP server, routing, structured logging, and schema-aware request handling |
| TypeScript | Static types at the API boundary and in domain logic |
| Vitest | Fast unit/integration-style tests for the app without opening a port |

---

## Coding Conventions

**Language(s):** TypeScript, ESM, Node.js 20+

- Keep `app.ts` responsible for composing the Fastify application; keep `server.ts` responsible for starting the process.
- Organize API code by feature or boundary (`routes/`, then later `plugins/`, `domain/`, and `db/`) rather than putting all logic in one file.
- Validate external input at the route boundary. Never pass unchecked request data into database queries or recurrence logic.
- Use structured logs with useful context; do not log tokens or other secrets.
- Each important behavior should have a happy-path test and a meaningful failure-case test.

---

## Domain Expert Context

**Active persona:** Senior backend engineer teaching HTTP/API design through a time-aware calendar domain.

**Key constraints:**

- API timestamps will eventually be UTC ISO-8601; the client renders them in the user's timezone.
- Occurrence range requests must be bounded; an unbounded infinite recurrence must never be accepted.
- Ordinary requests run as the signed-in user and must remain protected by database row-level security.
- Recurrence bugs become regression tests before fixes.

**Preferred libraries/tools:** Fastify for the explicit HTTP boundary, Kysely for typed SQL without hiding SQL semantics, Supabase/Postgres for managed auth/database, and Vitest for unit/integration tests.

---

## Decisions & Gotchas Log

**2026-09-23 — Start the API with an executable vertical slice**

Decision: create a small `api/` package with `buildApp()`, `server.ts`, `/api/healthz`, and an injection test before adding database or authentication code.

Rationale: this proves the process boundary and gives each later feature a runnable, testable home.

Gotcha: the root currently has a bare Fastify install while the intended architecture places the API under `api/`. Keep the package boundary explicit and avoid letting route code depend on the process entrypoint.

**2026-09-23 — Use the root package as an npm workspace coordinator**

Decision: the root `package.json` declares `web/` and `api/` as workspaces and exposes project-level build, test, typecheck, and API development commands. Runtime dependencies remain in the package that owns them.

Rationale: the repository is a monorepo with separate deployable concerns; root commands make that structure easier to operate without hiding package ownership.

---

## Next Up

- [ ] Add shared API error handling and a consistent error envelope.
- [x] Normalize dependency installation around the root workspace lockfile.
- [ ] Add configuration parsing for `PORT`, `HOST`, and the allowed web origin.
- [ ] Add the database package and a first migration only after the HTTP slice is understood.
- [ ] Add auth verification before exposing user-owned data.
