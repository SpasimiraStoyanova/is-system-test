const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://zdythzcgcjxwbxufunuh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Checking gp:");
    const gp = await supabase.from('inventory_gp').select('*').ilike('ID Детайл', '%мпр2%');
    console.log(gp.data);

    console.log("Checking wip:");
    const wip = await supabase.from('inventory_wip').select('*').ilike('ID Детайл', '%мпр2%');
    console.log(wip.data);

    console.log("Checking marshruti:");
    const routes = await supabase.from('marshruti').select('*').ilike('Име на детайл', '%мпр2%');
    console.log(routes.data);
}
check();
