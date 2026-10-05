const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('admin-config.json', 'utf8'));
const supabase = createClient(config.supabaseUrl, config.supabaseKey);
async function run() {
    let { data: bomData } = await supabase.from('bom').select('*').ilike('ID Компонент', '%Статор Вар. 25%');
    console.log('BOM:', JSON.stringify(bomData, null, 2));
    let { data: oData } = await supabase.from('otcheti').select('*').ilike('ID Детайл', '%575-60044%').limit(5);
    console.log('Otcheti for resolver:', oData.length);
}
run();
