REVOKE ALL ON TABLE
    public.profiles,
    public.calendars,
    public.events
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
    public.profiles
    TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.calendars,
    public.events
    TO authenticated;
