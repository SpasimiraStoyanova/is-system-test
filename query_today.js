const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const config = fs.readFileSync('./admin/admin-core-old.js', 'utf8') + fs.readFileSync('./app.js', 'utf8');
const urlMatch = config.match(/https:\/\/[a-zA-Z0-9]+\.supabase\.co/);
const keyMatch = config.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
const supabase = createClient(urlMatch[0], keyMatch[0]);

async function run() {
    let d = new Date();
    d.setHours(d.getHours() - 12);
    const { data: otcheti, error } = await supabase.from('otcheti').select('*').gte('Дата', d.toISOString());
    console.log("Recent otcheti count:", otcheti ? otcheti.length : error);
    if(otcheti) {
        otcheti.forEach(o => {
            if(o['ID Детайл'].toLowerCase().includes('ms-23')) console.log("FOUND MS-23:", o);
        });
        console.log("Samples:", otcheti.slice(0,5));
    }
}
run();
