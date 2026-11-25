-- Добавяне на колона photo_url за прикачени снимки в Сервизния дневник
ALTER TABLE public.factory_maintenance_log ADD COLUMN IF NOT EXISTS photo_url text;
NOTIFY pgrst, 'reload schema';

