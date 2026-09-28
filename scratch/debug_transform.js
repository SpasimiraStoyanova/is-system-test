const { createClient } = require('@supabase/supabase-js');
const client = createClient('https://zdythzcgcjxwbxufunuh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE');

async function check() {
    const {data: inv} = await client.from('inventory').select('*').ilike('ID Детайл', '%575-01921#%');
    console.log("INVENTORY:", inv);
    
    const {data: nom} = await client.from('Номенклатура').select('*').ilike('ID Детайл', '%575-01921#%');
    console.log("NOMENCLATURE:", nom);
}
check();
