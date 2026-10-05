const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://zdythzcgcjxwbxufunuh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE';
const client = createClient(supabaseUrl, supabaseKey);

async function wipe() {
    let { data, error } = await client.from('acc_nomenklatura').delete().neq('Номер', 'XXXXXXXXX');
    if(error) console.error(error);
    else console.log('Successfully cleared acc_nomenklatura table.');
}
wipe();
