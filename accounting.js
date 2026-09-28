const SUPABASE_URL = 'https://zdythzcgcjxwbxufunuh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE';
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Define columns for Nom
const nomColumns = [
    { data: 'Номер', title: 'Номер' },
    { data: 'Описание', title: 'Описание' },
    { data: 'Цена на ал в 1 бр', title: 'Цена на ал в 1 бр.' },
    { data: 'Премахване на 0-лите', title: 'Премахване на 0-лите' },
    { data: 'Процент АЛ в детайл', title: 'Процент АЛ в детайл' },
    { data: 'Вид АЛ за тялото', title: 'Вид АЛ за тялото' },
    { data: 'Тегло 1', title: 'Тегло' },
    { data: 'Цена 1', title: 'Цена' },
    { data: 'Вид АЛ за Пр. Капаци', title: 'Вид АЛ за Пр. Капаци' },
    { data: 'Тегло 2', title: 'Тегло' },
    { data: 'Цена 2', title: 'Цена' },
    { data: 'Вид АЛ за 3.Капаци', title: 'Вид АЛ за 3.Капаци' },
    { data: 'Тегло 3', title: 'Тегло' },
    { data: 'Цена 3', title: 'Цена' }
];

// Define columns for Data
const dataColumns = [
    { data: 'Номер', title: 'Номер' },
    { data: 'Описание', title: 'Описание' },
    { data: 'Unit cost', title: 'Unit cost' },
    { data: 'HTS Code', title: 'HTS Code' }
];

// Define columns for Plan
const planColumns = [
    { data: 'бр.', title: 'бр.' },
    { data: 'Номер', title: 'Номер' }
];

// Initialize Handsontables
const hotNom = new Handsontable(document.getElementById('grid-nom'), {
    data: [],
    columns: nomColumns,
    rowHeaders: true,
    colHeaders: true,
    minSpareRows: 50,
    contextMenu: true,
    licenseKey: 'non-commercial-and-evaluation'
});

const hotData = new Handsontable(document.getElementById('grid-data'), {
    data: [],
    columns: dataColumns,
    rowHeaders: true,
    colHeaders: true,
    minSpareRows: 50,
    contextMenu: true,
    licenseKey: 'non-commercial-and-evaluation'
});

const hotPlan = new Handsontable(document.getElementById('grid-plan'), {
    data: [],
    columns: planColumns,
    rowHeaders: true,
    colHeaders: true,
    minSpareRows: 50,
    contextMenu: true,
    licenseKey: 'non-commercial-and-evaluation'
});

async function loadData(tableName, hotInstance) {
    try {
        let { data, error } = await client.from(tableName).select('*').order('id', { ascending: true });
        if (error) {
            console.warn(`Table ${tableName} might not exist yet or empty. Error:`, error);
            data = [];
        }
        hotInstance.loadData(data && data.length > 0 ? data : []);
    } catch(e) {
        console.error("Load data error:", e);
    }
}

async function saveData(tableName, hotInstance) {
    try {
        // Get all data, filter out empty rows
        let allData = hotInstance.getData();
        let colProps = hotInstance.getSettings().columns.map(c => c.data);
        
        let validRows = allData.map(rowArray => {
            let obj = {};
            let hasData = false;
            colProps.forEach((prop, idx) => {
                obj[prop] = rowArray[idx];
                if (rowArray[idx] !== null && rowArray[idx] !== '') hasData = true;
            });
            return hasData ? obj : null;
        }).filter(r => r !== null);
        
        // Clear table and insert new
        let { error: delErr } = await client.from(tableName).delete().neq('id', 0); 
        // if table is new, this might error if no rows, it's fine.
        
        if (validRows.length > 0) {
            let { error: insErr } = await client.from(tableName).insert(validRows);
            if (insErr) throw insErr;
        }
        
        Swal.fire('Успех', 'Данните са запазени!', 'success');
        loadData(tableName, hotInstance);
    } catch (err) {
        Swal.fire('Грешка', 'Неуспешен запис: ' + err.message, 'error');
    }
}

// Initial load
window.addEventListener('load', () => {
    loadData('acc_nomenklatura', hotNom);
    loadData('acc_data', hotData);
    loadData('acc_plan', hotPlan);
});

function generateInvoice() {
    Swal.fire('Информация', 'Тази функция ще събере данните от трите таба и ще сметне финалните суми.', 'info');
}
