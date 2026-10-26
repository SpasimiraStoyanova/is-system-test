-- ==============================================================================
-- ТАБЛИЦА: task_priorities (Приоритети на производствени задачи по работни места)
-- База: Supabase zdythzcgcjxwbxufunuh (Тестова среда)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.task_priorities (
    id bigserial PRIMARY KEY,
    plan_year integer NOT NULL,
    plan_month text NOT NULL,
    machine text NOT NULL,
    detail_id text NOT NULL,
    op_num integer NOT NULL,
    op_name text,
    detail_name text,
    priority_order integer NOT NULL DEFAULT 100,
    priority_score numeric DEFAULT 0,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT uq_task_priority UNIQUE (plan_year, plan_month, machine, detail_id, op_num)
);

-- Индекси за бързо филтриране по машина и период
CREATE INDEX IF NOT EXISTS idx_task_priorities_lookup 
ON public.task_priorities (plan_year, plan_month, machine);

CREATE INDEX IF NOT EXISTS idx_task_priorities_machine 
ON public.task_priorities (machine);

-- Активиране на RLS и права за четене/запис за anon ролята
ALTER TABLE public.task_priorities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for anon task_priorities" ON public.task_priorities;
CREATE POLICY "Enable all for anon task_priorities" ON public.task_priorities FOR ALL USING (true) WITH CHECK (true);

-- Тригер за автоматично обновяване на updated_at
CREATE OR REPLACE FUNCTION update_task_priorities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_task_priorities_updated_at ON public.task_priorities;
CREATE TRIGGER trg_task_priorities_updated_at
BEFORE UPDATE ON public.task_priorities
FOR EACH ROW
EXECUTE FUNCTION update_task_priorities_updated_at();

COMMENT ON TABLE public.task_priorities IS 'Съхранява ръчно зададени или алгоритмично изчислени приоритети за задачи по машини и месечен план.';

-- Добавяне на колона за временно прехвърляне на операция към друга машина за текущия месец
ALTER TABLE public.task_priorities 
ADD COLUMN IF NOT EXISTS original_machine text;
