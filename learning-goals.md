# Learning Goals

The primary purpose of Caldochi is to learn web development in depth. The calendar
is the vehicle; the skills below are the destination. When an architecture or
implementation decision is close, **prefer the option that exercises a goal on this
list** — even when it is not the shortest path.

This file exists to be re-read. If a decision later contradicts it, change this file
deliberately rather than drifting.

---

## The goals

Nine, in four layers. Layer 0 outlives every framework you will ever use; Layer 3 is
plumbing you should be fluent in but that nobody is a better developer for mastering.

### Layer 0 — The platform

**1. HTTP fundamentals**
Methods, status codes, headers, caching semantics, cookies vs. tokens, CORS, content
negotiation. Most bugs for the next decade are HTTP bugs.

### Layer 1 — Craft

**2. API design**
Not "build endpoints" — contract design, request validation, consistent error
shapes, idempotency, versioning.

**3. Frontend depth**
The UI as a real engineering surface: layout algorithms, server-state caching and
invalidation, optimistic updates, keyboard accessibility, render performance.

**4. Databases & entity relations**
Modeling, normalization, constraints, indexing, query plans, transactions,
migrations. Currently the strongest area of the project.

### Layer 2 — Discipline

**5. Testing**
Unit vs. integration vs. E2E, and knowing which a given problem deserves.

**6. Observability**
Structured logging, error tracking, health checks — debugging what you cannot
reproduce and did not witness.

**7. Security practices**
Input validation at boundaries, XSS, injection, secret handling, treating external
input as hostile.

### Layer 3 — Plumbing

**8. Docker**
**9. CI/CD**

⚠️ These two are **deliberately demoted**. They feel foundational because they are
visible and intimidating, but each is a few days of learning, and on a solo project
CI is a YAML file touched twice a year. Treat them as *tools you will be fluent in
as a side effect of deploying*, not as pillars. If they start consuming more
attention than goals 1–7, something has gone wrong.

---

## What Caldochi teaches, concretely

Most learning projects are CRUD and teach plumbing. A calendar is **domain-heavy**,
which forces real engineering. Each goal maps to actual work in this repo:

| Goal | Where it gets learned |
|---|---|
| HTTP | Designing `/api/occurrences`; status codes for the three edit scopes; CORS between the SPA origin and the API; caching posture on range queries |
| API design | The `scope: this / this_and_following / all` contract; the occurrence response shape; `.ics` import conflict policy |
| Frontend depth | Day-view overlapping-event layout (a real interval-packing algorithm, not CSS); cache invalidation when one recurring event expands into many instances; keyboard nav over a month grid |
| Databases | The 5-table schema; `recurrence_end_at` as a denormalized index-friendly bound; RLS policies; CHECK constraints; the `this_and_following` series split as a transaction |
| Testing | Recurrence expansion is a pure function with brutal edge cases — DST boundaries, Jan-31 monthly, leap day, infinite series. Best unit-testing subject you will find, and the cases are already written down in the README |
| Observability | The reminder worker runs unattended. When a notification silently fails to fire at 8:30am, logs are the only evidence that exists |
| Security | `.ics` import is untrusted input from other applications — size caps, parse timeouts, no `dangerouslySetInnerHTML` on imported event text |
| Docker | One image, two process types (api + worker); Compose for local Postgres |
| CI/CD | lint → typecheck → test → build image → deploy; migrations as a separately gated step |

### The two things here that most web developers never touch

- **Time.** Timezones, DST, recurrence. Genuinely one of the hardest domains in
  software. Developers with ten years' experience have never thought about
  `RECURRENCE-ID`.
- **A real algorithm.** The planner is constraint satisfaction / scheduling. Most
  web work never gets harder than a filter.

---

## What this project will NOT teach

Know the gaps so you don't mistake this for a complete education:

- **Scale** — one user. No load balancing, replicas, sharding, or caching tiers.
- **Real-time collaboration** — unless shared calendars get built later.
- **Team workflow** — code review and coordination need other people.
- **Third-party integration** — payments, webhooks, OAuth flows.
- **SEO / the public web** — it's a logged-in app.

---

## Checkpoints

Signals that a goal has actually landed, rather than been read about:

- **HTTP** — you can say why an edit returns 200 and a create returns 201, and when
  409 is correct.
- **API design** — someone else could implement your frontend from the README alone.
- **Frontend** — the day view lays out overlapping events correctly, and the month
  grid is navigable without a mouse.
- **Databases** — you can read `EXPLAIN ANALYZE` on the occurrences range query and
  say which index it used.
- **Testing** — a recurrence bug gets reproduced as a failing test *before* it is
  fixed, reflexively.
- **Observability** — a reminder fails to fire and you diagnose it from logs alone,
  without reproducing it locally.
- **Security** — you can name what an imported `.ics` file could do to your system.
- **Docker** — the image that runs in production is the one you ran locally.
- **CI/CD** — a red pipeline blocks a merge, and you trust it.
