UPDATE public.otcheti
SET "Статус" = 'Изпратено'
WHERE "Операция" ILIKE '%Опаковане - Кашон №%'
AND "Статус" = 'Отчетено'
AND "ID План" IN (
    SELECT id::text FROM public.plan WHERE "Статус" = '🚚 Изпратен'
);
