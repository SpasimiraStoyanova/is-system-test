const SUPABASE_URL = 'https://zdythzcgcjxwbxufunuh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE';
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Define columns for Nom
const nomColumns = [
    { data: 'Номер', title: 'Описание' },
    { data: 'Описание', title: 'Вътрешно име' },
    { data: 'Тяло', title: 'Тяло' },
    { data: 'Преден капак', title: 'Преден капак' },
    { data: 'Заден капак', title: 'Заден капак' },
    { data: 'Вал', title: 'Вал' },
    { data: 'Ротор', title: 'Ротор' },
    { data: 'Статор', title: 'Статор' },
    { data: 'Макари R', title: 'Макари R' },
    { data: 'Щифтове', title: 'Щифтове' },
    { data: 'МПР 1', title: 'МПР 1' },
    { data: 'МПР 2', title: 'МПР 2' },
    { data: 'Пр. Лагер', title: 'Пр. Лагер' },
    { data: 'З. Лагер', title: 'З. Лагер' },
    { data: 'Шпилки', title: 'Шпилки' },
    { data: 'Забележка', title: 'Забележка' },
    { data: 'Папка №', title: 'Папка №' },
    { data: 'Цена на изделие лв_бр', title: 'Цена на изделие [лв./бр.]' },
    { data: 'Вид AL за тялото', title: 'Вид AL за тялото' },
    { data: 'Цена на AL Тяло с ДДС', title: 'Цена на AL Тяло [лв./бр.] с ДДС' },
    { data: 'Вид AL за пр. капак', title: 'Вид AL за пр. капак' },
    { data: 'Цена на AL на пр. капак с ДДС', title: 'Цена на AL на пр. капак [лв./бр.] с ДДС' },
    { data: 'Вид AL за з. капак', title: 'Вид AL за з. капак' },
    { data: 'Цена на AL на зад. капак с ДДС', title: 'Цена на AL на зад. капак [лв./бр.] с ДДС' },
    { data: 'Тегло Al тяло kg', title: 'Тегло Al тяло [kg]' },
    { data: 'Тегло на ротор', title: 'Тегло на ротор' },
    { data: 'Тегло АL пр. капак kg', title: 'Тегло АL пр. капак [kg]' },
    { data: 'Тегло на AL зад. капак kg', title: 'Тегло на AL зад. капак [kg]' },
    { data: 'Тегло на куплунг kg', title: 'Тегло на куплунг [kg]' },
    { data: 'СУМА AL_бр.', title: 'СУМА AL/бр.' },
    { data: 'СУМА kg', title: 'СУМА [kg]' },
    { data: 'Тегло на цялото изделие g', title: 'Тегло на цялото изделие [g]' },
    { data: 'Тегло на цялото издели_тегло на AL в', title: 'Тегло на цялото издели/тегло на AL в него' }
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

// Define columns for Materials
const materialsColumns = [
    { data: 'Вид материал', title: 'Вид материал' },
    { data: 'лв/кг с ДДС', title: 'лв/кг с ДДС' }
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
    search: true,
    filters: true,
    dropdownMenu: true,
    licenseKey: 'non-commercial-and-evaluation'
});

window.searchNom = function(query) {
    const searchPlugin = hotNom.getPlugin('search');
    searchPlugin.query(query);
    hotNom.render();
};

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

const hotMaterials = new Handsontable(document.getElementById('grid-materials'), {
    data: [],
    columns: materialsColumns,
    rowHeaders: true,
    colHeaders: true,
    minSpareRows: 20,
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
        ['#', 'Item No', 'Description', 'Qty', 'HTS Code', 'Unit cost', 'Amount', 'Aluminum<br>Content Value', 'Total<br>AL Value', 'Value of<br>the rest', 'Aluminum Content<br>weight percentage', {label: 'Country of Smelt & Cast of Aluminum Breakdown per Aluminum Type', colspan: 9}],
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
    // Set today's date in calendar by default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('invoice-date').value = today;
    const parts = today.split('-');
    document.getElementById('invoice-header-date').value = `${parts[2]}.${parts[1]}.${parts[0]}`;

    loadData('acc_nomenklatura', hotNom);
    loadData('acc_data', hotData);
    loadData('acc_plan', hotPlan);
    loadData('acc_materials', hotMaterials);
    
    // Fetch rate for today
    fetchExchangeRate();
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
        let alPercent = 0;
        
        // 9 columns for Breakdown
        let al_type_1 = '', al_weight_1 = null, al_price_1 = null;
        let al_type_2 = '', al_weight_2 = null, al_price_2 = null;
        let al_type_3 = '', al_weight_3 = null, al_price_3 = null;

        // Build materials map for pricing
        let materialsData = hotMaterials.getData().filter(r => r[0]);
        let materialsMap = {};
        materialsData.forEach(r => {
            let price = parseFloat(r[1]);
            if (!isNaN(price)) materialsMap[r[0]] = price;
        });

        let nomRow = nomMap[itemNo];
        if (nomRow) {
            desc = nomRow[1]; // Вътрешно име (или Описание)
            
            // Percentage from new Nomenklatura (last column, index 32)
            let p = parseFloat(nomRow[32]); 
            if (!isNaN(p)) {
                alPercent = p > 1 ? p / 100 : p;
            }

            // Helper to get price
            const getPrice = (typeStr, weightStr, manualPriceStr) => {
                let manual = parseFloat(manualPriceStr);
                if (!isNaN(manual) && manual > 0) return manual; // Prefer manual if filled
                
                let weight = parseFloat(weightStr) || 0;
                let matPrice = materialsMap[typeStr] || 0;
                if (weight > 0 && matPrice > 0) return weight * matPrice;
                return null;
            };

            // Type 1: Тяло
            al_type_1 = nomRow[18] || ''; // Вид AL за тялото
            al_weight_1 = parseFloat(nomRow[24]) || null; // Тегло Al тяло kg
            al_price_1 = getPrice(al_type_1, al_weight_1, nomRow[19]);

            // Type 2: Преден капак
            al_type_2 = nomRow[20] || ''; // Вид AL за пр. капак
            al_weight_2 = parseFloat(nomRow[26]) || null; // Тегло АL пр. капак kg
            al_price_2 = getPrice(al_type_2, al_weight_2, nomRow[21]);

            // Type 3: Заден капак
            al_type_3 = nomRow[22] || ''; // Вид AL за з. капак
            al_weight_3 = parseFloat(nomRow[27]) || null; // Тегло на AL зад. капак kg
            al_price_3 = getPrice(al_type_3, al_weight_3, nomRow[23]);
        }

        let htsCode = '';
        let unitCost = 0;
        let htsRow = htsMap[itemNo];
        if (htsRow) {
            unitCost = parseFloat(htsRow[2]) || 0; // Unit cost
            htsCode = htsRow[3]; // HTS Code
        }

        let amount = qty * unitCost;
        
        // Колона 8: Aluminum Content Value = Unit Cost * Процент АЛ
        let alContentValue = unitCost * alPercent;
        
        // Колона 9: Total AL Value = Qty * Aluminum Content Value
        let totalAlValue = qty * alContentValue;

        // Колона 10: Value of the rest = Amount - Total AL Value
        let valueOfRest = amount - totalAlValue;

        invoiceRows.push({
            'index': idx++,
            'item_no': itemNo,
            'description': desc,
            'qty': qty,
            'hts_code': htsCode,
            'unit_cost': unitCost, 
            'amount': amount, 
            'al_content_value': alContentValue, // Колона 8
            'total_al_value': totalAlValue, // Колона 9
            'value_of_rest': valueOfRest, // Колона 10
            'al_weight_percent': alPercent, // Колона 11
            'al_type_1': al_type_1, 'al_weight_1': al_weight_1, 'al_price_1': al_price_1,
            'al_type_2': al_type_2, 'al_weight_2': al_weight_2, 'al_price_2': al_price_2,
            'al_type_3': al_type_3, 'al_weight_3': al_weight_3, 'al_price_3': al_price_3
        });
    });

    hotInvoice.loadData(invoiceRows);
    Swal.fire('Успех', 'Генерирани са колони 1-8 и колона 11!', 'success');
}

async function fetchExchangeRate() {
    const dateVal = document.getElementById('invoice-date').value;
    if (!dateVal) return;

    // Update the invoice header date
    const parts = dateVal.split('-');
    if (parts.length === 3) {
        document.getElementById('invoice-header-date').value = `${parts[2]}.${parts[1]}.${parts[0]}`;
    }

    try {
        let response = await fetch(`https://api.frankfurter.app/${dateVal}?from=USD&to=BGN`);
        if (!response.ok) {
            // Fallback to latest if future date or weekend
            response = await fetch(`https://api.frankfurter.app/latest?from=USD&to=BGN`);
        }
        if (!response.ok) throw new Error('Няма данни за тази дата.');
        const data = await response.json();
        if (data && data.rates) {
            let rate = data.rates.BGN;
            if (!rate && data.rates.EUR) {
                // If BGN is missing (because it's pegged), use EUR rate (which matches the 0.8702 from the screenshot)
                rate = data.rates.EUR;
            }
            if (rate) {
                document.getElementById('invoice-rate').value = rate;
            }
        }
    } catch(err) {
        console.error('Exchange rate error:', err);
        Swal.fire('Внимание', 'Не успях да изтегля курса автоматично. Въведи го ръчно.', 'warning');
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
