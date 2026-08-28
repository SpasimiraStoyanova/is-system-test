const fs = require('fs');

let content = fs.readFileSync('d:\\Projects\\IS_SYSTEM_TEST\\fix_triggers_bom.sql', 'utf8');

content = content.replace(/NULLIF\("№ Операция", ''\)/g, 'NULLIF(CAST("№ Операция" AS text), \'\')');
content = content.replace(/NULLIF\("Изразходено", ''\)/g, 'NULLIF(CAST("Изразходено" AS text), \'\')');
content = content.replace(/NULLIF\("Доставено", ''\)/g, 'NULLIF(CAST("Доставено" AS text), \'\')');

content = content.replace(
    'AND (b."Влага се на Оп. №" = current_op_num OR (b."Влага се на Оп. №" IS NULL AND prev_op IS NULL))',
    'AND (CAST(NULLIF(CAST(b."Влага се на Оп. №" AS text), \'\') AS numeric) = current_op_num OR (CAST(NULLIF(CAST(b."Влага се на Оп. №" AS text), \'\') AS numeric) IS NULL AND prev_op IS NULL))'
);

fs.writeFileSync('d:\\Projects\\IS_SYSTEM_TEST\\fix_triggers_bom.sql', content, 'utf8');
