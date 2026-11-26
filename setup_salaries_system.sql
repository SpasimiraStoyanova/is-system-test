-- ==============================================================
-- Скрипт за Система "Заплати, Бонуси & Мотивация" (AMCI MES)
-- Включва: Създаване на таблици + Сигурност за достъп от Терминала и Админа
-- Тестова База Данни: zdythzcgcjxwbxufunuh
-- ==============================================================

-- 1. Таблица за Конфигурация на Правилата (Заповедта)
CREATE TABLE IF NOT EXISTS public.salary_bonus_rules (
    id serial PRIMARY KEY,
    rule_code text NOT NULL UNIQUE,
    rule_name text NOT NULL,
    category text NOT NULL, -- 'attendance' (Закъснения), '3s' (3S Одити), 'reports' (Отчети), 'bonus' (Поощрения)
    threshold integer NOT NULL DEFAULT 1, -- праг брой пъти
    calc_type text NOT NULL DEFAULT 'percent', -- 'percent' (% от базовия бонус) или 'fixed' (твърда сума в EUR)
    penalty_amount numeric NOT NULL DEFAULT 0, -- удръжка (% или EUR)
    bonus_amount numeric NOT NULL DEFAULT 0, -- бонус (% или EUR)
    unit text NOT NULL DEFAULT 'пъти',
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.salary_bonus_rules ADD COLUMN IF NOT EXISTS calc_type text DEFAULT 'percent';

-- 2. Таблица за Месечни Записи / Изчисления на Бонусите и Заплатите
CREATE TABLE IF NOT EXISTS public.salary_monthly_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    month text NOT NULL, -- напр. 'Октомври'
    year integer NOT NULL, -- напр. 2026
    worker_email text NOT NULL,
    worker_name text,
    position text,
    base_salary numeric DEFAULT 0,
    base_bonus numeric DEFAULT 0,
    late_count integer DEFAULT 0,
    late_penalty numeric DEFAULT 0,
    audit_3s_failed_count integer DEFAULT 0,
    audit_3s_penalty numeric DEFAULT 0,
    report_mistakes_count integer DEFAULT 0,
    report_penalty numeric DEFAULT 0,
    manual_adjustment numeric DEFAULT 0,
    manual_notes text,
    total_penalty numeric DEFAULT 0,
    total_bonus numeric DEFAULT 0,
    final_payout numeric DEFAULT 0,
    status text DEFAULT 'Чернова', -- 'Чернова', 'Одобрено'
    details_json jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS salary_monthly_logs_month_worker_idx 
ON public.salary_monthly_logs (month, year, worker_email);

-- 3. Добавяне на колони за Базов бонус и Заплата в таблица personal (ако липсват)
ALTER TABLE public.personal ADD COLUMN IF NOT EXISTS "Основна заплата" numeric DEFAULT 0;
ALTER TABLE public.personal ADD COLUMN IF NOT EXISTS "Базов бонус" numeric DEFAULT 0;

-- 4. Първоначални правила по подразбиране (Модел 30% 3S / 60% Дисциплина 100т. / 10% Ръководител + Поощрения EUR)
INSERT INTO public.salary_bonus_rules (rule_code, rule_name, category, threshold, calc_type, penalty_amount, bonus_amount, unit, description, is_active)
VALUES 
    ('LATE_ARRIVAL', 'Закъснения за смяна (след 08:00)', 'attendance', 3, 'fixed', 10.00, 0, 'закъснения', 'Толеранс до 3 закъснения за месеца (след 08:00 ч.). От 4-тото нататък се удържат -10 точки от стартовите 100 т. Дисциплина.', true),
    ('MISSING_REPORT', 'Непопълнен дневен отчет', 'reports', 2, 'fixed', 8.00, 0, 'пропуска', 'Толеранс до 2 пропуска в присъствен ден. От 3-тия пропуск нататък се удържат -8 точки Дисциплина.', true),
    ('WRONG_REPORT_ERR', 'Грешно въведени данни в отчет', 'reports', 0, 'fixed', 5.00, 0, 'случая', 'Без толеранс: -5 точки Дисциплина на случай (установен от контрольор / система).', true),
    ('OPERATOR_SCRAP', 'Допуснат брак по вина на оператора', 'reports', 0, 'fixed', 15.00, 0, 'случая', 'Без толеранс: -15 точки Дисциплина на случай (по отметка / Акт за брак ОТК).', true),
    ('ADMIN_VIOLATION', 'Административно нарушение', 'discipline', 0, 'fixed', 15.00, 0, 'случая', 'Без толеранс: -15 точки Дисциплина на случай по доклад от прекия ръководител.', true),
    ('PERFECT_ATTENDANCE', 'Поощрение: Перфектен месец (+20 EUR)', 'bonus', 0, 'fixed', 0, 20.00, 'месец', '+20 EUR при 0 закъснения, 0 грешки/пропуски в отчитането, 0 брак по вина и пълно присъствие спрямо цеховите работни дни.', true)
ON CONFLICT (rule_code) DO UPDATE 
SET rule_name = EXCLUDED.rule_name,
    category = EXCLUDED.category,
    threshold = EXCLUDED.threshold,
    calc_type = EXCLUDED.calc_type,
    penalty_amount = EXCLUDED.penalty_amount,
    bonus_amount = EXCLUDED.bonus_amount,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

-- 5. RLS СИГУРНОСТ (Защита с право на четене на фиша от служителя)

-- А) Заплати и Бонуси
ALTER TABLE public.salary_monthly_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on salary_monthly_logs" ON public.salary_monthly_logs;
DROP POLICY IF EXISTS "Allow select for all on salary_monthly_logs" ON public.salary_monthly_logs;
DROP POLICY IF EXISTS "Admin full access on salary_monthly_logs" ON public.salary_monthly_logs;

-- Забраняваме вмъкване, промяна или триене от терминалите
REVOKE INSERT, UPDATE, DELETE ON public.salary_monthly_logs FROM anon;
-- Разрешаваме ЧЕТЕНЕ (за да може служителят да си вижда фиша в досието)
GRANT SELECT ON public.salary_monthly_logs TO anon;
-- Пълни права за логнатия администратор
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

-- Б) Правила за Бонуси
ALTER TABLE public.salary_bonus_rules ENABLE ROW LEVEL SECURITY;
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

-- В) Персонал
ALTER TABLE public.personal ENABLE ROW LEVEL SECURITY;
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

-- 6. Опресняване на кеша на API
NOTIFY pgrst, 'reload schema';
