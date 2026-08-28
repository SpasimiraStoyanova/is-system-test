import re

with open(r'd:\Projects\IS_SYSTEM_TEST\fix_triggers_bom.sql', 'r', encoding='utf8') as f:
    content = f.read()

content = content.replace('NULLIF("№ Операция", \'\')', 'NULLIF(CAST("№ Операция" AS text), \'\')')
content = content.replace('NULLIF("Изразходено", \'\')', 'NULLIF(CAST("Изразходено" AS text), \'\')')
content = content.replace('NULLIF("Доставено", \'\')', 'NULLIF(CAST("Доставено" AS text), \'\')')

# Also fix the BOM check
content = content.replace(
    'AND (b."Влага се на Оп. №" = current_op_num OR (b."Влага се на Оп. №" IS NULL AND prev_op IS NULL))',
    'AND (CAST(NULLIF(CAST(b."Влага се на Оп. №" AS text), \'\') AS numeric) = current_op_num OR (CAST(NULLIF(CAST(b."Влага се на Оп. №" AS text), \'\') AS numeric) IS NULL AND prev_op IS NULL))'
)

with open(r'd:\Projects\IS_SYSTEM_TEST\fix_triggers_bom.sql', 'w', encoding='utf8') as f:
    f.write(content)
