CREATE TABLE IF NOT EXISTS public.sklad_history AS TABLE public.sklad WITH NO DATA;
ALTER TABLE public.sklad_history ADD COLUMN IF NOT EXISTS snapshot_date date DEFAULT CURRENT_DATE;
