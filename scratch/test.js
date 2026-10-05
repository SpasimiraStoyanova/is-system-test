const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const config = fs.readFileSync('./admin/admin-config.js', 'utf8');
const client = createClient(config.match(/const SUPABASE_URL = '(.*?)'/)[1], config.match(/const SUPABASE_ANON_KEY = '(.*?)'/)[1]);
async function run() {
    let { data: inv } = await client.from('inventory').select('*').ilike('ID Детайл', '%575-01921%');
    console.log("INV:"); console.log(inv);
    let { data: otc } = await client.from('otcheti').select('*').ilike('ID Детайл', '%575-01921%');
    console.log("OTC count:", otc ? otc.length : 0);
    let { data: bom } = await client.from('bom').select('*').ilike('ID Родител', '%575-01921%');
    console.log("BOM:"); console.log(bom);
    let { data: rts } = await client.from('marshruti').select('*').ilike('Код на детайла', '%575-01921%');
    console.log("ROUTES:"); console.log(rts);
}
run();
