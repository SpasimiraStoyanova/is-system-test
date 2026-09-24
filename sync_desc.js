const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const readline = require('readline');

// Initialize Supabase
const supabaseUrl = 'https://zdythzcgcjxwbxufunuh.supabase.co';
// Read from .env
const envContent = fs.readFileSync('.env', 'utf8');
const keyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="(.*?)"/);
const anonKeyMatch = envContent.match(/SUPABASE_ANON_KEY="(.*?)"/);
let supabaseKey = keyMatch ? keyMatch[1] : (anonKeyMatch ? anonKeyMatch[1] : null);

if (!supabaseKey) {
    console.error("Could not find Supabase key in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Loading CSV...");
    
    // Some lines might have commas inside quotes.
    // For a simple parser, since Description is first and Item Number is last,
    // we can just extract the last comma-separated value as the Item Number.
    // E.g. "Description with, commas",575-92015 -> "575-92015" is the item number.
    
    const fileStream = fs.createReadStream('descriptions.csv');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let firstLine = true;
    let records = [];

    for await (const line of rl) {
        if (firstLine) { firstLine = false; continue; } // Skip header
        if (!line.trim()) continue;
        
        let lastCommaIndex = line.lastIndexOf(',');
        if (lastCommaIndex === -1) continue;
        
        let itemNum = line.substring(lastCommaIndex + 1).trim();
        let description = line.substring(0, lastCommaIndex).trim();
        
        // Remove surrounding quotes from description if they exist
        if (description.startsWith('"') && description.endsWith('"')) {
            description = description.substring(1, description.length - 1);
            // Also unescape double quotes "" -> "
            description = description.replace(/""/g, '"');
        }
        
        if (itemNum && description) {
            records.push({ itemNum, description });
        }
    }
    
    console.log(`Found ${records.length} records in CSV.`);
    
    // Fetch all Nomenclature from DB to match them
    console.log("Fetching Nomenclature from DB...");
    const { data: nomData, error: nomErr } = await supabase.from('Номенклатура').select('*');
    if (nomErr) {
        console.error("Error fetching Nomenclature:", nomErr);
        return;
    }
    
    console.log(`Found ${nomData.length} records in DB.`);
    
    let updateCount = 0;
    
    for (const r of records) {
        // Try exact match on ID Детайл or Вътрешно име
        let match = nomData.find(n => 
            String(n['ID Детайл']).trim().toUpperCase() === r.itemNum.toUpperCase() ||
            String(n['Вътрешно име']).trim().toUpperCase() === r.itemNum.toUpperCase()
        );
        
        if (match) {
            const { error: updErr } = await supabase.from('Номенклатура')
                .update({ 'Описание': r.description })
                .eq('id', match.id);
                
            if (updErr) {
                console.error(`Error updating ID ${match.id}:`, updErr);
            } else {
                updateCount++;
                console.log(`Updated ${r.itemNum} -> ${r.description.substring(0, 30)}...`);
            }
        } else {
            console.log(`Warning: Item ${r.itemNum} not found in DB.`);
        }
    }
    
    console.log(`Done! Updated ${updateCount} records in the database.`);
}

run();
