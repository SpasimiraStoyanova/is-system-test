// ==============================================================================
// Workplace Tasks & Priority Management (Задачи & Приоритети по Работни Места)
// IS-SYSTEMS MES Test Environment
// ==============================================================================

const supabaseUrl = 'https://zdythzcgcjxwbxufunuh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE';
const client = supabase.createClient(supabaseUrl, supabaseKey);

// Global State
let rawPlans = [];
let rawBom = [];
let rawRoutes = [];
let rawNom = [];
let rawInventory = [];
let rawReports = [];
let rawPriorities = [];

let activeTasks = [];
let currentStatusFilter = 'all';
let hasUnsavedChanges = false;
let sortableInstance = null;

// Helpers
function normalize(str) {
    if (!str) return '';
    return String(str).replace(/[\u00A0\s]+/g, ' ').trim().toLowerCase();
}

async function fetchAllRows(table, select = '*', extraFilter = null, maxRows = 100000) {
    let result = [];
    let start = 0;
    while (true) {
        let query = client.from(table).select(select).range(start, start + 999);
        if (extraFilter) query = extraFilter(query);
        const { data, error } = await query;
        if (error) throw error;
        if (data) result.push(...data);
        if (!data || data.length < 1000 || result.length >= maxRows) break;
        start += 1000;
    }
    return result;
}

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    await loadAllData();
});

async function loadAllData() {
    const tbody = document.getElementById('tasksTableBody');
    tbody.innerHTML = `
        <tr>
            <td colspan="11" class="loading-row">
                <i class="fas fa-spinner fa-spin"></i> Зареждане на данни от базата...
            </td>
        </tr>
    `;

    try {
        const [plans, bom, routes, nom, inv, priorities, reports] = await Promise.all([
            fetchAllRows('plan', '*'),
            fetchAllRows('bom', '*'),
            fetchAllRows('marshruti', '*'),
            fetchAllRows('Номенклатура', '*'),
            fetchAllRows('inventory', '*'),
            fetchAllRows('task_priorities', '*'),
            fetchAllRows('otcheti', '*', q => q.in('Статус', ['Отчетено', 'Готов продукт']))
        ]);

        rawPlans = plans || [];
        rawBom = bom || [];
        rawRoutes = routes || [];
        rawNom = nom || [];
        rawInventory = inv || [];
        rawPriorities = priorities || [];
        rawReports = reports || [];

        populatePeriodSelectors();
        populateMachineSelector();
        buildWorkplaceTasks();
        setSaveStatus(false);
    } catch (err) {
        console.error('Грешка при зареждане:', err);
        Swal.fire('Грешка', 'Неуспешно зареждане на данните: ' + err.message, 'error');
    }
}

function populatePeriodSelectors() {
    const yearSelect = document.getElementById('selectYear');
    const monthSelect = document.getElementById('selectMonth');

    const years = [...new Set(rawPlans.map(p => parseInt(p['Година'])).filter(y => y && !isNaN(y)))].sort((a,b) => b - a);
    const months = [...new Set(rawPlans.map(p => String(p['Месец'] || '').trim()).filter(m => m !== '' && m !== '1'))];

    // Standard Bulgarian months order for sorting
    const monthOrder = ["Януари", "Февруари", "Март", "Април", "Май", "Юни", "Юли", "Август", "Септември", "Октомври", "Ноември", "Декември"];
    months.sort((a, b) => {
        let ia = monthOrder.indexOf(a);
        let ib = monthOrder.indexOf(b);
        if (ia !== -1 && ib !== -1) return ia - ib;
        return a.localeCompare(b);
    });

    const currentYear = new Date().getFullYear();
    const currentMonthNum = new Date().getMonth();
    const defaultMonthName = monthOrder[currentMonthNum] || 'Октомври';

    yearSelect.innerHTML = years.map(y => `<option value="${y}" ${y === 2026 ? 'selected' : ''}>${y} г.</option>`).join('');
    if (years.length === 0) yearSelect.innerHTML = `<option value="2026" selected>2026 г.</option>`;

    let monthHtml = `<option value="ALL">-- Всички активни планове --</option>`;
    months.forEach(m => {
        let isSel = (m.toLowerCase() === defaultMonthName.toLowerCase()) ? 'selected' : '';
        monthHtml += `<option value="${m}" ${isSel}>${m}</option>`;
    });
    monthSelect.innerHTML = monthHtml;
}

function populateMachineSelector() {
    const machineSelect = document.getElementById('selectMachine');
    const machines = [];
    rawRoutes.forEach(r => {
        let m = String(r['Машина'] || '').trim();
        if (m && !machines.includes(m)) machines.push(m);
    });
    machines.sort((a,b) => a.localeCompare(b));

    const prevVal = machineSelect.value;
    let html = `<option value="">-- Изберете работно място / машина --</option>`;
    machines.forEach(m => {
        let isSel = (m === prevVal) ? 'selected' : '';
        html += `<option value="${m}" ${isSel}>${m}</option>`;
    });
    machineSelect.innerHTML = html;

    // Default select first machine if none selected
    if (!prevVal && machines.length > 0) {
        machineSelect.value = machines[0];
    }
}

function onPeriodChange() {
    buildWorkplaceTasks();
}

function onMachineChange() {
    buildWorkplaceTasks();
}

// Task Calculation Engine
function buildWorkplaceTasks() {
    const selectedYear = parseInt(document.getElementById('selectYear').value) || 2026;
    const selectedMonth = document.getElementById('selectMonth').value;
    const selectedMachine = document.getElementById('selectMachine').value.trim();

    if (!selectedMachine) {
        document.getElementById('tasksTableBody').innerHTML = `
            <tr>
                <td colspan="11" class="loading-row">
                    <i class="fas fa-hand-pointer text-primary"></i> Моля, изберете машина от горното меню, за да се заредят задачите.
                </td>
            </tr>
        `;
        updateStats([], 0, 0);
        return;
    }

    // 1. Filter relevant plans
    let filteredPlans = rawPlans.filter(p => {
        let pStatus = String(p['Статус'] || '').trim();
        if (pStatus === '🚚 Изпратен') return false;
        let pYear = parseInt(p['Година']);
        let pMonth = String(p['Месец'] || '').trim();

        if (selectedMonth === 'ALL') {
            return pStatus === 'Активен';
        }
        return pYear === selectedYear && pMonth.toLowerCase() === selectedMonth.toLowerCase();
    });

    // 2. Expand BOM requirements for filtered plans
    let nomMap = {};
    let codeByName = {};
    rawNom.forEach(n => {
        let code = normalize(n['ID Детайл']);
        let name = String(n['Вътрешно име'] || '').trim();
        nomMap[code] = n;
        if (name) codeByName[normalize(name)] = code;
    });

    let neededDetails = {}; // detailCode -> { targetQty: N, planSources: Set }

    filteredPlans.forEach(plan => {
        let planItemName = String(plan['Вътрешно име'] || '').trim();
        let planQty = parseFloat(plan['Целево количество']) || 0;
        let rootCode = codeByName[normalize(planItemName)] || normalize(planItemName);

        if (!neededDetails[rootCode]) neededDetails[rootCode] = { targetQty: 0, planSources: new Set() };
        neededDetails[rootCode].targetQty += planQty;
        neededDetails[rootCode].planSources.add(planItemName);

        // Recursively add children
        function expandChildren(parentCode, currentQty) {
            let children = rawBom.filter(b => normalize(b['ID Родител']) === parentCode);
            children.forEach(c => {
                let childCode = normalize(c['ID Компонент']);
                let mult = parseFloat(c['Количество']) || 1;
                let childQty = currentQty * mult;

                if (!neededDetails[childCode]) neededDetails[childCode] = { targetQty: 0, planSources: new Set() };
                neededDetails[childCode].targetQty += childQty;
                neededDetails[childCode].planSources.add(planItemName);

                expandChildren(childCode, childQty);
            });
        }
        expandChildren(rootCode, planQty);
    });

    // 3. Pre-aggregate otcheti by Detail + Operation
    let otchetiMap = {};
    rawReports.forEach(r => {
        let code = normalize(r['ID Детайл']);
        let op = normalize(r['Операция']);
        let key = code + '||' + op;
        otchetiMap[key] = (otchetiMap[key] || 0) + (parseFloat(r['Количество']) || 0);
    });

    // 4. Pre-aggregate inventory stock by Detail + Operation
    let stockMap = {};
    rawInventory.forEach(inv => {
        let code = normalize(inv['ID Детайл']);
        let op = normalize(inv['Операция']);
        let key = code + '||' + op;
        let qty = parseFloat(inv['Количество']) || parseFloat(inv['Общо']) || parseFloat(inv['Свободни']) || 0;
        stockMap[key] = (stockMap[key] || 0) + qty;
    });

    // 5. Load saved priorities for this month + machine
    let priorityMap = {};
    rawPriorities.forEach(p => {
        let pMachine = String(p.machine || '').trim();
        let pMonth = String(p.plan_month || '').trim();
        let pYear = parseInt(p.plan_year);

        let matchesMachine = pMachine.toLowerCase() === selectedMachine.toLowerCase();
        let matchesPeriod = (selectedMonth === 'ALL') ? true : (pYear === selectedYear && pMonth.toLowerCase() === selectedMonth.toLowerCase());

        if (matchesMachine && matchesPeriod) {
            let key = normalize(p.detail_id) + '||' + parseInt(p.op_num);
            priorityMap[key] = {
                order: parseInt(p.priority_order) || 100,
                score: parseFloat(p.priority_score) || 0,
                notes: p.notes || ''
            };
        }
    });

    // 6. Match details against Marshruti for this machine
    let taskList = [];

    // Group routes by detail
    let routesByDetail = {};
    rawRoutes.forEach(r => {
        let code = normalize(r['Код на детайла']);
        if (!routesByDetail[code]) routesByDetail[code] = [];
        routesByDetail[code].push(r);
    });
    Object.keys(routesByDetail).forEach(code => {
        routesByDetail[code].sort((a,b) => (parseInt(a['№ Операция']) || 0) - (parseInt(b['№ Операция']) || 0));
    });

    Object.keys(neededDetails).forEach(detailCode => {
        let needInfo = neededDetails[detailCode];
        let routes = routesByDetail[detailCode] || [];

        routes.forEach((route, idx) => {
            let routeMachine = String(route['Машина'] || '').trim();
            if (routeMachine.toLowerCase() !== selectedMachine.toLowerCase()) return;

            let opNum = parseInt(route['№ Операция']) || 0;
            let opName = String(route['Име на операция'] || '').trim();
            let opKey = detailCode + '||' + normalize(opName);

            let nomItem = nomMap[detailCode] || {};
            let detailName = nomItem['Вътрешно име'] || detailCode;
            let drawingLink = route['Линк към чертеж'] || nomItem['Линк към чертеж'] || '';

            let targetQty = needInfo.targetQty;
            let doneQty = otchetiMap[opKey] || 0;
            let remainQty = Math.max(0, targetQty - doneQty);

            // Previous operation and availability calculation
            let prevOpName = '';
            let prevOpNum = 0;
            let availableFromPrev = 0;
            let isFirstOp = (idx === 0);

            if (!isFirstOp) {
                let prevRoute = routes[idx - 1];
                prevOpName = String(prevRoute['Име на операция'] || '').trim();
                prevOpNum = parseInt(prevRoute['№ Операция']) || 0;
                let prevKey = detailCode + '||' + normalize(prevOpName);
                availableFromPrev = stockMap[prevKey] || 0;
            } else {
                // First operation: materials available in raw stock
                let rawStockKey = detailCode + '||склад';
                availableFromPrev = stockMap[rawStockKey] || 0;
            }

            // Determine status
            let status = 'waiting';
            if (remainQty <= 0) {
                status = 'completed';
            } else if (isFirstOp || availableFromPrev > 0) {
                status = 'ready';
            }

            // Check saved priority
            let prioKey = detailCode + '||' + opNum;
            let savedPrio = priorityMap[prioKey];
            let priorityOrder = savedPrio ? savedPrio.order : 999;
            let notes = savedPrio ? savedPrio.notes : '';

            taskList.push({
                detail_id: String(route['Код на детайла']).trim(),
                detail_name: detailName,
                drawing_link: drawingLink,
                op_num: opNum,
                op_name: opName,
                op_desc: String(route['Описание'] || route['Инструкция за оставяне'] || '').trim(),
                plan_sources: Array.from(needInfo.planSources).join(', '),
                target_qty: targetQty,
                done_qty: doneQty,
                remain_qty: remainQty,
                available_prev: availableFromPrev,
                prev_op_name: prevOpName,
                prev_op_num: prevOpNum,
                is_first_op: isFirstOp,
                status: status,
                priority_order: priorityOrder,
                notes: notes,
                has_custom_priority: !!savedPrio
            });
        });
    });

    // 7. Sort tasks:
    // First by custom priority (1, 2, 3...)
    // If tie or not custom, ready tasks first, then by detail, then by opNum
    taskList.sort((a, b) => {
        if (a.priority_order !== b.priority_order) return a.priority_order - b.priority_order;
        if (a.status === 'ready' && b.status !== 'ready') return -1;
        if (b.status === 'ready' && a.status !== 'ready') return 1;
        if (a.remain_qty > 0 && b.remain_qty <= 0) return -1;
        if (b.remain_qty > 0 && a.remain_qty <= 0) return 1;
        return a.op_num - b.op_num;
    });

    // Re-index consecutive priorities cleanly (1, 2, 3...)
    taskList.forEach((t, i) => {
        t.priority_order = i + 1;
    });

    activeTasks = taskList;
    renderTasks();
}

function renderTasks() {
    const tbody = document.getElementById('tasksTableBody');
    const searchVal = normalize(document.getElementById('searchInput').value);

    // Apply Filter & Search
    let displayed = activeTasks.filter(t => {
        if (currentStatusFilter !== 'all' && t.status !== currentStatusFilter) return false;
        if (searchVal) {
            let matchText = (t.detail_id + ' ' + t.detail_name + ' ' + t.op_name + ' ' + t.op_num + ' ' + t.plan_sources + ' ' + t.notes).toLowerCase();
            if (!matchText.includes(searchVal)) return false;
        }
        return true;
    });

    updateStats(activeTasks, displayed.length);

    if (displayed.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="loading-row">
                    <i class="fas fa-search-minus"></i> Няма намерени задачи, отговарящи на избраните филтри.
                </td>
            </tr>
        `;
        return;
    }

    let rowsHtml = '';
    displayed.forEach((t, idx) => {
        let isTop3 = (t.priority_order <= 3);
        let statusBadge = '';
        if (t.status === 'completed') {
            statusBadge = `<span class="badge-status badge-completed"><i class="fas fa-check-circle"></i> Завършена</span>`;
        } else if (t.status === 'ready') {
            statusBadge = `<span class="badge-status badge-ready"><i class="fas fa-play-circle"></i> Готова за пускане</span>`;
        } else {
            statusBadge = `<span class="badge-status badge-waiting"><i class="fas fa-hourglass-half"></i> Чака заготовки</span>`;
        }

        let wipInfo = '';
        if (t.is_first_op) {
            wipInfo = `<span class="wip-tag ${t.available_prev > 0 ? 'avail' : 'empty'}">1-ва оп. (${t.available_prev}бр. в Склад)</span>`;
        } else {
            if (t.available_prev > 0) {
                wipInfo = `<span class="wip-tag avail">✅ ${t.available_prev}бр. готови от Оп. ${t.prev_op_num}</span>`;
            } else {
                wipInfo = `<span class="wip-tag empty">⏳ 0бр. от Оп. ${t.prev_op_num} (${t.prev_op_name})</span>`;
            }
        }

        let drawingBtn = t.drawing_link 
            ? `<a href="${t.drawing_link}" target="_blank" class="btn-drawing" title="Отвори чертеж"><i class="fas fa-drafting-compass"></i></a>` 
            : '';

        rowsHtml += `
            <tr data-detail="${t.detail_id}" data-op="${t.op_num}">
                <td style="text-align: center;">
                    <div class="priority-cell">
                        <span class="drag-handle" title="Хванете и преместете с мишката">⋮⋮</span>
                        <span class="prio-badge ${isTop3 ? 'top-3' : ''}">${t.priority_order}</span>
                        <div class="prio-arrows">
                            <button class="btn-arrow" onclick="moveTask('${t.detail_id}', ${t.op_num}, -1)" title="Премести нагоре">▲</button>
                            <button class="btn-arrow" onclick="moveTask('${t.detail_id}', ${t.op_num}, 1)" title="Премести надолу">▼</button>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="detail-code">${t.detail_id}</span>
                    <span class="detail-name">${t.detail_name}</span>
                </td>
                <td>
                    <div>
                        <span class="op-badge">Оп. ${t.op_num}</span>
                        <span class="op-name">${t.op_name}</span>
                    </div>
                    ${t.op_desc ? `<div class="op-desc" title="${t.op_desc}">${t.op_desc}</div>` : ''}
                </td>
                <td>
                    <span style="font-weight: 600; color: #4338ca; font-size: 0.9em;">${t.plan_sources || '-'}</span>
                </td>
                <td style="text-align: center;">
                    <span class="qty-num qty-target">${t.target_qty}</span>
                </td>
                <td style="text-align: center;">
                    <span class="qty-num qty-done">${t.done_qty}</span>
                </td>
                <td style="text-align: center;">
                    <span class="qty-num ${t.remain_qty > 0 ? 'qty-remain' : 'qty-zero'}">${t.remain_qty}</span>
                </td>
                <td>
                    ${wipInfo}
                </td>
                <td style="text-align: center;">
                    ${statusBadge}
                </td>
                <td>
                    <input type="text" class="notes-input" placeholder="Добави бележка към оператора..." 
                        value="${escapeHtml(t.notes || '')}" 
                        onchange="updateTaskNotes('${t.detail_id}', ${t.op_num}, this.value)">
                </td>
                <td style="text-align: center;">
                    ${drawingBtn}
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = rowsHtml;
    initSortable();
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#039;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function initSortable() {
    const tbody = document.getElementById('tasksTableBody');
    if (sortableInstance) {
        sortableInstance.destroy();
    }

    sortableInstance = new Sortable(tbody, {
        handle: '.drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        onEnd: function () {
            // Re-order activeTasks according to DOM order
            let newOrderList = [];
            const rows = tbody.querySelectorAll('tr[data-detail]');
            rows.forEach((row, index) => {
                let detail = row.getAttribute('data-detail');
                let op = parseInt(row.getAttribute('data-op'));
                let task = activeTasks.find(t => t.detail_id === detail && t.op_num === op);
                if (task) {
                    task.priority_order = index + 1;
                    newOrderList.push(task);
                }
            });

            // Append any tasks that were filtered out at the end
            activeTasks.forEach(t => {
                if (!newOrderList.includes(t)) {
                    t.priority_order = newOrderList.length + 1;
                    newOrderList.push(t);
                }
            });

            activeTasks = newOrderList;
            setSaveStatus(true);
            renderTasks();
        }
    });
}

function moveTask(detailId, opNum, delta) {
    let index = activeTasks.findIndex(t => t.detail_id === detailId && t.op_num === opNum);
    if (index === -1) return;
    let newIndex = index + delta;
    if (newIndex < 0 || newIndex >= activeTasks.length) return;

    // Swap
    let temp = activeTasks[index];
    activeTasks[index] = activeTasks[newIndex];
    activeTasks[newIndex] = temp;

    // Renumber
    activeTasks.forEach((t, i) => t.priority_order = i + 1);

    setSaveStatus(true);
    renderTasks();
}

function updateTaskNotes(detailId, opNum, newNote) {
    let task = activeTasks.find(t => t.detail_id === detailId && t.op_num === opNum);
    if (task) {
        task.notes = newNote;
        setSaveStatus(true);
    }
}

function setStatusFilter(filterType) {
    currentStatusFilter = filterType;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    const clicked = document.querySelector(`.chip[data-filter="${filterType}"]`);
    if (clicked) clicked.classList.add('active');
    renderTasks();
}

function filterRenderedTasks() {
    renderTasks();
}

function updateStats(allTasks, filteredCount) {
    let readyCount = allTasks.filter(t => t.status === 'ready').length;
    let waitingCount = allTasks.filter(t => t.status === 'waiting').length;
    let completedCount = allTasks.filter(t => t.status === 'completed').length;

    let targetTotal = allTasks.reduce((sum, t) => sum + t.target_qty, 0);
    let doneTotal = allTasks.reduce((sum, t) => sum + t.done_qty, 0);
    let pct = targetTotal > 0 ? Math.round((doneTotal / targetTotal) * 100) : 0;

    document.getElementById('countAll').innerText = allTasks.length;
    document.getElementById('countReady').innerText = readyCount;
    document.getElementById('countWaiting').innerText = waitingCount;
    document.getElementById('countCompleted').innerText = completedCount;

    document.getElementById('statTotalTasks').innerText = allTasks.length;
    document.getElementById('statReadyTasks').innerText = readyCount;
    document.getElementById('statWaitingTasks').innerText = waitingCount;
    document.getElementById('statDonePieces').innerText = doneTotal;
    document.getElementById('statTargetPieces').innerText = targetTotal;
    document.getElementById('statPercentDone').innerText = pct + '%';
}

function setSaveStatus(hasChanges) {
    hasUnsavedChanges = hasChanges;
    const btn = document.getElementById('btnSavePriorities');
    const indicator = document.getElementById('saveStatusIndicator');

    if (hasChanges) {
        btn.classList.add('has-changes');
        btn.innerHTML = `<i class="fas fa-exclamation-circle"></i> <span>Запази Промените!</span>`;
        indicator.className = 'save-status unsaved';
        indicator.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Имате незапазени промени в приоритетите!`;
    } else {
        btn.classList.remove('has-changes');
        btn.innerHTML = `<i class="fas fa-check"></i> <span>Запази Приоритетите</span>`;
        indicator.className = 'save-status saved';
        indicator.innerHTML = `<i class="fas fa-check-circle"></i> Всички промени са записани`;
    }
}

// Save Priorities to Supabase
async function savePriorities() {
    const selectedYear = parseInt(document.getElementById('selectYear').value) || 2026;
    const selectedMonth = document.getElementById('selectMonth').value;
    const selectedMachine = document.getElementById('selectMachine').value.trim();

    if (!selectedMachine) {
        Swal.fire('Внимание', 'Моля, изберете машина преди да запазите.', 'warning');
        return;
    }

    if (activeTasks.length === 0) {
        Swal.fire('Информация', 'Няма задачи за запазване на това работно място.', 'info');
        return;
    }

    Swal.fire({
        title: 'Запазване на приоритетите...',
        html: `Записване на подредбата за <b>${selectedMachine}</b>...`,
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const rowsToUpsert = activeTasks.map(t => ({
            plan_year: selectedYear,
            plan_month: selectedMonth,
            machine: selectedMachine,
            detail_id: t.detail_id,
            op_num: t.op_num,
            op_name: t.op_name,
            detail_name: t.detail_name,
            priority_order: t.priority_order,
            priority_score: 0,
            notes: t.notes || null,
            updated_at: new Date().toISOString()
        }));

        const { error } = await client
            .from('task_priorities')
            .upsert(rowsToUpsert, {
                onConflict: 'plan_year,plan_month,machine,detail_id,op_num'
            });

        if (error) throw error;

        // Also update local rawPriorities
        rowsToUpsert.forEach(row => {
            let idx = rawPriorities.findIndex(p => 
                p.plan_year === row.plan_year && 
                p.plan_month === row.plan_month && 
                p.machine.toLowerCase() === row.machine.toLowerCase() && 
                p.detail_id === row.detail_id && 
                p.op_num === row.op_num
            );
            if (idx !== -1) {
                rawPriorities[idx] = row;
            } else {
                rawPriorities.push(row);
            }
        });

        setSaveStatus(false);

        Swal.fire({
            icon: 'success',
            title: 'Приоритетите са запазени!',
            html: `Задачите за <b>${selectedMachine}</b> бяха преподредени успешно.<br><small class="text-muted">Терминалите на операторите веднага ще отразят тази поредност.</small>`,
            confirmButtonColor: '#2563eb',
            timer: 2500
        });
    } catch (err) {
        console.error('Грешка при запис:', err);
        Swal.fire('Грешка', 'Неуспешен запис на приоритетите: ' + err.message, 'error');
    }
}

// Excel Export
function exportToExcel() {
    const selectedMachine = document.getElementById('selectMachine').value || 'Workplace';
    const selectedMonth = document.getElementById('selectMonth').value || 'Month';

    const exportData = activeTasks.map(t => ({
        'Приоритет': t.priority_order,
        'Детайл Код': t.detail_id,
        'Детайл Име': t.detail_name,
        'Оп №': t.op_num,
        'Операция': t.op_name,
        'Описание': t.op_desc,
        'За План': t.plan_sources,
        'План Бройки': t.target_qty,
        'Отчетени Бройки': t.done_qty,
        'Оставащи Бройки': t.remain_qty,
        'Наличност от Предходна Оп': t.is_first_op ? `Склад: ${t.available_prev}` : `Оп ${t.prev_op_num}: ${t.available_prev}`,
        'Статус': t.status === 'ready' ? 'Готова за пускане' : (t.status === 'completed' ? 'Завършена' : 'Чака заготовки'),
        'Бележка': t.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Задачи");
    XLSX.writeFile(wb, `Zadachi_${selectedMachine.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedMonth}.xlsx`);
}

