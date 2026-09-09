const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const config = fs.readFileSync('./admin/admin-config.js', 'utf8');
const urlMatch = config.match(/const SUPABASE_URL = '(.*?)'/);
const keyMatch = config.match(/const SUPABASE_ANON_KEY = '(.*?)'/);

const client = createClient(urlMatch[1], keyMatch[1]);

async function check() {
    const {data, error} = await client.from('otcheti').select('*').order('id', {ascending: false}).limit(5);
    console.log("Последни отчети:");
    console.log(data);
}
check();
