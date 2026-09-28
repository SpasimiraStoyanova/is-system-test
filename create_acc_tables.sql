CREATE TABLE IF NOT EXISTS public.acc_nomenklatura (
    id serial PRIMARY KEY,
    "Номер" text,
    "Описание" text,
    "Цена на ал в 1 бр" text,
    "Премахване на 0-лите" text,
    "Процент АЛ в детайл" text,
    "Вид АЛ за тялото" text,
    "Тегло 1" text,
    "Цена 1" text,
    "Вид АЛ за Пр. Капаци" text,
    "Тегло 2" text,
    "Цена 2" text,
    "Вид АЛ за 3.Капаци" text,
    "Тегло 3" text,
    "Цена 3" text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.acc_data (
    id serial PRIMARY KEY,
    "Номер" text,
    "Описание" text,
    "Unit cost" text,
    "HTS Code" text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.acc_plan (
    id serial PRIMARY KEY,
    "бр." text,
    "Номер" text,
    created_at timestamptz DEFAULT now()
);

-- Enable RLS for all to allow anonymous access (since we are doing it via client JS)
ALTER TABLE public.acc_nomenklatura ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acc_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acc_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for anon acc_nomenklatura" ON public.acc_nomenklatura FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon acc_data" ON public.acc_data FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon acc_plan" ON public.acc_plan FOR ALL USING (true) WITH CHECK (true);
