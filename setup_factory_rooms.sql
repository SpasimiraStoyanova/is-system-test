-- ==============================================================================
-- СИСТЕМА ЗА СТАИ, ОПИС И ИНВЕНТАРИЗАЦИЯ НА ОБОРУДВАНЕТО (AMCI)
-- ==============================================================================

-- 1. Таблица: Стаи / Помещения (factory_rooms)
CREATE TABLE IF NOT EXISTS public.factory_rooms (
    id SERIAL PRIMARY KEY,
    room_number TEXT NOT NULL UNIQUE,     -- напр. '11', '12', '21', '22', '31'
    room_name TEXT NOT NULL,              -- напр. 'Бобиновъчен участък', 'Механичен цех'
    floor TEXT NOT NULL DEFAULT 'Етаж 1', -- 'Етаж 1', 'Етаж 2', 'Етаж 3'
    supervisor TEXT,                      -- Отговорник на стаята
    description TEXT,                     -- Описание / Предназначение
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Свързване на Машините към Стаите (factory_machines)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='factory_machines' AND column_name='room_number') THEN
        ALTER TABLE public.factory_machines ADD COLUMN room_number TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='factory_machines' AND column_name='room_name') THEN
        ALTER TABLE public.factory_machines ADD COLUMN room_name TEXT;
    END IF;
END $$;

-- 3. Свързване на Инструментите и Уредите към Стаите (factory_tools)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='factory_tools' AND column_name='room_number') THEN
        ALTER TABLE public.factory_tools ADD COLUMN room_number TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='factory_tools' AND column_name='room_name') THEN
        ALTER TABLE public.factory_tools ADD COLUMN room_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='factory_tools' AND column_name='location_detail') THEN
        ALTER TABLE public.factory_tools ADD COLUMN location_detail TEXT; -- напр. 'Шкаф 1', 'Маса 2', 'Стелаж А'
    END IF;
END $$;

-- 4. Индекси за светкавично филтриране по стая
CREATE INDEX IF NOT EXISTS idx_factory_rooms_num ON public.factory_rooms (room_number);
CREATE INDEX IF NOT EXISTS idx_factory_machines_room ON public.factory_machines (room_number);
CREATE INDEX IF NOT EXISTS idx_factory_tools_room ON public.factory_tools (room_number);

-- 5. Активиране в Supabase Realtime
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'factory_rooms') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.factory_rooms;
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 6. RLS Политики за пълен достъп и права
ALTER TABLE public.factory_rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on factory_rooms" ON public.factory_rooms;
CREATE POLICY "Allow all on factory_rooms" ON public.factory_rooms FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.factory_rooms TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

