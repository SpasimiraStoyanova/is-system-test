SELECT 'BOM_COUNT' as source, COUNT(*) FROM public.bom WHERE LOWER(TRIM("ID Родител")) = 'роторен пак. вар. 25' AND LOWER(TRIM("ID Компонент")) = 'ламела роторна вар.25';
