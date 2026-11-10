# CLAUDE.md
> Last updated: 2026-11-10 | Session: 4

## Current Focus

> Keep this section current. When work moves to a new subject, update it in the same session: move the finished item to "Recently completed" (keep only the last few), and rewrite "Working on", "Next step", and "Open questions".

**Working on:** First authenticated API route. Auth verification + RLS (steps 0–6) is done; the route is the first real use of `withUserTx`.

**Design so far:**

```text
request -> auth plugin (onRequest): parse Bearer, verify JWT (signature, exp, aud, iss)
        -> 401 + WWW-Authenticate if invalid; 500 if JWKS fetch fails
        -> request.user = { id: sub, claims }
        -> withUserTx: BEGIN; set_config('role', 'authenticated', true);
                       set_config('request.jwt.claims', <claims json>, true)
        -> run query (RLS enforced, auth.uid() = sub)
        -> COMMIT
```

- The `DATABASE_URL` connection logs in as `postgres`, which bypasses RLS (`BYPASSRLS` and table owner). Queries made for a user must switch role inside a transaction.
- Make the role and claims transaction-local (`SET LOCAL`, or `set_config(..., true)`), not session-level, so they reset when the transaction ends. Otherwise the next request that borrows the pooled connection inherits them.
- The claims come from the request, so they must be a bind parameter, which only works inside a `select` (`set_config(...)`); utility commands like `SET LOCAL ROLE` take no parameters, and `pg` runs only one statement per parameterized query. `set_config('role', 'authenticated', true)` does the same as `SET LOCAL ROLE authenticated`, so both settings fit in one `select`: one round trip per request.
- Hardcode the role as `authenticated`; never take it from the token's `role` claim, or a token with a different role could switch the connection to that role.
- The auth plugin is wrapped in `fastify-plugin` and registered inside a `/api`-prefixed scope in `app.ts`, so its `onRequest` hook covers sibling routes in that scope (`/api/me`) while `/api/healthz` stays public outside it.
- Verify tokens locally against Supabase's JWKS (`/auth/v1/.well-known/jwks.json`) with `jose`, instead of calling Supabase Auth on every request.
- Signing keys are asymmetric ECC P-256 (`alg: ES256`), so the API holds no signing secret. Pin `algorithms: ['ES256']` in `jwtVerify`.
- Confirmed from a real access token (2026-10-25): `iss` = `https://oufmvwwqhomjazeujjas.supabase.co/auth/v1` (no trailing slash), `aud` = `authenticated`, `role` = `authenticated`, header `kid` matches the JWKS.

- `loadConfig` derives `config.auth = { issuer, jwksUrl }` from `SUPABASE_URL` with `new URL('/auth/v1…', base)`. The leading `/` keeps only the origin, so a trailing slash or extra path on `SUPABASE_URL` can't change the issuer. `issuer` is a string because `jwtVerify` compares `iss` exactly; `jwksUrl` is a `URL` because `createRemoteJWKSet` takes one.
- The `iss` check rejects tokens from other signers but can't catch a wrong `SUPABASE_URL`, since issuer and JWKS come from the same value. `loadConfig` therefore cross-checks the project ref in `SUPABASE_URL` against `DATABASE_URL` (direct `db.<ref>.supabase.co` host or pooler `postgres.<ref>` username) and fails at startup on a mismatch.
- Supabase caches the JWKS at its edge for 10 minutes; wait at least 20 minutes after rotating or revoking keys (Supabase docs, signing keys guide).

**Next step:** `GET /api/calendars` through `withUserTx` (all queries on `trx`, never `app.db`), with `app.inject` tests for the auth failures and a DB test that it returns only the caller's calendars. See TODO.

**Database tests:**

- `*.db.test.ts` files run against the local Supabase stack via `npm --prefix api run test:db` (`vitest.db.config.ts`); `npm test` excludes them and needs no Docker.
- Setup: Docker Desktop running, then `supabase start` and `supabase db reset` (applies `supabase/migrations/` to the local DB). Default URL `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, overridable with `TEST_DATABASE_URL`; the tests refuse non-local hosts because they write to `auth.users`.
- Seed as `postgres` with fresh UUID users in `auth.users` (`id`, `email` is enough), then profiles, calendars, events; delete the users in `afterAll` (cascades).
- Use a pool with `max: 1` when testing that role and claims don't leak, so the follow-up query reuses the same connection.

**Open questions:**

- How should `.env` be loaded locally? `tsx --env-file=.env` / `node --env-file` (Node 20+) look sufficient; needed for step 6.
- JWKS cache: `createRemoteJWKSet` defaults are `cacheMaxAge` 10 min and `cooldownDuration` 30 s (minimum gap between refetches on an unknown `kid`). That matches Supabase's 10-minute edge cache; confirm and record the decision.
- Should routes call `withUserTx` directly, or through a request decorator (`request.userDb(fn)`)? Calling it directly keeps the transaction boundary visible in each route.

**Recently completed:**

- 2026-11-10: steps 5–6. `withUserTx` in `src/db/user-tx.ts` (one `select` with two transaction-local `set_config` calls, claims as a bind parameter); 8 RLS tests in `user-tx.db.test.ts` (postgres bypass, `auth.uid()` = sub, own rows only, cross-user insert rejected with 42501, cross-user update hits 0 rows, role/claims reset after commit and rollback).
- 2026-11-06: steps 3–4. `authPlugin` (Bearer parsing, 401 envelope with `WWW-Authenticate`, `request.user`, JWKS/network errors become 500, never logs tokens), `GET /api/me`, shared `auth/test-helpers.ts`, `app.inject` tests (valid, missing/malformed header, non-JWT, expired, forged, healthz stays public).
- 2026-11-05: step 2. `verifyAccessToken` in `src/auth/verify.ts` with `jose` (ES256 pinned), tests from a local key pair: valid, expired, forged, wrong `aud`/`iss`.
- 2026-10-30: `SUPABASE_URL` config. Validation (present, parseable, `https:`, `<ref>.supabase.co`), project-ref cross-check against `DATABASE_URL`, `config.auth.issuer`/`jwksUrl` derivation, tests including exact-string issuer checks.

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

The repository is moving toward a monorepo with a Vite React SPA, a Fastify API, a reminder worker, shared packages, and Supabase/Postgres:

```text
[web/] -- HTTP/JSON --> [api/ Fastify] --> [Supabase Postgres (Kysely), RLS]
                              |
                              +--> /api/healthz        (public)
                              +--> /api/me             (auth plugin, JWT via Supabase JWKS)
```

**Directory structure:**

```text
web/                  Vite + React SPA
api/                  Fastify + TypeScript HTTP service
  src/auth/           JWT verification, auth plugin, test helpers
  src/db/             Kysely factory and table types
  src/routes/         route plugins
supabase/migrations/  SQL schema, RLS policies, grants, triggers (Supabase CLI)
worker/               planned reminder scheduler
packages/             planned shared types and date/recurrence helpers
```

**Key dependencies:**

| Library | Why it's here |
|---|---|
| Fastify | HTTP server, routing, structured logging, and schema-aware request handling |
| fastify-plugin | Lets the auth plugin's hooks apply to the scope that registers it |
| Kysely + pg | Typed SQL query builder over a `pg` pool |
| jose | Verifies Supabase ES256 access tokens against the JWKS |
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

- [ ] Add shared API error handling and a consistent error envelope (the auth plugin's 401 body is the first one to switch over).
- [ ] Normalize dependency installation around the root workspace lockfile.
- [ ] Add configuration parsing for the allowed web origin (CORS). `PORT` and `HOST` are already parsed.
- [x] Add the database schema and first migrations (`supabase/migrations/`).
- [x] Add auth verification before exposing user-owned data.
- [x] Run user queries through `withUserTx` so RLS applies, with RLS tests.
