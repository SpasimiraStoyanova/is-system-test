-- ==============================================================================
-- СИСТЕМА ЗА ДИСКРЕТНА / ВНЕЗАПНА ПРОВЕРКА НА ЛОКАЦИЯ В РЕАЛНО ВРЕМЕ
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.location_ping_requests (
    id BIGSERIAL PRIMARY KEY,
    worker_email TEXT NOT NULL,
    worker_name TEXT,
    requested_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'SUCCESS', 'TIMEOUT'
    result_lat NUMERIC,
    result_lng NUMERIC,
    result_distance INTEGER,
    result_note TEXT,
    responded_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_loc_ping_worker_status ON public.location_ping_requests (worker_email, status);
CREATE INDEX IF NOT EXISTS idx_loc_ping_created ON public.location_ping_requests (created_at DESC);

-- Добавяне в Supabase Realtime (за мигновена реакция на терминала)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'location_ping_requests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.location_ping_requests;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- RLS Политики
ALTER TABLE public.location_ping_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on location_ping_requests" ON public.location_ping_requests;
CREATE POLICY "Allow all on location_ping_requests" ON public.location_ping_requests FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.location_ping_requests TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

