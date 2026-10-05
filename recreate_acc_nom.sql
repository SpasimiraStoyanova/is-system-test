DROP TABLE IF EXISTS public.acc_nomenklatura;

CREATE TABLE IF NOT EXISTS public.acc_nomenklatura (
    id serial PRIMARY KEY,
    "Номер" text,
    "Описание" text,
    "Тяло" text,
    "Преден капак" text,
    "Заден капак" text,
    "Вал" text,
    "Ротор" text,
    "Статор" text,
    "Макари R" text,
    "Щифтове" text,
    "МПР 1" text,
    "МПР 2" text,
    "Пр. Лагер" text,
    "З. Лагер" text,
    "Шпилки" text,
    "Забележка" text,
    "Папка №" text,
    "Цена на изделие лв_бр" text,
    "Вид AL за тялото" text,
    "Цена на AL Тяло с ДДС" text,
    "Вид AL за пр. капак" text,
    "Цена на AL на пр. капак с ДДС" text,
    "Вид AL за з. капак" text,
    "Цена на AL на зад. капак с ДДС" text,
    "Тегло Al тяло kg" text,
    "Тегло на ротор" text,
    "Тегло АL пр. капак kg" text,
    "Тегло на AL зад. капак kg" text,
    "Тегло на куплунг kg" text,
    "СУМА AL_бр." text,
    "СУМА kg" text,
    "Тегло на цялото изделие g" text,
    "Тегло на цялото издели_тегло на AL в него" text,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.acc_nomenklatura ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for anon acc_nomenklatura" ON public.acc_nomenklatura FOR ALL USING (true) WITH CHECK (true);
