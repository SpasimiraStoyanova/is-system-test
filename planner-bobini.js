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
    otcheti: [],
    activeOperators: [],
    currentWeekMonday: null,
    currentViewMode: 'weekly', // 'weekly' or 'monthly'
    overviewPeriod: 'all', // 'all', 'w1', 'w1_2', 'w1_3', 'w4'
    isFullMonthMatrixExpanded: false,
    poolFilter: 'all'
};

// Date helper utilities
function getMonday(d) {
    let date = new Date(d);
    let day = date.getDay();
    let diff = date.getDate() - day + (day === 0 ? -6 : 1);
    let monday = new Date(date.setDate(diff));
    monday.setHours(0,0,0,0);
    return monday;
}

function formatDateISO(d) {
    let y = d.getFullYear();
    let m = String(d.getMonth() + 1).padStart(2, '0');
    let day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatDateDisplay(d) {
    let day = String(d.getDate()).padStart(2, '0');
    let m = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}.${m}`;
}

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
}

function getMonthString() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
}

function normalizeStr(str) {
    if (!str) return '';
    return String(str).replace(/[\u00A0\s]+/g, ' ').trim().toLowerCase();
}

window.onload = async function() {
    globalState.currentWeekMonday = getMonday(new Date());
    const monthPicker = document.getElementById('month-picker');
    if (monthPicker) {
        monthPicker.value = getMonthString();
        monthPicker.addEventListener('change', () => {
            let parts = monthPicker.value.split('-');
            let y = parseInt(parts[0]);
            let m = parseInt(parts[1]) - 1;
            let firstDay = new Date(y, m, 1);
            globalState.currentWeekMonday = getMonday(firstDay);
            loadData();
        });
    }
    await initialFetch();
    await loadData();
    setInterval(loadData, 20000); 
};

let offMode = false;
function toggleOffMode() {
    offMode = !offMode;
    const btn = document.getElementById('off-mode-toggle');
    if (btn) {
        if (offMode) {
            btn.classList.add('active');
            btn.innerText = '🛑 Почивки: ВКЛ';
        } else {
            btn.classList.remove('active');
            btn.innerText = '🛑 Почивки: ИЗКЛ';
        }
    }
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
        const selectedMonth = document.getElementById('month-picker').value || getMonthString();
        
        let dStart = new Date(selectedMonth + '-01');
        dStart.setMonth(dStart.getMonth() - 1);
        let prevMonthStr = `${dStart.getFullYear()}-${String(dStart.getMonth() + 1).padStart(2,'0')}-01`;

        let dEnd = new Date(selectedMonth + '-01');
        dEnd.setMonth(dEnd.getMonth() + 2);
        dEnd.setDate(0);
        let nextMonthStr = `${dEnd.getFullYear()}-${String(dEnd.getMonth() + 1).padStart(2,'0')}-${String(dEnd.getDate()).padStart(2,'0')}`;

        // Fetch Plans (Active only)
        const plansRes = await client.from('plan').select('*').in('Статус', ['Активен']);
        // Fetch otcheti
        const otchetiRes = await client.from('otcheti').select('*').eq('Статус', 'Отчетено');
        // Fetch quotas for 3 month range
        const quotasRes = await client.from('planner_bobini').select('*').gte('date', prevMonthStr).lte('date', nextMonthStr);
        // Fetch personal
        const personalRes = await client.from('personal').select('Име, Имейл, Длъжност').eq('Статус', 'Активен');
        
        let personalData = personalRes.data || [];
        let validNames = new Set();
        personalData.forEach(p => {
            let name = String(p['Име'] || '').trim();
            if (p['Длъжност'] && p['Длъжност'].toLowerCase().includes('бобин') && name) {
                validNames.add(name);
            }
        });

        globalState.otcheti = otchetiRes.data || [];
        globalState.quotas = quotasRes.data || [];
        globalState.activeOperators = Array.from(validNames).sort();

        let allTasks = await generateTerminalTasks(client);
        let filteredTargetNodes = {};
        
        if (allTasks) {
            allTasks.forEach(t => {
                let name = String(t.internalName || '').toLowerCase().trim();
                if (!name) name = String(t.name || '').toLowerCase().trim();
                
                let isStator = name.includes('статор') && !name.includes('пак');
                let isRotor = name.includes('ротор');
                let isTransformer = name.includes('трансформатор');
                let isToroid = name.includes('тороид');
                
                let op = String(t.op || '').toLowerCase().trim();
                let isValidOp = false;
                
                if (isStator && op.includes('навиване')) isValidOp = true;
                if (isRotor && (op.includes('навиване') || op.includes('спояване'))) isValidOp = true;
                if ((isTransformer || isToroid) && (op.includes('навиване') || op.includes('спояване'))) isValidOp = true;
                
                if (op.includes('бобиньорки')) isValidOp = true;
                if (op.includes('ротор') && (op.includes('навиване') || op.includes('спояване'))) isValidOp = true;
                
                if (isValidOp) {
                    let key = t.name + "___" + t.op;
                    if (!filteredTargetNodes[key]) {
                        filteredTargetNodes[key] = {
                            detailName: t.name,
                            operationName: t.op,
                            planQty: 0,
                            totalDone: 0,
                            isBlocked: true,
                            availableQty: 0
                        };
                    }
                    
                    filteredTargetNodes[key].planQty += t.totalNeed;
                    filteredTargetNodes[key].totalDone += t.totalDone;
                    
                    if (!t.isBlocked) {
                        filteredTargetNodes[key].isBlocked = false;
                        filteredTargetNodes[key].availableQty += t.totalNeed;
                    }
                }
            });
        }
        
        globalState.targetItems = Object.values(filteredTargetNodes);
        globalState.targetItems.sort((a,b) => a.detailName.localeCompare(b.detailName));
        
        await reconcileScheduleSurplus();

        renderCalendarUI();

        if (firstLoad) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('main-layout').style.display = 'flex';
            firstLoad = false;
        }
    } catch (err) {
        console.error("Грешка при зареждане:", err);
        if (firstLoad) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('main-layout').style.display = 'flex';
            firstLoad = false;
        }
    }
}

// View switcher
window.switchViewMode = function(mode) {
    globalState.currentViewMode = mode;
    let btnWeekly = document.getElementById('view-weekly-btn');
    let btnMonthly = document.getElementById('view-monthly-btn');
    let weeklyCont = document.getElementById('weekly-view-container');
    let monthlyCont = document.getElementById('monthly-overview-container');
    
    if (mode === 'weekly') {
        if (btnWeekly) btnWeekly.classList.add('active');
        if (btnMonthly) btnMonthly.classList.remove('active');
        if (weeklyCont) weeklyCont.style.display = 'flex';
        if (monthlyCont) monthlyCont.style.display = 'none';
        renderWeeklyBoard();
    } else {
        if (btnMonthly) btnMonthly.classList.add('active');
        if (btnWeekly) btnWeekly.classList.remove('active');
        if (weeklyCont) weeklyCont.style.display = 'none';
        if (monthlyCont) monthlyCont.style.display = 'flex';
        renderMonthlyOverview();
    }
};

// Week navigation
window.navWeek = function(direction) {
    if (direction === 0) {
        globalState.currentWeekMonday = getMonday(new Date());
    } else {
        let m = new Date(globalState.currentWeekMonday || getMonday(new Date()));
        m.setDate(m.getDate() + (direction * 7));
        globalState.currentWeekMonday = m;
    }
    
    let yyyyMm = `${globalState.currentWeekMonday.getFullYear()}-${String(globalState.currentWeekMonday.getMonth() + 1).padStart(2, '0')}`;
    let mp = document.getElementById('month-picker');
    if (mp && mp.value !== yyyyMm) {
        mp.value = yyyyMm;
        loadData();
        return;
    }
    renderCalendarUI();
};

function renderCalendarUI() {
    renderTaskPool();
    if (globalState.currentViewMode === 'weekly') {
        renderWeeklyBoard();
    } else {
        renderMonthlyOverview();
    }
}

// Render Task Pool (Compact, clear tracking, color-coded badges)
function renderTaskPool() {
    try {
    let allCount = 0;
    let pendingCount = 0;
    let doneCount = 0;

    let itemsWithMeta = (globalState.targetItems || []).map(item => {
        let planQty = item.planQty || 0;
        let totalAssignedMonth = 0;
        globalState.quotas.forEach(q => {
            if (q.detail_name === item.detailName && q.operation_name === item.operationName && q.detail_name !== 'OFF') {
                totalAssignedMonth += q.qty;
            }
        });
        let remaining = Math.max(0, planQty - totalAssignedMonth);
        let isDone = (totalAssignedMonth >= planQty && planQty > 0);
        let isPartial = (totalAssignedMonth > 0 && totalAssignedMonth < planQty);
        
        allCount++;
        if (isDone) doneCount++;
        else pendingCount++;

        return {
            item,
            planQty,
            totalAssignedMonth,
            remaining,
            isDone,
            isPartial
        };
    });

    // Update filter counts in modal
    let allEl = document.getElementById('pool-filter-all-count');
    if (allEl) allEl.innerText = allCount;
    let pendEl = document.getElementById('pool-filter-pending-count');
    if (pendEl) pendEl.innerText = pendingCount;
    let doneEl = document.getElementById('pool-filter-done-count');
    if (doneEl) doneEl.innerText = doneCount;

    // Update mobile toggle button text and header button text
    let poolBtn = document.getElementById('mobile-toggle-pool-btn');
    if (poolBtn) {
        if (pendingCount > 0) {
            poolBtn.innerHTML = `📥 Свободни задачи: <strong style="color:#f59e0b;">${pendingCount} за залагане</strong> ▾`;
        } else {
            poolBtn.innerHTML = `📥 Свободни задачи: <strong style="color:#10b981;">Всички са заложени ✅</strong> ▾`;
        }
    }
    let topPoolBtn = document.getElementById('btn-open-pool');
    if (topPoolBtn) {
        if (pendingCount > 0) {
            topPoolBtn.innerHTML = `📥 Свободни задачи (${pendingCount})`;
        } else {
            topPoolBtn.innerHTML = `📥 Свободни задачи ✅`;
        }
    }

    // Generate HTML for card
    let makeCardHtml = (data, isModal = false) => {
        let { item, planQty, totalAssignedMonth, remaining, isDone, isPartial } = data;
        let detailNameStr = String(item.detailName || '');
        let opNameStr = String(item.operationName || '');
        let safeDetail = detailNameStr.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;").replace(/\r?\n/g, ' ');
        let safeOp = opNameStr.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;").replace(/\r?\n/g, ' ');

        let badgeHtml = '';
        let borderStyle = '';
        let cardBg = '';

        if (isDone) {
            badgeHtml = `<span style="background:rgba(16,185,129,0.2); color:#10b981; border:1px solid #10b981; padding:${isModal ? '5px 12px' : '2px 7px'}; border-radius:6px; font-size:${isModal ? '0.85em' : '0.75em'}; font-weight:bold; white-space:nowrap;">✅ 100% Заложена</span>`;
            borderStyle = isModal ? 'border-left: 6px solid #10b981;' : 'border-left: 4px solid #10b981;';
            cardBg = 'background: #1e293b; opacity: 0.9;';
        } else if (isPartial) {
            badgeHtml = `<span style="background:rgba(245,158,11,0.2); color:#f59e0b; border:1px solid #f59e0b; padding:${isModal ? '5px 12px' : '2px 7px'}; border-radius:6px; font-size:${isModal ? '0.85em' : '0.75em'}; font-weight:bold; white-space:nowrap;">⏳ Заложени: ${totalAssignedMonth}/${planQty}</span>`;
            borderStyle = isModal ? 'border-left: 6px solid #f59e0b;' : 'border-left: 4px solid #f59e0b;';
            cardBg = 'background: #1e293b;';
        } else {
            badgeHtml = `<span style="background:rgba(239,68,68,0.2); color:#f87171; border:1px solid #ef4444; padding:${isModal ? '5px 12px' : '2px 7px'}; border-radius:6px; font-size:${isModal ? '0.85em' : '0.75em'}; font-weight:bold; white-space:nowrap;">🔴 Неразпределена</span>`;
            borderStyle = isModal ? 'border-left: 6px solid #ef4444;' : 'border-left: 4px solid #ef4444;';
            cardBg = 'background: #1e293b;';
        }

        let cardPadding = isModal ? '14px 15px' : '11px 12px';
        let titleSize = isModal ? '1.18em' : '1.05em';
        let opSize = isModal ? '0.95em' : '0.82em';
        let btnPadding = isModal ? '10px 22px' : '6px 15px';
        let btnFontSize = isModal ? '1.08em' : '0.95em';
        let btnBg = isDone ? '#334155' : '#10b981';

        return `
            <div style="${borderStyle} ${cardBg} padding:${cardPadding}; border-radius:10px; border:1px solid #334155; margin-bottom:8px; box-shadow:0 3px 6px rgba(0,0,0,0.3);" draggable="true" ondragstart="dragStart(event, '${safeDetail}', '${safeOp}', ${remaining}, ${totalAssignedMonth})">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:800; font-size:${titleSize}; color:#fff; line-height:1.25; word-wrap:break-word;">${item.detailName}</div>
                        <div style="font-size:${opSize}; color:#94a3b8; margin-top:4px;">${item.operationName}</div>
                    </div>
                    <div style="flex-shrink:0;">${badgeHtml}</div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; font-size:${isModal ? '0.95em' : '0.88em'}; color:#cbd5e1; border-top:1px solid rgba(255,255,255,0.08); padding-top:8px;">
                    <div>
                        <span>Остават: <strong style="color:${remaining > 0 ? '#f59e0b' : '#10b981'}; font-size:1.18em;">${remaining} бр.</strong></span>
                        <span style="color:#64748b; margin-left:6px; font-size:0.9em;">(План: ${planQty})</span>
                    </div>
                    <button class="btn-micro" style="background:${btnBg}; color:#fff; font-weight:800; padding:${btnPadding}; font-size:${btnFontSize}; border-radius:8px; min-height:${isModal ? '44px' : 'auto'}; cursor:pointer;" onclick="openWizardModal('${safeDetail}', '${safeOp}'); if(${isModal}) closePoolModal();">
                        ${isDone ? '✏️ Преразпредели' : '⚡ Заложи'}
                    </button>
                </div>
            </div>
        `;
    };

    // 1. Render desktop sidebar list
    let sidebarHtml = '';
    itemsWithMeta.forEach(data => {
        sidebarHtml += makeCardHtml(data, false);
    });
    if (itemsWithMeta.length === 0) {
        sidebarHtml = '<div style="color:#94a3b8; text-align:center; padding:15px;">Няма заредени детайли.</div>';
    }
    let sidebarPool = document.getElementById('w-task-pool');
    if (sidebarPool) sidebarPool.innerHTML = sidebarHtml;

    // 2. Render mobile modal list (respecting globalState.poolFilter and globalState.poolSearchQuery)
    let currentFilter = globalState.poolFilter || 'all';
    let qSearch = (globalState.poolSearchQuery || '').trim().toLowerCase();
    
    // Update active class on filter buttons
    ['all', 'pending', 'done'].forEach(f => {
        let b = document.getElementById(`btn-pool-filter-${f}`);
        if (b) {
            if (f === currentFilter) b.classList.add('active');
            else b.classList.remove('active');
        }
    });

    let filteredItems = itemsWithMeta.filter(data => {
        if (currentFilter === 'pending' && data.isDone) return false;
        if (currentFilter === 'done' && !data.isDone) return false;
        if (qSearch) {
            let dName = (data.item.detailName || '').toLowerCase();
            let oName = (data.item.operationName || '').toLowerCase();
            if (!dName.includes(qSearch) && !oName.includes(qSearch)) return false;
        }
        return true;
    });

    let modalHtml = '';
    filteredItems.forEach(data => {
        modalHtml += makeCardHtml(data, true);
    });
    if (filteredItems.length === 0) {
        modalHtml = `<div style="color:#94a3b8; text-align:center; padding:35px 20px; font-size:1em;">
            ${qSearch ? 'Няма намерени задачи, отговарящи на търсенето.' : (currentFilter === 'pending' ? '🎉 Страхотно! Всички задачи по плана са напълно разпределени.' : 'Няма намерени задачи в този филтър.')}
        </div>`;
    }
    let modalList = document.getElementById('w-task-pool-modal-list');
    if (modalList) modalList.innerHTML = modalHtml;

    let countLabel = document.getElementById('pool-shown-count-label');
    if (countLabel) {
        countLabel.innerText = `Показани: ${filteredItems.length} от ${allCount} задачи`;
    }
    } catch(err) {
        console.error("Грешка в renderTaskPool:", err);
    }
}

// Render Weekly Board (Work week Mon - Fri)
function renderWeeklyBoard() {
    if (!globalState.currentWeekMonday) {
        globalState.currentWeekMonday = getMonday(new Date());
    }
    let mon = new Date(globalState.currentWeekMonday);
    
    // 5 work days
    let workDays = [];
    for (let i = 0; i < 5; i++) {
        let d = new Date(mon);
        d.setDate(mon.getDate() + i);
        workDays.push(d);
    }
    let fri = workDays[4];
    
    let weekLabel = document.getElementById('current-week-label');
    if (weekLabel) {
        weekLabel.innerHTML = `Седмица ${getWeekNumber(mon)}: <strong>${formatDateDisplay(mon)} – ${formatDateDisplay(fri)}.${fri.getFullYear()}</strong>`;
    }
    
    // Map actual reports from otcheti
    let actualsMap = {};
    if (globalState.otcheti) {
        globalState.otcheti.forEach(r => {
            if (!r['Дата']) return;
            let dateStr = r['Дата'].split('T')[0];
            let name = String(r['Оператор']).trim();
            let detail = normalizeStr(r['ID Детайл']);
            let op = normalizeStr(r['Операция']);
            let qty = parseFloat(r['Количество']) || 0;
            if (qty > 0) {
                let key = `${dateStr}|${name}|${detail}|${op}`;
                actualsMap[key] = (actualsMap[key] || 0) + qty;
            }
        });
    }

    let dayNames = ['Пон', 'Вт', 'Ср', 'Чт', 'Пт'];
    let todayStr = formatDateISO(new Date());

    let boardHtml = `
      <table class="calendar-table" id="planner-table">
        <thead>
          <tr>
            <th class="first-cell" style="vertical-align: middle; text-align: left;">👤 Оператор</th>
    `;
    
    workDays.forEach((wd, idx) => {
        let dStr = formatDateISO(wd);
        let isToday = (dStr === todayStr) ? 'border-top: 3px solid #38bdf8;' : '';
        boardHtml += `
          <th style="${isToday}">
            <div style="font-size:1.05em; font-weight:800;">${dayNames[idx]}</div>
            <div style="font-size:0.8em; color:#94a3b8; font-weight:normal;">${formatDateDisplay(wd)}</div>
          </th>
        `;
    });
    
    boardHtml += `
            <th style="background:#1e293b; color:#38bdf8; min-width:110px;">📊 Седмичен сбор</th>
          </tr>
        </thead>
        <tbody>
    `;

    if (globalState.activeOperators.length === 0) {
        boardHtml += `<tr><td colspan="7" style="padding:25px; color:#94a3b8; text-align:center;">Няма намерени активни оператори в отдел Бобини.</td></tr>`;
    } else {
        globalState.activeOperators.forEach(opName => {
            let opTotalAssigned = 0;
            let opTotalDone = 0;

            let safeOp = opName.replace(/'/g, "\\'").replace(/"/g, "&quot;");

            boardHtml += `<tr><td class="op-name">👤 ${opName}</td>`;

            workDays.forEach(wd => {
                let fullDateStr = formatDateISO(wd);
                let dayQuotas = globalState.quotas.filter(q => q.operator_name === opName && q.date === fullDateStr);
                let isOffDay = dayQuotas.some(q => q.detail_name === 'OFF');

                let dayActualKeys = Object.keys(actualsMap).filter(k => k.startsWith(`${fullDateStr}|${opName}|`));
                let cellClass = isOffDay ? 'day-cell off-day' : 'day-cell';

                boardHtml += `<td class="${cellClass}" onclick="cellClick('${fullDateStr}', '${safeOp}')" ondragover="allowDrop(event)" ondrop="drop(event, '${safeOp}', '${fullDateStr}')" ondragenter="dragEnter(event)" ondragleave="dragLeave(event)">`;

                if (isOffDay) {
                    boardHtml += `<div class="off-day-badge">ПОЧИВКА (X)</div>`;
                } else {
                    dayQuotas.forEach(q => {
                        let aKey = `${fullDateStr}|${opName}|${normalizeStr(q.detail_name)}|${normalizeStr(q.operation_name)}`;
                        let actualQty = actualsMap[aKey] || 0;
                        
                        let displayQty = "";
                        let bgClass = "";
                        
                        if (actualQty > 0) {
                            displayQty = `${actualQty} / ${q.qty} бр.`;
                            bgClass = "assigned-card-actual";
                            opTotalDone += actualQty;
                        } else {
                            displayQty = `${q.qty} бр.`;
                            bgClass = "assigned-card-forecast";
                        }
                        opTotalAssigned += q.qty;
                        
                        actualsMap[aKey] = -1; // Flag as handled

                        let safeDetail = q.detail_name.replace(/'/g, "\\'").replace(/"/g, "&quot;");
                        let safeOpName = q.operation_name.replace(/'/g, "\\'").replace(/"/g, "&quot;");

                        boardHtml += `
                            <div class="assigned-card ${bgClass}" onclick="event.stopPropagation(); openTaskOptionsModal('${q.id}', '${safeDetail}', '${safeOpName}', ${q.qty})" title="Натиснете за редакция или разпъване">
                                <div class="assigned-card-title">${q.detail_name}</div>
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:3px;">
                                    <strong>${displayQty}</strong>
                                    <span style="font-size:0.75em; color:#94a3b8;">${q.operation_name}</span>
                                </div>
                            </div>
                        `;
                    });

                    // Unplanned reports
                    dayActualKeys.forEach(k => {
                        if (actualsMap[k] > 0) {
                            let parts = k.split('|');
                            let detail = parts[2];
                            let actualQty = actualsMap[k];
                            opTotalDone += actualQty;

                            let originalDetail = detail;
                            let report = globalState.otcheti.find(r => r['Дата'].startsWith(fullDateStr) && String(r['Оператор']).trim() === opName && normalizeStr(r['ID Детайл']) === detail);
                            if (report && report['ID Детайл']) originalDetail = report['ID Детайл'];

                            boardHtml += `
                                <div class="assigned-card assigned-card-unplanned" onclick="event.stopPropagation();" title="Отчетено извънредно през терминала">
                                    <div class="assigned-card-title">${originalDetail}</div>
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:3px;">
                                        <strong>${actualQty} бр.</strong>
                                        <span style="font-size:0.75em; color:#f59e0b;">(Извънр.)</span>
                                    </div>
                                </div>
                            `;
                        }
                    });

                    // Fast touch "+ Добави" button
                    boardHtml += `
                        <button class="cell-add-btn" onclick="event.stopPropagation(); openQuickCellModal('${safeOp}', '${fullDateStr}')">
                          ➕ Добави
                        </button>
                    `;
                }

                boardHtml += `</td>`;
            });

            // Weekly Total Column
            boardHtml += `
              <td style="background:#1e293b; vertical-align:middle; text-align:center; padding:10px;">
                <div style="font-size:1.15em; font-weight:800; color:#38bdf8;">
                  ${opTotalDone} / ${opTotalAssigned}
                </div>
                <div style="font-size:0.75em; color:#94a3b8; margin-top:2px;">бр. готови / заложени</div>
              </td>
            </tr>`;
        });
    }

    boardHtml += `</tbody></table>`;
    document.getElementById('w-calendar-board').innerHTML = boardHtml;
}

// Render Monthly Overview (Read-only / Summary)
function renderMonthlyOverview() {
    const selectedMonth = document.getElementById('month-picker').value || getMonthString();
    let parts = selectedMonth.split('-');
    let year = parseInt(parts[0]);
    let month = parseInt(parts[1]);
    let daysInMonth = new Date(year, month, 0).getDate();

    let startDay = 1;
    let endDay = daysInMonth;

    if (globalState.overviewPeriod === 'w1') {
        startDay = 1; endDay = Math.min(7, daysInMonth);
    } else if (globalState.overviewPeriod === 'w1_2') {
        startDay = 1; endDay = Math.min(14, daysInMonth);
    } else if (globalState.overviewPeriod === 'w1_3') {
        startDay = 1; endDay = Math.min(21, daysInMonth);
    } else if (globalState.overviewPeriod === 'w4') {
        startDay = 22; endDay = daysInMonth;
    }

    let rangeStart = `${year}-${String(month).padStart(2,'0')}-${String(startDay).padStart(2,'0')}`;
    let rangeEnd = `${year}-${String(month).padStart(2,'0')}-${String(endDay).padStart(2,'0')}`;

    let periodLabel = document.getElementById('overview-period-label');
    if (periodLabel) {
        periodLabel.innerText = `(Период: ${String(startDay).padStart(2,'0')}.${String(month).padStart(2,'0')} – ${String(endDay).padStart(2,'0')}.${String(month).padStart(2,'0')}.${year} г.)`;
    }

    // Filter quotas and reports for this range
    let rangeQuotas = globalState.quotas.filter(q => q.date >= rangeStart && q.date <= rangeEnd && q.detail_name !== 'OFF');
    let rangeOtcheti = globalState.otcheti.filter(r => {
        if (!r['Дата'] || r['Статус'] !== 'Отчетено') return false;
        let d = r['Дата'].split('T')[0];
        return d >= rangeStart && d <= rangeEnd;
    });

    let monthStartStr = `${year}-${String(month).padStart(2,'0')}-01`;
    let monthEndStr = `${year}-${String(month).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`;
    let allMonthOtcheti = globalState.otcheti.filter(r => {
        if (!r['Дата'] || r['Статус'] !== 'Отчетено') return false;
        let d = r['Дата'].split('T')[0];
        return d >= monthStartStr && d <= monthEndStr;
    });

    // Accumulators for table and KPIs strictly for target items in this department
    let totalPlan = 0;
    let totalAssignedPeriod = 0;
    let totalDonePeriod = 0;
    let totalDoneMonth = 0;
    let totalRemaining = 0;

    let tableRowsHtml = '';

    globalState.targetItems.forEach(item => {
        let planQty = item.planQty || 0;
        totalPlan += planQty;

        let assignedInPeriod = 0;
        rangeQuotas.forEach(q => {
            if (q.detail_name === item.detailName && q.operation_name === item.operationName) {
                assignedInPeriod += q.qty;
            }
        });
        totalAssignedPeriod += assignedInPeriod;

        let doneInPeriod = 0;
        rangeOtcheti.forEach(r => {
            if (normalizeStr(r['ID Детайл']) === normalizeStr(item.detailName) && normalizeStr(r['Операция']) === normalizeStr(item.operationName)) {
                doneInPeriod += (parseFloat(r['Количество']) || 0);
            }
        });
        totalDonePeriod += doneInPeriod;

        let doneAllMonth = 0;
        allMonthOtcheti.forEach(r => {
            if (normalizeStr(r['ID Детайл']) === normalizeStr(item.detailName) && normalizeStr(r['Операция']) === normalizeStr(item.operationName)) {
                doneAllMonth += (parseFloat(r['Количество']) || 0);
            }
        });
        totalDoneMonth += doneAllMonth;

        let remaining = Math.max(0, planQty - doneAllMonth);
        totalRemaining += remaining;

        let pct = planQty > 0 ? Math.min(100, Math.round((doneAllMonth / planQty) * 100)) : 0;
        let barColor = pct >= 100 ? '#10b981' : (pct >= 50 ? '#38bdf8' : '#f59e0b');

        // Calculate ETA completion date based on assigned quotas
        let itemQuotas = globalState.quotas.filter(q => q.detail_name === item.detailName && q.operation_name === item.operationName && q.detail_name !== 'OFF');
        let totalAssignedAll = 0;
        let maxQuotaDate = null;
        let uniqueDaysSet = new Set();
        itemQuotas.forEach(q => {
            totalAssignedAll += q.qty;
            uniqueDaysSet.add(q.date);
            if (!maxQuotaDate || q.date > maxQuotaDate) {
                maxQuotaDate = q.date;
            }
        });

        let etaHtml = '';
        if (remaining === 0 && doneAllMonth >= planQty) {
            etaHtml = `<span style="color:#10b981; font-weight:bold;">✅ Изпълнен</span>`;
        } else if (maxQuotaDate) {
            let maxD = new Date(maxQuotaDate + 'T00:00:00');
            let dateFormatted = `${String(maxD.getDate()).padStart(2,'0')}.${String(maxD.getMonth()+1).padStart(2,'0')}`;
            if (totalAssignedAll >= remaining) {
                etaHtml = `<span style="color:#38bdf8; font-weight:bold; white-space:nowrap;" title="Завършва на ${dateFormatted}.${maxD.getFullYear()} г. за ${uniqueDaysSet.size} работни дни">🏁 ${dateFormatted} (${uniqueDaysSet.size} д.)</span>`;
            } else {
                etaHtml = `<span style="color:#f59e0b; white-space:nowrap;" title="Заложени частично: ${totalAssignedAll} от ${remaining} бр.">⏳ ~${dateFormatted} (част.)</span>`;
            }
        } else {
            etaHtml = `<span style="color:#64748b; font-style:italic;">Не е заложен</span>`;
        }

        tableRowsHtml += `
          <tr>
            <td><strong>${item.detailName}</strong></td>
            <td style="color:#94a3b8;">${item.operationName}</td>
            <td style="text-align:right; font-weight:bold;">${planQty} бр.</td>
            <td style="text-align:right; color:#38bdf8; font-weight:bold;">${assignedInPeriod} бр.</td>
            <td style="text-align:right; color:#10b981; font-weight:bold;">${doneInPeriod} бр.</td>
            <td style="text-align:right; font-weight:bold;">${doneAllMonth} бр.</td>
            <td style="text-align:right; color:${remaining > 0 ? '#f59e0b' : '#10b981'}; font-weight:bold;">${remaining} бр.</td>
            <td style="text-align:center;">${etaHtml}</td>
            <td>
              <div style="display:flex; justify-content:space-between; font-size:0.8em; margin-bottom:2px;">
                <span>${pct}%</span>
              </div>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width:${pct}%; background:${barColor};"></div>
              </div>
            </td>
          </tr>
        `;
    });

    let kpisHtml = `
      <div class="kpi-card" style="border-top-color:#38bdf8;">
        <span class="kpi-title">🎯 Месечен План (Цел)</span>
        <span class="kpi-value">${totalPlan} <small style="font-size:0.5em; color:#94a3b8;">бр.</small></span>
      </div>
      <div class="kpi-card" style="border-top-color:#3b82f6;">
        <span class="kpi-title">📅 Заложени в Периода</span>
        <span class="kpi-value">${totalAssignedPeriod} <small style="font-size:0.5em; color:#94a3b8;">бр.</small></span>
      </div>
      <div class="kpi-card" style="border-top-color:#10b981;">
        <span class="kpi-title">✅ Изработени в Периода</span>
        <span class="kpi-value" style="color:#10b981;">${totalDonePeriod} <small style="font-size:0.5em; color:#94a3b8;">бр.</small></span>
      </div>
      <div class="kpi-card" style="border-top-color:#f59e0b;">
        <span class="kpi-title">⏳ Оставащи за Месеца</span>
        <span class="kpi-value" style="color:#f59e0b;">${totalRemaining} <small style="font-size:0.5em; color:#94a3b8;">бр.</small></span>
      </div>
    `;
    document.getElementById('overview-kpis-container').innerHTML = kpisHtml;

    // 2. Details Breakdown Table
    let detTableHtml = `
      <thead>
        <tr>
          <th>Детайл</th>
          <th>Операция</th>
          <th style="text-align:right;">План за месеца</th>
          <th style="text-align:right;">Възложени в периода</th>
          <th style="text-align:right;">Готови в периода</th>
          <th style="text-align:right;">Общо готови (м.)</th>
          <th style="text-align:right;">Остават по план</th>
          <th style="text-align:center;">🏁 Готов на (ETA)</th>
          <th style="min-width:140px;">Прогрес %</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
      </tbody>
      <tfoot>
        <tr style="background:#0f172a; font-weight:bold;">
          <td colspan="2">ОБЩО:</td>
          <td style="text-align:right;">${totalPlan} бр.</td>
          <td style="text-align:right; color:#38bdf8;">${totalAssignedPeriod} бр.</td>
          <td style="text-align:right; color:#10b981;">${totalDonePeriod} бр.</td>
          <td style="text-align:right;">${totalDoneMonth} бр.</td>
          <td style="text-align:right; color:#f59e0b;">${totalRemaining} бр.</td>
          <td></td>
          <td></td>
        </tr>
      </tfoot>
    `;
    document.getElementById('overview-details-table').innerHTML = detTableHtml;

    // 3. Operators Breakdown Table
    let opTableHtml = `
      <thead>
        <tr>
          <th>👤 Оператор</th>
          <th style="text-align:right;">Възложени в периода</th>
          <th style="text-align:right;">Изработени в периода</th>
          <th style="text-align:right;">Изпълнение спрямо нормата</th>
        </tr>
      </thead>
      <tbody>
    `;

    globalState.activeOperators.forEach(opName => {
        let opAssigned = 0;
        rangeQuotas.forEach(q => {
            if (q.operator_name === opName) opAssigned += q.qty;
        });

        let opDone = 0;
        rangeOtcheti.forEach(r => {
            if (String(r['Оператор']).trim() === opName) {
                let isBobini = globalState.targetItems.some(item => 
                    normalizeStr(r['ID Детайл']) === normalizeStr(item.detailName) && 
                    normalizeStr(r['Операция']) === normalizeStr(item.operationName)
                );
                if (isBobini) {
                    opDone += (parseFloat(r['Количество']) || 0);
                }
            }
        });

        let eff = opAssigned > 0 ? Math.round((opDone / opAssigned) * 100) : '-';
        let effColor = (eff !== '-' && eff >= 100) ? '#10b981' : ((eff !== '-' && eff >= 75) ? '#38bdf8' : '#94a3b8');

        opTableHtml += `
          <tr>
            <td><strong>👤 ${opName}</strong></td>
            <td style="text-align:right; color:#38bdf8; font-weight:bold;">${opAssigned} бр.</td>
            <td style="text-align:right; color:#10b981; font-weight:bold;">${opDone} бр.</td>
            <td style="text-align:right; font-weight:bold; color:${effColor};">${eff !== '-' ? eff + '%' : 'Няма заложена норма'}</td>
          </tr>
        `;
    });

    opTableHtml += `</tbody>`;
    document.getElementById('overview-operators-table').innerHTML = opTableHtml;

    // 4. Render Full Month Matrix if expanded
    if (globalState.isFullMonthMatrixExpanded) {
        renderFullMonthMatrix();
    }
}

window.setOverviewPeriod = function(period) {
    globalState.overviewPeriod = period;
    let buttons = document.querySelectorAll('#overview-period-buttons button');
    buttons.forEach(b => {
        if (b.getAttribute('data-period') === period) b.classList.add('active');
        else b.classList.remove('active');
    });
    renderMonthlyOverview();
};

window.toggleFullMonthMatrix = function() {
    globalState.isFullMonthMatrixExpanded = !globalState.isFullMonthMatrixExpanded;
    let body = document.getElementById('full-month-matrix-body');
    let indicator = document.getElementById('full-month-matrix-indicator');
    if (globalState.isFullMonthMatrixExpanded) {
        body.style.display = 'block';
        indicator.innerText = '[ Свиване ▴ ]';
        renderFullMonthMatrix();
    } else {
        body.style.display = 'none';
        indicator.innerText = '[ Показване ▾ ]';
    }
};

function renderFullMonthMatrix() {
    const selectedMonth = document.getElementById('month-picker').value || getMonthString();
    let parts = selectedMonth.split('-');
    let year = parseInt(parts[0]);
    let month = parseInt(parts[1]);
    let daysInMonth = new Date(year, month, 0).getDate();

    let tableHtml = `<table class="calendar-table"><thead><tr><th class="first-cell">Оператор</th>`;
    for (let d = 1; d <= daysInMonth; d++) {
        let dateObj = new Date(year, month - 1, d);
        let dayStr = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][dateObj.getDay()];
        let isWeekend = (dateObj.getDay() === 0 || dateObj.getDay() === 6) ? 'color:#f87171;' : '';
        tableHtml += `<th style="${isWeekend}">${d}<br><span style="font-size:0.7em; font-weight:normal;">${dayStr}</span></th>`;
    }
    tableHtml += '</tr></thead><tbody>';

    globalState.activeOperators.forEach(opName => {
        tableHtml += `<tr><td class="op-name">👤 ${opName}</td>`;
        for (let d = 1; d <= daysInMonth; d++) {
            let fullDateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            let dayQuotas = globalState.quotas.filter(q => q.operator_name === opName && q.date === fullDateStr);
            let isOffDay = dayQuotas.some(q => q.detail_name === 'OFF');
            let cellClass = isOffDay ? 'day-cell off-day' : 'day-cell';

            tableHtml += `<td class="${cellClass}">`;
            if (isOffDay) {
                tableHtml += `<div class="off-day-badge">X</div>`;
            } else {
                dayQuotas.forEach(q => {
                    tableHtml += `
                      <div class="assigned-card assigned-card-forecast" style="margin-bottom:2px; padding:3px 5px;">
                        <span style="font-weight:bold;">${q.detail_name}</span>
                        <div><strong>${q.qty} бр.</strong></div>
                      </div>
                    `;
                });
            }
            tableHtml += `</td>`;
        }
        tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table>';
    document.getElementById('full-month-matrix-body').innerHTML = tableHtml;
}

// Cell click for OFF mode
async function cellClick(dateStr, opName) {
    if (!offMode) return;
    
    let existingOff = globalState.quotas.find(q => q.operator_name === opName && q.date === dateStr && q.detail_name === 'OFF');
    
    const loader = document.getElementById('loading');
    loader.style.display = 'flex';
    
    if (existingOff) {
        await client.from('planner_bobini').delete().eq('id', existingOff.id);
        globalState.quotas = globalState.quotas.filter(q => q.id !== existingOff.id);
    } else {
        const { data } = await client.from('planner_bobini').insert([{
            date: dateStr, operator_name: opName, detail_name: 'OFF', operation_name: '-', qty: 0
        }]).select();
        if (data && data[0]) globalState.quotas.push(data[0]);
    }
    renderCalendarUI();
    loader.style.display = 'none';
}

// Copy forward logic
async function copyForward(quotaId) {
    let q = globalState.quotas.find(x => String(x.id) === String(quotaId));
    if (!q) return;
    
    if(!confirm(`Искате ли да копирате задачата (${q.qty} бр.) за всички оставащи работни дни от седмицата за ${q.operator_name}?`)) return;
    
    let parts = q.date.split('-');
    let qDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    let monday = getMonday(qDate);
    
    let remainingDays = [];
    for (let i = 0; i < 5; i++) {
        let d = new Date(monday);
        d.setDate(monday.getDate() + i);
        let isoStr = formatDateISO(d);
        if (isoStr > q.date) {
            remainingDays.push(isoStr);
        }
    }

    if (remainingDays.length === 0) {
        alert("Няма оставащи работни дни в тази седмица.");
        return;
    }

    const loader = document.getElementById('loading');
    loader.style.display = 'flex';

    try {
        let inserts = [];
        let existingIdsToDelete = [];

        for (let dStr of remainingDays) {
            let isOff = globalState.quotas.some(x => x.operator_name === q.operator_name && x.date === dStr && x.detail_name === 'OFF');
            if (isOff) continue;

            let existing = globalState.quotas.filter(x => x.operator_name === q.operator_name && x.date === dStr && x.detail_name === q.detail_name && x.operation_name === q.operation_name);
            existing.forEach(ex => existingIdsToDelete.push(ex.id));

            inserts.push({
                date: dStr,
                operator_name: q.operator_name,
                detail_name: q.detail_name,
                operation_name: q.operation_name,
                qty: q.qty
            });
        }

        if (existingIdsToDelete.length > 0) {
            await client.from('planner_bobini').delete().in('id', existingIdsToDelete);
            globalState.quotas = globalState.quotas.filter(x => !existingIdsToDelete.includes(x.id));
        }

        if (inserts.length > 0) {
            const { data, error } = await client.from('planner_bobini').insert(inserts).select();
            if (error) throw error;
            if (data && data.length > 0) globalState.quotas.push(...data);
        }

        renderCalendarUI();
        loader.style.display = 'none';
    } catch(err) {
        alert("Грешка при разпъване: " + err.message);
        loader.style.display = 'none';
    }
}

// Drag & Drop Handlers (Desktop compatibility)
let currentDragTask = null;
function dragStart(e, detailName, operationName, remaining, totalAssignedMonth) {
    currentDragTask = { detailName, operationName, remaining, totalAssignedMonth };
    e.dataTransfer.setData('text/plain', detailName); 
}
function allowDrop(e) {
    if (offMode) return;
    e.preventDefault();
}
function dragEnter(e) {
    if (offMode) return;
    e.preventDefault();
    if (!e.currentTarget.classList.contains('off-day')) {
        e.currentTarget.classList.add('drag-over');
    }
}
function dragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}
function drop(e, operatorName, dateStr) {
    if (offMode) return;
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (e.currentTarget.classList.contains('off-day')) return;
    
    if (currentDragTask) {
        openQuickCellModal(operatorName, dateStr, currentDragTask.detailName, currentDragTask.operationName);
    }
}

// Next Work Day Helper (Mon - Fri)
function getNextWorkDay(dateStr) {
    if (!dateStr) return formatDateISO(new Date());
    let d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) { // 0 Sun, 6 Sat
        d.setDate(d.getDate() + 1);
    }
    return formatDateISO(d);
}

// Modal Viewport Synchronization (Mobile Zoom & Pan Friendly)
function openModalCentered(modalId) {
    let modal = document.getElementById(modalId);
    if (!modal) return;

    let syncViewport = () => {
        if (modal.style.display !== 'flex') return;
        if (window.visualViewport) {
            let vv = window.visualViewport;
            modal.style.position = 'fixed';
            modal.style.left = `${vv.offsetLeft}px`;
            modal.style.top = `${vv.offsetTop}px`;
            modal.style.width = `${vv.width}px`;
            modal.style.height = `${vv.height}px`;
        }
    };

    modal._vvSync = syncViewport;
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', syncViewport);
        window.visualViewport.addEventListener('scroll', syncViewport);
    }
    modal.style.display = 'flex';
    syncViewport();
    document.body.style.overflow = 'hidden';
}

function closeModalCentered(modalId) {
    let modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.display = 'none';
    if (modal._vvSync && window.visualViewport) {
        window.visualViewport.removeEventListener('resize', modal._vvSync);
        window.visualViewport.removeEventListener('scroll', modal._vvSync);
        modal._vvSync = null;
    }
    document.body.style.overflow = '';
}

// Screen Lock Helpers for Fullscreen Modals (Pool & Wizard)
let activeLockedModals = new Set();
let savedScrollPos = { x: 0, y: 0 };

function lockScreenForFullModal(modalId) {
    let modal = document.getElementById(modalId);
    if (modal) {
        modal.style.left = '';
        modal.style.top = '';
        modal.style.width = '';
        modal.style.height = '';
        modal.style.position = '';
    }

    if (activeLockedModals.size === 0) {
        savedScrollPos.x = window.scrollX || window.pageXOffset || 0;
        savedScrollPos.y = window.scrollY || window.pageYOffset || 0;

        let vp = document.getElementById('meta-viewport') || document.querySelector('meta[name="viewport"]');
        if (vp) {
            vp.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no');
        }

        document.documentElement.classList.add('modal-screen-locked');
        document.body.classList.add('modal-screen-locked');
        let lw = document.querySelector('.layout-wrapper');
        if (lw) lw.classList.add('modal-screen-locked');

        try {
            window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
        } catch (e) {
            window.scrollTo(0, 0);
        }
    }
    activeLockedModals.add(modalId);

    if (modal) {
        modal.style.display = 'flex';
    }
}

function unlockScreenForFullModal(modalId) {
    let modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        modal.style.left = '';
        modal.style.top = '';
        modal.style.width = '';
        modal.style.height = '';
    }

    activeLockedModals.delete(modalId);

    if (activeLockedModals.size === 0) {
        let vp = document.getElementById('meta-viewport') || document.querySelector('meta[name="viewport"]');
        if (vp) {
            vp.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes');
        }

        document.documentElement.classList.remove('modal-screen-locked');
        document.body.classList.remove('modal-screen-locked');
        let lw = document.querySelector('.layout-wrapper');
        if (lw) lw.classList.remove('modal-screen-locked');

        try {
            window.scrollTo({ left: savedScrollPos.x, top: savedScrollPos.y, behavior: 'instant' });
        } catch (e) {
            window.scrollTo(savedScrollPos.x, savedScrollPos.y);
        }
    }
}

// Quick Cell Modal Logic
let currentQcOp = null;
let currentQcDate = null;

window.openQuickCellModal = function(operatorName, dateStr, preDetail, preOp) {
    currentQcOp = operatorName;
    currentQcDate = dateStr;

    document.getElementById('qc-title').innerText = `Възлагане за ${operatorName}`;
    document.getElementById('qc-subtitle').innerText = `📅 Дата: ${dateStr}`;

    let select = document.getElementById('qc-detail-select');
    select.innerHTML = '';
    globalState.targetItems.forEach(t => {
        let opt = document.createElement('option');
        opt.value = `${t.detailName}___${t.operationName}`;
        opt.text = `${t.detailName} (${t.operationName}) — План: ${t.planQty} бр.`;
        if (preDetail && t.detailName === preDetail && (!preOp || t.operationName === preOp)) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });

    document.getElementById('qc-qty-input').value = '10';
    openModalCentered('quick-cell-modal');
};

window.closeQuickCellModal = function() {
    closeModalCentered('quick-cell-modal');
};

window.setQcQty = function(num) {
    document.getElementById('qc-qty-input').value = num;
};

window.confirmQuickCellAssign = async function() {
    let select = document.getElementById('qc-detail-select');
    if (!select || !select.value) return;
    let parts = select.value.split('___');
    let detail = parts[0];
    let op = parts[1];

    let qty = parseInt(document.getElementById('qc-qty-input').value) || 0;
    if (qty <= 0) {
        alert("Моля, въведете валидно количество.");
        return;
    }

    closeQuickCellModal();
    const loader = document.getElementById('loading');
    loader.style.display = 'flex';

    try {
        let existing = globalState.quotas.filter(q => q.operator_name === currentQcOp && q.date === currentQcDate && q.detail_name === detail && q.operation_name === op);
        if (existing.length > 0) {
            let ids = existing.map(e => e.id);
            await client.from('planner_bobini').delete().in('id', ids);
            globalState.quotas = globalState.quotas.filter(q => !ids.includes(q.id));
        }

        const { data, error } = await client.from('planner_bobini').insert([{
            date: currentQcDate,
            operator_name: currentQcOp,
            detail_name: detail,
            operation_name: op,
            qty: qty
        }]).select();

        if (error) throw error;
        if (data && data[0]) globalState.quotas.push(data[0]);

        renderCalendarUI();
        loader.style.display = 'none';
    } catch(err) {
        alert("Грешка при запис: " + err.message);
        loader.style.display = 'none';
    }
};

// ==========================================
// FORWARD CAPACITY SCHEDULING & WIZARD (ETA)
// ==========================================

function calculateSchedule(startDateStr, totalQty, operators, dailyNorm, detailName, operationName) {
    if (!startDateStr || !totalQty || totalQty <= 0 || !operators || operators.length === 0 || !dailyNorm || dailyNorm <= 0) {
        return null;
    }

    let cur = new Date(startDateStr + 'T00:00:00');
    let remaining = totalQty;
    let schedule = [];
    let workDaysSet = new Set();
    let maxDays = 90; // guard against infinite loop
    let dayCounter = 0;

    while (remaining > 0 && dayCounter < maxDays) {
        dayCounter++;
        let dayOfWeek = cur.getDay(); // 0 Sun, 6 Sat
        let dateStr = formatDateISO(cur);

        // Monday to Friday
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            // Find operators who are NOT on vacation / OFF on this date
            let availOps = operators.filter(op => {
                return !globalState.quotas.some(q => q.operator_name === op && q.date === dateStr && q.detail_name === 'OFF');
            });

            if (availOps.length > 0) {
                let dayHadWork = false;
                for (let i = 0; i < availOps.length; i++) {
                    if (remaining <= 0) break;
                    let opName = availOps[i];
                    let assignQty = Math.min(dailyNorm, remaining);
                    if (assignQty > 0) {
                        schedule.push({
                            date: dateStr,
                            operator_name: opName,
                            detail_name: detailName,
                            operation_name: operationName,
                            qty: assignQty
                        });
                        remaining -= assignQty;
                        dayHadWork = true;
                    }
                }
                if (dayHadWork) {
                    workDaysSet.add(dateStr);
                }
            }
        }
        // Advance 1 day
        cur.setDate(cur.getDate() + 1);
    }

    let endDateStr = schedule.length > 0 ? schedule[schedule.length - 1].date : null;
    return {
        schedule,
        workDaysCount: workDaysSet.size,
        endDateStr,
        remainingUnassigned: remaining
    };
}

window.setWzNorm = function(num) {
    let normInput = document.getElementById('wz-daily-norm');
    if (normInput) {
        normInput.value = num;
        updateWizardCalc();
    }
};

window.openWizardModal = function(preselectedDetail, preselectedOp) {
    let select = document.getElementById('wz-detail-select');
    select.innerHTML = '';
    
    if (globalState.targetItems.length === 0) {
        alert("Няма налични свободни задачи за разпределяне.");
        return;
    }

    globalState.targetItems.forEach(t => {
        let opt = document.createElement('option');
        opt.value = `${t.detailName}___${t.operationName}`;
        opt.text = `${t.detailName} (${t.operationName}) — План: ${t.planQty} бр.`;
        if (preselectedDetail && t.detailName === preselectedDetail && (!preselectedOp || t.operationName === preselectedOp)) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });

    // Populate operators chips
    let opsCont = document.getElementById('wz-ops-container');
    opsCont.innerHTML = '';
    globalState.activeOperators.forEach(op => {
        let label = document.createElement('label');
        label.className = 'wizard-chip selected';
        label.innerHTML = `<input type="checkbox" value="${op}" checked onchange="onWizardChipChange(this); updateWizardCalc();"> 👤 ${op}`;
        opsCont.appendChild(label);
    });

    // Default daily norm
    let normInput = document.getElementById('wz-daily-norm');
    if (normInput && (!normInput.value || parseInt(normInput.value) <= 0)) {
        normInput.value = 6;
    }

    let overwriteCb = document.getElementById('wz-overwrite-checkbox');
    if (overwriteCb) overwriteCb.checked = false;

    onWizardDetailChange();
    lockScreenForFullModal('wizard-modal');
};

window.closeWizardModal = function() {
    unlockScreenForFullModal('wizard-modal');
};

window.onWizardChipChange = function(input) {
    if (input.checked) {
        input.parentElement.classList.add('selected');
    } else {
        input.parentElement.classList.remove('selected');
    }
};

window.onWizardDetailChange = function() {
    let select = document.getElementById('wz-detail-select');
    if (!select || !select.value) return;
    let parts = select.value.split('___');
    let detail = parts[0];
    let op = parts[1];

    let targetItem = globalState.targetItems.find(t => t.detailName === detail && t.operationName === op);
    let totalAssigned = 0;
    let existingQuotasForDetail = [];
    globalState.quotas.forEach(q => {
        if (q.detail_name === detail && q.operation_name === op && q.detail_name !== 'OFF') {
            totalAssigned += q.qty;
            existingQuotasForDetail.push(q);
        }
    });

    let planQty = targetItem ? targetItem.planQty : 0;
    let remaining = Math.max(0, planQty - totalAssigned);

    let latestScheduledDateStr = null;
    if (existingQuotasForDetail.length > 0) {
        let sortedDates = existingQuotasForDetail.map(q => q.date).sort();
        latestScheduledDateStr = sortedDates[sortedDates.length - 1];
    }

    let info = document.getElementById('wz-detail-info');
    if (info) {
        let dateBadge = '';
        if (latestScheduledDateStr && totalAssigned > 0) {
            let [ly, lm, ld] = latestScheduledDateStr.split('-');
            dateBadge = ` <span style="color:#94a3b8; font-weight:normal;">(заложени до ${ld}.${lm})</span>`;
        }
        info.innerHTML = `План: <strong>${planQty} бр.</strong> | Вече заложени: <strong>${totalAssigned} бр.</strong>${dateBadge} | Остава за залагане: <strong style="color:${remaining > 0 ? '#10b981' : '#38bdf8'};">${remaining} бр.</strong>`;
    }

    let qtyInput = document.getElementById('wz-qty-input');
    if (qtyInput) {
        qtyInput.value = remaining > 0 ? remaining : (planQty > 0 ? planQty : 50);
    }

    // Smart start date:
    // If detail already has scheduled tasks and there are remaining pieces,
    // continue right after the latest scheduled day!
    let startDateInput = document.getElementById('wz-start-date');
    if (startDateInput) {
        if (latestScheduledDateStr && remaining > 0 && totalAssigned > 0) {
            startDateInput.value = getNextWorkDay(latestScheduledDateStr);
        } else {
            let today = new Date();
            let selectedMonth = document.getElementById('month-picker')?.value || getMonthString();
            let [y, m] = selectedMonth.split('-').map(Number);
            if (today.getFullYear() === y && (today.getMonth() + 1) === m) {
                startDateInput.value = formatDateISO(today);
            } else {
                let d1 = new Date(y, m - 1, 1);
                while (d1.getDay() === 0 || d1.getDay() === 6) d1.setDate(d1.getDate() + 1);
                startDateInput.value = formatDateISO(d1);
            }
        }
    }

    updateWizardCalc();
};

window.fillWizardRemaining = function() {
    let select = document.getElementById('wz-detail-select');
    if (!select || !select.value) return;
    let parts = select.value.split('___');
    let detail = parts[0];
    let op = parts[1];

    let targetItem = globalState.targetItems.find(t => t.detailName === detail && t.operationName === op);
    let totalAssigned = 0;
    globalState.quotas.forEach(q => {
        if (q.detail_name === detail && q.operation_name === op && q.detail_name !== 'OFF') {
            totalAssigned += q.qty;
        }
    });
    let remaining = targetItem ? Math.max(0, targetItem.planQty - totalAssigned) : 0;
    document.getElementById('wz-qty-input').value = remaining > 0 ? remaining : 10;
    updateWizardCalc();
};

window.toggleAllWizardOps = function(select) {
    let inputs = document.querySelectorAll('#wz-ops-container input[type="checkbox"]');
    inputs.forEach(i => {
        i.checked = select;
        if (select) i.parentElement.classList.add('selected');
        else i.parentElement.classList.remove('selected');
    });
    updateWizardCalc();
};

window.updateWizardCalc = function() {
    let select = document.getElementById('wz-detail-select');
    if (!select || !select.value) return;
    let parts = select.value.split('___');
    let detail = parts[0];
    let op = parts[1];

    let selectedOps = Array.from(document.querySelectorAll('#wz-ops-container input:checked')).map(i => i.value);
    let opCountEl = document.getElementById('wz-op-count');
    if (opCountEl) opCountEl.innerText = selectedOps.length;

    let qtyInput = document.getElementById('wz-qty-input');
    let inputQty = parseInt(qtyInput ? qtyInput.value : 0) || 0;

    let normInput = document.getElementById('wz-daily-norm');
    let dailyNorm = parseInt(normInput ? normInput.value : 0) || 0;

    let startDateStr = document.getElementById('wz-start-date')?.value;

    let preview = document.getElementById('wz-calc-preview');
    if (!preview) return;

    if (selectedOps.length === 0) {
        preview.innerHTML = `<span style="color:#f59e0b;">👉 Моля, изберете поне един оператор (бобиньорка).</span>`;
        return;
    }
    if (inputQty <= 0) {
        preview.innerHTML = `<span style="color:#f59e0b;">👉 Въведете количество за изработка (бр.).</span>`;
        return;
    }
    if (dailyNorm <= 0) {
        preview.innerHTML = `<span style="color:#f59e0b;">👉 Задайте дневна норма (напр. 6 бр./ден на човек).</span>`;
        return;
    }
    if (!startDateStr) {
        preview.innerHTML = `<span style="color:#f59e0b;">👉 Изберете начална дата.</span>`;
        return;
    }

    let result = calculateSchedule(startDateStr, inputQty, selectedOps, dailyNorm, detail, op);
    if (!result || !result.endDateStr) {
        preview.innerHTML = `<span style="color:#ef4444;">⚠️ Не можа да се генерира график. Проверете дали избраните дати не са изцяло почивни.</span>`;
        return;
    }

    let teamDailyCap = selectedOps.length * dailyNorm;
    let endD = new Date(result.endDateStr + 'T00:00:00');
    let startD = new Date(startDateStr + 'T00:00:00');
    let dayNames = ['Неделя', 'Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота'];
    let endDayName = dayNames[endD.getDay()];
    let endDateFormatted = `${String(endD.getDate()).padStart(2,'0')}.${String(endD.getMonth()+1).padStart(2,'0')}.${endD.getFullYear()} г. (${endDayName})`;

    // Deadline check (target is 20th of the month of startDate)
    let deadlineDay = 20;
    let deadlineDate = new Date(startD.getFullYear(), startD.getMonth(), deadlineDay);
    
    // Check if finishes on or before the 20th
    let isOnTime = (endD <= deadlineDate);

    // Calculate suggested norm if delayed
    let suggestionHtml = '';
    if (!isOnTime) {
        let availableWorkDays = 0;
        let tempCur = new Date(startD);
        while (tempCur <= deadlineDate) {
            let dw = tempCur.getDay();
            if (dw !== 0 && dw !== 6) availableWorkDays++;
            tempCur.setDate(tempCur.getDate() + 1);
        }

        if (availableWorkDays > 0) {
            let neededTeamCap = Math.ceil(inputQty / availableWorkDays);
            let neededNormPerPerson = Math.ceil(neededTeamCap / selectedOps.length);
            suggestionHtml = `
              <div style="margin-top:8px; padding-top:8px; border-top:1px dashed rgba(239,68,68,0.4); font-size:0.9em;">
                💡 <strong>Препоръка:</strong> До 20-то число остават <strong>${availableWorkDays} работни дни</strong>.<br>
                За да приключите навреме, вдигнете нормата на <button type="button" class="btn-micro" style="background:#ef4444; color:#fff; font-weight:bold; padding:3px 10px; margin:2px 0;" onclick="setWzNorm(${neededNormPerPerson})">⚡ ${neededNormPerPerson} бр./ден</button> или включете още оператори.
              </div>
            `;
        } else {
            suggestionHtml = `
              <div style="margin-top:8px; padding-top:8px; border-top:1px dashed rgba(239,68,68,0.4); font-size:0.9em;">
                💡 Началната дата (${formatDateDisplay(startD)}) е след 20-то число на месеца. Преместете началната дата по-рано или увеличете дневната норма.
              </div>
            `;
        }
    }

    if (isOnTime) {
        preview.innerHTML = `
          <div style="background:rgba(16,185,129,0.12); border:1px solid #10b981; border-radius:8px; padding:12px;">
            <div style="color:#10b981; font-weight:900; font-size:1.05em; display:flex; align-items:center; gap:6px;">
              ✅ Срокът е изпълним до 20-то число!
            </div>
            <div style="margin-top:6px; color:#f1f5f9; font-size:0.92em; line-height:1.6;">
              🏁 <strong>Очаквано завършване (ETA):</strong> <span style="color:#38bdf8; font-weight:bold; font-size:1.15em;">${endDateFormatted}</span><br>
              ⏳ <strong>Времетраене:</strong> <strong style="color:#fff;">${result.workDaysCount} работни дни</strong> (без съботи и недели)<br>
              ⚡ <strong>Дневен капацитет:</strong> ${teamDailyCap} бр./ден общо (${selectedOps.length} човека × ${dailyNorm} бр./ден)
            </div>
          </div>
        `;
    } else {
        preview.innerHTML = `
          <div style="background:rgba(239,68,68,0.15); border:1px solid #ef4444; border-radius:8px; padding:12px;">
            <div style="color:#ef4444; font-weight:900; font-size:1.05em; display:flex; align-items:center; gap:6px;">
              ⚠️ ВНИМАНИЕ: Поръчката надхвърля 20-то число!
            </div>
            <div style="margin-top:6px; color:#f1f5f9; font-size:0.92em; line-height:1.6;">
              🏁 <strong>Очаквано завършване (ETA):</strong> <span style="color:#f87171; font-weight:bold; font-size:1.15em;">${endDateFormatted}</span><br>
              ⏳ <strong>Времетраене:</strong> <strong style="color:#fff;">${result.workDaysCount} работни дни</strong> при текуща норма ${dailyNorm} бр./ден.<br>
              ⚡ <strong>Дневен капацитет:</strong> ${teamDailyCap} бр./ден общо (${selectedOps.length} човека × ${dailyNorm} бр./ден)
            </div>
            ${suggestionHtml}
          </div>
        `;
    }
};

window.confirmWizardAssign = async function() {
    let select = document.getElementById('wz-detail-select');
    if (!select || !select.value) {
        alert("Моля, изберете детайл.");
        return;
    }
    let parts = select.value.split('___');
    let detail = parts[0];
    let op = parts[1];

    let selectedOps = Array.from(document.querySelectorAll('#wz-ops-container input:checked')).map(i => i.value);
    if (selectedOps.length === 0) {
        alert("Моля, изберете поне един оператор.");
        return;
    }

    let qtyInput = document.getElementById('wz-qty-input');
    let inputQty = parseInt(qtyInput ? qtyInput.value : 0) || 0;
    if (inputQty <= 0) {
        alert("Моля, въведете валидно количество.");
        return;
    }

    let normInput = document.getElementById('wz-daily-norm');
    let dailyNorm = parseInt(normInput ? normInput.value : 0) || 0;
    if (dailyNorm <= 0) {
        alert("Моля, въведете дневна норма.");
        return;
    }

    let startDateStr = document.getElementById('wz-start-date')?.value;
    if (!startDateStr) {
        alert("Моля, изберете начална дата.");
        return;
    }

    let result = calculateSchedule(startDateStr, inputQty, selectedOps, dailyNorm, detail, op);
    if (!result || result.schedule.length === 0) {
        alert("Не бяха намерени работни дни за разпределяне.");
        return;
    }

    closeWizardModal();
    const loader = document.getElementById('loading');
    loader.style.display = 'flex';

    try {
        let isOverwrite = document.getElementById('wz-overwrite-checkbox')?.checked || false;

        if (isOverwrite) {
            let scheduledDates = Array.from(new Set(result.schedule.map(s => s.date)));
            
            let existingIdsToDelete = [];
            globalState.quotas.forEach(q => {
                if (q.detail_name === detail && q.operation_name === op && scheduledDates.includes(q.date)) {
                    // Safety: Never delete quotas with terminal reports!
                    let hasReport = (globalState.otcheti || []).some(r =>
                        r['Дата'] && r['Дата'].split('T')[0] === q.date &&
                        String(r['Оператор'] || '').trim().toLowerCase() === String(q.operator_name || '').trim().toLowerCase() &&
                        normalizeStr(r['ID Детайл']) === normalizeStr(q.detail_name) &&
                        normalizeStr(r['Операция']) === normalizeStr(q.operation_name) &&
                        (parseFloat(r['Количество']) || 0) > 0
                    );
                    if (!hasReport) {
                        existingIdsToDelete.push(q.id);
                    }
                }
            });

            if (existingIdsToDelete.length > 0) {
                await client.from('planner_bobini').delete().in('id', existingIdsToDelete);
                globalState.quotas = globalState.quotas.filter(q => !existingIdsToDelete.includes(q.id));
            }
        }

        const { data, error } = await client.from('planner_bobini').insert(result.schedule).select();
        if (error) throw error;

        if (data && data.length > 0) {
            globalState.quotas.push(...data);
        }

        let startD = new Date(startDateStr + 'T00:00:00');
        globalState.currentWeekMonday = getMonday(startD);

        renderCalendarUI();
        loader.style.display = 'none';

        let endD = new Date(result.endDateStr + 'T00:00:00');
        let dayNames = ['Неделя', 'Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота'];
        let actionMsg = isOverwrite ? 'презаписани' : 'добавени';
        alert(`✅ Успешно ${actionMsg} ${inputQty} бр. в графика за ${result.workDaysCount} работни дни!\n\n🏁 Очаквано завършване (ETA): ${String(endD.getDate()).padStart(2,'0')}.${String(endD.getMonth()+1).padStart(2,'0')}.${endD.getFullYear()} г. (${dayNames[endD.getDay()]})\n\nКалендарът е обновен.`);
    } catch (err) {
        alert("Грешка при запис: " + err.message);
        loader.style.display = 'none';
    }
};

// Task Options Modal (Enhanced with Quantity Edit)
let currentOptionQuotaId = null;

window.openTaskOptionsModal = function(quotaId, detailName, operationName, currentQty) {
    currentOptionQuotaId = quotaId;
    document.getElementById('opt-task-title').innerText = detailName;
    document.getElementById('opt-task-op').innerText = operationName;
    document.getElementById('opt-task-qty').value = currentQty || '';

    document.getElementById('opt-btn-save-qty').onclick = async function() {
        let newQty = parseInt(document.getElementById('opt-task-qty').value) || 0;
        if (newQty <= 0) {
            alert("Моля, въведете валидно количество.");
            return;
        }
        closeTaskOptionsModal();
        const loader = document.getElementById('loading');
        loader.style.display = 'flex';
        try {
            const { error } = await client.from('planner_bobini').update({ qty: newQty }).eq('id', quotaId);
            if (error) throw error;
            let q = globalState.quotas.find(x => String(x.id) === String(quotaId));
            if (q) q.qty = newQty;
            renderCalendarUI();
            loader.style.display = 'none';
        } catch (err) {
            alert("Грешка при редакция: " + err.message);
            loader.style.display = 'none';
        }
    };

    document.getElementById('opt-btn-copy').onclick = function() {
        closeTaskOptionsModal();
        copyForward(quotaId);
    };

    document.getElementById('opt-btn-delete').onclick = function() {
        closeTaskOptionsModal();
        deleteQuota(quotaId);
    };

    openModalCentered('task-options-modal');
};

window.closeTaskOptionsModal = function() {
    closeModalCentered('task-options-modal');
};

window.openPoolModal = function() {
    try {
        let searchInput = document.getElementById('pool-search-input');
        if (searchInput) {
            searchInput.value = globalState.poolSearchQuery || '';
        }
        renderTaskPool();
    } catch (err) {
        console.error("Грешка при зареждане на списъка със свободни задачи:", err);
    }
    lockScreenForFullModal('task-pool-modal');
    let list = document.getElementById('w-task-pool-modal-list');
    if (list) list.scrollTop = 0;
};

window.closePoolModal = function() {
    unlockScreenForFullModal('task-pool-modal');
};

window.clearPoolSearch = function() {
    let searchInput = document.getElementById('pool-search-input');
    if (searchInput) searchInput.value = '';
    globalState.poolSearchQuery = '';
    renderTaskPool();
};

window.onPoolSearchInput = function(query) {
    globalState.poolSearchQuery = (query || '').trim().toLowerCase();
    renderTaskPool();
};

window.setPoolFilter = function(filter) {
    globalState.poolFilter = filter;
    renderTaskPool();
};

window.togglePoolMobile = function() {
    openPoolModal();
};

async function deleteQuota(id) {
    if(!confirm("Сигурни ли сте, че искате да изтриете тази задача?")) return;
    
    const loader = document.getElementById('loading');
    loader.style.display = 'flex';

    try {
        const { error } = await client.from('planner_bobini').delete().eq('id', id);
        if (error) throw error;
        
        globalState.quotas = globalState.quotas.filter(q => q.id !== id);
        renderCalendarUI();
        loader.style.display = 'none';
    } catch(err) {
        alert("Грешка при изтриване: " + err.message);
        loader.style.display = 'none';
    }
}

// Reconcile schedule surplus:
// When actual reported units exceed the quota or when extra work is reported,
// reduce/remove the un-reported quotas from the latest days (the tail of the schedule)
// so the ETA completion date pulls forward in time.
let isReconciling = false;

async function reconcileScheduleSurplus() {
    if (isReconciling) return;
    isReconciling = true;

    try {
        const selectedMonth = document.getElementById('month-picker')?.value || getMonthString();
        let parts = selectedMonth.split('-');
        let year = parseInt(parts[0]);
        let month = parseInt(parts[1]);
        let daysInMonth = new Date(year, month, 0).getDate();

        let startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
        let endOfMonth = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

        // Get actual reported pieces for this month
        let monthOtcheti = (globalState.otcheti || []).filter(r => {
            if (!r['Дата'] || r['Статус'] !== 'Отчетено') return false;
            let d = r['Дата'].split('T')[0];
            return d >= startOfMonth && d <= endOfMonth;
        });

        let idsToDelete = [];
        let updates = []; // { id, newQty }

        // Process each target item
        globalState.targetItems.forEach(item => {
            let planQty = item.planQty || 0;
            if (planQty <= 0) return;

            // Total produced so far this month for this detail and operation
            let doneAllMonth = 0;
            monthOtcheti.forEach(r => {
                if (normalizeStr(r['ID Детайл']) === normalizeStr(item.detailName) &&
                    normalizeStr(r['Операция']) === normalizeStr(item.operationName)) {
                    doneAllMonth += (parseFloat(r['Количество']) || 0);
                }
            });

            // How many pieces still remain needed according to the monthly plan target
            let remainingNeeded = Math.max(0, planQty - doneAllMonth);

            // Filter all quotas in this month for this detail (excluding OFF)
            let itemQuotas = globalState.quotas.filter(q =>
                q.date >= startOfMonth && q.date <= endOfMonth &&
                q.detail_name === item.detailName &&
                q.operation_name === item.operationName &&
                q.detail_name !== 'OFF'
            );

            // Find which quotas are pending (have 0 reported pieces so far)
            let pendingQuotas = [];
            itemQuotas.forEach(q => {
                let reportedForQ = 0;
                monthOtcheti.forEach(r => {
                    let rDate = r['Дата'].split('T')[0];
                    if (rDate === q.date &&
                        String(r['Оператор'] || '').trim().toLowerCase() === String(q.operator_name || '').trim().toLowerCase() &&
                        normalizeStr(r['ID Детайл']) === normalizeStr(q.detail_name) &&
                        normalizeStr(r['Операция']) === normalizeStr(q.operation_name)) {
                        reportedForQ += (parseFloat(r['Количество']) || 0);
                    }
                });

                if (reportedForQ === 0) {
                    pendingQuotas.push(q);
                }
            });

            let sumPending = pendingQuotas.reduce((sum, q) => sum + (q.qty || 0), 0);
            let excess = sumPending - remainingNeeded;

            if (excess > 0) {
                // Sort pending quotas by date descending (tail/latest days first)
                pendingQuotas.sort((a, b) => b.date.localeCompare(a.date));

                for (let q of pendingQuotas) {
                    if (excess <= 0) break;

                    if (q.qty <= excess) {
                        excess -= q.qty;
                        idsToDelete.push(q.id);
                        q._toDelete = true;
                    } else {
                        let newQty = q.qty - excess;
                        excess = 0;
                        updates.push({ id: q.id, newQty: newQty });
                        q.qty = newQty;
                    }
                }
            }
        });

        // Delete excess quotas from DB in batches
        if (idsToDelete.length > 0) {
            const chunkSize = 100;
            for (let i = 0; i < idsToDelete.length; i += chunkSize) {
                let chunk = idsToDelete.slice(i, i + chunkSize);
                await client.from('planner_bobini').delete().in('id', chunk);
            }
            let delSet = new Set(idsToDelete);
            globalState.quotas = globalState.quotas.filter(q => !delSet.has(q.id));
        }

        // Update partially trimmed quotas in DB
        if (updates.length > 0) {
            await Promise.all(updates.map(u =>
                client.from('planner_bobini').update({ qty: u.newQty }).eq('id', u.id)
            ));
        }
    } catch (err) {
        console.error("Грешка при динамично преизчисляване на графика:", err);
    } finally {
        isReconciling = false;
    }
}

window.triggerManualReconcile = async function() {
    const loader = document.getElementById('loading');
    if (loader) loader.style.display = 'flex';
    try {
        await reconcileScheduleSurplus();
        renderCalendarUI();
    } catch(err) {
        alert("Грешка при преизчисляване: " + err.message);
    } finally {
        if (loader) loader.style.display = 'none';
    }
};

async function clearMonth() {
    const selectedMonth = document.getElementById('month-picker')?.value || getMonthString();
    
    let year = parseInt(selectedMonth.split('-')[0]);
    let month = parseInt(selectedMonth.split('-')[1]);
    let daysInMonth = new Date(year, month, 0).getDate();
    
    let startOfMonth = `${year}-${String(month).padStart(2,'0')}-01`;
    let endOfMonth = `${year}-${String(month).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`;

    // Get actual reports for this month
    let monthOtcheti = (globalState.otcheti || []).filter(r => {
        if (!r['Дата'] || r['Статус'] !== 'Отчетено') return false;
        let d = r['Дата'].split('T')[0];
        return d >= startOfMonth && d <= endOfMonth;
    });

    let monthQuotas = globalState.quotas.filter(q => q.date >= startOfMonth && q.date <= endOfMonth);
    
    let idsToDelete = [];
    let countKeptWithReports = 0;
    let countKeptOffDays = 0;

    monthQuotas.forEach(q => {
        if (q.detail_name === 'OFF') {
            // Keep manually marked days off (X)
            countKeptOffDays++;
            return;
        }

        // Check if there is at least 1 reported piece for this quota
        let hasReports = monthOtcheti.some(r => {
            let rDate = r['Дата'].split('T')[0];
            return rDate === q.date &&
                   String(r['Оператор'] || '').trim().toLowerCase() === String(q.operator_name || '').trim().toLowerCase() &&
                   normalizeStr(r['ID Детайл']) === normalizeStr(q.detail_name) &&
                   normalizeStr(r['Операция']) === normalizeStr(q.operation_name) &&
                   (parseFloat(r['Количество']) || 0) > 0;
        });

        if (hasReports) {
            countKeptWithReports++;
        } else {
            idsToDelete.push(q.id);
        }
    });

    if (idsToDelete.length === 0) {
        alert(`Няма норми за изчистване за ${selectedMonth}.\n\nВсички съществуващи задачи вече имат отчетени бройки или са почивни дни.`);
        return;
    }

    let confirmMsg = `ВНИМАНИЕ!\n\nИскате ли да изчистите зададените норми без отчети за месец ${selectedMonth}?\n\n` +
                     `• Ще бъдат изтрити: ${idsToDelete.length} планирани норми (без отчети)\n` +
                     `• Ще бъдат запазени: ${countKeptWithReports} задачи с вече отчетени бройки\n` +
                     `• Ще бъдат запазени: ${countKeptOffDays} маркирани почивни дни (Х)`;

    if (!confirm(confirmMsg)) return;

    const loader = document.getElementById('loading');
    if (loader) loader.style.display = 'flex';

    try {
        const chunkSize = 100;
        for (let i = 0; i < idsToDelete.length; i += chunkSize) {
            let chunk = idsToDelete.slice(i, i + chunkSize);
            const { error } = await client.from('planner_bobini').delete().in('id', chunk);
            if (error) throw error;
        }

        let delSet = new Set(idsToDelete);
        globalState.quotas = globalState.quotas.filter(q => !delSet.has(q.id));

        renderCalendarUI();
        if (loader) loader.style.display = 'none';

        alert(`✅ Успешно изчистени ${idsToDelete.length} норми!\nЗапазени са задачите с отчети (${countKeptWithReports}) и почивните дни (${countKeptOffDays}).`);
    } catch (err) {
        alert("Грешка при изчистване: " + err.message);
        if (loader) loader.style.display = 'none';
    }
}

async function generateTerminalTasks(client) {
  try {
      const [plansRes, reportsRes, skladRes, bufferRes, invRes] = await Promise.all([
          client.from('plan').select('*').in('Статус', ['Активен']).limit(100000), 
          client.from('otcheti').select('*').order('Дата', {ascending: false}).limit(2000), 
          client.from('sklad').select('*').limit(100000), 
          client.from('sklad_bufferi').select('*').limit(100000),
          client.from('inventory').select('*').limit(100000)
      ]);

      if (plansRes.error) throw plansRes.error; 
      if (reportsRes.error) throw reportsRes.error;
      if (invRes.error) throw invRes.error;

      let globalNomData = staticCache.nomData || [];
      let namesMap = {}; if (globalNomData) globalNomData.forEach(n => { let code = normalizeStr(n['ID Детайл']); namesMap[code] = n['Вътрешно име'] || ''; });
      
      let bufferMap = {};
      let bufferScrapMap = {};

      if (bufferRes && bufferRes.data) {
          bufferRes.data.forEach(b => {
              let bKey = normalizeStr(b['ID Детайл']);
              let bufVal = parseFloat(b['Буфер']) || 0;
              let scrapVal = parseFloat(b['% Брак']) || 0;
              if (bufVal > 0) bufferMap[bKey] = bufVal;
              if (scrapVal > 0) bufferScrapMap[bKey] = scrapVal;
          });
      }

      let globalBomData = staticCache.bomData || []; 
      let globalRoutesByDetail = staticCache.routesByDetail || {};

      let takenOps = {}; 
      reportsRes.data.forEach(r => {
          let code = normalizeStr(r['ID Детайл']);
          let op = normalizeStr(r['Операция']);
          let key = code + '_' + op; 
          
          if (r['Статус'] === 'Брак' || r['Статус'] === 'Отчетено' || r['Статус'] === 'Прекъсната') {
              if (String(r['Оператор']).trim() === "".trim() && takenOps[key] === undefined) takenOps[key] = false;
          }
          else if (r['Статус'] === 'Започната') {
              if (String(r['Оператор']).trim() === "".trim() && takenOps[key] === undefined) takenOps[key] = true;
          }
      });

      let skladData = skladRes.data || [];
      let getSkladQty = (code) => { let c = normalizeStr(code); let item = skladData.find(s => normalizeStr(s['ID Детайл']) === c); return item ? (parseFloat(item['Остатък']) || 0) : 0; };

      let planRoots = {}; 
      let planNames = {};
      let groupEarliestId = {};
      let planNameToId = {};
      let groupTotalTargets = {};
      let groupScrapDetails = {};
      
      plansRes.data.forEach(plan => {
          if (String(plan['Статус']).trim() === 'Изпратен') return;
          let planId = String(plan.id).trim(); 
          let rootItem = String(plan['Вътрешно име']).trim(); 
          let targetQty = parseFloat(plan['Целево количество']) || 0;
          let monthYear = (plan['Месец'] && plan['Година']) ? (plan['Месец'] + ' ' + plan['Година']) : '';
          
          let groupKey = monthYear || planId; 
          
          if (!groupEarliestId[groupKey] || parseInt(planId) < groupEarliestId[groupKey]) {
              groupEarliestId[groupKey] = parseInt(planId);
              groupScrapDetails[groupKey] = plan['scrap_details']; // jsonb column
          }
          groupTotalTargets[groupKey] = (groupTotalTargets[groupKey] || 0) + targetQty;
          
          if (plan['Вътрешно име']) planNameToId[String(plan['Вътрешно име']).trim()] = planId;
          planNameToId[planId] = planId;
          
          planNames[groupKey] = monthYear ? monthYear : plan['Вътрешно име'];
          
          if (globalNomData) {
              let translated = globalNomData.find(n => String(n['Вътрешно име']).trim() === rootItem);
              if (translated && translated['ID Детайл']) rootItem = String(translated['ID Детайл']).trim();
          }
          rootItem = rootItem.toLowerCase();

          if(!planRoots[groupKey]) planRoots[groupKey] = {};
          planRoots[groupKey][rootItem] = (planRoots[groupKey][rootItem] || 0) + targetQty;
      });

      let physicalStock = {}; 
      if (invRes.data) {
          invRes.data.forEach(r => {
              let code = normalizeStr(r['ID Детайл']);
              let op = normalizeStr(r['Операция']);
              if (op === 'готов продукт') {
                  let routes = globalRoutesByDetail[code];
                  if (routes && routes.length > 0) {
                      op = normalizeStr(routes[routes.length - 1]['Име на операция']);
                  }
              }
              let key = code + '_' + op;
              physicalStock[key] = (physicalStock[key] || 0) + (parseFloat(r['Количество']) || 0);
          });
      }

      let getDepth = (item, visited = new Set()) => {
          if (depths[item] !== undefined) return depths[item];
          if (visited.has(item)) return 0; 
          visited.add(item);
          let parents = globalBomData.filter(b => normalizeStr(b['ID Компонент']) === item);
          if (parents.length === 0) { depths[item] = 0; return 0; }
          let maxP = -1;
          parents.forEach(p => {
              let pCode = normalizeStr(p['ID Родител']);
              if (pCode !== item) { let d = getDepth(pCode, new Set(visited)); if (d > maxP) maxP = d; }
          });
          depths[item] = maxP + 1; return depths[item];
      };
      let depths = {};

      let globalPlanItems = new Set();
      Object.keys(planRoots).forEach(pId => {
          Object.keys(planRoots[pId]).forEach(root => globalPlanItems.add(root));
      });
      Object.keys(bufferMap).forEach(root => globalPlanItems.add(root));
      let planItemsAdded = true;
      while(planItemsAdded) {
          planItemsAdded = false;
          globalBomData.forEach(b => {
              let parent = normalizeStr(b['ID Родител']);
              let child = normalizeStr(b['ID Компонент']);
              if (globalPlanItems.has(parent) && !globalPlanItems.has(child)) {
                  globalPlanItems.add(child);
                  planItemsAdded = true;
              }
          });
      }

      let generatedTasks = [];

      let planIdsToProcess = Object.keys(planRoots).sort((a,b) => (groupEarliestId[a] || 0) - (groupEarliestId[b] || 0));
      planIdsToProcess.push('NONE'); // For Buffer plans
      
      let scrapUpdatesToSave = {};
      
      let virtualSklad = {};
      let getVirtualSklad = (code) => {
          let c = code.toLowerCase();
          if (virtualSklad[c] !== undefined) return virtualSklad[c];
          let qty = getSkladQty(c);
          virtualSklad[c] = qty;
          return qty;
      };
      let consumeSklad = (code, qty) => {
          let c = code.toLowerCase();
          virtualSklad[c] = getVirtualSklad(c) - qty;
      };
      let planPureBom = {};
      let planScrapBom = {};
      let planOriginalBom = {};
      let bufferPureBom = {};
      let bufferOriginalBom = {};
      let scrapActivated = {};
      let componentPlanSources = {};
      let componentPlanIds = {};

      planIdsToProcess.forEach(pId => {
          let isBuffer = pId === 'NONE';
          
          let savedMap = null;
          let currentTargetTotal = groupTotalTargets[pId] || 0;
          
          if (!isBuffer) {
              if (groupScrapDetails[pId] && groupScrapDetails[pId].target === currentTargetTotal && groupScrapDetails[pId].map) {
                  savedMap = groupScrapDetails[pId].map;
              } else {
                  savedMap = {};
                  let earliestId = groupEarliestId[pId];
                  if (earliestId) {
                      scrapUpdatesToSave[earliestId] = { target: currentTargetTotal, map: savedMap };
                  }
              }
          }
          
          if (isBuffer) {
              Object.keys(bufferMap).forEach(root => {
                  let qty = bufferMap[root];
                  bufferPureBom[root] = (bufferPureBom[root] || 0) + qty;
                  bufferOriginalBom[root] = (bufferOriginalBom[root] || 0) + qty;
              });
          } else if (planRoots[pId]) {
              Object.keys(planRoots[pId]).forEach(root => {
                  let targetQty = planRoots[pId][root];
                  let available = getVirtualSklad(root);
                  let pureDeficit = Math.max(0, targetQty - available);
                  consumeSklad(root, targetQty);
                  
                  planPureBom[root] = (planPureBom[root] || 0) + pureDeficit;
                  planOriginalBom[root] = (planOriginalBom[root] || 0) + targetQty;
                  
                  if (!componentPlanSources[root]) componentPlanSources[root] = new Set();
                  componentPlanSources[root].add(planNames[pId] || pId);
                  if (!componentPlanIds[root]) componentPlanIds[root] = new Set();
                  componentPlanIds[root].add(pId);
                  
                  let scrapAllowance = 0;
                  if (bufferScrapMap[root] > 0) {
                      if (savedMap && savedMap[root] !== undefined) {
                          scrapAllowance = savedMap[root];
                      } else {
                          scrapAllowance = Math.ceil(pureDeficit * (bufferScrapMap[root] / 100));
                          if (savedMap) savedMap[root] = scrapAllowance;
                      }
                      scrapActivated[root] = true;
                  }
                  planScrapBom[root] = (planScrapBom[root] || 0) + scrapAllowance;
              });
          }
      });
      
      let allItemsSet = new Set([...Object.keys(planPureBom), ...Object.keys(bufferPureBom)]);
      globalBomData.forEach(b => { allItemsSet.add(normalizeStr(b['ID Родител'])); allItemsSet.add(normalizeStr(b['ID Компонент'])); });
      Object.keys(bufferMap).forEach(code => allItemsSet.add(code));
      
      let allItemsArray = Array.from(allItemsSet);
      allItemsArray.forEach(item => getDepth(item));
      allItemsArray.sort((a, b) => (depths[a] || 0) - (depths[b] || 0));

      allItemsArray.forEach((code, nodeIndex) => {
          let currentPlanPureTarget = planPureBom[code] || 0;
          let currentPlanScrapTarget = planScrapBom[code] || 0;
          let currentBufferTarget = bufferPureBom[code] || 0;
          
          if (currentPlanPureTarget <= 0 && currentPlanScrapTarget <= 0 && currentBufferTarget <= 0) return;
          
          let routes = globalRoutesByDetail[code] || [];
          
          if (routes.length > 0) {
              for (let i = routes.length - 1; i >= 0; i--) {
                  let route = routes[i];
                  let opName = normalizeStr(route['Име на операция']);
                  let opKey = code + '_' + opName;
                  
                  let availableHere = physicalStock[opKey] || 0; 
                  
                  let takenPure = Math.min(currentPlanPureTarget, availableHere);
                  availableHere -= takenPure;
                  let pureShortage = currentPlanPureTarget - takenPure;
                  
                  let takenScrap = Math.min(currentPlanScrapTarget, availableHere);
                  availableHere -= takenScrap;
                  let scrapShortage = currentPlanScrapTarget - takenScrap;
                  
                  let takenBuffer = Math.min(currentBufferTarget, availableHere);
                  availableHere -= takenBuffer;
                  let bufferShortage = currentBufferTarget - takenBuffer;
                  
                  let totalShortage = pureShortage + scrapShortage + bufferShortage;
                  
                  if (totalShortage > 0) {
                      let maxAllowed = Infinity;
                      let displayMaxAllowed = Infinity;
                      let hasLimit = false;
                      let blockingReasons = [];
                      
                      if (i > 0) {
                          hasLimit = true;
                          let prevRoute = routes[i - 1]; 
                          let prevOpName = normalizeStr(prevRoute['Име на операция']);
                          maxAllowed = physicalStock[code + '_' + prevOpName] || 0;
                          displayMaxAllowed = maxAllowed;
                          if (maxAllowed < totalShortage) blockingReasons.push(`Липсва наличност на предходна операция (${String(prevRoute['Име на операция']).trim()})`);
                      }

                      let isLastOp = (i === routes.length - 1);
                      let currentOpNum = parseInt(route['№ Операция']) || 0;
                      let children = globalBomData.filter(b => normalizeStr(b['ID Родител']) === code);
                      
                      let relevantChildren = children.filter(c => {
                          let opNum = c['Влага се на Оп. №'] ? parseFloat(c['Влага се на Оп. №']) : 0;
                          if (opNum > 0) return opNum === currentOpNum;
                          return (i === 0);
                      });

                      let itemsToFetch = [];
                      if (relevantChildren.length > 0) {
                          hasLimit = true;
                          let minSets = Infinity;
                          let rawMinSets = Infinity;
                          relevantChildren.forEach(child => {
                              let cCode = normalizeStr(child['ID Компонент']); 
                              let multiplier = parseFloat(child['Количество']) || 1;
                              let childRoutes = globalRoutesByDetail[cCode] || [];
                              let wipAvail = 0;
                              let skladAvail = getSkladQty(cCode);
                              if (childRoutes.length > 0) {
                                  let lastChildOp = normalizeStr(childRoutes[childRoutes.length - 1]['Име на операция']);
                                  wipAvail = physicalStock[cCode + '_' + lastChildOp] || 0;
                              }
                              let childAvail = wipAvail + skladAvail;
                              let sets = Math.floor(childAvail / multiplier);
                              if (sets < minSets) { minSets = sets; blockingReasons.push(`${cCode} (${childAvail} налични)`); }
                              if (sets < rawMinSets) rawMinSets = sets;
                              
                              let nomItem = globalNomData.find(n => normalizeStr(n['ID Детайл']) === cCode);
                              let type = nomItem ? normalizeStr(nomItem['Тип']) : '';
                              if (type !== 'материал' || i === 0) {
                                  let lastChildDropoff = '';
                                  if (childRoutes.length > 0) {
                                      let lastOpObj = childRoutes[childRoutes.length - 1];
                                      lastChildDropoff = String(lastOpObj['Инструкция за оставяне'] || '').trim();
                                  }
                                  let locTexts = [];
                                  if (wipAvail > 0) {
                                      locTexts.push(`${wipAvail}бр. ${lastChildDropoff ? 'в ' + lastChildDropoff : 'в Буфер'}`);
                                  }
                                  if (skladAvail > 0) {
                                      locTexts.push(`${skladAvail}бр. в Склад`);
                                  }
                                  if (locTexts.length === 0) locTexts.push(`0бр. налични`);
                                  let loc = locTexts.join(' / ');
                                  
                                  itemsToFetch.push({ code: String(child['ID Компонент']).trim(), qty: multiplier, loc: loc, type: type });
                              }
                          });
                          
                          if (rawMinSets < displayMaxAllowed) displayMaxAllowed = rawMinSets;
                          if (maxAllowed < totalShortage) {
                              if (!blockingReasons.includes(`Липсващи компоненти`)) blockingReasons.push(`Липсващи компоненти`);
                          }
                      }
                      
                      if (i === 0) {
                          let rootNom = globalNomData.find(n => normalizeStr(n['ID Детайл']) === code);
                          if (rootNom && rootNom['ID Родител'] && normalizeStr(rootNom['ID Родител']) !== '') {
                              let parentCode = normalizeStr(rootNom['ID Родител']);
                              if (parentCode) {
                                  let pNom = globalNomData.find(n => normalizeStr(n['ID Детайл']) === parentCode);
                                  let loc = pNom ? String(pNom['Местоположение'] || '').trim() : '';
                                  itemsToFetch.push({ code: normalizeStr(rootNom['ID Родител']), qty: parseFloat(rootNom['Разходна норма']) || 1, loc: loc, type: 'материал' });
                              }
                          }
                      }
                      
                      let isTaken = takenOps[opKey] === true;
                      if (maxAllowed < 0) maxAllowed = 0; 
                      let isBlocked = hasLimit && maxAllowed <= 0; 
                      let machineName = route['Машина'] || '';
                      
                      let matchMachine = false;
                      if (!"" || "".trim() === "" || isTaken) {
                          matchMachine = true;
                      } else {
                          let selectedMachines = "".split(',').map(m => m.toLowerCase().trim()); 
                          matchMachine = selectedMachines.some(m => machineName.toLowerCase().includes(m));
                      }

                      if (matchMachine) {
                          blockingReasons = [...new Set(blockingReasons)];
                          let pIdForCard = null;
                          let pNameForCardBase = "КОМПОНЕНТ";
                          
                          if (componentPlanSources[code] && componentPlanSources[code].size > 0) {
                              pNameForCardBase = Array.from(componentPlanSources[code]).join(', ');
                              pIdForCard = Array.from(componentPlanIds[code] || []).join(',');
                          } else {
                              Object.keys(planRoots).forEach(pid => {
                                  if (planRoots[pid] && planRoots[pid][code]) {
                                      pIdForCard = pid;
                                      pNameForCardBase = planNames[pid] || pid;
                                  }
                              });
                          }

                          let safeIdBase = (code + '_n' + nodeIndex + '_op' + i).replace(/[^a-zA-Z0-9а-яА-Я_]/g, '_');
                          let displayName = String(route['Код на детайла']).trim();
                          let displayOpName = String(route['Име на операция']).trim();
                          let nextOpStr = i < routes.length - 1 ? String(routes[i+1]['Име на операция']).trim() : "Готово";
                          let typeStr = i === routes.length - 1 ? "ЗЕЛЕНА" : "СИНЯ";
                          
                          let pushTask = (shortage, typeSuffix, pNameOverride, isScrapOnlyCard, originalTarget) => {
                              if (shortage <= 0) return;
                              let isBlocked = hasLimit && maxAllowed <= 0;
                              let targetInput = shortage;
                              let displayMaxAllowedForThis = displayMaxAllowed;
                              let realMaxAllowedForThis = maxAllowed;
                              
                              if (hasLimit && targetInput > realMaxAllowedForThis) targetInput = realMaxAllowedForThis;
                              if (targetInput <= 0 && !hasLimit) targetInput = 1;
                              if (targetInput <= 0 && isBlocked) targetInput = 0;
                              
                              if (!isBlocked && isScrapOnlyCard) {
                                  if (hasLimit) {
                                      displayMaxAllowedForThis = Math.min(displayMaxAllowedForThis, shortage);
                                      realMaxAllowedForThis = displayMaxAllowedForThis;
                                  } else {
                                      displayMaxAllowedForThis = shortage;
                                      realMaxAllowedForThis = shortage;
                                  }
                                  targetInput = displayMaxAllowedForThis;
                              }
                              
                              let totalDone = (originalTarget > 0 ? originalTarget : shortage) - shortage;
                              if (totalDone < 0) totalDone = 0;
                              
                              generatedTasks.push({ 
                                  id: safeIdBase + typeSuffix, 
                                  plan_id: pNameOverride === 'БУФЕРИ' ? null : pIdForCard, 
                                  plan_name: pNameOverride,
                                  name: displayName, internalName: namesMap[code] || '', op: displayOpName, opNum: parseInt(route['№ Операция']) || 0, next_op: nextOpStr, 
                                  machine: machineName, drawing_link: route['Линк към чертеж'], sop_link: route['Линк към СОП'], desc: route['Описание'], 
                                  type: typeStr, 
                                  dropoff: route['Инструкция за оставяне'],
                                  defaultQty: targetInput, maxAllowed: displayMaxAllowedForThis, realMaxAllowed: realMaxAllowedForThis, hasLimit: hasLimit, isBlocked: isBlocked, blockingReasons: blockingReasons, 
                                  totalNeed: shortage, pureQty: isScrapOnlyCard ? 0 : shortage, scrapAllowance: isScrapOnlyCard ? shortage : 0,
                                  totalDone: totalDone, totalScrapped: 0, isTaken: isTaken, isGreenCard: (pNameOverride === 'БУФЕРИ'),
                                  globalGrossAtLoad: 0, globalScrapAtLoad: 0,
                                  itemsToFetch: itemsToFetch
                              });
                              
                              if (hasLimit) {
                                  maxAllowed -= shortage;
                                  displayMaxAllowed -= shortage;
                                  if (maxAllowed < 0) maxAllowed = 0;
                                  if (displayMaxAllowed < 0) displayMaxAllowed = 0;
                              }
                          };

                          pushTask(pureShortage, '_blue', pNameForCardBase, false, planOriginalBom[code] || 0);
                          pushTask(scrapShortage, '_scrap', pNameForCardBase, true, 0);
                          pushTask(bufferShortage, '_green', "БУФЕРИ", false, bufferOriginalBom[code] || 0);
                      }
                  }

                  if ((takenPure + takenScrap + takenBuffer) > 0) {
                      physicalStock[opKey] -= (takenPure + takenScrap + takenBuffer);
                  }

                  currentPlanPureTarget = pureShortage;
                  currentPlanScrapTarget = scrapShortage;
                  currentBufferTarget = bufferShortage;
              }
          }
          
          if (currentPlanPureTarget > 0 || currentPlanScrapTarget > 0 || currentBufferTarget > 0) {
              let children = globalBomData.filter(b => normalizeStr(b['ID Родител']) === code);
              children.forEach(c => {
                  let cCode = normalizeStr(c['ID Компонент']);
                  let multiplier = parseFloat(c['Количество']) || 1;
                  
                  let childPureTarget = currentPlanPureTarget * multiplier;
                  let childScrapTarget = currentPlanScrapTarget * multiplier;
                  
                  let isActivated = scrapActivated[code] === true;
                  
                  if (!isActivated && bufferScrapMap[cCode] > 0) {
                      let newScrap = Math.ceil(childPureTarget * (bufferScrapMap[cCode] / 100));
                      childScrapTarget += newScrap;
                      isActivated = true;
                  }
                  
                  if (isActivated) {
                      scrapActivated[cCode] = true;
                  }
                  
                  planPureBom[cCode] = (planPureBom[cCode] || 0) + childPureTarget;
                  planScrapBom[cCode] = (planScrapBom[cCode] || 0) + childScrapTarget;
                  planOriginalBom[cCode] = (planOriginalBom[cCode] || 0) + ((planOriginalBom[code] || 0) * multiplier);
                  
                  if (!componentPlanSources[cCode]) componentPlanSources[cCode] = new Set();
                  if (componentPlanSources[code]) {
                      componentPlanSources[code].forEach(pn => componentPlanSources[cCode].add(pn));
                  }
                  if (!componentPlanIds[cCode]) componentPlanIds[cCode] = new Set();
                  if (componentPlanIds[code]) {
                      componentPlanIds[code].forEach(id => componentPlanIds[cCode].add(id));
                  }
                  
                  bufferPureBom[cCode] = (bufferPureBom[cCode] || 0) + (currentBufferTarget * multiplier);
                  bufferOriginalBom[cCode] = (bufferOriginalBom[cCode] || 0) + ((bufferOriginalBom[code] || 0) * multiplier);
              });
          }
      });

      if (Object.keys(scrapUpdatesToSave).length > 0) {
          Promise.all(Object.keys(scrapUpdatesToSave).map(pId => {
              return client.from('plan').update({ scrap_details: scrapUpdatesToSave[pId] }).eq('id', pId);
          })).catch(e => console.error('Failed to save scrap details:', e));
      }

      generatedTasks.sort((a, b) => {
          let getWeight = (t) => {
              if (t.plan_name === "БУФЕРИ") return Infinity;
              if (t.plan_name === "СВРЪХПРОИЗВОДСТВО") return 9999999;
              let baseWeight = groupEarliestId[t.plan_id] || 0;
              if (t.pureQty <= 0 && t.scrapAllowance > 0) {
                  baseWeight += 5000000;
              }
              return baseWeight;
          };
          let aPlanWeight = getWeight(a);
          let bPlanWeight = getWeight(b);
          if (aPlanWeight !== bPlanWeight) return aPlanWeight - bPlanWeight;
          return a.opNum - b.opNum;
      });
      return generatedTasks;
  } catch (err) { console.error(err); return []; }
}
