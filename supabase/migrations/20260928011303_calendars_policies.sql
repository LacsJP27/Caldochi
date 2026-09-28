CREATE POLICY "Users can view their own calendars" ON public.calendars
    FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = owner_id);

CREATE POLICY "Users can insert their own calendars" ON public.calendars
    FOR INSERT
    TO authenticated
    WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY "Users can update their own calendars" ON public.calendars
    FOR UPDATE
    TO authenticated
    USING ((select auth.uid()) = owner_id)
    WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY "Users can delete their own calendars" ON public.calendars
    FOR DELETE
    TO authenticated
    USING ((select auth.uid()) = owner_id);
    