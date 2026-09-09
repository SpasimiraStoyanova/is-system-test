-- 1. Изтриваме старите изгледи (вече не ни трябват)
DROP VIEW IF EXISTS public.computed_sklad_wip CASCADE;
DROP VIEW IF EXISTS public.computed_sklad_gp CASCADE;

-- 2. Обединяваме таблиците
-- Преименуваме inventory_wip на inventory
ALTER TABLE IF EXISTS public.inventory_wip RENAME TO inventory;

-- Изтриваме inventory_gp
DROP TABLE IF EXISTS public.inventory_gp CASCADE;

-- 3. Обновяваме тригерите за Отчети
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

    -- Игнорираме ръчните корекции
    IF new_operator ILIKE '%ръчна корек%' THEN
        RETURN NEW;
    END IF;

    -- Игнорираме Опаковане (не влияе на складовата наличност, само на статуса)
    IF new_op ILIKE 'опаков%' THEN RETURN NEW; END IF;

    -- При Експедиция - вадим директно от Готов продукт
    IF new_op ILIKE 'експед%' THEN
        UPDATE public.inventory SET "Количество" = GREATEST(0, "Количество" - new_qty) WHERE LOWER(TRIM("ID Детайл")) = new_detail AND LOWER(TRIM("Операция")) = 'Готов продукт';
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
            UPDATE public.inventory SET "Количество" = GREATEST(0, "Количество" - new_qty) WHERE LOWER(TRIM("ID Детайл")) = new_detail AND LOWER(TRIM("Операция")) = prev_op;
            IF NOT FOUND THEN INSERT INTO public.inventory ("ID Детайл", "Операция", "Количество") VALUES (new_detail, prev_op, 0); END IF;
        ELSE
            FOR child_record IN SELECT LOWER(TRIM("ID Част")) as child_id, COALESCE("Количество", 1) as req_qty FROM public.bom WHERE LOWER(TRIM("ID Детайл")) = new_detail
            LOOP
                UPDATE public.inventory SET "Количество" = GREATEST(0, "Количество" - (new_qty * child_record.req_qty)) WHERE LOWER(TRIM("ID Детайл")) = child_record.child_id AND LOWER(TRIM("Операция")) = 'Готов продукт';
                IF NOT FOUND THEN INSERT INTO public.inventory ("ID Детайл", "Операция", "Количество") VALUES (child_record.child_id, 'Готов продукт', 0); END IF;
            END LOOP;
        END IF;
    END IF;

    -- СТЪПКА 2: Добавяме в текущата операция или Готов продукт (само ако не е Брак!)
    IF new_status != 'брак' THEN
        IF is_last_op THEN
            UPDATE public.inventory SET "Количество" = "Количество" + new_qty WHERE LOWER(TRIM("ID Детайл")) = new_detail AND LOWER(TRIM("Операция")) = 'Готов продукт';
            IF NOT FOUND THEN INSERT INTO public.inventory ("ID Детайл", "Операция", "Количество") VALUES (new_detail, 'Готов продукт', new_qty); END IF;
        ELSE
            UPDATE public.inventory SET "Количество" = "Количество" + new_qty WHERE LOWER(TRIM("ID Детайл")) = new_detail AND LOWER(TRIM("Операция")) = new_op;
            IF NOT FOUND THEN INSERT INTO public.inventory ("ID Детайл", "Операция", "Количество") VALUES (new_detail, new_op, new_qty); END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


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

    IF old_operator ILIKE '%ръчна корек%' THEN RETURN OLD; END IF;
    IF old_op ILIKE 'опаков%' THEN RETURN OLD; END IF;

    IF old_op ILIKE 'експед%' THEN
        UPDATE public.inventory SET "Количество" = "Количество" + old_qty WHERE LOWER(TRIM("ID Детайл")) = old_detail AND LOWER(TRIM("Операция")) = 'Готов продукт';
        RETURN OLD;
    END IF;

    SELECT LOWER(TRIM("Име на операция")) INTO prev_op FROM public.marshruti
    WHERE LOWER(TRIM("Име на детайл")) = old_detail AND CAST(NULLIF("№ Операция", '') AS integer) < (
          SELECT CAST(NULLIF("№ Операция", '') AS integer) FROM public.marshruti WHERE LOWER(TRIM("Име на детайл")) = old_detail AND LOWER(TRIM("Име на операция")) = old_op ORDER BY CAST(NULLIF("№ Операция", '') AS integer) DESC LIMIT 1
      ) ORDER BY CAST(NULLIF("№ Операция", '') AS integer) DESC LIMIT 1;

    SELECT NOT EXISTS (
        SELECT 1 FROM public.marshruti WHERE LOWER(TRIM("Име на детайл")) = old_detail AND CAST(NULLIF("№ Операция", '') AS integer) > (
              SELECT CAST(NULLIF("№ Операция", '') AS integer) FROM public.marshruti WHERE LOWER(TRIM("Име на детайл")) = old_detail AND LOWER(TRIM("Име на операция")) = old_op ORDER BY CAST(NULLIF("№ Операция", '') AS integer) DESC LIMIT 1
          )
    ) INTO is_last_op;

    IF old_status != 'брак' THEN
        IF is_last_op THEN
            UPDATE public.inventory SET "Количество" = GREATEST(0, "Количество" - old_qty) WHERE LOWER(TRIM("ID Детайл")) = old_detail AND LOWER(TRIM("Операция")) = 'Готов продукт';
        ELSE
            UPDATE public.inventory SET "Количество" = GREATEST(0, "Количество" - old_qty) WHERE LOWER(TRIM("ID Детайл")) = old_detail AND LOWER(TRIM("Операция")) = old_op;
        END IF;
    END IF;

    IF old_operator NOT ILIKE '%система%' THEN
        IF prev_op IS NOT NULL THEN
            UPDATE public.inventory SET "Количество" = "Количество" + old_qty WHERE LOWER(TRIM("ID Детайл")) = old_detail AND LOWER(TRIM("Операция")) = prev_op;
            IF NOT FOUND THEN INSERT INTO public.inventory ("ID Детайл", "Операция", "Количество") VALUES (old_detail, prev_op, old_qty); END IF;
        ELSE
            FOR child_record IN SELECT LOWER(TRIM("ID Част")) as child_id, COALESCE("Количество", 1) as req_qty FROM public.bom WHERE LOWER(TRIM("ID Детайл")) = old_detail
            LOOP
                UPDATE public.inventory SET "Количество" = "Количество" + (old_qty * child_record.req_qty) WHERE LOWER(TRIM("ID Детайл")) = child_record.child_id AND LOWER(TRIM("Операция")) = 'Готов продукт';
                IF NOT FOUND THEN INSERT INTO public.inventory ("ID Детайл", "Операция", "Количество") VALUES (child_record.child_id, 'Готов продукт', (old_qty * child_record.req_qty)); END IF;
            END LOOP;
        END IF;
    END IF;

    RETURN OLD;
END;
$$;
