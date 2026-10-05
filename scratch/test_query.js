const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const config = fs.readFileSync('d:/Projects/IS_SYSTEM_TEST/admin/admin-config.js', 'utf8');
const urlMatch = config.match(/const SUPABASE_URL = '(.*?)'/);
const keyMatch = config.match(/const SUPABASE_ANON_KEY = '(.*?)'/);

const client = createClient(urlMatch[1], keyMatch[1]);

async function check() {
    const {data: oData} = await client.from('otcheti').select('*').ilike('ID Детайл', '%575-01921%');
    console.log("otcheti:", oData.map(d => `'${d['ID Детайл']}'`));

    const {data: iData} = await client.from('inventory').select('*').ilike('ID Детайл', '%575-01921%');
    console.log("inventory:", iData.map(d => `'${d['ID Детайл']}'`));
    
    const {data: bData} = await client.from('bom').select('*').ilike('ID Родител', '%575-01921%');
    console.log("bom:", bData.map(d => `'${d['ID Родител']}'`));
}
check();
