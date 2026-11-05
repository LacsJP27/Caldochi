# CLAUDE.md
> Last updated: 2026-11-05 | Session: 3

## Current Focus

> Keep this section current. When work moves to a new subject, update it in the same session: move the finished item to "Recently completed" (keep only the last few), and rewrite "Working on", "Next step", and "Open questions".

**Working on:** Supabase auth verification + RLS for API requests.

**Design so far:**

```text
request -> verify JWT (signature, exp, aud, iss) -> 401 if invalid
        -> BEGIN; SET LOCAL ROLE authenticated; set_config('request.jwt.claims', <claims>, true)
        -> run query (RLS enforced, auth.uid() = sub)
        -> COMMIT
```

- The `DATABASE_URL` connection logs in as `postgres`, which bypasses RLS (`BYPASSRLS` and table owner). Queries made for a user must switch role inside a transaction.
- Use `SET LOCAL`, not `SET`, so the role and claims reset when the transaction ends. Otherwise the next request that borrows the pooled connection inherits them.
- Verify tokens locally against Supabase's JWKS (`/auth/v1/.well-known/jwks.json`) with `jose`, instead of calling Supabase Auth on every request.
- Signing keys are asymmetric ECC P-256 (`alg: ES256`), so the API holds no signing secret. Pin `algorithms: ['ES256']` in `jwtVerify`.
- Confirmed from a real access token (2026-10-25): `iss` = `https://oufmvwwqhomjazeujjas.supabase.co/auth/v1` (no trailing slash), `aud` = `authenticated`, `role` = `authenticated`, header `kid` matches the JWKS.

- `loadConfig` derives `config.auth = { issuer, jwksUrl }` from `SUPABASE_URL` with `new URL('/auth/v1…', base)`. The leading `/` keeps only the origin, so a trailing slash or extra path on `SUPABASE_URL` can't change the issuer. `issuer` is a string because `jwtVerify` compares `iss` exactly; `jwksUrl` is a `URL` because `createRemoteJWKSet` takes one.
- The `iss` check rejects tokens from other signers but can't catch a wrong `SUPABASE_URL`, since issuer and JWKS come from the same value. `loadConfig` therefore cross-checks the project ref in `SUPABASE_URL` against `DATABASE_URL` (direct `db.<ref>.supabase.co` host or pooler `postgres.<ref>` username) and fails at startup on a mismatch.
- Supabase caches the JWKS at its edge for 10 minutes; wait at least 20 minutes after rotating or revoking keys (Supabase docs, signing keys guide).

**Next step:** step 2: install `jose` and write the verify module in `src/auth/` (token plus `config.auth` in, claims out or throw), with tests from a local key pair: valid, expired, forged, wrong `aud`/`iss`. See TODO.

**Open questions:**

- How should `.env` be loaded locally (`--env-file` with `tsx`/Node)?
- How long should `jose` cache the JWKS, given Supabase's 10-minute edge cache?

**Recently completed:**

- 2026-10-30: `SUPABASE_URL` config. Validation (present, parseable, `https:`, `<ref>.supabase.co`), project-ref cross-check against `DATABASE_URL`, `config.auth.issuer`/`jwksUrl` derivation, tests including exact-string issuer checks.
- 2026-10-25: Kysely connection. `createDb(databaseUrl)` factory, `DATABASE_URL` validation in `loadConfig`, db injected into `buildApp(db)` and exposed with `app.decorate('db')`, pool destroyed in an `onClose` hook.

## Project Overview

**What this is:** Caldochi is a calendar app that suggests daily schedules from a user's activities and existing commitments. The project is intentionally a learning vehicle for HTTP, API design, databases, testing, observability, security, and deployment.

**Status:** Prototype

**How to run locally:**

```bash
npm install --prefix api
npm --prefix api run dev
npm --prefix api test
npm --prefix api run build
```

The React client currently runs independently from `web/` with its Vite scripts.

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
- [ ] Normalize dependency installation around the root workspace lockfile.
- [ ] Add configuration parsing for `PORT`, `HOST`, and the allowed web origin.
- [ ] Add the database package and a first migration only after the HTTP slice is understood.
- [ ] Add auth verification before exposing user-owned data.
