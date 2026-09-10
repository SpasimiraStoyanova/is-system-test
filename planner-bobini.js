const SUPABASE_URL = 'https://zdythzcgcjxwbxufunuh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let staticCache = {
    isLoaded: false,
    bomData: [],
    routesData: [],
    nomData: [],
    nomMap: {},
    routesByDetail: {},
    bomChildrenMap: {}
};

let globalState = {
    checkedIn: [],
    targetItems: [],
    quotas: [],
    otcheti: []
};

window.onload = async function() {
    const datePicker = document.getElementById('date-picker');
    if (datePicker) {
        datePicker.value = getTodayString();
        datePicker.addEventListener('change', loadData);
    }
    await initialFetch();
    loadData();
    setInterval(loadData, 15000); 
};

function getTodayString() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function fetchAll(table, orderCol) {
    let allData = [];
    let from = 0;
    const step = 1000;
    while(true) {
        let query = client.from(table).select('*').range(from, from + step - 1);
        if (orderCol) query = query.order(orderCol, {ascending: true});
        let { data, error } = await query;
        if (error || !data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < step) break;
        from += step;
    }
    return { data: allData };
}

async function initialFetch() {
    try {
        const [bomRes, routesRes, nomRes] = await Promise.all([
            fetchAll('bom'),
            fetchAll('marshruti'),
            fetchAll('Номенклатура')
        ]);

        staticCache.bomData = bomRes.data || [];
        staticCache.routesData = routesRes.data || [];
        staticCache.nomData = nomRes.data || [];

        staticCache.nomData.forEach(n => {
            if (n['ID Детайл']) staticCache.nomMap[String(n['ID Детайл']).trim().toLowerCase()] = n;
        });

        staticCache.routesData.forEach(r => {
            let code = String(r['Код на детайла']).trim().toLowerCase();
            if(!staticCache.routesByDetail[code]) staticCache.routesByDetail[code] = [];
            staticCache.routesByDetail[code].push(r);
        });

        let bomDataSorted = staticCache.bomData.sort((a, b) => String(a['ID Компонент']).localeCompare(String(b['ID Компонент'])));
        bomDataSorted.forEach(b => {
            let p = String(b['ID Родител']).trim().toLowerCase();
            if(!staticCache.bomChildrenMap[p]) staticCache.bomChildrenMap[p] = [];
            staticCache.bomChildrenMap[p].push(b);
        });

        staticCache.isLoaded = true;
    } catch (err) {
        console.error("Грешка при зареждане на справочници: " + err.message);
    }
}

let firstLoad = true;

async function loadData() {
    if (!staticCache.isLoaded) return;
    
    if (firstLoad) {
        document.getElementById('loading').style.display = 'flex';
        document.getElementById('main-layout').style.display = 'none';
    }

    try {
        const selectedDateStr = document.getElementById('date-picker').value;
        let nextDay = new Date(selectedDateStr);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split('T')[0];

        // Fetch Plans (Active only)
        const plansRes = await client.from('plan').select('*').in('Статус', ['Активен', 'Опакован']); // Assuming active
        // Fetch checkins for the selected date
        const checkinRes = await client.from('chekiraniya').select('*').gte('Време', selectedDateStr + 'T00:00:00').lt('Време', nextDayStr + 'T00:00:00');
        // Fetch otcheti for these operations (to calculate progress)
        const otchetiRes = await client.from('otcheti').select('*').eq('Статус', 'Отчетено');
        // Fetch quotas
        const quotasRes = await client.from('planner_bobini').select('*').eq('date', selectedDateStr);

        // Fetch personal to filter by department and map emails
        const personalRes = await client.from('personal').select('Име, Имейл, Длъжност').eq('Статус', 'Активен');
        let personalData = personalRes.data || [];
        
        let emailToName = {};
        let validNames = new Set();

        personalData.forEach(p => {
            let name = String(p['Име'] || '').trim();
            let email = String(p['Имейл'] || '').trim().toLowerCase();
            if (email && name) emailToName[email] = name;
            
            if (p['Длъжност'] && p['Длъжност'].toLowerCase().includes('бобин') && name) {
                validNames.add(name);
            }
        });

        let activePlans = plansRes.data || [];
        
        let chekiraniyaData = checkinRes.data || [];
        globalState.otcheti = otchetiRes.data || [];
        globalState.quotas = quotasRes.data || [];

        // Build list of checked in operators
        let present = new Set();
        chekiraniyaData.forEach(r => {
            let email = String(r['Имейл'] || '').trim().toLowerCase();
            let nameFromRow = String(r['Име'] || '').trim();
            let name = nameFromRow || emailToName[email];
            
            if (name && validNames.has(name)) present.add(name);
        });
        globalState.checkedIn = Array.from(present).sort();

        buildTargetItems(activePlans);
        renderAssignUI();
        renderDashboardUI();

        if (firstLoad) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('main-layout').style.display = 'flex';
            firstLoad = false;
        }

    } catch(err) {
        console.error(err);
        document.getElementById('loading').innerHTML = '<div style="color:red;">Грешка при зареждане.</div>';
    }
}

function buildTargetItems(plansData) {
    let planMap = {};
    let targetNodesMap = {}; // key: "DetailName___OperationName"

    plansData.forEach(p => { 
        let originalPlanCode = String(p['Вътрешно име']).trim();
        let actualBomName = originalPlanCode;
        let targetQty = parseFloat(p['Целево количество']) || 0;

        let translated = staticCache.nomData.find(n => String(n['Вътрешно име']).trim() === originalPlanCode);
        if (translated && translated['ID Детайл']) {
            actualBomName = String(translated['ID Детайл']).trim();
        }

        function traverseAndAdd(parentName, currentCode, requiredQty) {
            let currentCodeLower = currentCode.toLowerCase();
            let nomEntry = staticCache.nomMap[currentCodeLower] || {};
            let children = staticCache.bomChildrenMap[currentCodeLower] || [];
            
            let isRawMaterial = (children.length === 0) && (!staticCache.routesByDetail[currentCodeLower]);
            if (isRawMaterial) return;

            let partType = (nomEntry['Тип'] || '').trim();
            let typeStr = (partType + " " + currentCode).toLowerCase().replace(/[\s\.\-\_]+/g, '');

            let isStator = typeStr.includes("статор");
            let isRotor = typeStr.includes("ротор") && typeStr.includes("пакет");
            let isTransformer = typeStr.includes("трансформатор");
            let isToroid = typeStr.includes("тороид");

            if (isStator || isRotor || isTransformer || isToroid) {
                let validOperations = [];
                if (isStator) validOperations.push("Навиване");
                if (isRotor) validOperations.push("Навиване на роторен пакет", "Спояване на роторни намотки");
                if (isTransformer || isToroid) validOperations.push("Навиване", "Спояване");

                // Check actual routes
                let routes = staticCache.routesByDetail[currentCodeLower] || [];
                routes.forEach(r => {
                    let opName = String(r['Операция']).trim();
                    if (validOperations.includes(opName) || validOperations.some(v => opName.toLowerCase().includes(v.toLowerCase()))) {
                        let key = currentCode + "___" + opName;
                        if (!targetNodesMap[key]) {
                            targetNodesMap[key] = {
                                detailName: currentCode,
                                operationName: opName,
                                planQty: 0
                            };
                        }
                        targetNodesMap[key].planQty += requiredQty;
                    }
                });
            }

            children.forEach(c => {
                let childQty = parseFloat(c['Количество']) || 1;
                let cCode = String(c['ID Компонент']).trim();
                traverseAndAdd(currentCode, cCode, requiredQty * childQty);
            });
        }
        
        traverseAndAdd("", actualBomName, targetQty);
    });

    globalState.targetItems = Object.values(targetNodesMap);
    // Sort items logically
    globalState.targetItems.sort((a,b) => a.detailName.localeCompare(b.detailName));
}

function renderAssignUI() {
    let html = '';
    const dateStr = document.getElementById('date-picker').value;
    
    if (globalState.checkedIn.length === 0) {
        html = '<div style="color:#94a3b8;">Няма чекирани оператори днес. Възлагането на задачи е заключено.</div>';
    } else {
        globalState.checkedIn.forEach(opName => {
            // Find if there's already an assigned quota for this operator today
            let existingQuotas = globalState.quotas.filter(q => q.operator_name === opName);
            
            html += `<div class="operator-row">
                <div class="operator-name">👤 ${opName}</div>
                <div style="flex:1; display:flex; flex-direction:column; gap:5px;">
            `;
            
            existingQuotas.forEach(q => {
                html += `
                    <div style="display:flex; gap:10px; align-items:center; background:#1e293b; padding:5px; border-radius:4px;">
                        <span style="flex:1;">${q.detail_name} - ${q.operation_name}</span>
                        <strong style="color:#10b981;">${q.qty} бр.</strong>
                        <button onclick="deleteQuota('${q.id}')" style="background:#ef4444; border:none; padding:4px 8px; border-radius:4px; color:white; cursor:pointer;">X</button>
                    </div>
                `;
            });

            html += `
                    <div style="display:flex; gap:10px;">
                        <select id="sel_${opName}">
                            <option value="">-- Избери детайл и операция --</option>
                            ${globalState.targetItems.map(t => `<option value="${t.detailName}___${t.operationName}">${t.detailName} - ${t.operationName}</option>`).join('')}
                        </select>
                        <input type="number" id="qty_${opName}" placeholder="Бр." min="1">
                        <button class="btn-assign" onclick="assignQuota('${opName}')">Запази</button>
                    </div>
                </div>
            </div>`;
        });
    }
    document.getElementById('w-assign').innerHTML = html;
}

function renderDashboardUI() {
    let html = '';
    const dateStr = document.getElementById('date-picker').value;

    globalState.targetItems.forEach(item => {
        // Calculate completed qty for this detail + operation
        let completedQty = 0;
        globalState.otcheti.forEach(r => {
            let dName = String(r['ID Детайл']).trim().toLowerCase();
            let oName = String(r['Операция']).trim().toLowerCase();
            let isManual = (r['Оператор'] === 'СИСТЕМА (Ръчно добавен)' || r['Оператор'] === '💉 СИСТЕМА (Ръчно добавен)' || (r['Оператор'] === 'СИСТЕМА (Корекция наличност)' && parseFloat(r['Количество']) > 0));
            if (!isManual && dName === item.detailName.toLowerCase() && oName === item.operationName.toLowerCase()) {
                completedQty += parseFloat(r['Количество']) || 0;
            }
        });

        // Calculate Daily Pace (sum of all quotas for this item today)
        let dailyPace = 0;
        globalState.quotas.forEach(q => {
            if (q.detail_name === item.detailName && q.operation_name === item.operationName) {
                dailyPace += q.qty;
            }
        });

        let remaining = Math.max(0, item.planQty - completedQty);
        let progressPct = item.planQty > 0 ? (completedQty / item.planQty) * 100 : 0;
        if(progressPct > 100) progressPct = 100;

        let etaStr = "Няма зададено темпо";
        if (remaining === 0) {
            etaStr = '<span class="status-ok">Приключен</span>';
        } else if (dailyPace > 0) {
            let daysRemaining = Math.ceil(remaining / dailyPace);
            let etaDate = new Date();
            etaDate.setDate(etaDate.getDate() + daysRemaining);
            let formattedDate = `${String(etaDate.getDate()).padStart(2,'0')}.${String(etaDate.getMonth()+1).padStart(2,'0')}.${etaDate.getFullYear()}`;
            etaStr = `<span class="status-warning">След ${daysRemaining} работни дни (${formattedDate})</span>`;
        }

        html += `
            <div class="dash-card">
                <div class="dash-card-header">${item.detailName}<br><span style="font-size:0.8em; color:#94a3b8; font-weight:normal;">${item.operationName}</span></div>
                
                <div class="dash-stat"><span class="dash-stat-label">Месечен План:</span> <span class="dash-stat-val">${item.planQty} бр.</span></div>
                <div class="dash-stat"><span class="dash-stat-label">Изработени:</span> <span class="dash-stat-val" style="color:#10b981;">${completedQty} бр.</span></div>
                <div class="dash-stat"><span class="dash-stat-label">Остават:</span> <span class="dash-stat-val" style="color:#ef4444;">${remaining} бр.</span></div>
                
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: ${progressPct}%;"></div>
                </div>

                <div class="dash-stat" style="margin-top:15px; border-top:1px solid rgba(255,255,255,0.1); padding-top:10px;">
                    <span class="dash-stat-label">Зададени днес (Темпо):</span> <span class="dash-stat-val" style="color:#38bdf8;">${dailyPace} бр./ден</span>
                </div>
                <div class="dash-stat">
                    <span class="dash-stat-label">Прогноза:</span> <span class="dash-stat-val">${etaStr}</span>
                </div>
            </div>
        `;
    });

    if (globalState.targetItems.length === 0) {
        html = '<div style="color:#94a3b8; width:100%; text-align:center; padding:20px;">Няма заредени статори/ротори в активните планове.</div>';
    }

    document.getElementById('w-dashboard').innerHTML = html;
}

async function assignQuota(operatorName) {
    const sel = document.getElementById('sel_' + operatorName);
    const qtyInput = document.getElementById('qty_' + operatorName);
    const dateStr = document.getElementById('date-picker').value;

    const val = sel.value;
    const qty = parseInt(qtyInput.value);

    if (!val || !qty || qty <= 0) {
        alert("Моля, изберете детайл и въведете валидно количество.");
        return;
    }

    const [detailName, operationName] = val.split('___');

    const loader = document.getElementById('loading');
    loader.style.display = 'flex';
    document.getElementById('main-layout').style.display = 'none';

    try {
        const { error } = await client.from('planner_bobini').insert([{
            date: dateStr,
            operator_name: operatorName,
            detail_name: detailName,
            operation_name: operationName,
            qty: qty
        }]);

        if (error) throw error;
        await loadData(); // refresh UI
    } catch(err) {
        alert("Грешка при запис: " + err.message);
        loader.style.display = 'none';
        document.getElementById('main-layout').style.display = 'flex';
    }
}

async function deleteQuota(id) {
    if(!confirm("Сигурни ли сте, че искате да изтриете тази норма?")) return;
    
    const loader = document.getElementById('loading');
    loader.style.display = 'flex';
    document.getElementById('main-layout').style.display = 'none';

    try {
        const { error } = await client.from('planner_bobini').delete().eq('id', id);
        if (error) throw error;
        await loadData();
    } catch(err) {
        alert("Грешка при изтриване: " + err.message);
        loader.style.display = 'none';
        document.getElementById('main-layout').style.display = 'flex';
    }
}
