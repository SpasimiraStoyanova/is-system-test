const { createClient } = require('@supabase/supabase-js');
const client = createClient('https://zdythzcgcjxwbxufunuh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE');

async function test() {
    let targetId = 'Статор Вар. 25 (R3)';
    const { data: bomData } = await client.from('bom').select('ID Родител, ID Компонент').limit(10000);
    const normalize = s => String(s || '').toLowerCase().replace(/[^a-zа-я0-9]/g, '');
    let tName = normalize(targetId);
    
    let ancestors = new Set([tName]);
    let added = true;
    while (added) {
        added = false;
        (bomData || []).forEach(b => {
            let child = normalize(b['ID Компонент']);
            let parent = normalize(b['ID Родител']);
            if (ancestors.has(child) && !ancestors.has(parent)) {
                ancestors.add(parent);
                added = true;
            }
        });
    }
    
    console.log("Ancestors found:", Array.from(ancestors));
    
    const { data: plans } = await client.from('plan').select('*').limit(10000);
    const { data: nomData } = await client.from('Номенклатура').select('*').limit(10000);
    
    let myPlans = plans.filter(task => {
        let planInternal = String(task['Вътрешно име'] || '').trim();
        let translated = (nomData || []).find(n => String(n['Вътрешно име'] || '').trim() === planInternal);
        let planDetailId = translated && translated['ID Детайл'] ? translated['ID Детайл'] : planInternal;
        
        let pName = normalize(planDetailId);
        let pInternalName = normalize(planInternal); 
        
        for (let anc of ancestors) {
            let ancNoR3 = anc.replace('r3', '');
            if (pName.includes(anc) || anc.includes(pName) || pInternalName.includes(anc) || anc.includes(pInternalName)) return true;
            if (ancNoR3.length > 3 && (pName.includes(ancNoR3) || pInternalName.includes(ancNoR3))) return true;
        }
        return false;
    });
    
    console.log("Matched plans:", myPlans.map(p => p['Вътрешно име']));
}
test();
