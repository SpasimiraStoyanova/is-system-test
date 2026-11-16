-- ==============================================================================
-- СИСТЕМА ЗА МАШИНИ, МАЛКИ ИНСТРУМЕНТИ И СКЛАД ИНСТРУМЕНТАЛНА ЕКИПИРОВКА
-- IS-SYSTEMS MES Тестова База Данни
-- ==============================================================================

-- 1. Таблица: Работни Места & Машини (factory_machines)
CREATE TABLE IF NOT EXISTS public.factory_machines (
    id SERIAL PRIMARY KEY,
    code TEXT, -- напр. '101', '102', '201', '301' (първата цифра е етажът)
    name TEXT NOT NULL UNIQUE,
    floor TEXT DEFAULT 'Етаж 1',
    department TEXT,
    model TEXT,
    status TEXT DEFAULT 'active', -- 'active', 'maintenance'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Добавяне на колоните code и floor, ако таблицата вече е съществувала
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='factory_machines' AND column_name='code') THEN
        ALTER TABLE public.factory_machines ADD COLUMN code TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='factory_machines' AND column_name='floor') THEN
        ALTER TABLE public.factory_machines ADD COLUMN floor TEXT DEFAULT 'Етаж 1';
    END IF;
END $$;

-- 2. Таблица: Малки Инструменти & Уреди (factory_tools)
-- (Шублери, Винтоверти, Микрометри, Динамометрични ключове, Калибри)
CREATE TABLE IF NOT EXISTS public.factory_tools (
    id SERIAL PRIMARY KEY,
    tool_code TEXT NOT NULL UNIQUE, -- напр. 'Ш-01', 'В-01', '101-Ш1'
    tool_name TEXT NOT NULL,        -- напр. 'Шублер дигитален 150mm', 'Винтоверт Bosch'
    category TEXT NOT NULL DEFAULT 'Измервателен уред', -- 'Измервателен уред', 'Електрически инструмент', 'Ръчен инструмент', 'Калибър', 'Други'
    workstation_name TEXT,          -- Зачислено към Работно Място / Машина или 'Склад'
    serial_number TEXT,
    calibration_date DATE,          -- Последна проверка / калибрация
    calibration_due DATE,           -- Срок на валидност на калибрацията
    status TEXT DEFAULT 'active',   -- 'active', 'calibration', 'repair', 'broken', 'retired'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Таблица: Склад Инструментална Екипировка (tooling_inventory)
-- (Пластини, Фрези, Държачи, Цанги, Свредла, Консумативи по машини)
CREATE TABLE IF NOT EXISTS public.tooling_inventory (
    id SERIAL PRIMARY KEY,
    item_code TEXT NOT NULL,        -- напр. 'WNMG 080408', 'APKT 1604', 'Фреза Ф10'
    name TEXT NOT NULL,             -- напр. 'Стругарска пластина за стомана'
    machine_name TEXT,              -- За коя машина / пост (напр. 'HAAS ST 10', 'Общо')
    quantity NUMERIC DEFAULT 0,     -- Текуща наличност в склада
    min_quantity NUMERIC DEFAULT 0, -- Критичен буфер (за сигнализация за поръчка)
    unit TEXT DEFAULT 'бр.',
    supplier TEXT,                  -- Доставчик / Партньор
    order_status TEXT DEFAULT 'Налично', -- 'Налично', 'Критично (за поръчка)', 'Поръчано', 'Чака доставка'
    notes TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Таблица: Заявки за Инструменти & Пластини (tooling_requests)
-- (Сигнали от Терминала на работника към Админ панела при свършване)
CREATE TABLE IF NOT EXISTS public.tooling_requests (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    workstation_name TEXT NOT NULL,
    operator_name TEXT,
    tool_item TEXT NOT NULL,        -- Име/тип на свършващата пластина или инструмент
    urgency TEXT DEFAULT 'Нормална', -- 'Нормална', 'Спешна', 'Машината спира!'
    notes TEXT,
    status TEXT DEFAULT 'Чакаща',   -- 'Чакаща', 'Поръчана', 'Осигурена', 'Отхвърлена'
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by TEXT
);

-- 5. Таблица: Дневник на Замервания & Калибрации (factory_tool_calibrations)
-- (Запис на тестови точки с еталони, отчетени стойности, отклонения и история)
CREATE TABLE IF NOT EXISTS public.factory_tool_calibrations (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    tool_id INTEGER,
    tool_code TEXT NOT NULL,        -- напр. 'Ш-01'
    tool_name TEXT,
    check_date DATE NOT NULL DEFAULT CURRENT_DATE,
    checked_by TEXT NOT NULL,       -- Проверяващ (БТК / Метролог)
    check_type TEXT DEFAULT 'Вътрешна проверка с еталони', -- 'Вътрешна проверка с еталони', 'Външна калибрация'
    points JSONB NOT NULL DEFAULT '[]'::JSONB, -- [{"nominal": 10.00, "measured": 10.01, "diff": 0.01}, ...]
    max_deviation NUMERIC DEFAULT 0,
    result TEXT NOT NULL DEFAULT 'Годен (В допуск)', -- 'Годен (В допуск)', 'Условно годен', 'Брак / Извън допуск'
    valid_until DATE NOT NULL,      -- Валиден до коя дата
    notes TEXT
);

-- 6. Индекси за светкавично търсене
CREATE INDEX IF NOT EXISTS idx_factory_machines_code ON public.factory_machines (code);
CREATE INDEX IF NOT EXISTS idx_factory_tools_ws ON public.factory_tools (workstation_name);
CREATE INDEX IF NOT EXISTS idx_tooling_inv_machine ON public.tooling_inventory (machine_name);
CREATE INDEX IF NOT EXISTS idx_tooling_req_status ON public.tooling_requests (status);
CREATE INDEX IF NOT EXISTS idx_tool_calib_code ON public.factory_tool_calibrations (tool_code);
CREATE INDEX IF NOT EXISTS idx_tool_calib_date ON public.factory_tool_calibrations (check_date);

-- 7. Добавяне в Supabase Realtime (за живи нотификации и звук при заявка)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tooling_requests') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tooling_requests;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'factory_tools') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.factory_tools;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tooling_inventory') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tooling_inventory;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'factory_tool_calibrations') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.factory_tool_calibrations;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 8. RLS Политики за пълен достъп
ALTER TABLE public.factory_machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tooling_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tooling_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_tool_calibrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on factory_machines" ON public.factory_machines;
CREATE POLICY "Allow all on factory_machines" ON public.factory_machines FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on factory_tools" ON public.factory_tools;
CREATE POLICY "Allow all on factory_tools" ON public.factory_tools FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on tooling_inventory" ON public.tooling_inventory;
CREATE POLICY "Allow all on tooling_inventory" ON public.tooling_inventory FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on tooling_requests" ON public.tooling_requests;
CREATE POLICY "Allow all on tooling_requests" ON public.tooling_requests FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on factory_tool_calibrations" ON public.factory_tool_calibrations;
CREATE POLICY "Allow all on factory_tool_calibrations" ON public.factory_tool_calibrations FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.factory_machines TO anon, authenticated;
GRANT ALL ON public.factory_tools TO anon, authenticated;
GRANT ALL ON public.tooling_inventory TO anon, authenticated;
GRANT ALL ON public.tooling_requests TO anon, authenticated;
GRANT ALL ON public.factory_tool_calibrations TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

