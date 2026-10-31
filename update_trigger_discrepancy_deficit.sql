-- ==============================================================================
-- ОБНОВЯВАНЕ НА ТРИГЕРА ЗА СКЛАД (INVENTORY): РАЗРЕШАВАНЕ НА ОТРИЦАТЕЛНИ САЛДА
-- ПРИ ИЗПРЕВАРВАЩО ОТЧИТАНЕ МЕЖДУ ОПЕРАЦИИ В ЕДИННИЯ СКЛАД
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

    -- Намиране на предишната операция от marshruti
    SELECT LOWER(TRIM("Име на операция")) INTO prev_op
    FROM public.marshruti 
    WHERE LOWER(TRIM("Код на детайла")) = new_detail 
      AND CAST(NULLIF("№ Операция"::text, '') AS integer) < (
          SELECT CAST(NULLIF("№ Операция"::text, '') AS integer) 
          FROM public.marshruti 
          WHERE LOWER(TRIM("Код на детайла")) = new_detail 
            AND LOWER(TRIM("Име на операция")) = new_op 
          ORDER BY CAST(NULLIF("№ Операция"::text, '') AS integer) DESC 
          LIMIT 1
      )
    ORDER BY CAST(NULLIF("№ Операция"::text, '') AS integer) DESC 
    LIMIT 1;

    -- Проверка дали е последна операция
    SELECT NOT EXISTS (
        SELECT 1 FROM public.marshruti WHERE LOWER(TRIM("Код на детайла")) = new_detail AND CAST(NULLIF("№ Операция"::text, '') AS integer) > (
              SELECT CAST(NULLIF("№ Операция"::text, '') AS integer) FROM public.marshruti WHERE LOWER(TRIM("Код на детайла")) = new_detail AND LOWER(TRIM("Име на операция")) = new_op ORDER BY CAST(NULLIF("№ Операция"::text, '') AS integer) DESC LIMIT 1
          )
    ) INTO is_last_op;

    -- Стъпка 1: Вадим от предходна операция (или от Склад Материали за 1-ва операция)
    IF new_operator NOT ILIKE '%СИСТЕМА%' THEN
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
                -- 🟢 Разрешаваме отрицателно салдо за полуфабрикати в единния склад (inventory),
                -- за да се отчете точният дефицит, когато следващата операция изпревари предходната!
                UPDATE public.inventory 
                SET "Количество" = COALESCE("Количество"::text, '0')::numeric - new_qty 
                WHERE LOWER(TRIM("ID Детайл")) = new_detail AND LOWER(TRIM("Операция")) = prev_op;

                IF NOT FOUND THEN
                    INSERT INTO public.inventory ("ID Детайл", "Операция", "Количество") 
                    VALUES (NEW."ID Детайл", prev_op, -new_qty);
                END IF;
            END IF;
        ELSE
            -- 🟢 ПЪРВА ОПЕРАЦИЯ: Взима заготовка/суровина от Склад Материали (за ВСИЧКИ, вкл. ПРОБИ)!
            DECLARE
                nom_mat text;
                nom_qty numeric;
                nom_type text;
            BEGIN
                -- 1) Търсим в Номенклатура
                SELECT LOWER(TRIM("ID Родител")), COALESCE(NULLIF("Разходна норма"::text, ''), '1')::numeric INTO nom_mat, nom_qty
                FROM public."Номенклатура"
                WHERE LOWER(TRIM("ID Детайл")) = new_detail;
                
                -- 2) Ако детайлът е нов пробен, търсим материала му в probi_components
                IF nom_mat IS NULL THEN
                    SELECT LOWER(TRIM(material_code)), COALESCE(NULLIF(material_norm::text, ''), '1')::numeric INTO nom_mat, nom_qty
                    FROM public.probi_components
                    WHERE LOWER(TRIM(part_code)) = new_detail
                    LIMIT 1;
                END IF;

                IF nom_mat IS NOT NULL AND nom_mat != '' THEN
                    SELECT LOWER(TRIM("Тип")) INTO nom_type FROM public."Номенклатура" WHERE LOWER(TRIM("ID Детайл")) = nom_mat;
                    
                    -- Увеличаваме "Изразходено" и намаляваме "Остатък" в Склад Материали!
                    IF nom_type IS NOT NULL AND nom_type ILIKE '%материал%' THEN
                        UPDATE public.sklad 
                        SET "Изразходено" = (COALESCE(NULLIF("Изразходено"::text, ''), '0')::numeric + (new_qty * nom_qty))::text,
                            "Остатък" = GREATEST(0, COALESCE("Остатък", 0) - (new_qty * nom_qty))
                        WHERE LOWER(TRIM("ID Детайл")) = nom_mat;
                    ELSE
                        -- Полуфабрикат
                        IF is_proba THEN
                            UPDATE public.probi_inventory 
                            SET quantity = quantity - (new_qty * nom_qty), updated_at = now()
                            WHERE proba_id = p_id AND LOWER(TRIM(part_code)) = nom_mat AND LOWER(TRIM(operation)) = 'готов продукт';
                        ELSE
                            UPDATE public.inventory 
                            SET "Количество" = COALESCE("Количество"::text, '0')::numeric - (new_qty * nom_qty) 
                            WHERE LOWER(TRIM("ID Детайл")) = nom_mat AND LOWER(TRIM("Операция")) = 'готов продукт';
                        END IF;
                    END IF;
                END IF;
            END;
        END IF;
    END IF;

    -- Стъпка 2: Добавяме в текущата операция
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
