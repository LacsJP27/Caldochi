CREATE POLICY "Users can view their own calendar events" ON public.events
    FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = (SELECT owner_id FROM public.calendars WHERE id = calendar_id));

CREATE POLICY "Users can insert their own calendar events" ON public.events
    FOR INSERT
    TO authenticated
    WITH CHECK ((select auth.uid()) = (SELECT owner_id FROM public.calendars WHERE id = calendar_id));

CREATE POLICY "Users can update their own calendar events" ON public.events
    FOR UPDATE
    TO authenticated
    USING ((select auth.uid()) = (SELECT owner_id FROM public.calendars WHERE id = calendar_id))
    WITH CHECK ((select auth.uid()) = (SELECT owner_id FROM public.calendars WHERE id = calendar_id));

CREATE POLICY "Users can delete their own calendar events" ON public.events
    FOR DELETE
    TO authenticated
    USING ((select auth.uid()) = (SELECT owner_id FROM public.calendars WHERE id = calendar_id));
