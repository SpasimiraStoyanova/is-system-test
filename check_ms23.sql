SELECT 'wip' as type, * FROM inventory_wip WHERE "ID Детайл" ILIKE '%MS-23%';
SELECT 'gp' as type, * FROM inventory_gp WHERE "ID Детайл" ILIKE '%MS-23%';
SELECT 'otcheti' as type, * FROM otcheti WHERE "ID Детайл" ILIKE '%MS-23%' ORDER BY "Дата" DESC LIMIT 20;
