-- ==============================================================================
-- МИГРАЦИЯ: РАЗРЕШАВАНЕ НА ПОВТОРНИ НАПОМНЯНИЯ ПРИ 10+ МИНУТИ ПРЕСТОЙ
-- ==============================================================================
-- Премахва уникалното ограничение (1 запис на ден за служител), за да може
-- регистърът task_reminders да пази история на всяко изпратено подсещане
-- през целия работен ден.

ALTER TABLE public.task_reminders DROP CONSTRAINT IF EXISTS uq_task_reminders_date_worker;
DROP INDEX IF EXISTS public.uq_task_reminders_date_worker;

-- Създаване на обикновен индекс за бързо търсене по дата и служител
CREATE INDEX IF NOT EXISTS idx_task_reminders_worker_date_all ON public.task_reminders (worker_email, reminder_date, sent_at DESC);
