TRUNCATE TABLE public.otcheti RESTART IDENTITY;
TRUNCATE TABLE public.inventory_gp RESTART IDENTITY;
TRUNCATE TABLE public.inventory_wip RESTART IDENTITY;
UPDATE public.sklad SET "Изразходено" = '0', "Остатък" = COALESCE("Начална наличност", 0) + CAST(COALESCE(NULLIF("Доставено", ''), '0') AS numeric);
