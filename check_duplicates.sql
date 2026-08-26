SELECT 'BOM_COUNT' as source, COUNT(*) FROM public.bom WHERE LOWER(TRIM("ID Родител")) = 'роторен пак. вар. 25' AND LOWER(TRIM("ID Компонент")) = 'ламела роторна вар.25';
SELECT 'NOM_COUNT' as source, COUNT(*) FROM public."Номенклатура" WHERE LOWER(TRIM("ID Детайл")) = 'ламела роторна вар.25';
