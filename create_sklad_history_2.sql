ALTER TABLE public.sklad_history ADD COLUMN IF NOT EXISTS snapshot_date date DEFAULT CURRENT_DATE;
