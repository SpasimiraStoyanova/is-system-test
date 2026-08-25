-- =====================================================================================
-- МИГРАЦИОНЕН СКРИПТ: Обединяване на складовите тригери и почистване на старите
-- =====================================================================================

-- 1. Изтриваме всички стари тригери от otcheti, за да не се дублират бройките.
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'otcheti') LOOP
    EXECUTE 'DROP TRIGGER IF EXISTS "' || r.trigger_name || '" ON public.otcheti';
  END LOOP;
END $$;

-- 2. Създаваме функцията за INSERT (Когато се отчете нещо през терминала или админа)
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

    -- Игнорираме ръчните корекции (те не влияят на inventory_wip)
    IF new_operator ILIKE '%ръчна корек%' THEN
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


-- 3. Създаваме функцията за DELETE (Когато се изтрие запис от Отчети)
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
    IF old_operator ILIKE '%ръчна корек%' THEN
        RETURN OLD;
    END IF;

    -- Намираме предишната операция за този детайл
    SELECT LOWER(TRIM("Име на операция")) INTO prev_op FROM public.marshruti
    WHERE LOWER(TRIM("Име на детайл")) = old_detail AND CAST(NULLIF("№ Операция", '') AS integer) < (
          SELECT CAST(NULLIF("№ Операция", '') AS integer) FROM public.marshruti WHERE LOWER(TRIM("Име на детайл")) = old_detail AND LOWER(TRIM("Име на операция")) = old_op ORDER BY CAST(NULLIF("№ Операция", '') AS integer) DESC LIMIT 1
      ) ORDER BY CAST(NULLIF("№ Операция", '') AS integer) DESC LIMIT 1;

    -- Проверяваме дали текущата операция е последна
    SELECT NOT EXISTS (
        SELECT 1 FROM public.marshruti WHERE LOWER(TRIM("Име на детайл")) = old_detail AND CAST(NULLIF("№ Операция", '') AS integer) > (
              SELECT CAST(NULLIF("№ Операция", '') AS integer) FROM public.marshruti WHERE LOWER(TRIM("Име на детайл")) = old_detail AND LOWER(TRIM("Име на операция")) = old_op ORDER BY CAST(NULLIF("№ Операция", '') AS integer) DESC LIMIT 1
          )
    ) INTO is_last_op;

    -- СТЪПКА 1: Вадим от текущата операция (освен ако не е било Брак!)
    IF old_status != 'брак' THEN
        IF is_last_op THEN
            UPDATE public.inventory_gp SET "Количество" = GREATEST(0, "Количество" - old_qty) WHERE LOWER(TRIM("ID Детайл")) = old_detail;
        ELSE
            UPDATE public.inventory_wip SET "Количество" = GREATEST(0, "Количество" - old_qty) WHERE LOWER(TRIM("ID Детайл")) = old_detail AND LOWER(TRIM("Операция")) = old_op;
        END IF;
    END IF;

    -- СТЪПКА 2: Връщаме в предишната операция или склада (включително за Брак, защото бракът също вади оттам)
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

-- 4. Закачаме двата нови тригера към таблицата
CREATE TRIGGER trg_otcheti_insert
AFTER INSERT ON public.otcheti
FOR EACH ROW
EXECUTE FUNCTION public.process_inventory_on_otchet();

CREATE TRIGGER trg_otcheti_delete
BEFORE DELETE ON public.otcheti
FOR EACH ROW
EXECUTE FUNCTION public.process_inventory_on_delete_otchet();
- -   1 .    !	 �  � �   �   �     �   !  �  �  �  Q!   � !  �    �  �    �! U  U �  U V Q!  ( A u d i t   L o g s )  
 C R E A T E   T A B L E   I F   N O T   E X I S T S   p u b l i c . a u d i t _ l o g s   (  
         i d   b i g i n t   g e n e r a t e d   b y   d e f a u l t   a s   i d e n t i t y   p r i m a r y   k e y ,  
         t a b l e _ n a m e   t e x t   n o t   n u l l ,  
         a c t i o n _ t y p e   t e x t   n o t   n u l l ,  
         o l d _ d a t a   j s o n b ,  
         n e w _ d a t a   j s o n b ,  
         c h a n g e d _ a t   t i m e s t a m p   w i t h   t i m e   z o n e   d e f a u l t   n o w ( )  
 ) ;  
  
 - -    _ U �   U � !  �  X �     �    ! Q!!  T Q   � �   !!  � !  � !   (  �  �    � �    X U �  �    R � X Q    W �   �  � !	!    � �    V Q   �  � ! �  �  � � )  
 A L T E R   T A B L E   p u b l i c . a u d i t _ l o g s   E N A B L E   R O W   L E V E L   S E C U R I T Y ;  
 D R O P   P O L I C Y   I F   E X I S T S   " E n a b l e   r e a d   a c c e s s   f o r   a l l   u s e r s "   O N   p u b l i c . a u d i t _ l o g s ;  
 C R E A T E   P O L I C Y   " E n a b l e   r e a d   a c c e s s   f o r   a l l   u s e r s "   O N   p u b l i c . a u d i t _ l o g s   F O R   S E L E C T   U S I N G   ( t r u e ) ;  
  
 - -   2 .    !	 �  � �   �   �     �   !S  Q  � !! �  �   � !  �   ! !S  T!   Q!- ! ! Q V � ! 
 C R E A T E   O R   R E P L A C E   F U N C T I O N   p u b l i c . a u d i t _ l o g _ t r i g g e r ( )  
 R E T U R N S   t r i g g e r   A S   $ $  
 B E G I N  
         I F   T G _ O P   =   ' D E L E T E '   T H E N  
                 I N S E R T   I N T O   p u b l i c . a u d i t _ l o g s   ( t a b l e _ n a m e ,   a c t i o n _ t y p e ,   o l d _ d a t a ,   c h a n g e d _ a t )  
                 V A L U E S   ( T G _ T A B L E _ N A M E ,   T G _ O P ,   r o w _ t o _ j s o n ( O L D ) : : j s o n b ,   n o w ( ) ) ;  
                 R E T U R N   O L D ;  
         E L S I F   T G _ O P   =   ' U P D A T E '   T H E N  
                 - -      �  W Q!  �  X �   ! �  X U   �  T U   Q X �   ! �  �  �   �    W! U X!  �       � �    Q!  �  
                 I F   r o w _ t o _ j s o n ( O L D ) : : j s o n b   I S   D I S T I N C T   F R O M   r o w _ t o _ j s o n ( N E W ) : : j s o n b   T H E N  
                         I N S E R T   I N T O   p u b l i c . a u d i t _ l o g s   ( t a b l e _ n a m e ,   a c t i o n _ t y p e ,   o l d _ d a t a ,   n e w _ d a t a ,   c h a n g e d _ a t )  
                         V A L U E S   ( T G _ T A B L E _ N A M E ,   T G _ O P ,   r o w _ t o _ j s o n ( O L D ) : : j s o n b ,   r o w _ t o _ j s o n ( N E W ) : : j s o n b ,   n o w ( ) ) ;  
                 E N D   I F ;  
                 R E T U R N   N E W ;  
         E L S I F   T G _ O P   =   ' I N S E R T '   T H E N  
                 I N S E R T   I N T O   p u b l i c . a u d i t _ l o g s   ( t a b l e _ n a m e ,   a c t i o n _ t y p e ,   n e w _ d a t a ,   c h a n g e d _ a t )  
                 V A L U E S   ( T G _ T A B L E _ N A M E ,   T G _ O P ,   r o w _ t o _ j s o n ( N E W ) : : j s o n b ,   n o w ( ) ) ;  
                 R E T U R N   N E W ;  
         E N D   I F ;  
         R E T U R N   N U L L ;  
 E N D ;  
 $ $   L A N G U A G E   p l p g s q l   S E C U R I T Y   D E F I N E R ;  
  
 - -   3 .      �  T � !!  �   �     �   ! ! Q V � ! �    T!	 X   Q �  � ! �   Q!  �   !  �  �  �  Q!   Q 
 D O   $ $  
 D E C L A R E  
         t   t e x t ;  
 B E G I N  
         F O R   t   I N   S E L E C T   u n n e s t ( A R R A Y [ ' p l a n ' ,   ' m a r s h r u t i ' ,   ' b o m ' ,   '  \ U X �   T �  � ! !S! � ' ,   ' s k l a d ' ] )  
         L O O P  
                 E X E C U T E   f o r m a t ( ' D R O P   T R I G G E R   I F   E X I S T S   t r g _ a u d i t _ l o g   O N   p u b l i c . % I ' ,   t ) ;  
                 E X E C U T E   f o r m a t ( ' C R E A T E   T R I G G E R   t r g _ a u d i t _ l o g   A F T E R   I N S E R T   O R   U P D A T E   O R   D E L E T E   O N   p u b l i c . % I   F O R   E A C H   R O W   E X E C U T E   F U N C T I O N   p u b l i c . a u d i t _ l o g _ t r i g g e r ( ) ' ,   t ) ;  
         E N D   L O O P ;  
 E N D ;  
 $ $ ;  
  
 - -   4 .      U �  �   �   Q    U  Q   T U �  U  Q 
 A L T E R   T A B L E   p u b l i c . m a r s h r u t i   A D D   C O L U M N   I F   N O T   E X I S T S   "  �  !! !!S T!   Q!   �  �    U!!  �  !  � "   t e x t ;  
 A L T E R   T A B L E   p u b l i c . b o m   A D D   C O L U M N   I F   N O T   E X I S T S   "    �  �  V �   ! �     �    [ W.   2  "   n u m e r i c ;  
 