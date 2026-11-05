-- ==============================================================
-- Скрипт за 3S Система (Sort, Sweep, Standardize)
-- Тестова База Данни: zdythzcgcjxwbxufunuh
-- ==============================================================

-- 1. Таблица за Проверяващи и техните Звена
CREATE TABLE IF NOT EXISTS public.audit_3s_auditors (
    id serial PRIMARY KEY,
    auditor_name text NOT NULL,
    sector text NOT NULL UNIQUE,
    email text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 2. Таблица за Шаблони на Въпроси & Оценъчни рубрики (0 до 4 точки)
CREATE TABLE IF NOT EXISTS public.audit_3s_templates (
    id serial PRIMARY KEY,
    sector text NOT NULL, -- 'Измерване и монтаж', 'Бобиньорки', 'Машини'
    category text NOT NULL, -- '1. Sort (Сортиране)', '2. Sweep (Почистване)', '3. Standardize (Стандартизация)'
    question_code text NOT NULL, -- напр. '1.1', '1.2'
    question_title text NOT NULL,
    question_desc text,
    criteria jsonb NOT NULL DEFAULT '[]'::jsonb, -- масив от обекти {"points": 0..4, "text": "..."}
    order_index integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 3. Таблица за Списък с Общи части по Звена
CREATE TABLE IF NOT EXISTS public.audit_3s_areas (
    id serial PRIMARY KEY,
    sector text NOT NULL,
    area_name text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 4. Таблица за Зачислени Служители към Звено (за бърз избор при одит)
CREATE TABLE IF NOT EXISTS public.audit_3s_workers (
    id serial PRIMARY KEY,
    sector text NOT NULL,
    worker_name text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 5. Таблица за Записани Одити (Резултати)
CREATE TABLE IF NOT EXISTS public.audit_3s_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    audit_date date DEFAULT current_date,
    sector text NOT NULL,
    auditor_name text NOT NULL,
    target_type text NOT NULL, -- 'worker' (Служител) или 'area' (Обща част)
    target_name text NOT NULL, -- Име на служителя или име на общата част
    total_points numeric NOT NULL DEFAULT 0,
    max_points numeric NOT NULL DEFAULT 0,
    percentage numeric NOT NULL DEFAULT 0,
    answers jsonb NOT NULL DEFAULT '[]'::jsonb,
    notes text,
    photo_url text
);

-- 6. Задаване на RLS права за достъп
ALTER TABLE public.audit_3s_auditors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on audit_3s_auditors" ON public.audit_3s_auditors;
CREATE POLICY "Allow all on audit_3s_auditors" ON public.audit_3s_auditors FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.audit_3s_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on audit_3s_templates" ON public.audit_3s_templates;
CREATE POLICY "Allow all on audit_3s_templates" ON public.audit_3s_templates FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.audit_3s_areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on audit_3s_areas" ON public.audit_3s_areas;
CREATE POLICY "Allow all on audit_3s_areas" ON public.audit_3s_areas FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.audit_3s_workers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on audit_3s_workers" ON public.audit_3s_workers;
CREATE POLICY "Allow all on audit_3s_workers" ON public.audit_3s_workers FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.audit_3s_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on audit_3s_logs" ON public.audit_3s_logs;
CREATE POLICY "Allow all on audit_3s_logs" ON public.audit_3s_logs FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.audit_3s_auditors TO anon, authenticated;
GRANT ALL ON public.audit_3s_templates TO anon, authenticated;
GRANT ALL ON public.audit_3s_areas TO anon, authenticated;
GRANT ALL ON public.audit_3s_workers TO anon, authenticated;
GRANT ALL ON public.audit_3s_logs TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- 7. Първоначални данни за Проверяващите
INSERT INTO public.audit_3s_auditors (auditor_name, sector, email, is_active)
VALUES 
    ('Васил Асенов', 'Измерване и монтаж', 'amcirazlog@gmail.com', true),
    ('Не е зададен', 'Бобиньорки', '', true),
    ('Не е зададен', 'Машини', '', true)
ON CONFLICT (sector) DO NOTHING;

-- 8. Първоначален примерен въпрос (за Измерване и монтаж)
INSERT INTO public.audit_3s_templates (sector, category, question_code, question_title, question_desc, criteria, order_index)
VALUES (
    'Измерване и монтаж',
    '1. Sort (Сортиране)',
    '1.2',
    'Нужните инструменти, приспособления и др.',
    'На работното място се намират само нужните инструменти, приспособления и др. Инструменти, които не са нужни за текущата работа, са отстранени от работното място.',
    '[
        {"points": 0, "text": "Пълен безпорядък; Приспособленията са разхвърляни; инструментите за рязане са разхвърляни."},
        {"points": 1, "text": "На масата има повече шаблони и макари от необходимото за смяната."},
        {"points": 2, "text": "Инструментите са за текущата поръчка, но не са подредени по начин, който пести време."},
        {"points": 3, "text": "Инструментите са групирани логично; контролно-измервателната апаратура е защитена от прах и повреди."},
        {"points": 4, "text": "Минимален набор от инструменти на масата; всичко е чисто и подредено за максимална ефективност на навиване."}
    ]'::jsonb,
    10
)
ON CONFLICT DO NOTHING;

-- Опресняване на кеша на API
NOTIFY pgrst, 'reload schema';
