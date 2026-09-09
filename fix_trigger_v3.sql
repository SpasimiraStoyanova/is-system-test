-- 1. Оправяме типовете на колоните в таблиците да бъдат твърдо числа (numeric), а не текст
ALTER TABLE public.inventory ALTER COLUMN "Количество" TYPE numeric USING (COALESCE(NULLIF("Количество"::text, ''), '0')::numeric);
ALTER TABLE public.sklad ALTER COLUMN "Остатък" TYPE numeric USING (COALESCE(NULLIF("Остатък"::text, ''), '0')::numeric);
ALTER TABLE public.sklad ALTER COLUMN "Изразходено" TYPE numeric USING (COALESCE(NULLIF("Изразходено"::text, ''), '0')::numeric);
ALTER TABLE public.sklad_bufferi ALTER COLUMN "Брак" TYPE numeric USING (COALESCE(NULLIF("Брак"::text, ''), '0')::numeric);

-- 2. Заменяме тригера с най-безопасната версия, в която всички математики изрично са кастнати към ::numeric
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

    -- Игнорираме Опаковане
    IF new_op ILIKE 'опаков%' THEN RETURN NEW; END IF;

    -- При Експедиция - вадим директно от Готов продукт
    IF new_op ILIKE 'експед%' THEN
        UPDATE public.inventory SET "Количество" = GREATEST(0, COALESCE("Количество"::text, '0')::numeric - new_qty) WHERE LOWER(TRIM("ID Детайл")) = new_detail AND LOWER(TRIM("Операция")) = 'Готов продукт';
        RETURN NEW;
    END IF;

    -- Намираме предишната операция
    SELECT LOWER(TRIM("Име на операция")) INTO prev_op FROM public.marshruti
    WHERE LOWER(TRIM("Код на детайла")) = new_detail AND CAST(NULLIF("№ Операция"::text, '') AS integer) < (
          SELECT CAST(NULLIF("№ Операция"::text, '') AS integer) FROM public.marshruti WHERE LOWER(TRIM("Код на детайла")) = new_detail AND LOWER(TRIM("Име на операция")) = new_op ORDER BY CAST(NULLIF("№ Операция"::text, '') AS integer) DESC LIMIT 1
      ) ORDER BY CAST(NULLIF("№ Операция"::text, '') AS integer) DESC LIMIT 1;

    -- Проверяваме дали текущата операция е последна
    SELECT NOT EXISTS (
        SELECT 1 FROM public.marshruti WHERE LOWER(TRIM("Код на детайла")) = new_detail AND CAST(NULLIF("№ Операция"::text, '') AS integer) > (
              SELECT CAST(NULLIF("№ Операция"::text, '') AS integer) FROM public.marshruti WHERE LOWER(TRIM("Код на детайла")) = new_detail AND LOWER(TRIM("Име на операция")) = new_op ORDER BY CAST(NULLIF("№ Операция"::text, '') AS integer) DESC LIMIT 1
          )
    ) INTO is_last_op;

    -- СТЪПКА 1
    IF new_operator NOT ILIKE '%система%' THEN
        IF prev_op IS NOT NULL THEN
            UPDATE public.inventory SET "Количество" = GREATEST(0, COALESCE("Количество"::text, '0')::numeric - new_qty) WHERE LOWER(TRIM("ID Детайл")) = new_detail AND LOWER(TRIM("Операция")) = prev_op;
        ELSE
            UPDATE public.sklad SET "Остатък" = GREATEST(0, COALESCE("Остатък"::text, '0')::numeric - new_qty), "Изразходено" = COALESCE("Изразходено"::text, '0')::numeric + new_qty WHERE LOWER(TRIM("ID Детайл")) = new_detail;
        END IF;
    END IF;

    -- СТЪПКА 2
    FOR child_record IN 
        SELECT b."ID Компонент" AS comp, b."Количество" AS needed, m."Тип" AS m_type, m."Единици" as unit
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

    -- СТЪПКА 3
    IF new_status = 'отчетено' THEN
        IF is_last_op THEN
            INSERT INTO public.inventory ("ID Детайл", "Операция", "Количество")
            VALUES (NEW."ID Детайл", 'Готов продукт', new_qty)
            ON CONFLICT ("ID Детайл", "Операция") DO UPDATE SET "Количество" = COALESCE(public.inventory."Количество"::text, '0')::numeric + COALESCE(EXCLUDED."Количество"::text, '0')::numeric;
        ELSE
            INSERT INTO public.inventory ("ID Детайл", "Операция", "Количество")
            VALUES (NEW."ID Детайл", new_op, new_qty)
            ON CONFLICT ("ID Детайл", "Операция") DO UPDATE SET "Количество" = COALESCE(public.inventory."Количество"::text, '0')::numeric + COALESCE(EXCLUDED."Количество"::text, '0')::numeric;
        END IF;
    END IF;

    -- СТЪПКА 4
    IF new_status = 'брак' THEN
        INSERT INTO public.sklad_bufferi ("ID Детайл", "Брак")
        VALUES (NEW."ID Детайл", new_qty)
        ON CONFLICT ("ID Детайл") DO UPDATE SET "Брак" = COALESCE(public.sklad_bufferi."Брак"::text, '0')::numeric + COALESCE(EXCLUDED."Брак"::text, '0')::numeric;
    END IF;

    RETURN NEW;
END;
$$;
