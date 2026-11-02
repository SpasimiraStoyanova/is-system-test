-- ==============================================================================
-- ОБНОВЯВАНЕ НА ТРИГЕРА ЗА СКЛАД (INVENTORY): 
-- 1. РАЗРЕШАВАНЕ НА ОТРИЦАТЕЛНИ САЛДА (ДЕФИЦИТ) МЕЖДУ ОПЕРАЦИИ И В БОМ
-- 2. АВТОМАТИЧНО ПРИСПАДАНЕ НА КОМПОНЕНТИ ОТ BOM (И СУРОВИНИ ОТ НОМЕНКЛАТУРА)
-- ==============================================================================

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
    is_proba boolean := (NEW."ID План" ILIKE 'PROBA_%');
    p_id bigint := CASE WHEN is_proba THEN CAST(NULLIF(SUBSTRING(NEW."ID План" FROM 7), '') AS bigint) ELSE NULL END;
BEGIN
    IF new_qty = 0 THEN RETURN NEW; END IF;
    IF new_operator ILIKE '%СИСТЕМА (Корекция%' THEN RETURN NEW; END IF;
    IF new_op ILIKE 'Опаковане%' THEN RETURN NEW; END IF;

    IF new_op ILIKE 'Експедиция%' THEN
        IF NOT is_proba THEN
            UPDATE public.inventory SET "Количество" = GREATEST(0, COALESCE("Количество"::text, '0')::numeric - new_qty) WHERE LOWER(TRIM("ID Детайл")) = new_detail AND LOWER(TRIM("Операция")) = 'готов продукт';
        END IF;
        RETURN NEW;
    END IF;

    -- Намираме номера на текущата операция
    SELECT CAST(NULLIF(CAST("№ Операция" AS text), '') AS numeric) INTO current_op_num
    FROM public.marshruti
    WHERE LOWER(TRIM("Код на детайла")) = new_detail AND LOWER(TRIM("Име на операция")) = new_op
    ORDER BY CAST(NULLIF(CAST("№ Операция" AS text), '') AS numeric) DESC
    LIMIT 1;

    -- Намиране на предишната операция от marshruti
    SELECT LOWER(TRIM("Име на операция")) INTO prev_op
    FROM public.marshruti 
    WHERE LOWER(TRIM("Код на детайла")) = new_detail 
      AND (current_op_num IS NULL OR CAST(NULLIF(CAST("№ Операция" AS text), '') AS numeric) < current_op_num)
    ORDER BY CAST(NULLIF(CAST("№ Операция" AS text), '') AS numeric) DESC 
    LIMIT 1;

    -- Проверка дали е последна операция
    SELECT NOT EXISTS (
        SELECT 1 FROM public.marshruti 
        WHERE LOWER(TRIM("Код на детайла")) = new_detail 
          AND (current_op_num IS NOT NULL AND CAST(NULLIF(CAST("№ Операция" AS text), '') AS numeric) > current_op_num)
    ) INTO is_last_op;

    IF new_operator NOT ILIKE '%СИСТЕМА%' THEN
        -- СТЪПКА 1: Вадим от предходна операция по маршрут (ако има такава)
        IF prev_op IS NOT NULL THEN
            IF is_proba THEN
                UPDATE public.probi_inventory 
                SET quantity = quantity - new_qty, updated_at = now()
                WHERE proba_id = p_id AND LOWER(TRIM(part_code)) = new_detail AND LOWER(TRIM(operation)) = prev_op;

                IF NOT FOUND THEN
                    INSERT INTO public.probi_inventory (proba_id, part_code, operation, quantity)
                    VALUES (p_id, NEW."ID Детайл", prev_op, -new_qty);
                END IF;
            ELSE
                UPDATE public.inventory 
                SET "Количество" = COALESCE("Количество"::text, '0')::numeric - new_qty 
                WHERE LOWER(TRIM("ID Детайл")) = new_detail AND LOWER(TRIM("Операция")) = prev_op;

                IF NOT FOUND THEN
                    INSERT INTO public.inventory ("ID Детайл", "Операция", "Количество") 
                    VALUES (NEW."ID Детайл", prev_op, -new_qty);
                END IF;
            END IF;
        END IF;

        -- СТЪПКА 1.5: Вадим децата от БОМ (или Номенклатура) за тази операция (или за 1-ва операция)
        FOR child_record IN 
            WITH bom_children AS (
                SELECT LOWER(TRIM(b."ID Компонент")) as child_id, 
                       COALESCE(b."Количество", 1) as req_qty,
                       COALESCE(LOWER(TRIM(n."Тип")), '') as child_type
                FROM public.bom b
                LEFT JOIN public."Номенклатура" n ON LOWER(TRIM(n."ID Детайл")) = LOWER(TRIM(b."ID Компонент"))
                WHERE LOWER(TRIM(b."ID Родител")) = new_detail 
                  AND (
                      (current_op_num IS NOT NULL AND CAST(NULLIF(CAST(b."Влага се на Оп. №" AS text), '') AS numeric) = current_op_num)
                      OR 
                      (COALESCE(CAST(NULLIF(CAST(b."Влага се на Оп. №" AS text), '') AS numeric), 0) = 0 AND prev_op IS NULL)
                  )
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
            IF child_record.child_type ILIKE '%материал%' THEN
                -- Вадим от Склад Материали (sklad)
                UPDATE public.sklad 
                SET "Изразходено" = CAST(CAST(COALESCE(NULLIF(CAST("Изразходено" AS text), ''), '0') AS numeric) + (new_qty * child_record.req_qty) AS text),
                    "Остатък" = GREATEST(0, COALESCE("Остатък", 0) - (new_qty * child_record.req_qty))
                WHERE LOWER(TRIM("ID Детайл")) = child_record.child_id;
            ELSE
                -- Полуфабрикат / Детайл: Вадим от Склад за готов продукт (с допускане на дефицит/отрицателно салдо!)
                IF is_proba THEN
                    UPDATE public.probi_inventory 
                    SET quantity = quantity - (new_qty * child_record.req_qty), updated_at = now()
                    WHERE proba_id = p_id AND LOWER(TRIM(part_code)) = child_record.child_id AND LOWER(TRIM(operation)) = 'готов продукт';

                    IF NOT FOUND THEN
                        INSERT INTO public.probi_inventory (proba_id, part_code, operation, quantity)
                        VALUES (p_id, child_record.child_id, 'готов продукт', -(new_qty * child_record.req_qty));
                    END IF;
                ELSE
                    UPDATE public.inventory 
                    SET "Количество" = COALESCE("Количество"::text, '0')::numeric - (new_qty * child_record.req_qty)
                    WHERE LOWER(TRIM("ID Детайл")) = child_record.child_id AND LOWER(TRIM("Операция")) = 'готов продукт';

                    IF NOT FOUND THEN
                        INSERT INTO public.inventory ("ID Детайл", "Операция", "Количество")
                        VALUES (child_record.child_id, 'готов продукт', -(new_qty * child_record.req_qty));
                    END IF;
                END IF;
            END IF;
        END LOOP;

        -- Специална обработка за Проби (нови пробни компоненти от probi_components)
        IF is_proba THEN
            DECLARE
                p_mat text;
                p_norm numeric;
            BEGIN
                IF prev_op IS NULL THEN
                    SELECT LOWER(TRIM(material_code)), COALESCE(material_norm, 1) INTO p_mat, p_norm
                    FROM public.probi_components
                    WHERE proba_id = p_id AND LOWER(TRIM(part_code)) = new_detail AND material_code IS NOT NULL AND TRIM(material_code) != ''
                    LIMIT 1;

                    IF p_mat IS NOT NULL AND p_mat != '' THEN
                        UPDATE public.sklad 
                        SET "Изразходено" = CAST(CAST(COALESCE(NULLIF(CAST("Изразходено" AS text), ''), '0') AS numeric) + (new_qty * p_norm) AS text),
                            "Остатък" = GREATEST(0, COALESCE("Остатък", 0) - (new_qty * p_norm))
                        WHERE LOWER(TRIM("ID Детайл")) = p_mat;
                    END IF;
                END IF;
            END;

            FOR child_record IN
                SELECT LOWER(TRIM(part_code)) as child_id,
                       COALESCE(qty_per_unit, 1) as req_qty
                FROM public.probi_components
                WHERE proba_id = p_id AND LOWER(TRIM(parent_part_code)) = new_detail AND prev_op IS NULL
            LOOP
                UPDATE public.probi_inventory 
                SET quantity = quantity - (new_qty * child_record.req_qty), updated_at = now()
                WHERE proba_id = p_id AND LOWER(TRIM(part_code)) = child_record.child_id AND LOWER(TRIM(operation)) = 'готов продукт';

                IF NOT FOUND THEN
                    INSERT INTO public.probi_inventory (proba_id, part_code, operation, quantity)
                    VALUES (p_id, child_record.child_id, 'готов продукт', -(new_qty * child_record.req_qty));
                END IF;
            END LOOP;
        END IF;
    END IF;

    -- СТЪПКА 2: Добавяме в текущата операция
    IF new_status = 'отчетено' THEN
        DECLARE
            target_op text := CASE WHEN is_last_op THEN 'готов продукт' ELSE new_op END;
        BEGIN
            IF is_proba THEN
                UPDATE public.probi_inventory 
                SET quantity = quantity + new_qty, updated_at = now()
                WHERE proba_id = p_id AND LOWER(TRIM(part_code)) = new_detail AND LOWER(TRIM(operation)) = target_op;
                
                IF NOT FOUND THEN
                    INSERT INTO public.probi_inventory (proba_id, part_code, operation, quantity)
                    VALUES (p_id, NEW."ID Детайл", target_op, new_qty);
                END IF;
            ELSE
                UPDATE public.inventory 
                SET "Количество" = COALESCE("Количество"::text, '0')::numeric + new_qty 
                WHERE LOWER(TRIM("ID Детайл")) = new_detail AND LOWER(TRIM("Операция")) = target_op;
                
                IF NOT FOUND THEN
                    INSERT INTO public.inventory ("ID Детайл", "Операция", "Количество") 
                    VALUES (NEW."ID Детайл", target_op, new_qty);
                END IF;
            END IF;
        END;
    END IF;

    RETURN NEW;
END;
$$;


-- ==============================================================================
-- ОБНОВЯВАНЕ НА ТРИГЕРА ПРИ ИЗТРИВАНЕ НА ОТЧЕТ (DELETE)
-- ==============================================================================

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
    is_proba boolean := (OLD."ID План" ILIKE 'PROBA_%');
    p_id bigint := CASE WHEN is_proba THEN CAST(NULLIF(SUBSTRING(OLD."ID План" FROM 7), '') AS bigint) ELSE NULL END;
BEGIN
    IF old_qty = 0 THEN RETURN OLD; END IF;
    IF old_operator ILIKE '%СИСТЕМА%' THEN RETURN OLD; END IF;
    IF old_op ILIKE 'Опаковане%' THEN RETURN OLD; END IF;

    IF old_op ILIKE 'Експедиция%' THEN
        IF NOT is_proba THEN
            UPDATE public.inventory SET "Количество" = COALESCE("Количество"::text, '0')::numeric + old_qty WHERE LOWER(TRIM("ID Детайл")) = old_detail AND LOWER(TRIM("Операция")) = 'готов продукт';
        END IF;
        RETURN OLD;
    END IF;

    SELECT CAST(NULLIF(CAST("№ Операция" AS text), '') AS numeric) INTO current_op_num
    FROM public.marshruti
    WHERE LOWER(TRIM("Код на детайла")) = old_detail AND LOWER(TRIM("Име на операция")) = old_op
    ORDER BY CAST(NULLIF(CAST("№ Операция" AS text), '') AS numeric) DESC
    LIMIT 1;

    SELECT LOWER(TRIM("Име на операция")) INTO prev_op
    FROM public.marshruti 
    WHERE LOWER(TRIM("Код на детайла")) = old_detail 
      AND (current_op_num IS NULL OR CAST(NULLIF(CAST("№ Операция" AS text), '') AS numeric) < current_op_num)
    ORDER BY CAST(NULLIF(CAST("№ Операция" AS text), '') AS numeric) DESC 
    LIMIT 1;

    SELECT NOT EXISTS (
        SELECT 1 FROM public.marshruti 
        WHERE LOWER(TRIM("Код на детайла")) = old_detail 
          AND (current_op_num IS NOT NULL AND CAST(NULLIF(CAST("№ Операция" AS text), '') AS numeric) > current_op_num)
    ) INTO is_last_op;

    -- Вадим от текущата операция
    IF old_status = 'отчетено' THEN
        DECLARE
            target_op text := CASE WHEN is_last_op THEN 'готов продукт' ELSE old_op END;
        BEGIN
            IF is_proba THEN
                UPDATE public.probi_inventory 
                SET quantity = quantity - old_qty, updated_at = now()
                WHERE proba_id = p_id AND LOWER(TRIM(part_code)) = old_detail AND LOWER(TRIM(operation)) = target_op;
            ELSE
                UPDATE public.inventory 
                SET "Количество" = COALESCE("Количество"::text, '0')::numeric - old_qty 
                WHERE LOWER(TRIM("ID Детайл")) = old_detail AND LOWER(TRIM("Операция")) = target_op;
            END IF;
        END;
    END IF;

    -- Връщаме в предходната операция
    IF prev_op IS NOT NULL THEN
        IF is_proba THEN
            UPDATE public.probi_inventory 
            SET quantity = quantity + old_qty, updated_at = now()
            WHERE proba_id = p_id AND LOWER(TRIM(part_code)) = old_detail AND LOWER(TRIM(operation)) = prev_op;
            
            IF NOT FOUND THEN
                INSERT INTO public.probi_inventory (proba_id, part_code, operation, quantity)
                VALUES (p_id, OLD."ID Детайл", prev_op, old_qty);
            END IF;
        ELSE
            UPDATE public.inventory 
            SET "Количество" = COALESCE("Количество"::text, '0')::numeric + old_qty 
            WHERE LOWER(TRIM("ID Детайл")) = old_detail AND LOWER(TRIM("Операция")) = prev_op;

            IF NOT FOUND THEN
                INSERT INTO public.inventory ("ID Детайл", "Операция", "Количество") 
                VALUES (OLD."ID Детайл", prev_op, old_qty);
            END IF;
        END IF;
    END IF;

    -- Връщаме децата от БОМ / Номенклатура
    FOR child_record IN 
        WITH bom_children AS (
            SELECT LOWER(TRIM(b."ID Компонент")) as child_id, 
                   COALESCE(b."Количество", 1) as req_qty,
                   COALESCE(LOWER(TRIM(n."Тип")), '') as child_type
            FROM public.bom b
            LEFT JOIN public."Номенклатура" n ON LOWER(TRIM(n."ID Детайл")) = LOWER(TRIM(b."ID Компонент"))
            WHERE LOWER(TRIM(b."ID Родител")) = old_detail 
              AND (
                  (current_op_num IS NOT NULL AND CAST(NULLIF(CAST(b."Влага се на Оп. №" AS text), '') AS numeric) = current_op_num)
                  OR 
                  (COALESCE(CAST(NULLIF(CAST(b."Влага се на Оп. №" AS text), '') AS numeric), 0) = 0 AND prev_op IS NULL)
              )
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
        IF child_record.child_type ILIKE '%материал%' THEN
            UPDATE public.sklad 
            SET "Изразходено" = CAST(GREATEST(0, CAST(COALESCE(NULLIF(CAST("Изразходено" AS text), ''), '0') AS numeric) - (old_qty * child_record.req_qty)) AS text),
                "Остатък" = COALESCE("Остатък", 0) + (old_qty * child_record.req_qty)
            WHERE LOWER(TRIM("ID Детайл")) = child_record.child_id;
        ELSE
            IF is_proba THEN
                UPDATE public.probi_inventory 
                SET quantity = quantity + (old_qty * child_record.req_qty), updated_at = now()
                WHERE proba_id = p_id AND LOWER(TRIM(part_code)) = child_record.child_id AND LOWER(TRIM(operation)) = 'готов продукт';
            ELSE
                UPDATE public.inventory 
                SET "Количество" = COALESCE("Количество"::text, '0')::numeric + (old_qty * child_record.req_qty) 
                WHERE LOWER(TRIM("ID Детайл")) = child_record.child_id AND LOWER(TRIM("Операция")) = 'готов продукт';
            END IF;
        END IF;
    END LOOP;

    RETURN OLD;
END;
$$;

-- Свързване на тригерите
DROP TRIGGER IF EXISTS trg_otcheti_insert ON public.otcheti;
DROP TRIGGER IF EXISTS trg_otcheti_delete ON public.otcheti;
DROP TRIGGER IF EXISTS trg_inventory_on_delete_otchet ON public.otcheti;
DROP TRIGGER IF EXISTS trg_otcheti_inventory_insert ON public.otcheti;
CREATE TRIGGER trg_otcheti_inventory_insert 
AFTER INSERT ON public.otcheti 
FOR EACH ROW EXECUTE FUNCTION public.process_inventory_on_otchet();

DROP TRIGGER IF EXISTS trg_otcheti_inventory_delete ON public.otcheti;
CREATE TRIGGER trg_otcheti_inventory_delete 
AFTER DELETE ON public.otcheti 
FOR EACH ROW EXECUTE FUNCTION public.process_inventory_on_delete_otchet();

NOTIFY pgrst, 'reload schema';