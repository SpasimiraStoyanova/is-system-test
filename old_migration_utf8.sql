-- =====================================================================================
-- ╨Ь╨Ш╨У╨а╨Р╨ж╨Ш╨Ю╨Э╨Х╨Э ╨б╨Ъ╨а╨Ш╨Я╨в: ╨Ю╨▒╨╡╨┤╨╕╨╜╤П╨▓╨░╨╜╨╡ ╨╜╨░ ╤Б╨║╨╗╨░╨┤╨╛╨▓╨╕╤В╨╡ ╤В╤А╨╕╨│╨╡╤А╨╕ ╨╕ ╨┐╨╛╤З╨╕╤Б╤В╨▓╨░╨╜╨╡ ╨╜╨░ ╤Б╤В╨░╤А╨╕╤В╨╡
-- =====================================================================================

-- 1. ╨Ш╨╖╤В╤А╨╕╨▓╨░╨╝╨╡ ╨▓╤Б╨╕╤З╨║╨╕ ╤Б╤В╨░╤А╨╕ ╤В╤А╨╕╨│╨╡╤А╨╕ ╨╛╤В otcheti, ╨╖╨░ ╨┤╨░ ╨╜╨╡ ╤Б╨╡ ╨┤╤Г╨▒╨╗╨╕╤А╨░╤В ╨▒╤А╨╛╨╣╨║╨╕╤В╨╡.
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'otcheti') LOOP
    EXECUTE 'DROP TRIGGER IF EXISTS "' || r.trigger_name || '" ON public.otcheti';
  END LOOP;
END $$;

-- 2. ╨б╤К╨╖╨┤╨░╨▓╨░╨╝╨╡ ╤Д╤Г╨╜╨║╤Ж╨╕╤П╤В╨░ ╨╖╨░ INSERT (╨Ъ╨╛╨│╨░╤В╨╛ ╤Б╨╡ ╨╛╤В╤З╨╡╤В╨╡ ╨╜╨╡╤Й╨╛ ╨┐╤А╨╡╨╖ ╤В╨╡╤А╨╝╨╕╨╜╨░╨╗╨░ ╨╕╨╗╨╕ ╨░╨┤╨╝╨╕╨╜╨░)
CREATE OR REPLACE FUNCTION public.process_inventory_on_otchet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_detail text := LOWER(TRIM(NEW."ID ╨Ф╨╡╤В╨░╨╣╨╗"));
    new_op text := LOWER(TRIM(NEW."╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П"));
    new_qty numeric := COALESCE(NEW."╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛", 0);
    new_operator text := COALESCE(NEW."╨Ю╨┐╨╡╤А╨░╤В╨╛╤А", '');
    new_status text := LOWER(TRIM(NEW."╨б╤В╨░╤В╤Г╤Б"));
    prev_op text;
    child_record RECORD;
    is_last_op boolean := false;
BEGIN
    IF new_qty = 0 THEN RETURN NEW; END IF;

    -- ╨Ш╨│╨╜╨╛╤А╨╕╤А╨░╨╝╨╡ ╤А╤К╤З╨╜╨╕╤В╨╡ ╨║╨╛╤А╨╡╨║╤Ж╨╕╨╕ (╤В╨╡ ╨╜╨╡ ╨▓╨╗╨╕╤П╤П╤В ╨╜╨░ inventory_wip)
    IF new_operator ILIKE '%╤А╤К╤З╨╜╨░ ╨║╨╛╤А╨╡╨║%' THEN
        RETURN NEW;
    END IF;

    -- ╨Э╨░╨╝╨╕╤А╨░╨╝╨╡ ╨┐╤А╨╡╨┤╨╕╤И╨╜╨░╤В╨░ ╨╛╨┐╨╡╤А╨░╤Ж╨╕╤П ╨╖╨░ ╤В╨╛╨╖╨╕ ╨┤╨╡╤В╨░╨╣╨╗
    SELECT LOWER(TRIM("╨Ш╨╝╨╡ ╨╜╨░ ╨╛╨┐╨╡╤А╨░╤Ж╨╕╤П")) INTO prev_op FROM public.marshruti
    WHERE LOWER(TRIM("╨Ш╨╝╨╡ ╨╜╨░ ╨┤╨╡╤В╨░╨╣╨╗")) = new_detail AND CAST(NULLIF("тДЦ ╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П", '') AS integer) < (
          SELECT CAST(NULLIF("тДЦ ╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П", '') AS integer) FROM public.marshruti WHERE LOWER(TRIM("╨Ш╨╝╨╡ ╨╜╨░ ╨┤╨╡╤В╨░╨╣╨╗")) = new_detail AND LOWER(TRIM("╨Ш╨╝╨╡ ╨╜╨░ ╨╛╨┐╨╡╤А╨░╤Ж╨╕╤П")) = new_op ORDER BY CAST(NULLIF("тДЦ ╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П", '') AS integer) DESC LIMIT 1
      ) ORDER BY CAST(NULLIF("тДЦ ╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П", '') AS integer) DESC LIMIT 1;

    -- ╨Я╤А╨╛╨▓╨╡╤А╤П╨▓╨░╨╝╨╡ ╨┤╨░╨╗╨╕ ╤В╨╡╨║╤Г╤Й╨░╤В╨░ ╨╛╨┐╨╡╤А╨░╤Ж╨╕╤П ╨╡ ╨┐╨╛╤Б╨╗╨╡╨┤╨╜╨░
    SELECT NOT EXISTS (
        SELECT 1 FROM public.marshruti WHERE LOWER(TRIM("╨Ш╨╝╨╡ ╨╜╨░ ╨┤╨╡╤В╨░╨╣╨╗")) = new_detail AND CAST(NULLIF("тДЦ ╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П", '') AS integer) > (
              SELECT CAST(NULLIF("тДЦ ╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П", '') AS integer) FROM public.marshruti WHERE LOWER(TRIM("╨Ш╨╝╨╡ ╨╜╨░ ╨┤╨╡╤В╨░╨╣╨╗")) = new_detail AND LOWER(TRIM("╨Ш╨╝╨╡ ╨╜╨░ ╨╛╨┐╨╡╤А╨░╤Ж╨╕╤П")) = new_op ORDER BY CAST(NULLIF("тДЦ ╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П", '') AS integer) DESC LIMIT 1
          )
    ) INTO is_last_op;

    -- ╨б╨в╨к╨Я╨Ъ╨Р 1: ╨Т╨░╨┤╨╕╨╝ ╨╛╤В ╨┐╤А╨╡╨┤╨╕╤И╨╜╨░╤В╨░ ╨╛╨┐╨╡╤А╨░╤Ж╨╕╤П ╨╕╨╗╨╕ ╨╛╤В ╤Б╨║╨╗╨░╨┤╨░ (╨╛╤Б╨▓╨╡╨╜ ╨░╨║╨╛ ╨╜╨╡ ╨╡ ╨б╨╕╤Б╤В╨╡╨╝╨░╤В╨░)
    IF new_operator NOT ILIKE '%╤Б╨╕╤Б╤В╨╡╨╝╨░%' THEN
        IF prev_op IS NOT NULL THEN
            UPDATE public.inventory_wip SET "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛" = GREATEST(0, "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛" - new_qty) WHERE LOWER(TRIM("ID ╨Ф╨╡╤В╨░╨╣╨╗")) = new_detail AND LOWER(TRIM("╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П")) = prev_op;
            IF NOT FOUND THEN INSERT INTO public.inventory_wip ("ID ╨Ф╨╡╤В╨░╨╣╨╗", "╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П", "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛") VALUES (new_detail, prev_op, 0); END IF;
        ELSE
            FOR child_record IN SELECT LOWER(TRIM("ID ╨з╨░╤Б╤В")) as child_id, COALESCE("╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛", 1) as req_qty FROM public.bom WHERE LOWER(TRIM("ID ╨Ф╨╡╤В╨░╨╣╨╗")) = new_detail
            LOOP
                UPDATE public.inventory_gp SET "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛" = GREATEST(0, "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛" - (new_qty * child_record.req_qty)) WHERE LOWER(TRIM("ID ╨Ф╨╡╤В╨░╨╣╨╗")) = child_record.child_id;
                IF NOT FOUND THEN INSERT INTO public.inventory_gp ("ID ╨Ф╨╡╤В╨░╨╣╨╗", "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛") VALUES (child_record.child_id, 0); END IF;
            END LOOP;
        END IF;
    END IF;

    -- ╨б╨в╨к╨Я╨Ъ╨Р 2: ╨Ф╨╛╨▒╨░╨▓╤П╨╝╨╡ ╨▓ ╤В╨╡╨║╤Г╤Й╨░╤В╨░ ╨╛╨┐╨╡╤А╨░╤Ж╨╕╤П ╨╕╨╗╨╕ GP (╤Б╨░╨╝╨╛ ╨░╨║╨╛ ╨╜╨╡ ╨╡ ╨С╤А╨░╨║!)
    IF new_status != '╨▒╤А╨░╨║' THEN
        IF is_last_op THEN
            UPDATE public.inventory_gp SET "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛" = "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛" + new_qty WHERE LOWER(TRIM("ID ╨Ф╨╡╤В╨░╨╣╨╗")) = new_detail;
            IF NOT FOUND THEN INSERT INTO public.inventory_gp ("ID ╨Ф╨╡╤В╨░╨╣╨╗", "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛") VALUES (new_detail, new_qty); END IF;
        ELSE
            UPDATE public.inventory_wip SET "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛" = "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛" + new_qty WHERE LOWER(TRIM("ID ╨Ф╨╡╤В╨░╨╣╨╗")) = new_detail AND LOWER(TRIM("╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П")) = new_op;
            IF NOT FOUND THEN INSERT INTO public.inventory_wip ("ID ╨Ф╨╡╤В╨░╨╣╨╗", "╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П", "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛") VALUES (new_detail, new_op, new_qty); END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


-- 3. ╨б╤К╨╖╨┤╨░╨▓╨░╨╝╨╡ ╤Д╤Г╨╜╨║╤Ж╨╕╤П╤В╨░ ╨╖╨░ DELETE (╨Ъ╨╛╨│╨░╤В╨╛ ╤Б╨╡ ╨╕╨╖╤В╤А╨╕╨╡ ╨╖╨░╨┐╨╕╤Б ╨╛╤В ╨Ю╤В╤З╨╡╤В╨╕)
CREATE OR REPLACE FUNCTION public.process_inventory_on_delete_otchet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    old_detail text := LOWER(TRIM(OLD."ID ╨Ф╨╡╤В╨░╨╣╨╗"));
    old_op text := LOWER(TRIM(OLD."╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П"));
    old_qty numeric := COALESCE(OLD."╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛", 0);
    old_operator text := COALESCE(OLD."╨Ю╨┐╨╡╤А╨░╤В╨╛╤А", '');
    old_status text := LOWER(TRIM(OLD."╨б╤В╨░╤В╤Г╤Б"));
    prev_op text;
    child_record RECORD;
    is_last_op boolean := false;
BEGIN
    IF old_qty = 0 THEN RETURN OLD; END IF;

    -- ╨Ш╨│╨╜╨╛╤А╨╕╤А╨░╨╝╨╡ ╤А╤К╤З╨╜╨╕╤В╨╡ ╨║╨╛╤А╨╡╨║╤Ж╨╕╨╕
    IF old_operator ILIKE '%╤А╤К╤З╨╜╨░ ╨║╨╛╤А╨╡╨║%' THEN
        RETURN OLD;
    END IF;

    -- ╨Э╨░╨╝╨╕╤А╨░╨╝╨╡ ╨┐╤А╨╡╨┤╨╕╤И╨╜╨░╤В╨░ ╨╛╨┐╨╡╤А╨░╤Ж╨╕╤П ╨╖╨░ ╤В╨╛╨╖╨╕ ╨┤╨╡╤В╨░╨╣╨╗
    SELECT LOWER(TRIM("╨Ш╨╝╨╡ ╨╜╨░ ╨╛╨┐╨╡╤А╨░╤Ж╨╕╤П")) INTO prev_op FROM public.marshruti
    WHERE LOWER(TRIM("╨Ш╨╝╨╡ ╨╜╨░ ╨┤╨╡╤В╨░╨╣╨╗")) = old_detail AND CAST(NULLIF("тДЦ ╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П", '') AS integer) < (
          SELECT CAST(NULLIF("тДЦ ╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П", '') AS integer) FROM public.marshruti WHERE LOWER(TRIM("╨Ш╨╝╨╡ ╨╜╨░ ╨┤╨╡╤В╨░╨╣╨╗")) = old_detail AND LOWER(TRIM("╨Ш╨╝╨╡ ╨╜╨░ ╨╛╨┐╨╡╤А╨░╤Ж╨╕╤П")) = old_op ORDER BY CAST(NULLIF("тДЦ ╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П", '') AS integer) DESC LIMIT 1
      ) ORDER BY CAST(NULLIF("тДЦ ╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П", '') AS integer) DESC LIMIT 1;

    -- ╨Я╤А╨╛╨▓╨╡╤А╤П╨▓╨░╨╝╨╡ ╨┤╨░╨╗╨╕ ╤В╨╡╨║╤Г╤Й╨░╤В╨░ ╨╛╨┐╨╡╤А╨░╤Ж╨╕╤П ╨╡ ╨┐╨╛╤Б╨╗╨╡╨┤╨╜╨░
    SELECT NOT EXISTS (
        SELECT 1 FROM public.marshruti WHERE LOWER(TRIM("╨Ш╨╝╨╡ ╨╜╨░ ╨┤╨╡╤В╨░╨╣╨╗")) = old_detail AND CAST(NULLIF("тДЦ ╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П", '') AS integer) > (
              SELECT CAST(NULLIF("тДЦ ╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П", '') AS integer) FROM public.marshruti WHERE LOWER(TRIM("╨Ш╨╝╨╡ ╨╜╨░ ╨┤╨╡╤В╨░╨╣╨╗")) = old_detail AND LOWER(TRIM("╨Ш╨╝╨╡ ╨╜╨░ ╨╛╨┐╨╡╤А╨░╤Ж╨╕╤П")) = old_op ORDER BY CAST(NULLIF("тДЦ ╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П", '') AS integer) DESC LIMIT 1
          )
    ) INTO is_last_op;

    -- ╨б╨в╨к╨Я╨Ъ╨Р 1: ╨Т╨░╨┤╨╕╨╝ ╨╛╤В ╤В╨╡╨║╤Г╤Й╨░╤В╨░ ╨╛╨┐╨╡╤А╨░╤Ж╨╕╤П (╨╛╤Б╨▓╨╡╨╜ ╨░╨║╨╛ ╨╜╨╡ ╨╡ ╨▒╨╕╨╗╨╛ ╨С╤А╨░╨║!)
    IF old_status != '╨▒╤А╨░╨║' THEN
        IF is_last_op THEN
            UPDATE public.inventory_gp SET "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛" = GREATEST(0, "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛" - old_qty) WHERE LOWER(TRIM("ID ╨Ф╨╡╤В╨░╨╣╨╗")) = old_detail;
        ELSE
            UPDATE public.inventory_wip SET "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛" = GREATEST(0, "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛" - old_qty) WHERE LOWER(TRIM("ID ╨Ф╨╡╤В╨░╨╣╨╗")) = old_detail AND LOWER(TRIM("╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П")) = old_op;
        END IF;
    END IF;

    -- ╨б╨в╨к╨Я╨Ъ╨Р 2: ╨Т╤А╤К╤Й╨░╨╝╨╡ ╨▓ ╨┐╤А╨╡╨┤╨╕╤И╨╜╨░╤В╨░ ╨╛╨┐╨╡╤А╨░╤Ж╨╕╤П ╨╕╨╗╨╕ ╤Б╨║╨╗╨░╨┤╨░ (╨▓╨║╨╗╤О╤З╨╕╤В╨╡╨╗╨╜╨╛ ╨╖╨░ ╨С╤А╨░╨║, ╨╖╨░╤Й╨╛╤В╨╛ ╨▒╤А╨░╨║╤К╤В ╤Б╤К╤Й╨╛ ╨▓╨░╨┤╨╕ ╨╛╤В╤В╨░╨╝)
    IF old_operator NOT ILIKE '%╤Б╨╕╤Б╤В╨╡╨╝╨░%' THEN
        IF prev_op IS NOT NULL THEN
            UPDATE public.inventory_wip SET "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛" = "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛" + old_qty WHERE LOWER(TRIM("ID ╨Ф╨╡╤В╨░╨╣╨╗")) = old_detail AND LOWER(TRIM("╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П")) = prev_op;
            IF NOT FOUND THEN INSERT INTO public.inventory_wip ("ID ╨Ф╨╡╤В╨░╨╣╨╗", "╨Ю╨┐╨╡╤А╨░╤Ж╨╕╤П", "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛") VALUES (old_detail, prev_op, old_qty); END IF;
        ELSE
            FOR child_record IN SELECT LOWER(TRIM("ID ╨з╨░╤Б╤В")) as child_id, COALESCE("╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛", 1) as req_qty FROM public.bom WHERE LOWER(TRIM("ID ╨Ф╨╡╤В╨░╨╣╨╗")) = old_detail
            LOOP
                UPDATE public.inventory_gp SET "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛" = "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛" + (old_qty * child_record.req_qty) WHERE LOWER(TRIM("ID ╨Ф╨╡╤В╨░╨╣╨╗")) = child_record.child_id;
                IF NOT FOUND THEN INSERT INTO public.inventory_gp ("ID ╨Ф╨╡╤В╨░╨╣╨╗", "╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛") VALUES (child_record.child_id, (old_qty * child_record.req_qty)); END IF;
            END LOOP;
        END IF;
    END IF;

    RETURN OLD;
END;
$$;

-- 4. ╨Ч╨░╨║╨░╤З╨░╨╝╨╡ ╨┤╨▓╨░╤В╨░ ╨╜╨╛╨▓╨╕ ╤В╤А╨╕╨│╨╡╤А╨░ ╨║╤К╨╝ ╤В╨░╨▒╨╗╨╕╤Ж╨░╤В╨░
CREATE TRIGGER trg_otcheti_insert
AFTER INSERT ON public.otcheti
FOR EACH ROW
EXECUTE FUNCTION public.process_inventory_on_otchet();

CREATE TRIGGER trg_otcheti_delete
BEFORE DELETE ON public.otcheti
FOR EACH ROW
EXECUTE FUNCTION public.process_inventory_on_delete_otchet();

-- =====================================================================================
-- 5. ╨б╤К╨╖╨┤╨░╨▓╨░╨╜╨╡ ╨╜╨░ ╤В╨░╨▒╨╗╨╕╤Ж╨░╤В╨░ ╨╖╨░ ╨е╤А╨╛╨╜╨╛╨╗╨╛╨│╨╕╤П (Audit Logs)
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id bigint generated by default as identity primary key,
    table_name text not null,
    action_type text not null,
    old_data jsonb,
    new_data jsonb,
    changed_at timestamp with time zone default now()
);

-- ╨Я╨╛╨╖╨▓╨╛╨╗╤П╨▓╨░╨╝╨╡ ╨╜╨░ ╨▓╤Б╨╕╤З╨║╨╕ ╨┤╨░ ╤З╨╡╤В╨░╤В (╨╖╨░ ╨┤╨░ ╨╝╨╛╨╢╨╡ ╨Р╨┤╨╝╨╕╨╜ ╨┐╨░╨╜╨╡╨╗╤К╤В ╨┤╨░ ╨│╨╕ ╨╖╨░╤А╨╡╨╢╨┤╨░)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.audit_logs;
CREATE POLICY "Enable read access for all users" ON public.audit_logs FOR SELECT USING (true);

-- 6. ╨б╤К╨╖╨┤╨░╨▓╨░╨╜╨╡ ╨╜╨░ ╤Г╨╜╨╕╨▓╨╡╤А╤Б╨░╨╗╨╜╨░╤В╨░ ╤Д╤Г╨╜╨║╤Ж╨╕╤П-╤В╤А╨╕╨│╨╡╤А
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO public.audit_logs (table_name, action_type, old_data, changed_at)
        VALUES (TG_TABLE_NAME, TG_OP, row_to_json(OLD)::jsonb, now());
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        -- ╨Ч╨░╨┐╨╕╤Б╨▓╨░╨╝╨╡ ╤Б╨░╨╝╨╛ ╨░╨║╨╛ ╨╕╨╝╨░ ╤А╨╡╨░╨╗╨╜╨░ ╨┐╤А╨╛╨╝╤П╨╜╨░ ╨▓ ╨┤╨░╨╜╨╜╨╕╤В╨╡
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

-- 7. ╨Ч╨░╨║╨░╤З╨░╨╜╨╡ ╨╜╨░ ╤В╤А╨╕╨│╨╡╤А╨░ ╨║╤К╨╝ ╨╕╨╖╨▒╤А╨░╨╜╨╕╤В╨╡ ╤В╨░╨▒╨╗╨╕╤Ж╨╕
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT unnest(ARRAY['plan', 'marshruti', 'bom', '╨Э╨╛╨╝╨╡╨╜╨║╨╗╨░╤В╤Г╤А╨░', 'sklad'])
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_log ON public.%I', t);
        EXECUTE format('CREATE TRIGGER trg_audit_log AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger()', t);
    END LOOP;
END;
$$;

-- =====================================================================================
-- 8. ╨Ф╨╛╨▒╨░╨▓╤П╨╜╨╡ ╨╜╨░ ╨╜╨╛╨▓╨╕ ╨║╨╛╨╗╨╛╨╜╨╕ ╨╖╨░ ╨в╨╡╤А╨╝╨╕╨╜╨░╨╗╨░ ╨╕ ╨С╨Ю╨Ь
-- =====================================================================================
ALTER TABLE public.marshruti ADD COLUMN IF NOT EXISTS "╨Ш╨╜╤Б╤В╤А╤Г╨║╤Ж╨╕╤П ╨╖╨░ ╨╛╤Б╤В╨░╨▓╤П╨╜╨╡" text;
ALTER TABLE public.bom ADD COLUMN IF NOT EXISTS "╨Т╨╗╨░╨│╨░ ╤Б╨╡ ╨╜╨░ ╨Ю╨┐. тДЦ" numeric;
