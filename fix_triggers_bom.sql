-- 1. Дропваме съществуващите тригъри
DROP TRIGGER IF EXISTS trg_otcheti_insert ON public.otcheti;
DROP TRIGGER IF EXISTS trg_otcheti_delete ON public.otcheti;

-- 2. Създаваме обновената функция за INSERT
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
    current_op_num numeric;
BEGIN
    IF new_qty = 0 THEN RETURN NEW; END IF;

    -- Игнорираме ръчните корекции
    IF new_operator ILIKE '%ръчна корек%' THEN
        RETURN NEW;
    END IF;

    -- Обработка на Експедиция (Изпращане на детайли)
    IF new_op = 'експедиция' THEN
        -- Вадим от Готови Детайли (GP)
        UPDATE public.inventory_gp SET "Количество" = GREATEST(0, "Количество" - new_qty) WHERE LOWER(TRIM("ID Детайл")) = new_detail;
        RETURN NEW;
    END IF;

    -- Обработка на Опаковане в кашон
    IF new_op LIKE 'опаковане - кашон%' THEN
        -- Опаковането не трябва да вади от Готови Детайли (GP), нито да слага в WIP.
        -- Детайлът си остава в Склад Готови Детайли, просто е отбелязано, че е в кашон.
        RETURN NEW;
    END IF;

    -- Намираме номера на текущата операция
    SELECT CAST(NULLIF(CAST("№ Операция" AS text), '') AS numeric) INTO current_op_num
    FROM public.marshruti
    WHERE LOWER(TRIM("Код на детайла")) = new_detail AND LOWER(TRIM("Име на операция")) = new_op
    LIMIT 1;

    -- Намираме предишната операция
    SELECT LOWER(TRIM("Име на операция")) INTO prev_op FROM public.marshruti
    WHERE LOWER(TRIM("Код на детайла")) = new_detail AND CAST(NULLIF(CAST("№ Операция" AS text), '') AS numeric) < current_op_num
    ORDER BY CAST(NULLIF(CAST("№ Операция" AS text), '') AS numeric) DESC LIMIT 1;

    -- Проверяваме дали е последна
    SELECT NOT EXISTS (
        SELECT 1 FROM public.marshruti WHERE LOWER(TRIM("Код на детайла")) = new_detail AND CAST(NULLIF(CAST("№ Операция" AS text), '') AS numeric) > current_op_num
    ) INTO is_last_op;

    -- СТЪПКА 1: Вадим от предишната операция (ако има такава)
    IF new_operator NOT ILIKE '%система%' THEN
        IF prev_op IS NOT NULL THEN
            UPDATE public.inventory_wip SET "Количество" = GREATEST(0, "Количество" - new_qty) WHERE LOWER(TRIM("ID Детайл")) = new_detail AND LOWER(TRIM("Операция")) = prev_op;
            IF NOT FOUND THEN INSERT INTO public.inventory_wip ("ID Детайл", "Операция", "Количество") VALUES (new_detail, prev_op, 0); END IF;
        END IF;

        -- СТЪПКА 1.5: Вадим децата от БОМ (или Номенклатура) за тази операция
        FOR child_record IN 
            WITH bom_children AS (
                SELECT LOWER(TRIM(b."ID Компонент")) as child_id, 
                       COALESCE(b."Количество", 1) as req_qty,
                       LOWER(TRIM(n."Тип")) as child_type
                FROM public.bom b
                LEFT JOIN public."Номенклатура" n ON LOWER(TRIM(n."ID Детайл")) = LOWER(TRIM(b."ID Компонент"))
                WHERE LOWER(TRIM(b."ID Родител")) = new_detail 
                  AND (CAST(NULLIF(CAST(b."Влага се на Оп. №" AS text), '') AS numeric) = current_op_num OR (COALESCE(CAST(NULLIF(CAST(b."Влага се на Оп. №" AS text), '') AS numeric), 0) = 0 AND prev_op IS NULL))
            ),
            nom_children AS (
                SELECT LOWER(TRIM("ID Родител")) as child_id,
                       COALESCE(CAST(NULLIF(CAST("Разходна норма" AS text), '') AS numeric), 1) as req_qty,
                       'материал' as child_type
                FROM public."Номенклатура"
                WHERE LOWER(TRIM("ID Детайл")) = new_detail
                  AND "ID Родител" IS NOT NULL AND TRIM("ID Родител") != ''
                  AND prev_op IS NULL
            )
            SELECT * FROM bom_children
            UNION ALL
            SELECT * FROM nom_children WHERE child_id NOT IN (SELECT child_id FROM bom_children)
        LOOP
            IF child_record.child_type = 'материал' THEN
                -- Вадим от Склад Материали (sklad)
                UPDATE public.sklad 
                SET "Изразходено" = CAST(CAST(COALESCE(NULLIF(CAST("Изразходено" AS text), ''), '0') AS numeric) + (new_qty * child_record.req_qty) AS text),
                    "Остатък" = COALESCE("Начална наличност", 0) + CAST(COALESCE(NULLIF(CAST("Доставено" AS text), ''), '0') AS numeric) - (CAST(COALESCE(NULLIF(CAST("Изразходено" AS text), ''), '0') AS numeric) + (new_qty * child_record.req_qty))
                WHERE LOWER(TRIM("ID Детайл")) = child_record.child_id;
            ELSE
                -- Вадим от Склад Готови Детайли (inventory_gp)
                UPDATE public.inventory_gp 
                SET "Количество" = GREATEST(0, "Количество" - (new_qty * child_record.req_qty)) 
                WHERE LOWER(TRIM("ID Детайл")) = child_record.child_id;
                
                IF NOT FOUND THEN 
                    INSERT INTO public.inventory_gp ("ID Детайл", "Количество") VALUES (child_record.child_id, 0); 
                END IF;
            END IF;
        END LOOP;
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


-- 3. Създаваме обновената функция за DELETE
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
    current_op_num numeric;
BEGIN
    IF old_qty = 0 THEN RETURN OLD; END IF;

    -- Игнорираме ръчните корекции
    IF old_operator ILIKE '%ръчна корек%' THEN
        RETURN OLD;
    END IF;

    -- Обработка на Експедиция (Изпращане на детайли)
    IF old_op = 'експедиция' THEN
        -- Връщаме в Готови Детайли (GP)
        UPDATE public.inventory_gp SET "Количество" = "Количество" + old_qty WHERE LOWER(TRIM("ID Детайл")) = old_detail;
        IF NOT FOUND THEN INSERT INTO public.inventory_gp ("ID Детайл", "Количество") VALUES (old_detail, old_qty); END IF;
        RETURN OLD;
    END IF;

    -- Обработка на Опаковане в кашон
    IF old_op LIKE 'опаковане - кашон%' THEN
        -- Опаковането не пипа наличностите, следователно и триенето на опаковане не ги пипа.
        RETURN OLD;
    END IF;

    -- Намираме номера на текущата операция
    SELECT CAST(NULLIF(CAST("№ Операция" AS text), '') AS numeric) INTO current_op_num
    FROM public.marshruti
    WHERE LOWER(TRIM("Код на детайла")) = old_detail AND LOWER(TRIM("Име на операция")) = old_op
    LIMIT 1;

    -- Намираме предишната операция
    SELECT LOWER(TRIM("Име на операция")) INTO prev_op FROM public.marshruti
    WHERE LOWER(TRIM("Код на детайла")) = old_detail AND CAST(NULLIF(CAST("№ Операция" AS text), '') AS numeric) < current_op_num
    ORDER BY CAST(NULLIF(CAST("№ Операция" AS text), '') AS numeric) DESC LIMIT 1;

    -- Проверяваме дали е последна
    SELECT NOT EXISTS (
        SELECT 1 FROM public.marshruti WHERE LOWER(TRIM("Код на детайла")) = old_detail AND CAST(NULLIF(CAST("№ Операция" AS text), '') AS numeric) > current_op_num
    ) INTO is_last_op;

    -- СТЪПКА 1: Вадим от текущата операция (освен ако не е било Брак!)
    IF old_status != 'брак' THEN
        IF is_last_op THEN
            UPDATE public.inventory_gp SET "Количество" = GREATEST(0, "Количество" - old_qty) WHERE LOWER(TRIM("ID Детайл")) = old_detail;
        ELSE
            UPDATE public.inventory_wip SET "Количество" = GREATEST(0, "Количество" - old_qty) WHERE LOWER(TRIM("ID Детайл")) = old_detail AND LOWER(TRIM("Операция")) = old_op;
        END IF;
    END IF;

    -- СТЪПКА 2: Връщаме в предишната операция И връщаме децата в склада
    IF old_operator NOT ILIKE '%система%' THEN
        IF prev_op IS NOT NULL THEN
            UPDATE public.inventory_wip SET "Количество" = "Количество" + old_qty WHERE LOWER(TRIM("ID Детайл")) = old_detail AND LOWER(TRIM("Операция")) = prev_op;
            IF NOT FOUND THEN INSERT INTO public.inventory_wip ("ID Детайл", "Операция", "Количество") VALUES (old_detail, prev_op, old_qty); END IF;
        END IF;

        -- Връщаме децата от БОМ (или Номенклатура) за тази операция
        FOR child_record IN 
            WITH bom_children AS (
                SELECT LOWER(TRIM(b."ID Компонент")) as child_id, 
                       COALESCE(b."Количество", 1) as req_qty,
                       LOWER(TRIM(n."Тип")) as child_type
                FROM public.bom b
                LEFT JOIN public."Номенклатура" n ON LOWER(TRIM(n."ID Детайл")) = LOWER(TRIM(b."ID Компонент"))
                WHERE LOWER(TRIM(b."ID Родител")) = old_detail 
                  AND (CAST(NULLIF(CAST(b."Влага се на Оп. №" AS text), '') AS numeric) = current_op_num OR (COALESCE(CAST(NULLIF(CAST(b."Влага се на Оп. №" AS text), '') AS numeric), 0) = 0 AND prev_op IS NULL))
            ),
            nom_children AS (
                SELECT LOWER(TRIM("ID Родител")) as child_id,
                       COALESCE(CAST(NULLIF(CAST("Разходна норма" AS text), '') AS numeric), 1) as req_qty,
                       'материал' as child_type
                FROM public."Номенклатура"
                WHERE LOWER(TRIM("ID Детайл")) = old_detail
                  AND "ID Родител" IS NOT NULL AND TRIM("ID Родител") != ''
                  AND prev_op IS NULL
            )
            SELECT * FROM bom_children
            UNION ALL
            SELECT * FROM nom_children WHERE child_id NOT IN (SELECT child_id FROM bom_children)
        LOOP
            IF child_record.child_type = 'материал' THEN
                -- Връщаме в Склад Материали (sklad)
                UPDATE public.sklad 
                SET "Изразходено" = CAST(GREATEST(0, CAST(COALESCE(NULLIF(CAST("Изразходено" AS text), ''), '0') AS numeric) - (old_qty * child_record.req_qty)) AS text),
                    "Остатък" = COALESCE("Начална наличност", 0) + CAST(COALESCE(NULLIF(CAST("Доставено" AS text), ''), '0') AS numeric) - GREATEST(0, CAST(COALESCE(NULLIF(CAST("Изразходено" AS text), ''), '0') AS numeric) - (old_qty * child_record.req_qty))
                WHERE LOWER(TRIM("ID Детайл")) = child_record.child_id;
            ELSE
                -- Връщаме в Склад Готови Детайли (inventory_gp)
                UPDATE public.inventory_gp 
                SET "Количество" = "Количество" + (old_qty * child_record.req_qty) 
                WHERE LOWER(TRIM("ID Детайл")) = child_record.child_id;
                
                IF NOT FOUND THEN 
                    INSERT INTO public.inventory_gp ("ID Детайл", "Количество") VALUES (child_record.child_id, (old_qty * child_record.req_qty)); 
                END IF;
            END IF;
        END LOOP;
    END IF;

    RETURN OLD;
END;
$$;


-- 4. Закачаме тригърите отново
CREATE TRIGGER trg_otcheti_insert
AFTER INSERT ON public.otcheti
FOR EACH ROW
EXECUTE FUNCTION public.process_inventory_on_otchet();

CREATE TRIGGER trg_otcheti_delete
BEFORE DELETE ON public.otcheti
FOR EACH ROW
EXECUTE FUNCTION public.process_inventory_on_delete_otchet();
