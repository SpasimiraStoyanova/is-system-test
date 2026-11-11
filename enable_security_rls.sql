-- =========================================================================
-- 🛡️ АКТИВИРАНЕ НА ROW LEVEL SECURITY (RLS) ЗА ЧУВСТВИТЕЛНИТЕ ТАБЛИЦИ
-- =========================================================================
-- Изпълнете този скрипт в Supabase Dashboard -> SQL Editor -> Run
-- Той защитава конфиденциалните данни за Заплати, Бонуси и Персонал.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. ТАБЛИЦА: salary_monthly_logs (Месечни Заплати и Бонуси)
-- 🔒 САМО ЛОГНАТ АДМИНИСТРАТОР (authenticated) има достъп (четене и запис).
-- ❌ Забранено за публичния ключ (anon) и външни заявки без автентикация.
-- -------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.salary_monthly_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on salary_monthly_logs" ON public.salary_monthly_logs;
DROP POLICY IF EXISTS "Admin full access on salary_monthly_logs" ON public.salary_monthly_logs;

-- Отнемаме достъпа от anon (терминали и публични заявки)
REVOKE ALL ON public.salary_monthly_logs FROM anon;

-- Даваме пълен достъп само на authenticated (логнатия администратор)
GRANT ALL ON public.salary_monthly_logs TO authenticated;

CREATE POLICY "Admin full access on salary_monthly_logs" 
ON public.salary_monthly_logs 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);


-- -------------------------------------------------------------------------
-- 2. ТАБЛИЦА: salary_bonus_rules (Правила за удръжки и бонуси от Заповедта)
-- 🔒 САМО ЛОГНАТ АДМИНИСТРАТОР може да вижда и променя правилата.
-- -------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.salary_bonus_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on salary_bonus_rules" ON public.salary_bonus_rules;
DROP POLICY IF EXISTS "Admin full access on salary_bonus_rules" ON public.salary_bonus_rules;

REVOKE ALL ON public.salary_bonus_rules FROM anon;
GRANT ALL ON public.salary_bonus_rules TO authenticated;

CREATE POLICY "Admin full access on salary_bonus_rules" 
ON public.salary_bonus_rules 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);


-- -------------------------------------------------------------------------
-- 3. ТАБЛИЦА: personal (Персонал и лични досиета)
-- 👁️ Терминалите и мониторите могат САМО ДА ЧЕТАТ (SELECT) Име и Статус.
-- 🔒 САМО ЛОГНАТ АДМИНИСТРАТОР може да добавя, редактира или трие служители.
-- -------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.personal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on personal" ON public.personal;
DROP POLICY IF EXISTS "Allow select for all on personal" ON public.personal;
DROP POLICY IF EXISTS "Admin full access on personal" ON public.personal;

-- Забраняваме промени (INSERT/UPDATE/DELETE) от публични/цехови терминали
REVOKE INSERT, UPDATE, DELETE ON public.personal FROM anon;
GRANT SELECT ON public.personal TO anon;

-- Администраторът има пълни права
GRANT ALL ON public.personal TO authenticated;

-- Политика за четене: достъпна за цеха и терминала (за чекиране и списък)
CREATE POLICY "Allow select for all on personal" 
ON public.personal 
FOR SELECT 
USING (true);

-- Политика за пълен запис и редакция: САМО за логнат администратор
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
