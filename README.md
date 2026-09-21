# Caldochi

A calendar app with a planning algorithm based on your goals and hobbies to suggest a daily itinerary

## Problem and Scope

I want to learn more about web development. I plan my day every day manually in the calendar app, but I want to see suggestions for a daily plan. The aim of this calendar app is to first teach me more about web development and second to have suggested daily schedules to keep me moving towards my goals.

Learning targets are tracked in [learning-goals.md](learning-goals.md), and the
architecture below is chosen to exercise them.

## Requirements

- support different calender views (day/month/year)
- send reminders to users about event
- multi user support (later)
- event view for details
- export/import events
- a planning algorithm to suggest daily schedule

## Data model

```sql
-- Supabase Auth owns auth.users (credentials, sessions, verification, reset).
-- This table is the application-side profile, sharing its primary key.
CREATE TABLE profiles (
  id             uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email          text        NOT NULL UNIQUE,   -- mirrored from auth.users; kept in sync by trigger
  display_name   text,                          -- may be absent at signup
  timezone       text        NOT NULL DEFAULT 'UTC',   -- IANA, e.g. 'America/New_York'
  week_start     smallint    NOT NULL DEFAULT 0,       -- 0=Sun … 6=Sat, matches JS getDay()
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT week_start_valid CHECK (week_start BETWEEN 0 AND 6)
);

CREATE TABLE calendars (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  color       text        NOT NULL DEFAULT '#3b82f6',
  timezone    text,                                   -- default for new events; NULL = use owner's
  kind        text        NOT NULL DEFAULT 'personal',
  is_default  boolean     NOT NULL DEFAULT false,
  is_visible  boolean     NOT NULL DEFAULT true,      -- the show/hide layer toggle
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT kind_valid  CHECK (kind IN ('personal', 'suggested', 'imported')),
  CONSTRAINT color_valid CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  UNIQUE (owner_id, name)
);

-- Exactly one default calendar per user, enforced by the database:
CREATE UNIQUE INDEX one_default_per_user
  ON calendars (owner_id) WHERE is_default;

CREATE TABLE events (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id       uuid        NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,

  title             text        NOT NULL,
  description       text,
  location          text,

  -- ---- TIME ----
  all_day           boolean     NOT NULL DEFAULT false,
  starts_at         timestamptz,        -- timed events: instant of FIRST occurrence
  duration_minutes  integer,            -- timed events
  start_date        date,               -- all-day events: a DATE, never an instant
  duration_days     integer,            -- all-day events
  timezone          text        NOT NULL,   -- IANA; the zone recurrence expands in

  -- ---- RECURRENCE ----
  rrule             text,               -- NULL = single event
  rdates            timestamptz[],      -- extra one-off additions (RDATE)
  recurrence_end_at timestamptz,        -- DERIVED; NULL = infinite series

  -- ---- SEMANTICS ----
  transparency      text        NOT NULL DEFAULT 'opaque',  -- opaque = blocks time, you are busy, transparent occupies no time, inherited from iCalendar standard
  status            text        NOT NULL DEFAULT 'confirmed', -- i.e., confirmed, tentative, cancelled

  -- ---- ICS ROUND-TRIP ----
  ical_uid          text        NOT NULL,   -- UID from the .ics file
  sequence          integer     NOT NULL DEFAULT 0,

  created_by        uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Two users may legitimately hold copies of the same imported event,
  -- so UID is unique per calendar, not globally:
  UNIQUE (calendar_id, ical_uid),

  CONSTRAINT transparency_valid CHECK (transparency IN ('opaque', 'transparent')),
  CONSTRAINT status_valid       CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
  CONSTRAINT duration_positive  CHECK (
    (duration_minutes IS NULL OR duration_minutes > 0) AND
    (duration_days    IS NULL OR duration_days    > 0)
  ),

  -- Exactly one of the two time shapes must be filled in:
  CONSTRAINT time_shape CHECK (
    (all_day = false
      AND starts_at  IS NOT NULL AND duration_minutes IS NOT NULL
      AND start_date IS     NULL AND duration_days    IS     NULL)
    OR
    (all_day = true
      AND start_date IS NOT NULL AND duration_days    IS NOT NULL
      AND starts_at  IS     NULL AND duration_minutes IS     NULL)
  )
);

CREATE INDEX events_calendar_start  ON events (calendar_id, starts_at);
CREATE INDEX events_calendar_date   ON events (calendar_id, start_date);
CREATE INDEX events_recurring       ON events (calendar_id) WHERE rrule IS NOT NULL;

CREATE TABLE event_exceptions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  original_start    timestamptz NOT NULL,   -- RECURRENCE-ID: WHICH instance this is about
  kind            text        NOT NULL,

  -- Overrides. NULL means "inherit from the series".
  title             text,
  description       text,
  location          text,
  starts_at         timestamptz,
  duration_minutes  integer,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT status_valid CHECK (status IN ('modified', 'cancelled')),
  UNIQUE (event_id, original_start)
);

CREATE TABLE reminders (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  minutes_before integer     NOT NULL,        -- 30 = 30 min before; negative = after start
  method         text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT method_valid CHECK (method IN ('push', 'email', 'in_app')),
  UNIQUE (event_id, minutes_before, method)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Supabase exposes these tables directly over its API, so RLS *is* the
-- authorization layer, not an optional hardening step. auth.uid() reads the
-- current user id from the request JWT.
-- ---------------------------------------------------------------------------

ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendars        ENABLE ROW LEVEL SECURITY;
ALTER TABLE events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders        ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_profile ON profiles
  FOR ALL USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY own_calendars ON calendars
  FOR ALL USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY own_events ON events
  FOR ALL USING (EXISTS (
    SELECT 1 FROM calendars c
    WHERE c.id = events.calendar_id AND c.owner_id = (SELECT auth.uid())
  ));

-- Two hops from the user (-> events -> calendars). If these get slow, the fix
-- is denormalizing user_id onto the table so the policy can use an index.
CREATE POLICY own_event_exceptions ON event_exceptions
  FOR ALL USING (EXISTS (
    SELECT 1 FROM events e
    JOIN calendars c ON c.id = e.calendar_id
    WHERE e.id = event_exceptions.event_id AND c.owner_id = (SELECT auth.uid())
  ));

CREATE POLICY own_reminders ON reminders
  FOR ALL USING (EXISTS (
    SELECT 1 FROM events e
    JOIN calendars c ON c.id = e.calendar_id
    WHERE e.id = reminders.event_id AND c.owner_id = (SELECT auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- Signup: Supabase inserts into auth.users and stops. These triggers create
-- the profile plus a default calendar, and keep the mirrored email in sync.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');

  INSERT INTO public.calendars (owner_id, name, is_default)
  VALUES (NEW.id, 'Personal', true);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE FUNCTION public.handle_user_email_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles SET email = NEW.email, updated_at = now()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.handle_user_email_change();
```

## API Surface

### Layering

Supabase/PostgREST already exposes every table over REST, and RLS makes those calls
safe from the browser. So we only hand-write endpoints for operations that **cannot
be expressed as table CRUD**:

| Goes through the Supabase client | Needs a real endpoint                   |
| -------------------------------- | --------------------------------------- |
| calendars CRUD                   | expanding recurrences over a date range |
| profile read/update              | scoped edit/delete of a recurring event |
| reminder add/remove              | `.ics` import/export                    |
|                                  | plan generation (later)                 |

Everything in the right column either returns something that isn't a table row, or
writes several rows in one transaction.

### Endpoints

```
GET    /api/occurrences?start&end&calendarIds   expanded instances (core read)
GET    /api/events/:id                          series detail + exceptions + reminders
POST   /api/events                              create (reminders inline in payload)
PATCH  /api/events/:id                          scoped edit — see below
DELETE /api/events/:id                          scoped delete — see below

POST   /api/calendars/:id/import                multipart .ics upload
GET    /api/calendars/:id/export.ics            text/calendar download

-- planner, later --
POST   /api/plans/generate                      { date } -> suggested blocks
GET    /api/plans/:date
POST   /api/plans/:id/blocks/:blockId/accept    commits a block to a real event
```

### The core read: occurrences, not events

`/api/occurrences` is deliberately not named `/events`. It does not return event
rows — a weekly standup is **one row and fifty-two occurrences**. The handler
fetches candidate series (the `recurrence_end_at` range query), expands them with
`rrule.js`, applies `event_exceptions`, and returns flattened instances:

```json
{
	"occurrences": [
		{
			"eventId": "8f3a…",
			"occurrenceStart": "2026-09-16T13:00:00Z",
			"start": "2026-09-16T18:00:00Z",
			"end": "2026-09-16T19:00:00Z",
			"allDay": false,
			"title": "Standup",
			"calendarId": "1c7e…",
			"transparency": "opaque",
			"status": "confirmed",
			"isException": true
		}
	]
}
```

Two properties of this shape matter:

- **An occurrence has no id of its own.** It is not a row. Its identity is the
  composite `(eventId, occurrenceStart)` — i.e. `UID` + `RECURRENCE-ID`.
- **`occurrenceStart` and `start` can differ.** `occurrenceStart` is where the rule
  said the instance goes; `start` is where it actually is after an override. The
  client must send `occurrenceStart` back to identify _which_ instance it means.

### Editing a recurring event: three scopes

One user action, three very different sets of writes. This is the Google Calendar
"This event / This and following / All events" dialog.

```
PATCH /api/events/:id
  {
    "scope":           "this" | "this_and_following" | "all",
    "occurrenceStart": "2026-09-16T13:00:00Z",   // required unless scope=all
    "changes":         { "title": "...", "startsAt": "...", ... }
  }
```

| scope                | Effect on the tables                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `this`               | insert one `event_exceptions` row                                                                                            |
| `this_and_following` | **split the series**: set `UNTIL` on the original `rrule`, create a new event for the remainder, move later exceptions to it |
| `all`                | update the `events` row                                                                                                      |

`DELETE` takes the same three scopes (`this` writes a `cancelled` exception).

`this_and_following` is the operation to build carefully: it mutates a rule string
and rehomes child rows, so it must run in a transaction. A failure halfway leaves
two overlapping series.

### Constraints

- `start` and `end` are **required** on `/api/occurrences`, and the span is capped
  (1 year). An unbounded range against an infinite series is a hang, and it is
  reachable by anyone editing a URL.
- All timestamps in and out are UTC ISO-8601; the client renders in the profile's
  timezone.
- Endpoints run as the signed-in user, so RLS still applies — they are not a
  service-role bypass.

### Open questions

- **Where expansion runs.** Server-side (above) vs. shipping candidate series to the
  browser and expanding there — `rrule.js` runs in both. Client-side is a legitimate
  v1 shortcut, but the planner needs expansion server-side anyway.
- **Import: synchronous or background job?** A large `.ics` will exceed a request
  timeout.
- **Import conflict policy** when `(calendar_id, ical_uid)` already exists: skip,
  overwrite, or compare `SEQUENCE`.

## Architecture

Choices here are made against `learning-goals.md`, not purely for shortest path.
Where two options were close, the one that exercises a goal won — which is why the
API is a service we write rather than generated, and why hosting takes a Dockerfile.

### Topology

```
      browser — Vite + React SPA          static files
                  |
                  |  HTTPS · JSON · Authorization: Bearer <supabase JWT>
                  v
      +---------------------------+
      |  api     Fastify + Kysely |  --+
      +---------------------------+    |  ONE Docker image,
      |  worker  reminder cron    |  --+  two process types
      +---------------------------+
                  |
                  |  postgres://  (privileged role)
                  v
      Supabase — Postgres + Auth          managed
```

- **SPA** has no server of its own, so the API boundary cannot quietly blur.
- **api** owns everything table CRUD cannot express: recurrence expansion, the three
  edit scopes, `.ics` import/export, plan generation.
- **worker** exists because a reminder must fire at 8:30am with no browser open.
  That requirement alone forces a backend, independent of any learning goal.
- **Supabase** keeps Postgres and Auth. Auth is the one component not worth
  hand-rolling; everything else stays a learning surface.

### Stack

| Layer      | Choice                | Why this one                                                                                                                                                                              |
| ---------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend   | Vite + React          | You wire up router, data layer and cache yourself, so those pieces stay visible. A meta-framework would hide exactly the seams we want to see.                                            |
| API        | Fastify               | Schema validation is first-class, which carries the security goal rather than bolting it on. (Express is the well-trodden alternative.)                                                   |
| DB access  | Kysely                | Typed query builder — SQL semantics stay visible, and it does **not** own the schema.                                                                                                     |
| Migrations | Supabase CLI, raw SQL | The hand-written DDL stays the source of truth. Prisma/Drizzle cannot express our partial unique index, CHECK constraints, RLS policies or triggers.                                      |
| Auth       | Supabase Auth         | See above.                                                                                                                                                                                |
| Container  | Docker                | One image, two process types.                                                                                                                                                             |
| Host       | Fly.io                | Deploys from a Dockerfile and runs persistent processes, so the worker has somewhere to live. Vercel was rejected: serverless, no Dockerfile in the deploy path, no long-running process. |
| CI         | GitHub Actions        |                                                                                                                                                                                           |

### Repo structure

Monorepo, because three deployables now share types and date logic:

```
web/                  Vite + React SPA
api/                  Fastify + Kysely
worker/               reminder scheduler
db/migrations/        raw SQL, applied by the Supabase CLI
packages/shared/      types, date + rrule helpers used by api, worker and web
Dockerfile            one image, two entrypoints
docker-compose.yml    local: api + worker + Postgres
.github/workflows/
```

**One image, two process types** (Fly `[processes]`) rather than two Dockerfiles.
The api and worker share nearly all their code; building twice would mean they could
drift.

### Local development

`docker compose up` brings up api + worker + a real Postgres. Two rules:

- Local Postgres is the **same major version** as production.
- Integration tests run against that container, not a mock — so they exercise the
  CHECK constraints and RLS policies too.

`supabase start` is the alternative: it runs the whole managed stack locally in
Docker, including GoTrue and PostgREST. Heavier, but closer to production auth.

### Deployment & CI/CD

```
lint  ->  typecheck  ->  unit tests  ->  integration tests (Postgres service)
      ->  build image  ->  push  ->  deploy
```

**Migrations are a separately gated step, not automatic on deploy.** A bad deploy
rolls back by redeploying the previous image; a bad migration does not roll back at
all. Keeping them separate means the dangerous step is always a deliberate one.

### Authorization

The API connects with a privileged role, so **RLS no longer enforces anything on
this path** — it stays enabled as a backstop for anon and direct access.

That moves authorization into application code, and names the failure mode
precisely: **a forgotten `WHERE owner_id = ...` is a data leak.** So no route builds
a query directly. Every read goes through a scoped helper that takes the caller's
user id and cannot be constructed without one.

### Testing

| Layer       | Tool                        | Targets                                                                                 |
| ----------- | --------------------------- | --------------------------------------------------------------------------------------- |
| Unit        | Vitest                      | recurrence expansion, planner scoring, day-view overlap layout, timezone conversion     |
| Integration | Vitest + Postgres in Docker | API endpoints end to end, plus the constraints and RLS policies unit tests cannot reach |
| E2E         | Playwright                  | a few happy paths only                                                                  |

Recurrence expansion is the best unit-testing subject in the project: a pure
function with brutal edge cases, most of them already written down in this README —
DST boundaries, `FREQ=MONTHLY` on Jan 31, leap day, infinite series, `BYSETPOS`.

**Rule: every recurrence bug becomes a failing test before it is fixed.**

### Observability

- Structured JSON logs (pino), with a request id correlated across api and worker.
- Sentry for errors.
- `/healthz` for Fly's health checks.
- **The worker logs every reminder decision, including skips and the reason.**

That last one is the point. A reminder that fires wrongly leaves a trace; a reminder
that silently _does not fire_ leaves nothing at all. The only evidence you will ever
have is a log line saying the worker considered it and why it declined.

### Security

- **Zod validation at every API boundary.** Nothing reaches a query unvalidated.
- **`.ics` import is hostile input** — it is a file produced by software you do not
  control. Size cap, parse timeout, rate limit on the endpoint.
- No `dangerouslySetInnerHTML` on any imported event title, description or location.
- Secrets via Fly secrets; a committed `.env.example` lists names only.
- Dependency audit runs in CI.

### HTTP conventions

| Code  | Used for                                                 |
| ----- | -------------------------------------------------------- |
| `200` | successful read, or an update returning the new state    |
| `201` | event/calendar created, `Location` header set            |
| `204` | delete succeeded, no body                                |
| `400` | malformed request — failed Zod parse                     |
| `401` | missing or invalid JWT                                   |
| `403` | valid JWT, but not your calendar                         |
| `404` | not found, **or** hidden from you (never leak existence) |
| `409` | import conflict on `(calendar_id, ical_uid)`             |
| `429` | rate limit, import endpoint                              |

One error envelope everywhere:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "…", "details": {} } }
```

CORS is configured for the SPA origin explicitly — no wildcard, credentials allowed.
Being on a separate origin is deliberate: it makes the request boundary visible
rather than incidental.

## Planning Algorithm

See [planning algorithm](/planning-algorithm.md)

## Open Questions

- Fly.io vs Railway — not yet chosen; both deploy Dockerfiles.
- Fastify vs Express.
- Whether `worker/` stays a separate package or becomes a process inside `api/`.
- Notification channel (Web Push vs email provider) — deferred to when reminders are
  actually built.
- Whether the SPA is served by the api container or as separate static hosting.
