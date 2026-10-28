-- ==============================================================
-- Скрипт за Тестовата База Данни (Supabase: zdythzcgcjxwbxufunuh)
-- 1. Създава публичен storage bucket 'dosieta'
-- 2. Задава RLS политики за качване, преглед, сваляне и триене
-- 3. Добавя колона 'password' към таблица 'personal'
-- 4. Опреснява схемата на API (PostgREST)
-- ==============================================================

-- 1. Създаване на кофата за съхранение на файлове (ако още не съществува)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('dosieta', 'dosieta', true) 
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Разрешаване на пълен достъп за качване (INSERT), преглед (SELECT), редакция (UPDATE) и триене (DELETE)
DROP POLICY IF EXISTS "Allow all on dosieta" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon all on dosieta" ON storage.objects;
DROP POLICY IF EXISTS "Allow public all on dosieta" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated all on dosieta" ON storage.objects;

CREATE POLICY "Allow all on dosieta" ON storage.objects
FOR ALL
USING (bucket_id = 'dosieta')
WITH CHECK (bucket_id = 'dosieta');

GRANT ALL ON storage.objects TO anon, authenticated;
GRANT ALL ON storage.buckets TO anon, authenticated;

-- 3. Добавяне на колона 'password' за индивидуалните пароли/ПИН кодове на служителите
ALTER TABLE public.personal ADD COLUMN IF NOT EXISTS password text;

-- 4. Опресняване на кеша на API
NOTIFY pgrst, 'reload schema';
