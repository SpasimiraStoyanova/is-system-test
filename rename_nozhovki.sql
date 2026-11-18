-- rename_nozhovki.sql
-- 1. "Малка ножовка" -> "Средна (зелена) ножовка"
-- 2. "Ножовка за процепване" -> "Малка (синя) ножовка"

BEGIN;

-- 1. Маршрутни карти (marshruti)
UPDATE public.marshruti
SET "Машина" = 'Средна (зелена) ножовка'
WHERE "Машина" = 'Малка ножовка';

UPDATE public.marshruti
SET "Машина" = 'Малка (синя) ножовка'
WHERE "Машина" = 'Ножовка за процепване';

-- 2. Регистър на машините (factory_machines)
UPDATE public.factory_machines
SET name = 'Средна (зелена) ножовка'
WHERE name = 'Малка ножовка';

UPDATE public.factory_machines
SET name = 'Малка (синя) ножовка'
WHERE name = 'Ножовка за процепване';

-- 3. Приоритети на задачи (task_priorities)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'task_priorities') THEN
        UPDATE public.task_priorities
        SET machine = 'Средна (зелена) ножовка'
        WHERE machine = 'Малка ножовка';

        UPDATE public.task_priorities
        SET machine = 'Малка (синя) ножовка'
        WHERE machine = 'Ножовка за процепване';
    END IF;
END $$;

-- 4. Зачислени работници към машини (worker_machines)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'worker_machines') THEN
        UPDATE public.worker_machines
        SET machine = 'Средна (зелена) ножовка'
        WHERE machine = 'Малка ножовка';

        UPDATE public.worker_machines
        SET machine = 'Малка (синя) ножовка'
        WHERE machine = 'Ножовка за процепване';
    END IF;
END $$;

-- 5. Заявки за пластини и инструменти (tooling_requests)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tooling_requests') THEN
        UPDATE public.tooling_requests
        SET machine_name = 'Средна (зелена) ножовка'
        WHERE machine_name = 'Малка ножовка';

        UPDATE public.tooling_requests
        SET machine_name = 'Малка (синя) ножовка'
        WHERE machine_name = 'Ножовка за процепване';
    END IF;
END $$;

COMMIT;

