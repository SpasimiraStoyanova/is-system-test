-- ==============================================================
-- Скрипт за Система "Заплати, Бонуси & Мотивация" (AMCI MES)
-- Тестова База Данни: zdythzcgcjxwbxufunuh
-- ==============================================================

-- 1. Таблица за Конфигурация на Правилата (Заповедта)
CREATE TABLE IF NOT EXISTS public.salary_bonus_rules (
    id serial PRIMARY KEY,
    rule_code text NOT NULL UNIQUE,
    rule_name text NOT NULL,
    category text NOT NULL, -- 'attendance' (Закъснения), '3s' (3S Одити), 'reports' (Отчети), 'bonus' (Поощрения)
    threshold integer NOT NULL DEFAULT 1, -- праг брой пъти
    penalty_amount numeric NOT NULL DEFAULT 0, -- удръжка в EUR
    bonus_amount numeric NOT NULL DEFAULT 0, -- бонус в EUR
    unit text NOT NULL DEFAULT 'пъти',
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

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

-- 4. RLS Политики за достъп
ALTER TABLE public.salary_bonus_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on salary_bonus_rules" ON public.salary_bonus_rules;
CREATE POLICY "Allow all on salary_bonus_rules" ON public.salary_bonus_rules FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.salary_monthly_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on salary_monthly_logs" ON public.salary_monthly_logs;
CREATE POLICY "Allow all on salary_monthly_logs" ON public.salary_monthly_logs FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.salary_bonus_rules TO anon, authenticated;
GRANT ALL ON public.salary_monthly_logs TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- 5. Първоначални правила по подразбиране (според примерите за Заповедта)
INSERT INTO public.salary_bonus_rules (rule_code, rule_name, category, threshold, penalty_amount, bonus_amount, unit, description, is_active)
VALUES 
    ('LATE_ARRIVAL', 'Закъснения за смяна (след 08:05)', 'attendance', 3, 10.00, 0, 'пъти', 'При 3 или повече закъснения за смяна след 08:05 ч. се удържат 10 €', true),
    ('FAILED_3S', 'Неиздържан 3S одит (под 80%)', '3s', 1, 20.00, 0, 'одита', 'При неиздържан 3S одит на работното място се удържат 20 €', true),
    ('WRONG_REPORT', 'Грешно отчитане на детайл / Брак', 'reports', 3, 15.00, 0, 'отчета', 'При 3 или повече грешни отчитания или брак (по подразбиране е изключено)', false),
    ('PERFECT_ATTENDANCE', 'Поощрение: Без закъснения за месеца', 'bonus', 0, 0, 20.00, 'месец', 'Поощрителен бонус при 0 закъснения през целия календарен месец', true)
ON CONFLICT (rule_code) DO UPDATE 
SET rule_name = EXCLUDED.rule_name,
    category = EXCLUDED.category,
    threshold = EXCLUDED.threshold,
    penalty_amount = EXCLUDED.penalty_amount,
    bonus_amount = EXCLUDED.bonus_amount,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

-- 6. Опресняване на API кеша
NOTIFY pgrst, 'reload schema';

