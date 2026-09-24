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
    current_qty numeric;
    inv_avail numeric;
    sklad_avail numeric;
    needed_total numeric;
BEGIN
    IF new_qty = 0 THEN RETURN NEW; END IF;
    IF new_operator ILIKE '%СИСТЕМА (Корекция%' THEN RETURN NEW; END IF;
    IF new_op ILIKE 'Опаковане%' THEN RETURN NEW; END IF;

    IF new_op ILIKE 'Експедиция%' THEN
        UPDATE public.inventory SET "Количество" = COALESCE("Количество"::text, '0')::numeric - new_qty 
        WHERE LOWER(TRIM("ID Детайл")) = new_detail AND LOWER(TRIM("Операция")) = 'готов продукт'
        RETURNING "Количество" INTO current_qty;
        
        IF current_qty IS NULL THEN
            RAISE EXCEPTION 'ГРЕШКА: Този продукт изобщо не е наличен в склада за готови продукти (%).', NEW."ID Детайл";
        END IF;
        IF current_qty < 0 THEN
            RAISE EXCEPTION 'ГРЕШКА: Няма достатъчно наличност от % за Експедиция (опит за превишаване с % бр.).', NEW."ID Детайл", ABS(current_qty);
        END IF;
        RETURN NEW;
    END IF;

    -- Намиране на предишната операция
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

    -- Стъпка 1: Вадим от предходна операция
    IF new_operator NOT ILIKE '%СИСТЕМА%' THEN
        IF prev_op IS NOT NULL THEN
            UPDATE public.inventory SET "Количество" = COALESCE("Количество"::text, '0')::numeric - new_qty 
            WHERE LOWER(TRIM("ID Детайл")) = new_detail AND LOWER(TRIM("Операция")) = prev_op
            RETURNING "Количество" INTO current_qty;
            
            IF current_qty IS NULL THEN
                RAISE EXCEPTION 'ГРЕШКА: Няма нито една отчетена бройка от предходната операция (%) за Детайл %.', prev_op, NEW."ID Детайл";
            END IF;
            IF current_qty < 0 THEN
                RAISE EXCEPTION 'ГРЕШКА: Няма достатъчно наличност на Детайл % от предходна операция % (опит за превишаване с % бр.). Моля обновете страницата.', NEW."ID Детайл", prev_op, ABS(current_qty);
            END IF;
        ELSE
            DECLARE
                nom_mat text;
                nom_qty numeric;
                nom_type text;
            BEGIN
                SELECT LOWER(TRIM("ID Родител")), COALESCE(NULLIF("Разходна норма"::text, ''), '1')::numeric INTO nom_mat, nom_qty
                FROM public."Номенклатура"
                WHERE LOWER(TRIM("ID Детайл")) = new_detail;
                
                IF nom_mat IS NOT NULL AND nom_mat != '' THEN
                    SELECT LOWER(TRIM("Тип")) INTO nom_type FROM public."Номенклатура" WHERE LOWER(TRIM("ID Детайл")) = nom_mat;
                    needed_total := new_qty * nom_qty;
                    
                    IF nom_type = 'материал' OR nom_type IS NULL THEN
                        UPDATE public.sklad 
                        SET "Остатък" = GREATEST(0, COALESCE("Остатък"::text, '0')::numeric - needed_total), 
                            "Изразходено" = COALESCE("Изразходено"::text, '0')::numeric + needed_total
                        WHERE LOWER(TRIM("ID Детайл")) = nom_mat;
                    ELSE
                        -- Check inventory first
                        SELECT COALESCE("Количество"::text, '0')::numeric INTO inv_avail 
                        FROM public.inventory 
                        WHERE LOWER(TRIM("ID Детайл")) = nom_mat AND LOWER(TRIM("Операция")) = 'готов продукт';
                        
                        inv_avail := COALESCE(inv_avail, 0);
                        
                        IF inv_avail >= needed_total THEN
                            UPDATE public.inventory SET "Количество" = "Количество"::numeric - needed_total 
                            WHERE LOWER(TRIM("ID Детайл")) = nom_mat AND LOWER(TRIM("Операция")) = 'готов продукт';
                        ELSE
                            -- Fallback to sklad
                            SELECT COALESCE("Остатък"::text, '0')::numeric INTO sklad_avail 
                            FROM public.sklad 
                            WHERE LOWER(TRIM("ID Детайл")) = nom_mat;
                            
                            sklad_avail := COALESCE(sklad_avail, 0);
                            
                            IF (inv_avail + sklad_avail) >= needed_total THEN
                                IF inv_avail > 0 THEN
                                    UPDATE public.inventory SET "Количество" = 0 WHERE LOWER(TRIM("ID Детайл")) = nom_mat AND LOWER(TRIM("Операция")) = 'готов продукт';
                                    needed_total := needed_total - inv_avail;
                                END IF;
                                UPDATE public.sklad SET "Остатък" = "Остатък"::numeric - needed_total, "Изразходено" = COALESCE("Изразходено"::text, '0')::numeric + needed_total 
                                WHERE LOWER(TRIM("ID Детайл")) = nom_mat;
                            ELSE
                                RAISE EXCEPTION 'ГРЕШКА: Няма достатъчно наличност от базов компонент % (опит за превишаване с % бр.). Моля обновете страницата.', nom_mat, (needed_total - inv_avail - sklad_avail);
                            END IF;
                        END IF;
                    END IF;
                END IF;
            END;
        END IF;
    END IF;

    -- Стъпка 2: Вадим материали (BOM)
    FOR child_record IN 
        SELECT b."ID Компонент" AS comp, b."Количество" AS needed, m."Тип" AS m_type, m."Единици" as unit
        FROM public.bom b
        LEFT JOIN public."Номенклатура" m ON LOWER(TRIM(b."ID Компонент")) = LOWER(TRIM(m."ID Детайл"))
        WHERE LOWER(TRIM(b."ID Родител")) = new_detail 
          AND (b."Влага се на Оп. №"::text IS NULL OR b."Влага се на Оп. №"::text = '' OR CAST(NULLIF(b."Влага се на Оп. №"::text, '') AS integer) = (
                SELECT CAST(NULLIF("№ Операция"::text, '') AS integer) FROM public.marshruti WHERE LOWER(TRIM("Код на детайла")) = new_detail AND LOWER(TRIM("Име на операция")) = new_op ORDER BY CAST(NULLIF("№ Операция"::text, '') AS integer) DESC LIMIT 1
          ))
    LOOP
        needed_total := new_qty * COALESCE(child_record.needed::text, '0')::numeric;
        
        IF LOWER(TRIM(child_record.m_type)) = 'материал' THEN
            UPDATE public.sklad SET "Остатък" = GREATEST(0, COALESCE("Остатък"::text, '0')::numeric - needed_total), "Изразходено" = COALESCE("Изразходено"::text, '0')::numeric + needed_total
            WHERE LOWER(TRIM("ID Детайл")) = LOWER(TRIM(child_record.comp));
        ELSE
            -- Check inventory first
            SELECT COALESCE("Количество"::text, '0')::numeric INTO inv_avail 
            FROM public.inventory 
            WHERE LOWER(TRIM("ID Детайл")) = LOWER(TRIM(child_record.comp)) AND LOWER(TRIM("Операция")) = 'готов продукт';
            
            inv_avail := COALESCE(inv_avail, 0);
            
            IF inv_avail >= needed_total THEN
                UPDATE public.inventory SET "Количество" = "Количество"::numeric - needed_total 
                WHERE LOWER(TRIM("ID Детайл")) = LOWER(TRIM(child_record.comp)) AND LOWER(TRIM("Операция")) = 'готов продукт';
            ELSE
                -- Fallback to sklad
                SELECT COALESCE("Остатък"::text, '0')::numeric INTO sklad_avail 
                FROM public.sklad 
                WHERE LOWER(TRIM("ID Детайл")) = LOWER(TRIM(child_record.comp));
                
                sklad_avail := COALESCE(sklad_avail, 0);
                
                IF (inv_avail + sklad_avail) >= needed_total THEN
                    IF inv_avail > 0 THEN
                        UPDATE public.inventory SET "Количество" = 0 WHERE LOWER(TRIM("ID Детайл")) = LOWER(TRIM(child_record.comp)) AND LOWER(TRIM("Операция")) = 'готов продукт';
                        needed_total := needed_total - inv_avail;
                    END IF;
                    UPDATE public.sklad SET "Остатък" = "Остатък"::numeric - needed_total, "Изразходено" = COALESCE("Изразходено"::text, '0')::numeric + needed_total 
                    WHERE LOWER(TRIM("ID Детайл")) = LOWER(TRIM(child_record.comp));
                ELSE
                    RAISE EXCEPTION 'ГРЕШКА: Няма достатъчно наличност от компонент % (опит за превишаване с % бр.). Моля обновете страницата.', child_record.comp, (needed_total - inv_avail - sklad_avail);
                END IF;
            END IF;
        END IF;
    END LOOP;

    -- Стъпка 3: Добавяме в склада САМО ако статусът е 'Отчетено' (бракът се игнорира)
    IF new_status = 'отчетено' THEN
        IF is_last_op THEN
            INSERT INTO public.inventory ("ID Детайл", "Операция", "Количество")
            VALUES (NEW."ID Детайл", 'готов продукт', new_qty)
            ON CONFLICT ("ID Детайл", "Операция") DO UPDATE SET "Количество" = COALESCE(public.inventory."Количество"::text, '0')::numeric + COALESCE(EXCLUDED."Количество"::text, '0')::numeric;
        ELSE
            INSERT INTO public.inventory ("ID Детайл", "Операция", "Количество")
            VALUES (NEW."ID Детайл", new_op, new_qty)
            ON CONFLICT ("ID Детайл", "Операция") DO UPDATE SET "Количество" = COALESCE(public.inventory."Количество"::text, '0')::numeric + COALESCE(EXCLUDED."Количество"::text, '0')::numeric;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
