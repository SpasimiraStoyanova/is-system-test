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
    stretchH: 'all',
    width: '100%',
    licenseKey: 'non-commercial-and-evaluation'
});

const hotData = new Handsontable(document.getElementById('grid-data'), {
    data: [],
    columns: dataColumns,
    rowHeaders: true,
    colHeaders: true,
    minSpareRows: 50,
    contextMenu: true,
    stretchH: 'all',
    width: '100%',
    licenseKey: 'non-commercial-and-evaluation'
});

const hotPlan = new Handsontable(document.getElementById('grid-plan'), {
    data: [],
    columns: planColumns,
    rowHeaders: true,
    colHeaders: true,
    minSpareRows: 50,
    contextMenu: true,
    stretchH: 'all',
    width: '100%',
    licenseKey: 'non-commercial-and-evaluation'
});

const invoiceColumns = [
    { data: 'index', readOnly: true },
    { data: 'item_no', readOnly: true },
    { data: 'description', readOnly: true },
    { data: 'qty', type: 'numeric', readOnly: true },
    { data: 'hts_code', readOnly: true },
    { data: 'unit_cost', type: 'numeric', format: '$0,0.00', readOnly: true },
    { data: 'amount', type: 'numeric', format: '$0,0.00', readOnly: true },
    { data: 'al_content_value', type: 'numeric', format: '$0,0.00', readOnly: true },
    { data: 'total_al_value', type: 'numeric', format: '$0,0.00', readOnly: true },
    { data: 'value_of_rest', type: 'numeric', format: '$0,0.00', readOnly: true },
    { data: 'al_weight_percent', type: 'numeric', format: '0.00%', readOnly: true },
    { data: 'al_type_1', readOnly: true },
    { data: 'al_weight_1', type: 'numeric', readOnly: true },
    { data: 'al_price_1', type: 'numeric', readOnly: true },
    { data: 'al_type_2', readOnly: true },
    { data: 'al_weight_2', type: 'numeric', readOnly: true },
    { data: 'al_price_2', type: 'numeric', readOnly: true },
    { data: 'al_type_3', readOnly: true },
    { data: 'al_weight_3', type: 'numeric', readOnly: true },
    { data: 'al_price_3', type: 'numeric', readOnly: true }
];

const hotInvoice = new Handsontable(document.getElementById('grid-invoice'), {
    data: Handsontable.helper.createEmptySpreadsheetData(30, 20),
    columns: invoiceColumns,
    rowHeaders: false,
    colHeaders: true,
    nestedHeaders: [
        ['#', 'Item No', 'Description', 'Qty', 'HTS Code', 'Unit cost', 'Amount', 'Aluminum Content Value', 'Total AL Value', 'Value of the rest', 'Aluminum Content weight percentage', {label: 'Country of Smelt & Cast of Aluminum Breakdown per Aluminum Type', colspan: 9}],
        ['', '', '', '', '', '', '', '', '', '', '', 'AL type 1', 'Weight', 'Price', 'AL type 2', 'Weight', 'Price', 'AL type 3', 'Weight', 'Price']
    ],
    minSpareRows: 0,
    contextMenu: true,
    stretchH: 'all',
    width: '100%',
    className: 'htCenter htMiddle',
    wordWrap: true,
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
    let planData = hotPlan.getData().filter(r => r[0] || r[1]);
    let nomData = hotNom.getData().filter(r => r[0]);
    let htsData = hotData.getData().filter(r => r[0]);

    if (planData.length === 0) {
        Swal.fire('Грешка', 'Планът е празен!', 'error');
        return;
    }

    let invoiceRows = [];
    
    // Create lookups for faster search
    let nomMap = {};
    nomData.forEach(r => nomMap[r[0]] = r);
    
    let htsMap = {};
    htsData.forEach(r => htsMap[r[0]] = r);

    let idx = 1;
    planData.forEach(row => {
        let qty = parseFloat(row[0]) || 0;
        let itemNo = row[1];
        
        let desc = '';
        let nomRow = nomMap[itemNo];
        if (nomRow) {
            desc = nomRow[1]; // Описание е втора колона в Номенклатура
        }

        let htsCode = '';
        let unitCost = 0;
        let htsRow = htsMap[itemNo];
        if (htsRow) {
            unitCost = parseFloat(htsRow[2]) || 0; // Unit cost е 3та колона в Данни
            htsCode = htsRow[3]; // HTS Code е 4та колона в Данни
        }

        let amount = qty * unitCost;

        invoiceRows.push({
            'index': idx++,
            'item_no': itemNo,
            'description': desc,
            'qty': qty,
            'hts_code': htsCode,
            'unit_cost': unitCost, 
            'amount': amount, 
            'al_content_value': null, // pending
            'total_al_value': null, // pending
            'value_of_rest': null, // pending
            'al_weight_percent': null, // pending
            'al_type_1': '', 'al_weight_1': null, 'al_price_1': null,
            'al_type_2': '', 'al_weight_2': null, 'al_price_2': null,
            'al_type_3': '', 'al_weight_3': null, 'al_price_3': null
        });
    });

    hotInvoice.loadData(invoiceRows);
    Swal.fire('Успех', 'Колони от 1 до 7 (включително Unit Cost и Amount) са генерирани!', 'success');
}

async function fetchExchangeRate() {
    const dateVal = document.getElementById('invoice-date').value;
    if (!dateVal) return;
    try {
        const response = await fetch(`https://api.frankfurter.app/${dateVal}?from=USD&to=BGN`);
        if (!response.ok) throw new Error('Няма данни за тази дата (може би е почивен ден).');
        const data = await response.json();
        if (data && data.rates && data.rates.BGN) {
            document.getElementById('invoice-rate').value = data.rates.BGN;
        }
    } catch(err) {
        console.error('Exchange rate error:', err);
        Swal.fire('Внимание', 'Не успях да изтегля курса автоматично (вероятно е почивен ден или бъдеща дата). Въведи го ръчно.', 'warning');
    }
}

async function fetchActivePlan() {
    try {
        const { data, error } = await client.from('plan').select('*').eq('Статус', 'Активен');
        if (error) throw error;
        
        if (!data || data.length === 0) {
            Swal.fire('Информация', 'Няма намерени активни планове в системата!', 'info');
            return;
        }

        const mappedData = data.map(p => ({
            'бр.': p['Целево количество'],
            'Номер': p['Вътрешно име']
        }));
        
        hotPlan.loadData(mappedData);
        Swal.fire('Успех', `Извлечени са ${mappedData.length} записа от Активния План! Натисни "Запази промените", за да ги съхраниш.`, 'success');
    } catch(err) {
        console.error(err);
        Swal.fire('Грешка при извличане', err.message, 'error');
    }
}

function printInvoice() {
    window.print();
}
