ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.audit_logs;
CREATE POLICY "Enable read access for all users" ON public.audit_logs FOR SELECT USING (true);
