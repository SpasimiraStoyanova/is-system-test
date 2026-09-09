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

    IF new_operator ILIKE '%СИСТЕМА (Корекция%' THEN RETURN NEW; END IF;

    IF new_op ILIKE 'Опаковане%' THEN RETURN NEW; END IF;

    IF new_op ILIKE 'Експедиция%' THEN
        UPDATE public.inventory SET "Количество" = GREATEST(0, COALESCE("Количество"::text, '0')::numeric - new_qty) WHERE LOWER(TRIM("ID Детайл")) = new_detail AND LOWER(TRIM("Операция")) = 'готов продукт';
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
            UPDATE public.inventory SET "Количество" = GREATEST(0, COALESCE("Количество"::text, '0')::numeric - new_qty) WHERE LOWER(TRIM("ID Детайл")) = new_detail AND LOWER(TRIM("Операция")) = prev_op;
        ELSE
            UPDATE public.sklad SET "Остатък" = GREATEST(0, COALESCE("Остатък"::text, '0')::numeric - new_qty), "Изразходено" = COALESCE("Изразходено"::text, '0')::numeric + new_qty WHERE LOWER(TRIM("ID Детайл")) = new_detail;
        END IF;
    END IF;

    -- Стъпка 2: Вадим материали (BOM)
    FOR child_record IN 
        SELECT b."ID Компонент" AS comp, b."Количество" AS needed, m."Тип" AS m_type, m."Мерна единица" as unit
        FROM public.bom b
        LEFT JOIN public."Номенклатура" m ON LOWER(TRIM(b."ID Компонент")) = LOWER(TRIM(m."ID Детайл"))
        WHERE LOWER(TRIM(b."ID Родител")) = new_detail 
          AND (b."Влага се на Оп. №"::text IS NULL OR b."Влага се на Оп. №"::text = '' OR CAST(NULLIF(b."Влага се на Оп. №"::text, '') AS integer) = (
                SELECT CAST(NULLIF("№ Операция"::text, '') AS integer) FROM public.marshruti WHERE LOWER(TRIM("Код на детайла")) = new_detail AND LOWER(TRIM("Име на операция")) = new_op ORDER BY CAST(NULLIF("№ Операция"::text, '') AS integer) DESC LIMIT 1
          ))
    LOOP
        IF LOWER(TRIM(child_record.m_type)) = 'материал' THEN
            UPDATE public.sklad SET "Остатък" = GREATEST(0, COALESCE("Остатък"::text, '0')::numeric - (new_qty * COALESCE(child_record.needed::text, '0')::numeric)), "Изразходено" = COALESCE("Изразходено"::text, '0')::numeric + (new_qty * COALESCE(child_record.needed::text, '0')::numeric)
            WHERE LOWER(TRIM("ID Детайл")) = LOWER(TRIM(child_record.comp));
        ELSE
            UPDATE public.inventory SET "Количество" = GREATEST(0, COALESCE("Количество"::text, '0')::numeric - (new_qty * COALESCE(child_record.needed::text, '0')::numeric))
            WHERE LOWER(TRIM("ID Детайл")) = LOWER(TRIM(child_record.comp)) AND LOWER(TRIM("Операция")) = 'готов продукт';
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
