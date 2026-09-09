const { createClient } = require('@supabase/supabase-js');

const prodClient = createClient(
  'https://aoekbmhgbohsgpwqsizv.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvZWtibWhnYm9oc2dwd3FzaXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NDU1OTEsImV4cCI6MjEwMjUyMTU5MX0.ikCySPlyg0kPHt0sx34pndAWJAJ9tVCyWonBuG-lLQU'
);

const testClient = createClient(
  'https://zdythzcgcjxwbxufunuh.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE'
);

// Списък с таблици за импорт. 
const tablesToCopy = ['Номенклатура', 'bom', 'marshruti', 'sklad_bufferi'];

async function copyData() {
    for (const table of tablesToCopy) {
        console.log(`\nВзимане на данни от реалната база за таблица: ${table}...`);
        const { data, error } = await prodClient.from(table).select('*').limit(100000);
        if (error) {
            console.error(`Грешка при извличане от ${table}:`, error);
            continue;
        }
        
        console.log(`Извлечени ${data.length} реда. Започва импорт в тестовата база...`);
        
        if (data.length > 0) {
            // Вмъкване
            const { error: insErr } = await testClient.from(table).insert(data);
            if (insErr) {
                console.error(`Грешка при импортиране в ${table}:`, insErr);
            } else {
                console.log(`УСПЕШНО импортирана таблица: ${table}`);
            }
        }
    }
}

copyData();
