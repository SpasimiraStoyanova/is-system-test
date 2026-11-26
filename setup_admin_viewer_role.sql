-- =========================================================================
-- 👁️ РОЛЯ "VIEWER" (САМО ЗА ПРЕГЛЕД) В АДМИН ПАНЕЛА
-- =========================================================================
-- Изпълнете този скрипт веднъж в Supabase Dashboard -> SQL Editor -> Run.
--
-- Как работи:
-- 1. Създава таблица public.admin_roles (само за четене от приложението;
--    редакция на ролите става само през Supabase SQL Editor).
-- 2. Създава функция public.is_admin_viewer(), която проверява дали
--    текущо логнатият потребител има роля 'viewer'.
-- 3. Добавя RESTRICTIVE RLS политики за роля 'authenticated' на всички
--    таблици в public и storage.objects, така че:
--    - SELECT (четене) е напълно разрешен (viewer вижда всичко);
--    - INSERT / UPDATE / DELETE са забранени на ниво база данни за viewer;
--    - Обикновените админи (които НЕ са в admin_roles като viewer) и
--      цеховите терминали (anon) продължават да работят без промяна.
-- =========================================================================

-- 1. Таблица с роли за Админ панела
CREATE TABLE IF NOT EXISTS public.admin_roles (
    email text PRIMARY KEY,
    role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
    notes text,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read admin_roles" ON public.admin_roles;
CREATE POLICY "Allow authenticated read admin_roles"
ON public.admin_roles
FOR SELECT
TO authenticated
USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.admin_roles FROM anon, authenticated;
GRANT SELECT ON public.admin_roles TO authenticated;

-- 2. Помощна функция за проверка дали логнатият потребител е viewer
CREATE OR REPLACE FUNCTION public.is_admin_viewer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_roles ar
        WHERE LOWER(TRIM(ar.email)) = LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')))
          AND ar.role = 'viewer'
    )
    OR LOWER(TRIM(COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', ''))) = 'viewer';
$$;

-- 3. Забрана на INSERT / UPDATE / DELETE за viewer върху всички таблици в public
DO $$
DECLARE
    tbl record;
BEGIN
    FOR tbl IN
        SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
          AND c.relname <> 'admin_roles'
    LOOP
        -- Ако таблицата все още няма включен RLS, първо добавяме обща permissive
        -- политика за текущата работа на админите и терминалите, за да не се блокира никой.
        IF NOT tbl.rls_enabled THEN
            EXECUTE format('DROP POLICY IF EXISTS "Allow default access" ON public.%I', tbl.table_name);
            EXECUTE format(
                'CREATE POLICY "Allow default access" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
                tbl.table_name
            );
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl.table_name);
        END IF;

        EXECUTE format('DROP POLICY IF EXISTS "Restrict viewer insert" ON public.%I', tbl.table_name);
        EXECUTE format(
            'CREATE POLICY "Restrict viewer insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.is_admin_viewer())',
            tbl.table_name
        );

        EXECUTE format('DROP POLICY IF EXISTS "Restrict viewer update" ON public.%I', tbl.table_name);
        EXECUTE format(
            'CREATE POLICY "Restrict viewer update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.is_admin_viewer()) WITH CHECK (NOT public.is_admin_viewer())',
            tbl.table_name
        );

        EXECUTE format('DROP POLICY IF EXISTS "Restrict viewer delete" ON public.%I', tbl.table_name);
        EXECUTE format(
            'CREATE POLICY "Restrict viewer delete" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.is_admin_viewer())',
            tbl.table_name
        );
    END LOOP;
END;
$$;

-- 4. Забрана на качване/редакция/триене на файлове (storage.objects) за viewer
DO $$
BEGIN
    DROP POLICY IF EXISTS "Restrict viewer storage insert" ON storage.objects;
    CREATE POLICY "Restrict viewer storage insert"
    ON storage.objects AS RESTRICTIVE
    FOR INSERT TO authenticated
    WITH CHECK (NOT public.is_admin_viewer());

    DROP POLICY IF EXISTS "Restrict viewer storage update" ON storage.objects;
    CREATE POLICY "Restrict viewer storage update"
    ON storage.objects AS RESTRICTIVE
    FOR UPDATE TO authenticated
    USING (NOT public.is_admin_viewer())
    WITH CHECK (NOT public.is_admin_viewer());

    DROP POLICY IF EXISTS "Restrict viewer storage delete" ON storage.objects;
    CREATE POLICY "Restrict viewer storage delete"
    ON storage.objects AS RESTRICTIVE
    FOR DELETE TO authenticated
    USING (NOT public.is_admin_viewer());
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Storage policy skipped: %', SQLERRM;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- =========================================================================
-- КАК ДА ДОБАВИТЕ 4-ТИЯ ЧОВЕК КАТО VIEWER:
-- 1) Създайте му акаунт в Supabase -> Authentication -> Users -> Add user
-- 2) Изпълнете в SQL Editor долния ред (с неговия реален имейл):
--
-- INSERT INTO public.admin_roles (email, role, notes)
-- VALUES ('viewer@company.com', 'viewer', 'Само преглед')
-- ON CONFLICT (email) DO UPDATE SET role = 'viewer';
--
-- Ако по-късно решите да му дадете права за редакция:
-- UPDATE public.admin_roles SET role = 'admin' WHERE LOWER(email) = 'viewer@company.com';
-- =========================================================================

