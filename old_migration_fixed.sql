-- =====================================================================================
-- МИГРАЦИОНЕН СКРИПТ: Обединяване на складовите тригери и почистване на старите
-- =====================================================================================

-- 1. Изтриваме всички стари тригери от otcheti, за да не се дублират бройките.
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'otcheti') LOOP
    EXECUTE 'DROP TRIGGER IF EXISTS "' || r.trigger_name || '" ON public.otcheti';
  END LOOP;
END $$;

-- 2. Създаваме функцията за INSERT (Когато се отчете нещо през терминала или админа)
CREATE OR REPLACE FUNCTION public.process_inventory_on_otchet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_detail text := LOWER(TRIM(NEW."ID Детайл"));
    new_op text := LOWER(TRIM(NEW."Операция"));
    new_qty numeric := COALESCE(NEW."Количество", 0);
    new_operator text := COALESCE(NEW."Оператор", '');
    new_status text := LOWER(TRIM(NEW."Статус"));
    prev_op text;
    child_record RECORD;
    is_last_op boolean := false;
BEGIN
    IF new_qty = 0 THEN RETURN NEW; END IF;

    -- Игнорираме ръчните корекции (те не влияят на inventory_wip)
    IF new_operator ILIKE '%ръчна корек%' THEN
        RETURN NEW;
    END IF;

    -- Намираме предишната операция за този детайл
    SELECT LOWER(TRIM("Име на операция")) INTO prev_op FROM public.marshruti
    WHERE LOWER(TRIM("Име на детайл")) = new_detail AND CAST(NULLIF("№ Операция", '') AS integer) < (
          SELECT CAST(NULLIF("№ Операция", '') AS integer) FROM public.marshruti WHERE LOWER(TRIM("Име на детайл")) = new_detail AND LOWER(TRIM("Име на операция")) = new_op ORDER BY CAST(NULLIF("№ Операция", '') AS integer) DESC LIMIT 1
      ) ORDER BY CAST(NULLIF("№ Операция", '') AS integer) DESC LIMIT 1;

    -- Проверяваме дали текущата операция е последна
    SELECT NOT EXISTS (
        SELECT 1 FROM public.marshruti WHERE LOWER(TRIM("Име на детайл")) = new_detail AND CAST(NULLIF("№ Операция", '') AS integer) > (
              SELECT CAST(NULLIF("№ Операция", '') AS integer) FROM public.marshruti WHERE LOWER(TRIM("Име на детайл")) = new_detail AND LOWER(TRIM("Име на операция")) = new_op ORDER BY CAST(NULLIF("№ Операция", '') AS integer) DESC LIMIT 1
          )
    ) INTO is_last_op;

    -- СТЪПКА 1: Вадим от предишната операция или от склада (освен ако не е Системата)
    IF new_operator NOT ILIKE '%система%' THEN
        IF prev_op IS NOT NULL THEN
            UPDATE public.inventory_wip SET "Количество" = GREATEST(0, "Количество" - new_qty) WHERE LOWER(TRIM("ID Детайл")) = new_detail AND LOWER(TRIM("Операция")) = prev_op;
            IF NOT FOUND THEN INSERT INTO public.inventory_wip ("ID Детайл", "Операция", "Количество") VALUES (new_detail, prev_op, 0); END IF;
        ELSE
            FOR child_record IN SELECT LOWER(TRIM("ID Част")) as child_id, COALESCE("Количество", 1) as req_qty FROM public.bom WHERE LOWER(TRIM("ID Детайл")) = new_detail
            LOOP
                UPDATE public.inventory_gp SET "Количество" = GREATEST(0, "Количество" - (new_qty * child_record.req_qty)) WHERE LOWER(TRIM("ID Детайл")) = child_record.child_id;
                IF NOT FOUND THEN INSERT INTO public.inventory_gp ("ID Детайл", "Количество") VALUES (child_record.child_id, 0); END IF;
            END LOOP;
        END IF;
    END IF;

    -- СТЪПКА 2: Добавяме в текущата операция или GP (само ако не е Брак!)
    IF new_status != 'брак' THEN
        IF is_last_op THEN
            UPDATE public.inventory_gp SET "Количество" = "Количество" + new_qty WHERE LOWER(TRIM("ID Детайл")) = new_detail;
            IF NOT FOUND THEN INSERT INTO public.inventory_gp ("ID Детайл", "Количество") VALUES (new_detail, new_qty); END IF;
        ELSE
            UPDATE public.inventory_wip SET "Количество" = "Количество" + new_qty WHERE LOWER(TRIM("ID Детайл")) = new_detail AND LOWER(TRIM("Операция")) = new_op;
            IF NOT FOUND THEN INSERT INTO public.inventory_wip ("ID Детайл", "Операция", "Количество") VALUES (new_detail, new_op, new_qty); END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


-- 3. Създаваме функцията за DELETE (Когато се изтрие запис от Отчети)
CREATE OR REPLACE FUNCTION public.process_inventory_on_delete_otchet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    old_detail text := LOWER(TRIM(OLD."ID Детайл"));
    old_op text := LOWER(TRIM(OLD."Операция"));
    old_qty numeric := COALESCE(OLD."Количество", 0);
    old_operator text := COALESCE(OLD."Оператор", '');
    old_status text := LOWER(TRIM(OLD."Статус"));
    prev_op text;
    child_record RECORD;
    is_last_op boolean := false;
BEGIN
    IF old_qty = 0 THEN RETURN OLD; END IF;

    -- Игнорираме ръчните корекции
    IF old_operator ILIKE '%ръчна корек%' THEN
        RETURN OLD;
    END IF;

    -- Намираме предишната операция за този детайл
    SELECT LOWER(TRIM("Име на операция")) INTO prev_op FROM public.marshruti
    WHERE LOWER(TRIM("Име на детайл")) = old_detail AND CAST(NULLIF("№ Операция", '') AS integer) < (
          SELECT CAST(NULLIF("№ Операция", '') AS integer) FROM public.marshruti WHERE LOWER(TRIM("Име на детайл")) = old_detail AND LOWER(TRIM("Име на операция")) = old_op ORDER BY CAST(NULLIF("№ Операция", '') AS integer) DESC LIMIT 1
      ) ORDER BY CAST(NULLIF("№ Операция", '') AS integer) DESC LIMIT 1;

    -- Проверяваме дали текущата операция е последна
    SELECT NOT EXISTS (
        SELECT 1 FROM public.marshruti WHERE LOWER(TRIM("Име на детайл")) = old_detail AND CAST(NULLIF("№ Операция", '') AS integer) > (
              SELECT CAST(NULLIF("№ Операция", '') AS integer) FROM public.marshruti WHERE LOWER(TRIM("Име на детайл")) = old_detail AND LOWER(TRIM("Име на операция")) = old_op ORDER BY CAST(NULLIF("№ Операция", '') AS integer) DESC LIMIT 1
          )
    ) INTO is_last_op;

    -- СТЪПКА 1: Вадим от текущата операция (освен ако не е било Брак!)
    IF old_status != 'брак' THEN
        IF is_last_op THEN
            UPDATE public.inventory_gp SET "Количество" = GREATEST(0, "Количество" - old_qty) WHERE LOWER(TRIM("ID Детайл")) = old_detail;
        ELSE
            UPDATE public.inventory_wip SET "Количество" = GREATEST(0, "Количество" - old_qty) WHERE LOWER(TRIM("ID Детайл")) = old_detail AND LOWER(TRIM("Операция")) = old_op;
        END IF;
    END IF;

    -- СТЪПКА 2: Връщаме в предишната операция или склада (включително за Брак, защото бракът също вади оттам)
    IF old_operator NOT ILIKE '%система%' THEN
        IF prev_op IS NOT NULL THEN
            UPDATE public.inventory_wip SET "Количество" = "Количество" + old_qty WHERE LOWER(TRIM("ID Детайл")) = old_detail AND LOWER(TRIM("Операция")) = prev_op;
            IF NOT FOUND THEN INSERT INTO public.inventory_wip ("ID Детайл", "Операция", "Количество") VALUES (old_detail, prev_op, old_qty); END IF;
        ELSE
            FOR child_record IN SELECT LOWER(TRIM("ID Част")) as child_id, COALESCE("Количество", 1) as req_qty FROM public.bom WHERE LOWER(TRIM("ID Детайл")) = old_detail
            LOOP
                UPDATE public.inventory_gp SET "Количество" = "Количество" + (old_qty * child_record.req_qty) WHERE LOWER(TRIM("ID Детайл")) = child_record.child_id;
                IF NOT FOUND THEN INSERT INTO public.inventory_gp ("ID Детайл", "Количество") VALUES (child_record.child_id, (old_qty * child_record.req_qty)); END IF;
            END LOOP;
        END IF;
    END IF;

    RETURN OLD;
END;
$$;

-- 4. Закачаме двата нови тригера към таблицата
CREATE TRIGGER trg_otcheti_insert
AFTER INSERT ON public.otcheti
FOR EACH ROW
EXECUTE FUNCTION public.process_inventory_on_otchet();

CREATE TRIGGER trg_otcheti_delete
BEFORE DELETE ON public.otcheti
FOR EACH ROW
EXECUTE FUNCTION public.process_inventory_on_delete_otchet();

-- =====================================================================================
-- 5. Създаване на таблицата за Хронология (Audit Logs)
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id bigint generated by default as identity primary key,
    table_name text not null,
    action_type text not null,
    old_data jsonb,
    new_data jsonb,
    changed_at timestamp with time zone default now()
);

-- Позволяваме на всички да четат (за да може Админ панелът да ги зарежда)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.audit_logs;
CREATE POLICY "Enable read access for all users" ON public.audit_logs FOR SELECT USING (true);

-- 6. Създаване на универсалната функция-тригер
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO public.audit_logs (table_name, action_type, old_data, changed_at)
        VALUES (TG_TABLE_NAME, TG_OP, row_to_json(OLD)::jsonb, now());
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Записваме само ако има реална промяна в данните
        IF row_to_json(OLD)::jsonb IS DISTINCT FROM row_to_json(NEW)::jsonb THEN
            INSERT INTO public.audit_logs (table_name, action_type, old_data, new_data, changed_at)
            VALUES (TG_TABLE_NAME, TG_OP, row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb, now());
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_logs (table_name, action_type, new_data, changed_at)
        VALUES (TG_TABLE_NAME, TG_OP, row_to_json(NEW)::jsonb, now());
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Закачане на тригера към избраните таблици
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT unnest(ARRAY['plan', 'marshruti', 'bom', 'Номенклатура', 'sklad'])
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_log ON public.%I', t);
        EXECUTE format('CREATE TRIGGER trg_audit_log AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger()', t);
    END LOOP;
END;
$$;

-- =====================================================================================
-- 8. Добавяне на нови колони за Терминала и БОМ
-- =====================================================================================
ALTER TABLE public.marshruti ADD COLUMN IF NOT EXISTS "Инструкция за оставяне" text;
ALTER TABLE public.bom ADD COLUMN IF NOT EXISTS "Влага се на Оп. №" numeric;
