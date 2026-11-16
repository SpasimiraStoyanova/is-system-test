-- ==============================================================================
-- МИГРАЦИЯ: ДОБАВЯНЕ НА ОПАКОВЪЧНИ ЕДИНИЦИ (КУТИИ / КАШОНИ) В СКЛАДОВЕТЕ
-- ==============================================================================

-- 1. Склад Инструментална Екипировка (tooling_inventory)
-- По подразбиране за пластини и инструменти е 10 бр. в кутия
ALTER TABLE public.tooling_inventory ADD COLUMN IF NOT EXISTS pack_size NUMERIC DEFAULT 10;
UPDATE public.tooling_inventory SET pack_size = 10 WHERE pack_size IS NULL;

-- 2. Склад Материали (sklad)
-- Брой / метри / кг в пакет, кашон или връзка (по подразбиране 1)
ALTER TABLE public.sklad ADD COLUMN IF NOT EXISTS pack_size NUMERIC DEFAULT 1;
UPDATE public.sklad SET pack_size = 1 WHERE pack_size IS NULL;

-- 3. Номенклатура ("Номенклатура")
ALTER TABLE public."Номенклатура" ADD COLUMN IF NOT EXISTS pack_size NUMERIC DEFAULT 1;
UPDATE public."Номенклатура" SET pack_size = 1 WHERE pack_size IS NULL;
