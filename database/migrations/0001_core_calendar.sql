CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL DEFAULT '',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    week_start SMALLINT NOT NULL DEFAULT 0
        CHECK (week_start BETWEEN 0 AND 6),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.calendars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    kind TEXT NOT NULL DEFAULT 'personal'
        CHECK (kind IN ('personal', 'suggested', 'imported')),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX calendars_one_default_per_owner
    ON public.calendars (owner_id)
    WHERE is_default = TRUE;

CREATE TABLE public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_id UUID NOT NULL REFERENCES public.calendars(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    all_day BOOLEAN NOT NULL DEFAULT FALSE,
    start_time TIMESTAMPTZ,
    duration_minutes INTEGER,
    start_date DATE,
    duration_days INTEGER,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    rrule TEXT,
    transparency TEXT NOT NULL DEFAULT 'opaque'
        CHECK (transparency IN ('opaque', 'transparent')),
    status TEXT NOT NULL DEFAULT 'confirmed'
        CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
    ical_uid TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT events_valid_time_shape CHECK (
        (
            all_day = FALSE
            AND start_time IS NOT NULL
            AND duration_minutes IS NOT NULL
            AND duration_minutes > 0
            AND start_date IS NULL
            AND duration_days IS NULL
        )
        OR
        (
            all_day = TRUE
            AND start_time IS NULL
            AND duration_minutes IS NULL
            AND start_date IS NOT NULL
            AND duration_days IS NOT NULL
            AND duration_days > 0
        )
    )
);

CREATE UNIQUE INDEX events_calendar_ical_uid_unique
    ON public.events (calendar_id, ical_uid)
    WHERE ical_uid IS NOT NULL;
