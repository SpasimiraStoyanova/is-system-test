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
    { data: 'Тегло на цялото издели_тегло на AL в', title: 'Тегло на цялото издели/тегло на AL в него' },
    { data: 'Процент на АЛ в детайл', title: 'Процент на АЛ в детайл' }
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
// Фиксирани ширини на колоните на Номенклатурата (без автоматично измерване, което стискаше колоните)
const nomColWidths = { 0: 260, 1: 130, 15: 220, 16: 90 };

const hotNom = new Handsontable(document.getElementById('grid-nom'), {
    data: [],
    columns: nomColumns,
    rowHeaders: true,
    colHeaders: true,
    minSpareRows: 50,
    contextMenu: true,
    stretchH: 'all',
    width: '100%',
    colWidths: (index) => nomColWidths[index] || 110,
    rowHeights: 28,
    autoRowSize: false,
    autoColumnSize: false,
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

// Renderers for formatted and clean empty cell display
function currencyRenderer(instance, td, row, col, prop, value, cellProperties) {
    Handsontable.renderers.NumericRenderer.apply(this, arguments);
    if (value !== null && value !== undefined && value !== '') {
        let num = parseFloat(value);
        if (!isNaN(num)) {
            td.innerText = '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            td.className = td.className + ' htRight';
            return;
        }
    }
    td.innerText = '';
}

function percentRenderer(instance, td, row, col, prop, value, cellProperties) {
    Handsontable.renderers.NumericRenderer.apply(this, arguments);
    if (value !== null && value !== undefined && value !== '') {
        let num = parseFloat(value);
        if (!isNaN(num)) {
            td.innerText = (num * 100).toFixed(2) + '%';
            td.className = td.className + ' htCenter';
            return;
        }
    }
    td.innerText = '';
}

function weightRenderer(instance, td, row, col, prop, value, cellProperties) {
    Handsontable.renderers.NumericRenderer.apply(this, arguments);
    if (value !== null && value !== undefined && value !== '') {
        let num = parseFloat(value);
        if (!isNaN(num)) {
            td.innerText = num.toFixed(3);
            td.className = td.className + ' htRight';
            return;
        }
    }
    td.innerText = '';
}

const invoiceColumns = [
    { data: 'index', readOnly: true },
    { data: 'item_no', readOnly: true },
    { data: 'description', readOnly: false },
    { data: 'qty', type: 'numeric', readOnly: false },
    { data: 'hts_code', readOnly: false },
    { data: 'unit_cost', renderer: currencyRenderer, readOnly: false },
    { data: 'amount', renderer: currencyRenderer, readOnly: true },
    { data: 'al_content_value', renderer: currencyRenderer, readOnly: false },
    { data: 'total_al_value', renderer: currencyRenderer, readOnly: true },
    { data: 'value_of_rest', renderer: currencyRenderer, readOnly: true },
    { data: 'al_weight_percent', renderer: percentRenderer, readOnly: false },
    { data: 'al_type_1', readOnly: false },
    { data: 'al_weight_1', renderer: weightRenderer, readOnly: false },
    { data: 'al_price_1', renderer: currencyRenderer, readOnly: false },
    { data: 'al_type_2', readOnly: false },
    { data: 'al_weight_2', renderer: weightRenderer, readOnly: false },
    { data: 'al_price_2', renderer: currencyRenderer, readOnly: false },
    { data: 'al_type_3', readOnly: false },
    { data: 'al_weight_3', renderer: weightRenderer, readOnly: false },
    { data: 'al_price_3', renderer: currencyRenderer, readOnly: false }
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
    afterChange: function(changes, source) {
        if (!changes || source === 'loadData' || source === 'calc') return;
        let setProps = [];
        changes.forEach(([row, prop, oldVal, newVal]) => {
            if (oldVal === newVal) return;
            if (prop === 'qty' || prop === 'unit_cost' || prop === 'al_content_value') {
                let rowData = hotInvoice.getSourceDataAtRow(row);
                if (!rowData) return;
                let qty = parseFloat(rowData.qty) || 0;
                let unitCost = parseFloat(rowData.unit_cost) || 0;
                let alContent = parseFloat(rowData.al_content_value) || 0;
                
                let amount = qty * unitCost;
                let totalAl = (alContent > 0) ? (qty * alContent) : null;
                let valueRest = (totalAl !== null) ? (amount - totalAl) : null;
                
                setProps.push([row, 'amount', amount]);
                setProps.push([row, 'total_al_value', totalAl]);
                setProps.push([row, 'value_of_rest', valueRest]);
            }
        });
        if (setProps.length > 0) {
            hotInvoice.setDataAtRowProp(setProps, 'calc');
            setTimeout(() => {
                let total = hotInvoice.getData().reduce((sum, r) => sum + (parseFloat(r[6]) || 0), 0);
                document.getElementById('invoice-total').innerText = total.toFixed(2);
            }, 50);
        }
    },
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
        hotInstance.render();
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
        
        if (validRows.length === 0) {
            Swal.fire('Внимание', 'Няма въведени данни за запазване!', 'warning');
            return;
        }

        // Clear table and insert new
        let { error: delErr } = await client.from(tableName).delete().neq('id', 0); 
        
        let { error: insErr } = await client.from(tableName).insert(validRows);
        
        // If insert failed due to missing schema column (e.g. 'Процент на АЛ в детайл' not yet added to Supabase)
        if (insErr && insErr.message && insErr.message.includes("schema cache")) {
            console.warn("Schema cache error detected, retrying without unmapped columns:", insErr.message);
            let fallbackRows = validRows.map(r => {
                let copy = { ...r };
                delete copy['Процент на АЛ в детайл'];
                delete copy['Процент АЛ в детайл'];
                return copy;
            });
            let retry = await client.from(tableName).insert(fallbackRows);
            if (!retry.error) {
                Swal.fire('Запазено с предупреждение', 'Данните са запазени, но колоната "Процент на АЛ в детайл" все още не съществува в Supabase таблицата. Добавете я през SQL Editor: ALTER TABLE public.acc_nomenklatura ADD COLUMN "Процент на АЛ в детайл" text;', 'warning');
                loadData(tableName, hotInstance);
                return;
            }
            throw retry.error;
        }

        if (insErr) throw insErr;
        
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

    // Default month/year for the plan fetch
    document.getElementById('plan-month').value = PLAN_MONTHS[new Date().getMonth()];
    document.getElementById('plan-year').value = new Date().getFullYear();

    loadData('acc_nomenklatura', hotNom);
    loadData('acc_data', hotData);
    loadData('acc_plan', hotPlan);
    loadData('acc_materials', hotMaterials);
    
    // Fetch rate for today
    fetchExchangeRate();
});

function generateInvoice() {
    let planData = hotPlan.getData().filter(r => r && (r[0] || r[1]));
    let nomData = hotNom.getData().filter(r => r && (r[0] || r[1] || r[2] || r[3] || r[4] || r[5]));
    let htsData = hotData.getData().filter(r => r && (r[0] || r[1]));

    if (planData.length === 0) {
        Swal.fire('Грешка', 'Планът е празен!', 'error');
        return;
    }

    const normalizeKey = (str) => {
        if (!str) return '';
        return String(str)
            .trim()
            .toLowerCase()
            .replace(/,/g, '.')
            .replace(/\s+/g, ' ')
            // Cyrillic to Latin homoglyphs for reliable cross-matching
            .replace(/а/g, 'a')
            .replace(/в/g, 'b')
            .replace(/с/g, 'c')
            .replace(/е/g, 'e')
            .replace(/к/g, 'k')
            .replace(/м/g, 'm')
            .replace(/н/g, 'h')
            .replace(/о/g, 'o')
            .replace(/р/g, 'p')
            .replace(/т/g, 't')
            .replace(/х/g, 'x');
    };

    const parseNumber = (val) => {
        if (val === null || val === undefined || val === '') return null;
        let str = String(val).replace(',', '.').replace(/[^\d.-]/g, '');
        let num = parseFloat(str);
        return isNaN(num) ? null : num;
    };

    const addLookup = (map, rawKey, value) => {
        if (!rawKey) return;
        let k = normalizeKey(rawKey);
        if (!k) return;
        if (!map.has(k)) map.set(k, value);
        let noSpace = k.replace(/\s+/g, '');
        if (!map.has(noSpace)) map.set(noSpace, value);
    };

    const getLookup = (map, rawKey) => {
        if (!rawKey) return null;
        let k = normalizeKey(rawKey);
        if (!k) return null;
        return map.get(k) || map.get(k.replace(/\s+/g, '')) || null;
    };

    // Build lookups for Nomenklatura
    let nomMap = new Map();
    let nomComponentMap = new Map();

    nomData.forEach(r => {
        // r[0]: Описание, r[1]: Номер/Вътрешно име
        addLookup(nomMap, r[1], r);
        addLookup(nomMap, r[0], r);

        // Component columns in Nomenklatura:
        // 4: Заден капак (напр. 'Ф62,7 201А')
        // 3: Преден капак
        // 2: Тяло
        // 5: Вал
        // 6: Ротор
        // 7: Статор
        // 8: Макари R
        [4, 3, 2, 5, 6, 7, 8].forEach(colIdx => {
            let val = r[colIdx];
            if (val) {
                addLookup(nomComponentMap, val, r);
            }
        });
    });

    // Build lookups for Data (HTS & Unit cost)
    let htsMap = new Map();
    htsData.forEach(r => {
        // r[0]: Номер, r[1]: Описание
        addLookup(htsMap, r[0], r);
        addLookup(htsMap, r[1], r);
    });

    // Materials map for aluminum price calculation
    let materialsData = hotMaterials.getData().filter(r => r && r[0]);
    let materialsMap = {};
    materialsData.forEach(r => {
        let priceStr = String(r[1] || '').replace(',', '.').replace(/[^\d.-]/g, '');
        let price = parseFloat(priceStr);
        if (!isNaN(price)) materialsMap[r[0]] = price;
    });

    let invoiceRows = [];
    let idx = 1;
    let totalUSD = 0;

    planData.forEach(row => {
        let qty = parseFloat(row[0]) || 0;
        let itemNo = row[1] || '';
        
        // 1. Resolve Nomenklatura row:
        // Try exact code/description, then try component columns (e.g. Заден капак 'Ф62,7 201А')
        let nomRow = getLookup(nomMap, itemNo) || getLookup(nomComponentMap, itemNo);

        // 2. Resolve HTS / Data row:
        // Try direct itemNo lookup, or via resolved Nomenklatura code/description
        let htsRow = getLookup(htsMap, itemNo);
        if (!htsRow && nomRow) {
            htsRow = getLookup(htsMap, nomRow[1]) || getLookup(htsMap, nomRow[0]);
        }

        // 3. Resolve Description
        let desc = '';
        if (htsRow && htsRow[1]) {
            desc = htsRow[1];
        } else if (nomRow && nomRow[0]) {
            desc = nomRow[0];
        } else if (nomRow && nomRow[1]) {
            desc = nomRow[1];
        } else {
            desc = itemNo;
        }

        // 4. Resolve HTS Code
        let htsCode = '';
        if (htsRow && htsRow[3]) {
            htsCode = String(htsRow[3]).trim();
        }

        // 5. Resolve Unit Cost:
        // Priority 1: Unit cost from Data (htsRow[2])
        // Priority 2: Цена на изделие за брой from Nomenklatura (nomRow[17])
        let unitCost = 0;
        if (htsRow) {
            let c = parseNumber(htsRow[2]);
            if (c !== null && c > 0) unitCost = c;
        }
        if ((!unitCost || unitCost === 0) && nomRow) {
            let c = parseNumber(nomRow[17]); // "Цена на изделие лв_бр"
            if (c !== null && c > 0) unitCost = c;
        }

        let amount = qty * unitCost;

        // Aluminum Breakdown & Percent
        let alPercent = null;
        let al_type_1 = '', al_weight_1 = null, al_price_1 = null;
        let al_type_2 = '', al_weight_2 = null, al_price_2 = null;
        let al_type_3 = '', al_weight_3 = null, al_price_3 = null;

        if (nomRow) {
            // Процент на АЛ в детайл (колона индекс 33). Приема 100, 100%, 100 %, 1, 0,5
            let pRaw = nomRow[33];
            let p = parseNumber(pRaw);
            if (p !== null && p > 0) {
                alPercent = (String(pRaw).includes('%') || p > 1) ? p / 100 : p;
            } else {
                alPercent = null;
            }

            const getPrice = (typeStr, weightStr, manualPriceStr) => {
                let manual = parseNumber(manualPriceStr);
                if (manual !== null && manual > 0) return manual; // Manual override if entered
                let weight = parseNumber(weightStr) || 0;
                let matPrice = materialsMap[typeStr] || 0;
                if (weight > 0 && matPrice > 0) return weight * matPrice;
                return null;
            };

            // Type 1: Тяло
            al_type_1 = nomRow[18] || ''; // Вид AL за тялото
            al_weight_1 = parseNumber(nomRow[24]); // Тегло Al тяло kg
            al_price_1 = getPrice(al_type_1, al_weight_1, nomRow[19]);

            // Type 2: Преден капак
            al_type_2 = nomRow[20] || ''; // Вид AL за пр. капак
            al_weight_2 = parseNumber(nomRow[26]); // Тегло АL пр. капак kg
            al_price_2 = getPrice(al_type_2, al_weight_2, nomRow[21]);

            // Type 3: Заден капак
            al_type_3 = nomRow[22] || ''; // Вид AL за з. капак
            al_weight_3 = parseNumber(nomRow[27]); // Тегло на AL зад. капак kg
            al_price_3 = getPrice(al_type_3, al_weight_3, nomRow[23]);
        }

        // Excluded HTS Code or Non-aluminum check
        let isExcludedHts = (String(htsCode).trim() === '8543.70.4500');
        let rawAlContentValue = (al_price_1 || 0) + (al_price_2 || 0) + (al_price_3 || 0);
        let hasAluminum = !isExcludedHts && (rawAlContentValue > 0 || (alPercent !== null && alPercent > 0));

        let alContentValue = null;
        let totalAlValue = null;
        let valueOfRest = null;
        let alWeightPercent = null;

        if (hasAluminum) {
            alContentValue = rawAlContentValue > 0 ? rawAlContentValue : null;
            if (alContentValue !== null) {
                totalAlValue = qty * alContentValue;
                valueOfRest = amount - totalAlValue;
            }
            if (alPercent !== null && alPercent > 0) {
                alWeightPercent = alPercent;
            }

            // Запазваме само видовете алуминий, които реално участват с тегло или цена
            if (!al_weight_1 && !al_price_1) { al_type_1 = ''; al_weight_1 = null; al_price_1 = null; }
            if (!al_weight_2 && !al_price_2) { al_type_2 = ''; al_weight_2 = null; al_price_2 = null; }
            if (!al_weight_3 && !al_price_3) { al_type_3 = ''; al_weight_3 = null; al_price_3 = null; }
        } else {
            // Без алуминий или изключен HTS код: всички алуминиеви колони остават напълно празни
            alContentValue = null;
            totalAlValue = null;
            valueOfRest = null;
            alWeightPercent = null;
            al_type_1 = ''; al_weight_1 = null; al_price_1 = null;
            al_type_2 = ''; al_weight_2 = null; al_price_2 = null;
            al_type_3 = ''; al_weight_3 = null; al_price_3 = null;
        }

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
            'al_weight_percent': alWeightPercent, // Колона 11
            'al_type_1': al_type_1, 'al_weight_1': al_weight_1, 'al_price_1': al_price_1,
            'al_type_2': al_type_2, 'al_weight_2': al_weight_2, 'al_price_2': al_price_2,
            'al_type_3': al_type_3, 'al_weight_3': al_weight_3, 'al_price_3': al_price_3
        });
        
        totalUSD += amount;
    });

    hotInvoice.loadData(invoiceRows);
    document.getElementById('invoice-total').innerText = totalUSD.toFixed(2);
    Swal.fire('Успех', 'INVOICE е генериран успешно!', 'success');
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

const PLAN_MONTHS = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни', 'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'];

// Извлича ВСИЧКИ детайли от плана за избран месец/година, независимо от статуса
// (Активен, Опакован, Изпратен и т.н.). Еднаквите номера се сумират.
async function fetchMonthPlan() {
    try {
        const month = document.getElementById('plan-month').value;
        const year = parseInt(document.getElementById('plan-year').value, 10);
        if (!month || !year) {
            Swal.fire('Внимание', 'Избери месец и година!', 'warning');
            return;
        }
        const monthNum = String(PLAN_MONTHS.indexOf(month) + 1);

        const { data, error } = await client.from('plan').select('*').eq('Година', year);
        if (error) throw error;

        const rows = (data || []).filter(p => {
            const m = String(p['Месец'] || '').trim();
            return m.toLowerCase() === month.toLowerCase() || m === monthNum || m === monthNum.padStart(2, '0');
        });

        if (rows.length === 0) {
            Swal.fire('Информация', `Няма намерени записи в плана за ${month} ${year}!`, 'info');
            return;
        }

        const totals = new Map();
        rows.forEach(p => {
            const name = String(p['Вътрешно име'] || '').trim();
            if (!name) return;
            totals.set(name, (totals.get(name) || 0) + (parseFloat(p['Целево количество']) || 0));
        });

        const mappedData = [...totals.entries()].map(([name, qty]) => ({ 'бр.': qty, 'Номер': name }));

        hotPlan.loadData(mappedData);
        Swal.fire('Успех', `Извлечени са ${mappedData.length} детайла от плана за ${month} ${year} (всички статуси). Натисни "Запази промените", за да ги съхраниш.`, 'success');
    } catch (err) {
        console.error(err);
        Swal.fire('Грешка при извличане', err.message, 'error');
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

window.exportToExcel = function() {
    let invoiceNo = document.getElementById('invoice-number') ? document.getElementById('invoice-number').value : '0000000511';
    let dateStr = document.getElementById('invoice-header-date').value || '';
    let rate = document.getElementById('invoice-rate').value || '';
    let invoiceDate = document.getElementById('invoice-date').value || '';
    
    let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
    html += '<head><meta charset="utf-8"></head><body>';
    html += '<table style="font-family: Arial, sans-serif; font-size: 11pt; border-collapse: collapse;">';
    
    // Header
    html += '<tr><td colspan="4" style="font-size: 18pt; font-weight: bold; text-align: left;">INVOICE</td></tr>';
    html += '<tr><td colspan="4" style="font-size: 14pt; font-weight: bold; text-align: left;">No.' + invoiceNo + '/' + dateStr + '</td></tr>';
    html += '<tr><td colspan="4"></td></tr>';
    
    html += '<tr><td colspan="3" style="border-bottom: 1px solid #000; padding-bottom: 5px;">Customer:</td><td colspan="3" style="border-bottom: 1px solid #000; padding-bottom: 5px;">Seller:</td></tr>';
    html += '<tr><td colspan="3">Advanced Micro Controls Incorporated</td><td colspan="3">AMCI AD</td></tr>';
    html += '<tr><td colspan="3">20 Gear Drive, Plymouth Industrial Park</td><td colspan="3">14 Lubata str.</td></tr>';
    html += '<tr><td colspan="3"></td><td colspan="3">Sofia 1407, Bulgaria</td></tr>';
    html += '<tr><td colspan="4"></td></tr>';
    
    // Rate Table at top right
    html += '<tr><td colspan="15"></td><td colspan="2" style="border: 1px solid #000; background: #e0e0e0; font-weight: bold; text-align: center;">Дата</td><td colspan="2" style="border: 1px solid #000; background: #e0e0e0; font-weight: bold; text-align: center;">USD/EUR</td></tr>';
    html += '<tr><td colspan="15"></td><td colspan="2" style="border: 1px solid #000; text-align: center;">' + invoiceDate + '</td><td colspan="2" style="border: 1px solid #000; text-align: center;">' + rate + '</td></tr>';
    html += '<tr><td colspan="4"></td></tr>';
    
    // Table Headers
    let exportHeaders = [
        '#', 'Item No', 'Description', 'Qty', 'HTS Code', 'Unit cost', 'Amount', 
        'Aluminum Content Value', 'Total AL Value', 'Value of the rest', 'Aluminum Content weight percentage', 
        'AL type 1', 'Weight', 'Price', 'AL type 2', 'Weight', 'Price', 'AL type 3', 'Weight', 'Price'
    ];
    let colWidths = [40, 120, 350, 60, 110, 80, 90, 130, 100, 100, 130, 100, 70, 70, 100, 70, 70, 100, 70, 70];
    
    html += '<tr>';
    exportHeaders.forEach((h, i) => {
        html += '<td style="background-color: #d9d9d9; font-weight: bold; border: 1px solid #000; text-align: center; vertical-align: middle; width: ' + colWidths[i] + 'px; padding: 5px;">' + h + '</td>';
    });
    html += '</tr>';
    
    // Data
    let data = hotInvoice.getData();
    data.forEach((r, idx) => {
        let bg = (idx % 2 === 0) ? '#ffffff' : '#f2f2f2';
        html += '<tr style="background-color: ' + bg + ';">';
        r.forEach((cell, cellIdx) => {
            let val = '';
            if (cell !== null && cell !== undefined && cell !== '') {
                if (cellIdx === 10) { // Aluminum Content weight percentage
                    let num = parseFloat(cell);
                    val = !isNaN(num) ? (num * 100).toFixed(2) + '%' : cell;
                } else if ([5, 6, 7, 8, 9, 13, 16, 19].includes(cellIdx)) { // Currency
                    let num = parseFloat(cell);
                    val = !isNaN(num) ? '$' + num.toFixed(2) : cell;
                } else if ([12, 15, 18].includes(cellIdx)) { // Weight
                    let num = parseFloat(cell);
                    val = !isNaN(num) ? num.toFixed(3) : cell;
                } else {
                    val = cell;
                }
            }
            html += '<td style="border: 1px solid #000; padding: 5px; text-align: center;">' + val + '</td>';
        });
        html += '</tr>';
    });
    
    // Total
    let total = document.getElementById('invoice-total').innerText;
    html += '<tr><td colspan="5"></td><td style="font-weight: bold; border: 1px solid #000; text-align: right; font-size: 14px; padding: 5px;">TOTAL USD</td><td style="font-weight: bold; border: 1px solid #000; text-align: center; font-size: 14px; padding: 5px;">$' + total + '</td></tr>';
    html += '<tr><td colspan="4"></td></tr>';
    
    // Footer
    let footers = ['Shipment: C.I.F New York', 'Country of origin: Bulgaria', 'Payment Details: Bank Transfer', 'United Bulgarian Bank', 'IBAN:BG29UBBS888100479603', 'Swift:UBBSBGSF'];
    footers.forEach(f => {
        html += '<tr><td colspan="5">' + f + '</td></tr>';
    });
    
    html += '</table></body></html>';
    
    let blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    let exportDate = document.getElementById('invoice-date').value || 'export';
    a.download = "Invoice_" + exportDate + ".xls";
    a.click();
    URL.revokeObjectURL(url);
};

