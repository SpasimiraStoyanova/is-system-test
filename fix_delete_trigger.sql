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

    IF old_operator ILIKE '%СИСТЕМА%' THEN
        RETURN OLD;
    END IF;

    IF old_op ILIKE 'Опаковане%' THEN RETURN OLD; END IF;

    IF old_op ILIKE 'Експедиция%' THEN
        UPDATE public.inventory SET "Количество" = COALESCE("Количество"::text, '0')::numeric + old_qty WHERE LOWER(TRIM("ID Детайл")) = old_detail AND LOWER(TRIM("Операция")) = 'готов продукт';
        RETURN OLD;
    END IF;

    -- Намиране на предишната операция
    SELECT LOWER(TRIM("Име на операция")) INTO prev_op
    FROM public.marshruti 
    WHERE LOWER(TRIM("Код на детайла")) = old_detail 
      AND CAST(NULLIF("№ Операция"::text, '') AS integer) < (
          SELECT CAST(NULLIF("№ Операция"::text, '') AS integer) 
          FROM public.marshruti 
          WHERE LOWER(TRIM("Код на детайла")) = old_detail 
            AND LOWER(TRIM("Име на операция")) = old_op 
          ORDER BY CAST(NULLIF("№ Операция"::text, '') AS integer) DESC 
          LIMIT 1
      )
    ORDER BY CAST(NULLIF("№ Операция"::text, '') AS integer) DESC 
    LIMIT 1;

    -- Проверка дали е последна операция
    SELECT NOT EXISTS (
        SELECT 1 FROM public.marshruti WHERE LOWER(TRIM("Код на детайла")) = old_detail AND CAST(NULLIF("№ Операция"::text, '') AS integer) > (
              SELECT CAST(NULLIF("№ Операция"::text, '') AS integer) FROM public.marshruti WHERE LOWER(TRIM("Код на детайла")) = old_detail AND LOWER(TRIM("Име на операция")) = old_op ORDER BY CAST(NULLIF("№ Операция"::text, '') AS integer) DESC LIMIT 1
          )
    ) INTO is_last_op;

    -- Стъпка 1: Вадим от склада (обратно на добавянето при INSERT)
    IF old_status = 'отчетено' THEN
        IF is_last_op THEN
            UPDATE public.inventory SET "Количество" = GREATEST(0, COALESCE("Количество"::text, '0')::numeric - old_qty) WHERE LOWER(TRIM("ID Детайл")) = old_detail AND LOWER(TRIM("Операция")) = 'готов продукт';
        ELSE
            UPDATE public.inventory SET "Количество" = GREATEST(0, COALESCE("Количество"::text, '0')::numeric - old_qty) WHERE LOWER(TRIM("ID Детайл")) = old_detail AND LOWER(TRIM("Операция")) = old_op;
        END IF;
    END IF;

    -- Стъпка 2: Връщаме в предходна операция (обратно на ваденето при INSERT)
    IF old_operator NOT ILIKE '%СИСТЕМА%' THEN
        IF prev_op IS NOT NULL THEN
            UPDATE public.inventory SET "Количество" = COALESCE("Количество"::text, '0')::numeric + old_qty WHERE LOWER(TRIM("ID Детайл")) = old_detail AND LOWER(TRIM("Операция")) = prev_op;
            IF NOT FOUND THEN
                INSERT INTO public.inventory ("ID Детайл", "Операция", "Количество") VALUES (OLD."ID Детайл", prev_op, old_qty);
            END IF;
        ELSE
            -- За първа операция: връщаме материалите в склад / inventory
            DECLARE
                nom_mat text;
                nom_qty numeric;
                nom_type text;
            BEGIN
                SELECT LOWER(TRIM("ID Родител")), COALESCE(NULLIF("Разходна норма"::text, ''), '1')::numeric INTO nom_mat, nom_qty
                FROM public."Номенклатура"
                WHERE LOWER(TRIM("ID Детайл")) = old_detail;
                
                IF nom_mat IS NOT NULL AND nom_mat != '' THEN
                    SELECT LOWER(TRIM("Тип")) INTO nom_type FROM public."Номенклатура" WHERE LOWER(TRIM("ID Детайл")) = nom_mat;
                    
                    IF nom_type = 'материал' OR nom_type IS NULL THEN
                        UPDATE public.sklad 
                        SET "Изразходено" = GREATEST(0, COALESCE("Изразходено"::text, '0')::numeric - (old_qty * nom_qty)), 
                            "Остатък" = COALESCE("Остатък"::text, '0')::numeric + (old_qty * nom_qty)
                        WHERE LOWER(TRIM("ID Детайл")) = nom_mat;
                    ELSE
                        UPDATE public.inventory 
                        SET "Количество" = COALESCE("Количество"::text, '0')::numeric + (old_qty * nom_qty)
                        WHERE LOWER(TRIM("ID Детайл")) = nom_mat AND LOWER(TRIM("Операция")) = 'готов продукт';
                        IF NOT FOUND THEN
                            INSERT INTO public.inventory ("ID Детайл", "Операция", "Количество") VALUES (nom_mat, 'готов продукт', (old_qty * nom_qty));
                        END IF;
                    END IF;
                END IF;
            END;
        END IF;
    END IF;

    -- Стъпка 3: Връщаме детайлите от BOM (обратно на ваденето при INSERT)
    FOR child_record IN 
        SELECT b."ID Компонент" AS comp, b."Количество" AS needed, m."Тип" AS m_type, m."Единици" as unit
        FROM public.bom b
        LEFT JOIN public."Номенклатура" m ON LOWER(TRIM(b."ID Компонент")) = LOWER(TRIM(m."ID Детайл"))
        WHERE LOWER(TRIM(b."ID Родител")) = old_detail 
          AND (b."Влага се на Оп. №"::text IS NULL OR b."Влага се на Оп. №"::text = '' OR CAST(NULLIF(b."Влага се на Оп. №"::text, '') AS integer) = (
                SELECT CAST(NULLIF("№ Операция"::text, '') AS integer) FROM public.marshruti WHERE LOWER(TRIM("Код на детайла")) = old_detail AND LOWER(TRIM("Име на операция")) = old_op ORDER BY CAST(NULLIF("№ Операция"::text, '') AS integer) DESC LIMIT 1
          ))
    LOOP
        IF LOWER(TRIM(child_record.m_type)) = 'материал' THEN
            UPDATE public.sklad SET "Изразходено" = GREATEST(0, COALESCE("Изразходено"::text, '0')::numeric - (old_qty * COALESCE(child_record.needed::text, '0')::numeric)), "Остатък" = COALESCE("Остатък"::text, '0')::numeric + (old_qty * COALESCE(child_record.needed::text, '0')::numeric)
            WHERE LOWER(TRIM("ID Детайл")) = LOWER(TRIM(child_record.comp));
        ELSE
            UPDATE public.inventory SET "Количество" = COALESCE("Количество"::text, '0')::numeric + (old_qty * COALESCE(child_record.needed::text, '0')::numeric)
            WHERE LOWER(TRIM("ID Детайл")) = LOWER(TRIM(child_record.comp)) AND LOWER(TRIM("Операция")) = 'готов продукт';
            IF NOT FOUND THEN
                INSERT INTO public.inventory ("ID Детайл", "Операция", "Количество") VALUES (child_record.comp, 'готов продукт', (old_qty * COALESCE(child_record.needed::text, '0')::numeric));
            END IF;
        END IF;
    END LOOP;

    RETURN OLD;
END;
$$;
