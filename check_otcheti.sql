SELECT "Количество", "Време", "Оператор" FROM public.otcheti WHERE LOWER(TRIM("ID Детайл")) = 'роторен пак. вар. 25' ORDER BY "Време" DESC LIMIT 5;
