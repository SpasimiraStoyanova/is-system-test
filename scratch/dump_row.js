const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://zdythzcgcjxwbxufunuh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE');

async function run() {
    let { data, error } = await supabase.from('acc_nomenklatura').select('*').eq('Номер', '21129000B');
    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
}
run();
