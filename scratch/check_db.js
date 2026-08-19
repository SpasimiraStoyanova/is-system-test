const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://aoekbmhgbohsgpwqsizv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvZWtibWhnYm9oc2dwd3FzaXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NDU1OTEsImV4cCI6MjEwMjUyMTU5MX0.ikCySPlyg0kPHt0sx34pndAWJAJ9tVCyWonBuG-lLQU';
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

