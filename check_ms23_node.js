const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const config = fs.readFileSync('./admin/admin-core-old.js', 'utf8') + fs.readFileSync('./app.js', 'utf8');
const urlMatch = config.match(/https:\/\/[a-zA-Z0-9]+\.supabase\.co/);
const keyMatch = config.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);

if (!urlMatch || !keyMatch) {
    console.error("Could not find Supabase credentials");
    process.exit(1);
}

const supabase = createClient(urlMatch[0], keyMatch[0]);

async function run() {
    console.log("=== inventory_wip ===");
    const { data: wip } = await supabase.from('inventory_wip').select('*').ilike('ID Детайл', '%MS-23%');
    console.log(wip);

    console.log("=== inventory_gp ===");
    const { data: gp } = await supabase.from('inventory_gp').select('*').ilike('ID Детайл', '%MS-23%');
    console.log(gp);

    console.log("=== otcheti ===");
    const { data: otcheti } = await supabase.from('otcheti').select('*').ilike('ID Детайл', '%MS-23%').order('Дата', { ascending: false }).limit(20);
    console.log(otcheti);
}

run();
