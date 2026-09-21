# Planning Algorithm

The feature that makes Caldochi more than a calendar: given your goals, hobbies and
existing commitments, propose a daily schedule.

---

## The problem

> Given a date, the fixed commitments already on the calendar, and a set of things
> the user wants to spend time on — propose a set of time blocks, ranked, with a
> reason for each.

This is a **scheduling / constraint satisfaction** problem, not a query. It has no
single correct answer, which has two consequences that shape everything below:

1. **Every suggestion must be explainable.** If the user can't see why a block was
   proposed, they can't trust it, and you can't debug it.
2. **Quality can only be measured against real behaviour** — what was accepted, and
   what was actually done. The schema has to record that from day one, because it
   cannot be reconstructed later.

---

## Core modelling decision

**A goal is not schedulable. An activity is.**

"Get fit" has no duration and cannot be placed on a calendar. "45-minute run" can.
So goals hold intent and priority, activities hold the schedulable unit, and one
goal has many activities.

A **hobby is simply an activity with no goal attached** (`goal_id IS NULL`). Guitar
practice doesn't need a goal to be worth an hour. This is why there's no separate
hobbies table — it would duplicate every column of `activities`.

Trying to schedule goals directly is the mistake that makes planner schemas
collapse.

---

## Data model

```sql
CREATE TABLE goals (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title          text        NOT NULL,
  description    text,
  category       text,                     -- health | learning | creative | social | ...
  priority       smallint    NOT NULL DEFAULT 3,   -- 1 (low) .. 5 (high)
  target_minutes_per_week integer,         -- NULL = no quantitative target
  deadline       date,                     -- NULL = ongoing
  status         text        NOT NULL DEFAULT 'active',
  color          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT priority_valid CHECK (priority BETWEEN 1 AND 5),
  CONSTRAINT status_valid   CHECK (status IN ('active', 'paused', 'achieved', 'abandoned'))
);

CREATE TABLE activities (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  goal_id        uuid        REFERENCES goals(id) ON DELETE SET NULL,  -- NULL = hobby
  title          text        NOT NULL,

  -- how long, and how flexible
  default_duration_minutes integer NOT NULL,
  min_duration_minutes     integer NOT NULL,
  max_duration_minutes     integer NOT NULL,

  -- how often
  target_minutes_per_week  integer,
  cooldown_hours           integer NOT NULL DEFAULT 0,  -- min gap between sessions

  -- when it fits
  preferred_time_of_day    text,        -- morning | afternoon | evening | any
  earliest_time            time,        -- hard bound, NULL = no bound
  latest_time              time,
  energy                   text NOT NULL DEFAULT 'any',  -- high | low | any

  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT durations_sane CHECK (
    min_duration_minutes > 0
    AND min_duration_minutes <= default_duration_minutes
    AND default_duration_minutes <= max_duration_minutes
  ),
  CONSTRAINT tod_valid    CHECK (preferred_time_of_day IN ('morning','afternoon','evening','any')),
  CONSTRAINT energy_valid CHECK (energy IN ('high','low','any'))
);

CREATE TABLE plans (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_date      date        NOT NULL,
  generated_at   timestamptz NOT NULL DEFAULT now(),
  algorithm_version text     NOT NULL,     -- 'greedy-v1'
  weights        jsonb       NOT NULL,     -- snapshot of the scoring weights used
  diagnostics    jsonb,                    -- unplaced activities + why (see below)
  status         text        NOT NULL DEFAULT 'proposed',

  CONSTRAINT status_valid CHECK (status IN ('proposed','partially_accepted','accepted','rejected','superseded')),
  UNIQUE (profile_id, plan_date, generated_at)
);

CREATE TABLE plan_blocks (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        uuid        NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  activity_id    uuid        NOT NULL REFERENCES activities(id) ON DELETE CASCADE,

  starts_at      timestamptz NOT NULL,
  duration_minutes integer   NOT NULL,

  score          numeric     NOT NULL,
  rationale      jsonb       NOT NULL,     -- per-factor contributions, for explaining

  status         text        NOT NULL DEFAULT 'suggested',
  responded_at   timestamptz,
  committed_event_id uuid    REFERENCES events(id) ON DELETE SET NULL,

  -- user feedback on this block, drives duration tuning
  duration_feedback text,                  -- too_short | about_right | too_long

  CONSTRAINT status_valid   CHECK (status IN ('suggested','accepted','rejected','completed','skipped')),
  CONSTRAINT feedback_valid CHECK (duration_feedback IN ('too_short','about_right','too_long'))
);

CREATE TABLE activity_logs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id    uuid        NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  plan_block_id  uuid        REFERENCES plan_blocks(id) ON DELETE SET NULL,  -- NULL = done spontaneously
  minutes_spent  integer     NOT NULL,
  occurred_on    date        NOT NULL,
  logged_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT minutes_positive CHECK (minutes_spent > 0)
);
```

### Why there is no `activity_stats` table

Acceptance rate and completion rate are **aggregates over `plan_blocks` and
`activity_logs`**, not stored facts:

```sql
-- acceptance rate for an activity, last 30 days
SELECT count(*) FILTER (WHERE status IN ('accepted','completed'))::numeric
       / nullif(count(*), 0)
FROM plan_blocks b JOIN plans p ON p.id = b.plan_id
WHERE b.activity_id = $1 AND p.plan_date > current_date - 30;
```

Computing them live means they can never drift from the truth. If it gets slow, the
fix is a materialized view — not a table someone has to remember to update.

### Progress on a goal

Also derived, never stored:

```sql
SELECT sum(l.minutes_spent)
FROM activity_logs l JOIN activities a ON a.id = l.activity_id
WHERE a.goal_id = $1 AND l.occurred_on >= date_trunc('week', current_date);
```

---

## The algorithm

`greedy-v1`: hard filter, then soft score, then greedy placement with re-scoring.

### Step 1 — Find the free gaps

1. Take the schedulable window: `profiles.day_start_time` → `day_end_time`.
2. Fetch the day's occurrences where **`transparency = 'opaque'`** and
   `status <> 'cancelled'`. (This is why `transparency` exists — a holiday banner or
   a deadline marker is on the calendar but does not consume time.)
3. Subtract those intervals from the window.
4. Shrink every gap by a **transition buffer** (default 10 min each side).
5. Discard gaps shorter than the smallest `min_duration_minutes` in the candidate set.

Result: a list of half-open `[start, end)` gaps.

### Step 2 — Hard filter

An activity is a candidate for a gap only if **all** of these hold. These are
filters, not scores — a failure removes the option entirely:

- `is_active` is true, and its goal (if any) has `status = 'active'`
- `gap duration >= min_duration_minutes`
- the gap intersects `[earliest_time, latest_time]`
- `cooldown_hours` has elapsed since the last log for this activity
- not already placed in today's plan

### Step 3 — Score the survivors

```
base = w_debt     * debt
     + w_priority * priority_norm
     + w_deadline * deadline_urgency
     + w_tod      * time_of_day_fit
     + w_energy   * energy_fit
     + w_fit      * slot_fit

score = base * acceptance_multiplier
```

| Factor | Range | Meaning |
|---|---|---|
| `debt` | 0–1 | `(target_week − done_week) / target_week`, clamped. The main driver: how far behind you are. |
| `priority_norm` | 0–1 | `goal.priority / 5`. Hobbies with no goal use a neutral 0.5. |
| `deadline_urgency` | 0–1 | 0 if no deadline, else rises as the deadline approaches. |
| `time_of_day_fit` | 0–1 | 1 if the gap matches `preferred_time_of_day`, 0.5 adjacent, 0.2 otherwise. |
| `energy_fit` | 0–1 | high-energy activities score better earlier in the day and after a long gap. |
| `slot_fit` | 0–1 | penalises **both** cramming a long activity into a tight gap and burning a 3-hour gap on a 20-minute task. |
| `acceptance_multiplier` | 0.5–1.5 | **learned** — see the feedback loop. |

Weights live in `plans.weights` so any plan can be replayed and compared.

### Step 4 — Place greedily, re-scoring each round

```
while gaps remain and candidates score above the threshold:
    (activity, gap) = highest scoring pair
    duration        = clamp(default_duration, min, min(max, gap length))
    place the block
    split the gap around it, minus buffers
    recompute scores        # debt dropped; cooldown now applies
```

Re-scoring matters: placing a 45-minute run reduces that activity's debt to zero, so
it shouldn't win the next round too. One pass without re-scoring fills the day with
whatever was most overdue at 6am.

### Step 5 — Record

Write the `plan` and its `plan_blocks`, including each block's `score` and a
`rationale` naming the factor contributions. Also write `diagnostics`: **every
activity that could not be placed, and which filter rejected it.**

That diagnostics field is not debug noise — it's the input to conflict detection
below.

---

## The feedback loop

Three signals, each attached to the thing it should change.

### 1. Acceptance and completion → `acceptance_multiplier`

These are **different signals** and must not be conflated:

- **Acceptance** — did you say yes to the suggestion? Rejecting it says *this was a
  bad suggestion*.
- **Completion** — did you actually do it? Accepting and then not doing it says
  *this was an over-optimistic suggestion*.

Both feed the multiplier, tracked per **(activity, time-of-day bucket)** rather than
per activity — because "reading" may be accepted 80% of the time in the evening and
20% in the morning, and the useful correction is to move it, not to stop suggesting
it.

```
rate  = (accepted + completed) / suggested        -- last 30 days, that bucket
mult  = 0.5 + rate                                -- clamped to [0.5, 1.5]
```

Below a minimum sample size, `mult = 1.0`. With three data points you are fitting
noise.

### 2. Duration feedback → `default_duration_minutes`

After a block completes, the user can say **too short / about right / too long**,
stored on `plan_blocks.duration_feedback`. This nudges the activity's default:

```
too_long   ->  default *= 0.85
too_short  ->  default *= 1.15
                clamped to [min_duration, max_duration]
```

Nudge, never jump — one grumpy Tuesday shouldn't halve your running time. A rolling
average over the last few responses is the better version once there's data.

### 3. Recurring events blocking suggestions → surface a conflict

The interesting one. When the same activity is repeatedly displaced by the same
recurring event, that's a structural problem the planner cannot solve on its own —
so it should **stop silently failing and tell the user**.

Detection, from `plans.diagnostics` across recent plans:

```
if activity A failed placement on N of the last M days
   and the blocking occurrence each time belongs to the same event E:
       raise a conflict
```

> "Your Tuesday team sync blocks the only morning slot that fits Gym. Move the
> workout to evenings, shorten it to 30 minutes, or lower its priority?"

This is the difference between a planner that quietly produces worse plans and one
that explains why it can't do better.

---

## Explainability

Every block stores its factor breakdown, and the UI shows it:

> **Reading, 7:00–7:45pm** — you're 90 minutes behind your weekly target, evenings
> are when you complete reading 80% of the time, and this gap fits the full session.

This is not a nicety. It's how you debug a scheduling algorithm, because a bad plan
is never obviously wrong — it's plausibly wrong, and without the breakdown you're
guessing at which weight misbehaved.

---

## Evaluating the algorithm

`plans.algorithm_version` and `plans.weights` exist so quality is measurable rather
than felt:

- acceptance rate per version
- completion rate of accepted blocks
- share of goal targets met per week

**Change one thing at a time, and let a version run for at least a week before
judging it.** The temptation is to tweak weights daily based on one bad plan; with a
sample of one day you are reading noise.

---

## Open questions

- **Cold start.** A new user has no history. Neutral multipliers and pure
  debt-driven scoring, or a short onboarding questionnaire?
- **Multi-day planning.** Scoring is per-day, so a target of "3× per week" can end up
  crammed into three consecutive days. Does the planner need a week-level view?
- **Where suggestions live before acceptance.** `plan_blocks` only, or mirrored into
  the `kind = 'suggested'` calendar so they render in normal views?
- **Regeneration.** When the day changes after a plan is made, re-plan automatically
  or on request? What happens to blocks already accepted?
- **Fixed anchors.** Should some activities be pinnable to a time ("gym is always
  7am") rather than scored into a slot?
- **Rest.** Nothing currently stops the planner from filling every waking gap. Does
  it need an explicit daily cap on planned minutes?
