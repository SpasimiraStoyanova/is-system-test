const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://zdythzcgcjxwbxufunuh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
    const { data, error } = await supabase.from('otcheti').select('*').order('Дата', {ascending: false}).limit(5);
    if(error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
}
check();
