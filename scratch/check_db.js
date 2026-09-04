const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zdythzcgcjxwbxufunuh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase.from('otcheti').select('*').eq('ID Детайл', 'Вал Вар. 11 #');
    if (error) console.error(error);
    else {
        console.log("Reports for 'Вал Вар. 11 #':");
        console.log(data);
    }
}
check();


