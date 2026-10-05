const { createClient } = require('@supabase/supabase-js');
const client = createClient('https://zdythzcgcjxwbxufunuh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE');

async function check() {
    const { data: plans } = await client.from('plan').select('*').limit(1000);
    const { data: nom } = await client.from('Номенклатура').select('*').limit(10000);
    
    let target = 'СТАТОР ВАР. 25 (R3)'.toLowerCase();
    
    for (let p of plans) {
        let name = String(p['Вътрешно име'] || '').toLowerCase();
        let translated = nom.find(n => String(n['Вътрешно име'] || '').toLowerCase() === name);
        let idDetail = translated ? String(translated['ID Детайл'] || '').toLowerCase() : name;
        
        if (name.includes('25') || idDetail.includes('25')) {
            console.log("FOUND PLAN:", p.id, "| Internal:", p['Вътрешно име'], "| Translated:", idDetail, "| Status:", p['Статус']);
        }
    }
}
check();
