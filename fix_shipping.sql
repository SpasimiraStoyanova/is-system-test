-- 1. Добавяме правило за Експедиция в process_inventory_on_otchet
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
    IF new_operator ILIKE '%ръчна корек%' THEN RETURN NEW; END IF;

    -- Игнорираме Опаковането
    IF new_op ILIKE 'опаковане%' THEN RETURN NEW; END IF;

    -- ЕКСПЕДИЦИЯ: Вади бройките от Склада за готови детайли
    IF new_op ILIKE 'експедиция%' THEN
        UPDATE public.inventory_gp SET "Количество" = GREATEST(0, "Количество" - new_qty) WHERE LOWER(TRIM("ID Детайл")) = new_detail;
        RETURN NEW;
    END IF;

    SELECT LOWER(TRIM("Име на операция")) INTO prev_op FROM public.marshruti
    WHERE LOWER(TRIM("Код на детайла")) = new_detail AND "№ Операция" < (
          SELECT "№ Операция" FROM public.marshruti WHERE LOWER(TRIM("Код на детайла")) = new_detail AND LOWER(TRIM("Име на операция")) = new_op ORDER BY "№ Операция" DESC LIMIT 1
      ) ORDER BY "№ Операция" DESC LIMIT 1;

    SELECT NOT EXISTS (
        SELECT 1 FROM public.marshruti WHERE LOWER(TRIM("Код на детайла")) = new_detail AND "№ Операция" > (
              SELECT "№ Операция" FROM public.marshruti WHERE LOWER(TRIM("Код на детайла")) = new_detail AND LOWER(TRIM("Име на операция")) = new_op ORDER BY "№ Операция" DESC LIMIT 1
          )
    ) INTO is_last_op;

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


-- 2. Добавяме правило за Експедиция в process_inventory_on_delete_otchet (връща бройките обратно)
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
    IF old_operator ILIKE '%ръчна корек%' THEN RETURN OLD; END IF;

    -- Игнорираме Опаковането
    IF old_op ILIKE 'опаковане%' THEN RETURN OLD; END IF;

    -- ЕКСПЕДИЦИЯ: Ако се изтрие записът за Експедиция, връщаме бройките в Склада за готови детайли
    IF old_op ILIKE 'експедиция%' THEN
        UPDATE public.inventory_gp SET "Количество" = "Количество" + old_qty WHERE LOWER(TRIM("ID Детайл")) = old_detail;
        RETURN OLD;
    END IF;

    SELECT LOWER(TRIM("Име на операция")) INTO prev_op FROM public.marshruti
    WHERE LOWER(TRIM("Код на детайла")) = old_detail AND "№ Операция" < (
          SELECT "№ Операция" FROM public.marshruti WHERE LOWER(TRIM("Код на детайла")) = old_detail AND LOWER(TRIM("Име на операция")) = old_op ORDER BY "№ Операция" DESC LIMIT 1
      ) ORDER BY "№ Операция" DESC LIMIT 1;

    SELECT NOT EXISTS (
        SELECT 1 FROM public.marshruti WHERE LOWER(TRIM("Код на детайла")) = old_detail AND "№ Операция" > (
              SELECT "№ Операция" FROM public.marshruti WHERE LOWER(TRIM("Код на детайла")) = old_detail AND LOWER(TRIM("Име на операция")) = old_op ORDER BY "№ Операция" DESC LIMIT 1
          )
    ) INTO is_last_op;

    IF old_status != 'брак' THEN
        IF is_last_op THEN
            UPDATE public.inventory_gp SET "Количество" = GREATEST(0, "Количество" - old_qty) WHERE LOWER(TRIM("ID Детайл")) = old_detail;
        ELSE
            UPDATE public.inventory_wip SET "Количество" = GREATEST(0, "Количество" - old_qty) WHERE LOWER(TRIM("ID Детайл")) = old_detail AND LOWER(TRIM("Операция")) = old_op;
        END IF;
    END IF;

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
