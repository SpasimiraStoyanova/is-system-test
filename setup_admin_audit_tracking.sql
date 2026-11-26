-- =========================================================================
-- 👤 ПРОСЛЕДЯВАНЕ КОЙ АДМИНИСТРАТОР ПРАВИ ПРОМЕНИТЕ (ADMIN AUDIT TRACKING)
-- =========================================================================
-- Изпълнете този скрипт веднъж в Supabase Dashboard -> SQL Editor -> Run.
-- Той:
-- 1. Добавя колони changed_by и changed_by_email в public.audit_logs
-- 2. Обновява audit_log_trigger() автоматично да извлича логнатия админ от JWT
--    и да намира името му по имейл в таблица public.personal
-- 3. Закача одит тригера към всички важни административни таблици
-- =========================================================================

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS changed_by text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS changed_by_email text;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.audit_logs;
CREATE POLICY "Enable read access for all users"
ON public.audit_logs
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Allow insert audit_logs for authenticated and anon" ON public.audit_logs;
CREATE POLICY "Allow insert audit_logs for authenticated and anon"
ON public.audit_logs
FOR INSERT
TO authenticated, anon
WITH CHECK (true);

GRANT SELECT, INSERT ON public.audit_logs TO anon, authenticated;

-- Помощна функция за резолвиране на текущия потребител (Име от personal / JWT)
CREATE OR REPLACE FUNCTION public.resolve_current_actor_info(
    OUT actor_name text,
    OUT actor_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_jwt jsonb;
    v_email text;
    v_name text;
BEGIN
    BEGIN
        v_jwt := auth.jwt();
    EXCEPTION WHEN OTHERS THEN
        v_jwt := NULL;
    END;

    v_email := NULLIF(TRIM(COALESCE(
        v_jwt ->> 'email',
        current_setting('request.jwt.claim.email', true),
        ''
    )), '');

    IF v_email IS NOT NULL THEN
        SELECT NULLIF(TRIM("Име"), '')
        INTO v_name
        FROM public.personal
        WHERE LOWER(TRIM("Имейл")) = LOWER(v_email)
        LIMIT 1;

        IF v_name IS NULL THEN
            v_name := NULLIF(TRIM(COALESCE(
                v_jwt -> 'user_metadata' ->> 'full_name',
                v_jwt -> 'user_metadata' ->> 'name',
                ''
            )), '');
        END IF;

        actor_email := v_email;
        actor_name := COALESCE(v_name, v_email);
    ELSE
        actor_email := NULL;
        actor_name := NULL;
    END IF;
END;
$$;

-- Обновена универсална тригер функция за audit_logs
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_name text;
    v_actor_email text;
BEGIN
    SELECT actor_name, actor_email INTO v_actor_name, v_actor_email
    FROM public.resolve_current_actor_info();

    IF TG_OP = 'DELETE' THEN
        INSERT INTO public.audit_logs (table_name, action_type, old_data, changed_at, changed_by, changed_by_email)
        VALUES (TG_TABLE_NAME, TG_OP, row_to_json(OLD)::jsonb, now(), v_actor_name, v_actor_email);
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        IF row_to_json(OLD)::jsonb IS DISTINCT FROM row_to_json(NEW)::jsonb THEN
            INSERT INTO public.audit_logs (table_name, action_type, old_data, new_data, changed_at, changed_by, changed_by_email)
            VALUES (TG_TABLE_NAME, TG_OP, row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb, now(), v_actor_name, v_actor_email);
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_logs (table_name, action_type, new_data, changed_at, changed_by, changed_by_email)
        VALUES (TG_TABLE_NAME, TG_OP, row_to_json(NEW)::jsonb, now(), v_actor_name, v_actor_email);
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

-- Закачане на тригера към всички основни и административни таблици (ако съществуват)
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'plan',
        'marshruti',
        'bom',
        'Номенклатура',
        'sklad',
        'inventory',
        'inventory_gp',
        'inventory_wip',
        'personal',
        'porachki_materiali',
        'tooling_inventory',
        'factory_machines',
        'factory_tools',
        'factory_rooms',
        'salary_bonus_rules',
        'salary_monthly_logs',
        'audit_3s_auditors'
    ])
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = t
        ) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_log ON public.%I', t);
            EXECUTE format('CREATE TRIGGER trg_audit_log AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger()', t);
        END IF;
    END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

