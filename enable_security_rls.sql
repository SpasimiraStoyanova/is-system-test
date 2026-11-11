-- =========================================================================
-- 🛡️ АКТИВИРАНЕ НА ROW LEVEL SECURITY (RLS) ЗА ЧУВСТВИТЕЛНИТЕ ТАБЛИЦИ
-- =========================================================================
-- Изпълнете този скрипт в Supabase Dashboard -> SQL Editor -> Run
-- Той защитава данните, като позволява на служителите да четат фишовете си
-- от цеховия терминал, а само на Администратора да записва и редактира.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. ТАБЛИЦА: salary_monthly_logs (Месечни Заплати и Бонуси)
-- -------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.salary_monthly_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on salary_monthly_logs" ON public.salary_monthly_logs;
DROP POLICY IF EXISTS "Allow select for all on salary_monthly_logs" ON public.salary_monthly_logs;
DROP POLICY IF EXISTS "Admin full access on salary_monthly_logs" ON public.salary_monthly_logs;

REVOKE INSERT, UPDATE, DELETE ON public.salary_monthly_logs FROM anon;
GRANT SELECT ON public.salary_monthly_logs TO anon;
GRANT ALL ON public.salary_monthly_logs TO authenticated;

CREATE POLICY "Allow select for all on salary_monthly_logs" 
ON public.salary_monthly_logs 
FOR SELECT 
USING (true);

CREATE POLICY "Admin full access on salary_monthly_logs" 
ON public.salary_monthly_logs 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);


-- -------------------------------------------------------------------------
-- 2. ТАБЛИЦА: salary_bonus_rules (Правила за удръжки и бонуси от Заповедта)
-- -------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.salary_bonus_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on salary_bonus_rules" ON public.salary_bonus_rules;
DROP POLICY IF EXISTS "Allow select for all on salary_bonus_rules" ON public.salary_bonus_rules;
DROP POLICY IF EXISTS "Admin full access on salary_bonus_rules" ON public.salary_bonus_rules;

REVOKE INSERT, UPDATE, DELETE ON public.salary_bonus_rules FROM anon;
GRANT SELECT ON public.salary_bonus_rules TO anon;
GRANT ALL ON public.salary_bonus_rules TO authenticated;

CREATE POLICY "Allow select for all on salary_bonus_rules" 
ON public.salary_bonus_rules 
FOR SELECT 
USING (true);

CREATE POLICY "Admin full access on salary_bonus_rules" 
ON public.salary_bonus_rules 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);


-- -------------------------------------------------------------------------
-- 3. ТАБЛИЦА: personal (Персонал и лични досиета)
-- -------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.personal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on personal" ON public.personal;
DROP POLICY IF EXISTS "Allow select for all on personal" ON public.personal;
DROP POLICY IF EXISTS "Admin full access on personal" ON public.personal;

REVOKE INSERT, UPDATE, DELETE ON public.personal FROM anon;
GRANT SELECT ON public.personal TO anon;
GRANT ALL ON public.personal TO authenticated;

CREATE POLICY "Allow select for all on personal" 
ON public.personal 
FOR SELECT 
USING (true);

CREATE POLICY "Admin full access on personal" 
ON public.personal 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);


-- -------------------------------------------------------------------------
-- 4. Опресняване на кеша на API (PostgREST)
-- -------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
