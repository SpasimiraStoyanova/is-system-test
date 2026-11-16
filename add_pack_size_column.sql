-- ==============================================================================
-- МИГРАЦИЯ: ДОБАВЯНЕ НА ОПАКОВЪЧНИ ЕДИНИЦИ (КУТИИ / КАШОНИ / РАЗФАСОВКИ)
-- ==============================================================================

-- 1. Склад Инструментална Екипировка (tooling_inventory)
ALTER TABLE public.tooling_inventory ADD COLUMN IF NOT EXISTS pack_size TEXT DEFAULT '10';

-- 2. Склад Материали (sklad) - по подразбиране е празно (тире), докато не въведете ръчно
ALTER TABLE public.sklad ADD COLUMN IF NOT EXISTS pack_size TEXT;
ALTER TABLE public.sklad ALTER COLUMN pack_size TYPE TEXT USING pack_size::TEXT;

-- 3. Номенклатура ("Номенклатура") - по подразбиране е празно (тире), докато не въведете ръчно за Материали
ALTER TABLE public."Номенклатура" ADD COLUMN IF NOT EXISTS pack_size TEXT;
ALTER TABLE public."Номенклатура" ALTER COLUMN pack_size TYPE TEXT USING pack_size::TEXT;
UPDATE public."Номенклатура" SET pack_size = NULL;


