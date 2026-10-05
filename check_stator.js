const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://zdythzcgcjxwbxufunuh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE');

async function test() {
    const { data } = await supabase.from('marshruti').select('Код на детайла').ilike('Код на детайла', '%СТАТОР%');
    let unique = [...new Set(data.map(d => d['Код на детайла']))];
    console.log(unique);
}
test();
