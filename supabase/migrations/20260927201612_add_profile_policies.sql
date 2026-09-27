CREATE POLICY "Profiles can view their own profile" ON public.profiles
    FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = id);

CREATE POLICY "Profiles can insert their own profile" ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Profiles can update their own profile" ON public.profiles
    FOR UPDATE
    TO authenticated
    USING ((select auth.uid()) = id)
    WITH CHECK ((select auth.uid()) = id);