// ==============================================================================
// Multi-Machine Workplace Tasks & Priority Board (Табло Машини & Задачи)
// IS-SYSTEMS MES Test Environment
// ==============================================================================

const supabaseUrl = 'https://zdythzcgcjxwbxufunuh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE';
const client = supabase.createClient(supabaseUrl, supabaseKey);

// Global Data
let rawPlans = [];
let rawBom = [];
let rawRoutes = [];
let rawNom = [];
let rawInventory = [];
let rawReports = [];
let rawPriorities = [];

// Calculated State: machineName -> [tasks...]
let machineTasksMap = {};
let allUniqueMachines = [];
let currentStatusFilter = 'all';
let hasUnsavedChanges = false;
let sortableInstances = [];

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
    const grid = document.getElementById('machinesGrid');
    grid.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin fa-2x text-primary"></i>
            <div style="margin-top: 15px; font-weight: 700; color: #64748b;">Зареждане на данни от базата...</div>
        </div>
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

        // Extract all unique machine names
        let machineSet = new Set();
        rawRoutes.forEach(r => {
            let m = String(r['Машина'] || '').trim();
            if (m) machineSet.add(m);
        });
        allUniqueMachines = Array.from(machineSet).sort((a,b) => a.localeCompare(b));

        populatePeriodSelectors();
        calculateAllMachineTasks();
        renderAllMachines();
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

function onPeriodChange() {
    calculateAllMachineTasks();
    renderAllMachines();
}

// Multi-Machine Task Calculation Engine
function calculateAllMachineTasks() {
    const selectedYear = parseInt(document.getElementById('selectYear').value) || 2026;
    const selectedMonth = document.getElementById('selectMonth').value;

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

    // 5. Load saved priorities
    let priorityMap = {};
    rawPriorities.forEach(p => {
        let pMachine = normalize(p.machine);
        let pMonth = String(p.plan_month || '').trim();
        let pYear = parseInt(p.plan_year);

        let matchesPeriod = (selectedMonth === 'ALL') ? true : (pYear === selectedYear && pMonth.toLowerCase() === selectedMonth.toLowerCase());

        if (matchesPeriod) {
            let key = pMachine + '||' + normalize(p.detail_id) + '||' + parseInt(p.op_num);
            priorityMap[key] = {
                order: parseInt(p.priority_order) || 100,
                score: parseFloat(p.priority_score) || 0,
                notes: p.notes || ''
            };
        }
    });

    // 6. Group routes by detail
    let routesByDetail = {};
    rawRoutes.forEach(r => {
        let code = normalize(r['Код на детайла']);
        if (!routesByDetail[code]) routesByDetail[code] = [];
        routesByDetail[code].push(r);
    });
    Object.keys(routesByDetail).forEach(code => {
        routesByDetail[code].sort((a,b) => (parseInt(a['№ Операция']) || 0) - (parseInt(b['№ Операция']) || 0));
    });

    // 7. Calculate tasks for EACH machine
    machineTasksMap = {};
    allUniqueMachines.forEach(m => {
        machineTasksMap[m] = [];
    });

    Object.keys(neededDetails).forEach(detailCode => {
        let needInfo = neededDetails[detailCode];
        let routes = routesByDetail[detailCode] || [];

        routes.forEach((route, idx) => {
            let machineName = String(route['Машина'] || '').trim();
            if (!machineName || !machineTasksMap[machineName]) return;

            let opNum = parseInt(route['№ Операция']) || 0;
            let opName = String(route['Име на операция'] || '').trim();
            let opKey = detailCode + '||' + normalize(opName);

            let nomItem = nomMap[detailCode] || {};
            let detailName = nomItem['Вътрешно име'] || detailCode;
            let drawingLink = route['Линк към чертеж'] || nomItem['Линк към чертеж'] || '';

            let targetQty = needInfo.targetQty;
            let doneQty = otchetiMap[opKey] || 0;
            let remainQty = Math.max(0, targetQty - doneQty);

            // Previous op info
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
            let prioKey = normalize(machineName) + '||' + detailCode + '||' + opNum;
            let savedPrio = priorityMap[prioKey];
            let priorityOrder = savedPrio ? savedPrio.order : 999;
            let notes = savedPrio ? savedPrio.notes : '';

            machineTasksMap[machineName].push({
                machine: machineName,
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

    // 8. Sort each machine's tasks
    Object.keys(machineTasksMap).forEach(m => {
        let list = machineTasksMap[m];
        list.sort((a, b) => {
            if (a.priority_order !== b.priority_order) return a.priority_order - b.priority_order;
            if (a.status === 'ready' && b.status !== 'ready') return -1;
            if (b.status === 'ready' && a.status !== 'ready') return 1;
            if (a.remain_qty > 0 && b.remain_qty <= 0) return -1;
            if (b.remain_qty > 0 && a.remain_qty <= 0) return 1;
            return a.op_num - b.op_num;
        });

        // Renumber consecutively 1..N
        list.forEach((t, i) => {
            t.priority_order = i + 1;
        });
    });
}

// Render All Machine Windows into Multi-Column Grid
function renderAllMachines() {
    const grid = document.getElementById('machinesGrid');
    const machineFilterText = normalize(document.getElementById('searchMachineInput').value);
    const taskFilterText = normalize(document.getElementById('searchTaskInput').value);
    const onlyWithTasks = document.getElementById('chkOnlyWithTasks').checked;

    // Clean up existing Sortable instances
    sortableInstances.forEach(s => s.destroy());
    sortableInstances = [];

    // Filter machines
    let machinesToDisplay = allUniqueMachines.filter(m => {
        if (machineFilterText && !normalize(m).includes(machineFilterText)) return false;
        let tasks = machineTasksMap[m] || [];
        if (onlyWithTasks && tasks.length === 0) return false;
        return true;
    });

    // Global counts
    let totalAllTasks = 0;
    let totalReadyTasks = 0;
    let totalWaitingTasks = 0;
    let totalCompletedTasks = 0;
    let totalTargetPieces = 0;
    let totalDonePieces = 0;
    let activeMachinesCount = 0;

    allUniqueMachines.forEach(m => {
        let tList = machineTasksMap[m] || [];
        if (tList.length > 0) activeMachinesCount++;
        tList.forEach(t => {
            totalAllTasks++;
            if (t.status === 'ready') totalReadyTasks++;
            else if (t.status === 'waiting') totalWaitingTasks++;
            else if (t.status === 'completed') totalCompletedTasks++;
            totalTargetPieces += t.target_qty;
            totalDonePieces += t.done_qty;
        });
    });

    updateGlobalStats(activeMachinesCount, totalAllTasks, totalReadyTasks, totalWaitingTasks, totalCompletedTasks, totalTargetPieces, totalDonePieces);

    if (machinesToDisplay.length === 0) {
        grid.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-search-minus fa-2x text-muted"></i>
                <div style="margin-top: 15px; font-weight: 700; color: #64748b;">Няма намерени машини, отговарящи на филтрите.</div>
            </div>
        `;
        return;
    }

    let gridHtml = '';

    machinesToDisplay.forEach(machineName => {
        let allTasksForMachine = machineTasksMap[machineName] || [];

        // Apply status & task text filters
        let visibleTasks = allTasksForMachine.filter(t => {
            if (currentStatusFilter !== 'all' && t.status !== currentStatusFilter) return false;
            if (taskFilterText) {
                let matchStr = (t.detail_id + ' ' + t.detail_name + ' ' + t.op_name + ' ' + t.op_num + ' ' + t.plan_sources + ' ' + t.notes).toLowerCase();
                if (!matchStr.includes(taskFilterText)) return false;
            }
            return true;
        });

        let readyCount = allTasksForMachine.filter(t => t.status === 'ready').length;
        let waitingCount = allTasksForMachine.filter(t => t.status === 'waiting').length;

        let machineHeaderHtml = `
            <div class="machine-header">
                <div class="machine-title">
                    <i class="fas fa-microchip"></i>
                    <span>${escapeHtml(machineName)}</span>
                </div>
                <div class="machine-header-badges">
                    <span class="m-badge m-badge-total" title="Общо задачи">${allTasksForMachine.length}</span>
                    ${readyCount > 0 ? `<span class="m-badge m-badge-ready" title="Готови за пускане">🟢 ${readyCount}</span>` : ''}
                    ${waitingCount > 0 ? `<span class="m-badge m-badge-waiting" title="Изчакващи">🟡 ${waitingCount}</span>` : ''}
                </div>
            </div>
        `;

        let tasksListHtml = '';
        if (visibleTasks.length === 0) {
            tasksListHtml = `
                <div class="empty-machine-tasks">
                    ${allTasksForMachine.length === 0 ? 'Няма заложени задачи за този месец' : 'Няма задачи за избрания филтър'}
                </div>
            `;
        } else {
            visibleTasks.forEach(t => {
                let isTop3 = (t.priority_order <= 3);
                let statusClass = `status-${t.status}`;
                let statusPill = '';
                if (t.status === 'ready') {
                    statusPill = `<span class="task-status-pill status-pill-ready">🟢 Готова</span>`;
                } else if (t.status === 'waiting') {
                    statusPill = `<span class="task-status-pill status-pill-waiting">🟡 Чака</span>`;
                } else {
                    statusPill = `<span class="task-status-pill status-pill-completed">✅ Готова</span>`;
                }

                let wipText = '';
                if (t.is_first_op) {
                    wipText = `1-ва оп. (${t.available_prev}бр. в Склад)`;
                } else {
                    wipText = t.available_prev > 0 
                        ? `✅ ${t.available_prev}бр. готови от Оп. ${t.prev_op_num}`
                        : `⏳ 0бр. от Оп. ${t.prev_op_num} (${t.prev_op_name})`;
                }

                let drawingBtn = t.drawing_link 
                    ? `<a href="${t.drawing_link}" target="_blank" class="btn-drawing" style="width:22px; height:22px; font-size:0.75em;" title="Чертеж"><i class="fas fa-drafting-compass"></i></a>` 
                    : '';

                tasksListHtml += `
                    <div class="task-item ${statusClass}" data-machine="${escapeHtml(machineName)}" data-detail="${escapeHtml(t.detail_id)}" data-op="${t.op_num}">
                        <div class="task-left">
                            <span class="prio-badge ${isTop3 ? 'top-3' : ''}">${t.priority_order}</span>
                            <span class="drag-handle" title="Хванете и преместете с мишката">⋮⋮</span>
                        </div>
                        <div class="task-content">
                            <div class="task-header-row">
                                <div class="task-detail-name">
                                    ${escapeHtml(t.detail_name)}
                                    <span class="task-detail-code">${escapeHtml(t.detail_id)}</span>
                                </div>
                                <div>${drawingBtn}</div>
                            </div>
                            <div class="task-op-row">
                                <span class="task-op-badge">Оп. ${t.op_num}</span>
                                <span class="task-op-name">${escapeHtml(t.op_name)}</span>
                            </div>
                            <span class="task-wip-pill">${wipText}</span>
                            <div class="task-stats-row">
                                <span class="task-qty-pill">
                                    ${t.done_qty} / ${t.target_qty} бр. ${t.remain_qty > 0 ? `<small style="color:#ea580c;">(остават ${t.remain_qty})</small>` : ''}
                                </span>
                                ${statusPill}
                            </div>
                            <div class="task-note-box">
                                <input type="text" class="task-note-input" placeholder="Бележка към оператора..." 
                                    value="${escapeHtml(t.notes || '')}" 
                                    onchange="updateTaskNotes('${escapeHtml(machineName)}', '${escapeHtml(t.detail_id)}', ${t.op_num}, this.value)">
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        gridHtml += `
            <div class="machine-card" data-machine="${escapeHtml(machineName)}">
                ${machineHeaderHtml}
                <div class="machine-tasks-list" data-machine="${escapeHtml(machineName)}">
                    ${tasksListHtml}
                </div>
            </div>
        `;
    });

    grid.innerHTML = gridHtml;
    initAllSortables();
}

function initAllSortables() {
    document.querySelectorAll('.machine-tasks-list').forEach(listEl => {
        let machineName = listEl.getAttribute('data-machine');
        let sortable = new Sortable(listEl, {
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onEnd: function () {
                reindexMachineTasks(machineName, listEl);
            }
        });
        sortableInstances.push(sortable);
    });
}

function reindexMachineTasks(machineName, listEl) {
    let machineTasks = machineTasksMap[machineName];
    if (!machineTasks) return;

    let newOrderList = [];
    const itemEls = listEl.querySelectorAll('.task-item[data-detail]');
    itemEls.forEach((el, index) => {
        let detail = el.getAttribute('data-detail');
        let op = parseInt(el.getAttribute('data-op'));
        let task = machineTasks.find(t => t.detail_id === detail && t.op_num === op);
        if (task) {
            task.priority_order = index + 1;
            newOrderList.push(task);
            // Update badge in DOM immediately
            const badge = el.querySelector('.prio-badge');
            if (badge) {
                badge.innerText = task.priority_order;
                if (task.priority_order <= 3) badge.classList.add('top-3');
                else badge.classList.remove('top-3');
            }
        }
    });

    // Re-attach any filtered-out tasks
    machineTasks.forEach(t => {
        if (!newOrderList.includes(t)) {
            t.priority_order = newOrderList.length + 1;
            newOrderList.push(t);
        }
    });

    machineTasksMap[machineName] = newOrderList;
    setSaveStatus(true);
}

function updateTaskNotes(machineName, detailId, opNum, newNote) {
    let list = machineTasksMap[machineName];
    if (list) {
        let task = list.find(t => t.detail_id === detailId && t.op_num === opNum);
        if (task) {
            task.notes = newNote;
            setSaveStatus(true);
        }
    }
}

function filterMachinesAndTasks() {
    renderAllMachines();
}

function setStatusFilter(filterType) {
    currentStatusFilter = filterType;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    const clicked = document.querySelector(`.chip[data-filter="${filterType}"]`);
    if (clicked) clicked.classList.add('active');
    renderAllMachines();
}

function updateGlobalStats(activeMachines, total, ready, waiting, completed, targetPcs, donePcs) {
    let pct = targetPcs > 0 ? Math.round((donePcs / targetPcs) * 100) : 0;

    document.getElementById('countAll').innerText = total;
    document.getElementById('countReady').innerText = ready;
    document.getElementById('countWaiting').innerText = waiting;
    document.getElementById('countCompleted').innerText = completed;

    document.getElementById('activeMachinesCount').innerText = activeMachines;
    document.getElementById('sumActiveMachines').innerText = activeMachines;
    document.getElementById('sumTotalTasks').innerText = total;
    document.getElementById('sumReadyTasks').innerText = ready;
    document.getElementById('sumWaitingTasks').innerText = waiting;
    document.getElementById('sumPiecesDone').innerText = donePcs;
    document.getElementById('sumPiecesTarget').innerText = targetPcs;
    document.getElementById('sumPiecesPercent').innerText = pct + '%';
}

function setSaveStatus(hasChanges) {
    hasUnsavedChanges = hasChanges;
    const btn = document.getElementById('btnSavePriorities');
    const indicator = document.getElementById('saveStatusIndicator');

    if (hasChanges) {
        btn.classList.add('has-changes');
        btn.innerHTML = `<i class="fas fa-exclamation-circle"></i> <span>Запази Промените!</span>`;
        indicator.className = 'save-status unsaved';
        indicator.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Имате незапазени промени!`;
    } else {
        btn.classList.remove('has-changes');
        btn.innerHTML = `<i class="fas fa-check"></i> <span>Запази Приоритетите</span>`;
        indicator.className = 'save-status saved';
        indicator.innerHTML = `<i class="fas fa-check-circle"></i> Всички промени са записани`;
    }
}

// Global Save: Upsert all priorities across all machines to Supabase
async function saveAllPriorities() {
    const selectedYear = parseInt(document.getElementById('selectYear').value) || 2026;
    const selectedMonth = document.getElementById('selectMonth').value;

    let allTasksToSave = [];
    Object.keys(machineTasksMap).forEach(m => {
        let tasks = machineTasksMap[m] || [];
        tasks.forEach(t => {
            allTasksToSave.push({
                plan_year: selectedYear,
                plan_month: selectedMonth,
                machine: t.machine,
                detail_id: t.detail_id,
                op_num: t.op_num,
                op_name: t.op_name,
                detail_name: t.detail_name,
                priority_order: t.priority_order,
                priority_score: 0,
                notes: t.notes || null,
                updated_at: new Date().toISOString()
            });
        });
    });

    if (allTasksToSave.length === 0) {
        Swal.fire('Информация', 'Няма задачи за запазване в текущия период.', 'info');
        return;
    }

    Swal.fire({
        title: 'Запазване на приоритетите...',
        html: `Записване на подредбата за всички <b>${Object.keys(machineTasksMap).length} машини</b>...`,
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // Upsert in batches of 500
        for (let i = 0; i < allTasksToSave.length; i += 500) {
            let chunk = allTasksToSave.slice(i, i + 500);
            const { error } = await client
                .from('task_priorities')
                .upsert(chunk, {
                    onConflict: 'plan_year,plan_month,machine,detail_id,op_num'
                });
            if (error) throw error;
        }

        setSaveStatus(false);

        Swal.fire({
            icon: 'success',
            title: 'Приоритетите са запазени!',
            html: `Успешно бяха обновени приоритетите на <b>${allTasksToSave.length} задачи</b> по всички машини.<br><small class="text-muted">Терминалите в цеха вече показват новия ред.</small>`,
            confirmButtonColor: '#2563eb',
            timer: 2500
        });
    } catch (err) {
        console.error('Грешка при запис:', err);
        Swal.fire('Грешка', 'Неуспешен запис на приоритетите: ' + err.message, 'error');
    }
}

// Global Excel Export
function exportToExcel() {
    const selectedMonth = document.getElementById('selectMonth').value || 'Month';
    let exportData = [];

    Object.keys(machineTasksMap).forEach(m => {
        let tasks = machineTasksMap[m] || [];
        tasks.forEach(t => {
            exportData.push({
                'Машина': t.machine,
                'Приоритет': t.priority_order,
                'Детайл Код': t.detail_id,
                'Детайл Име': t.detail_name,
                'Оп №': t.op_num,
                'Операция': t.op_name,
                'План Бройки': t.target_qty,
                'Отчетени Бройки': t.done_qty,
                'Оставащи Бройки': t.remain_qty,
                'Наличност': t.is_first_op ? `Склад: ${t.available_prev}` : `Оп ${t.prev_op_num}: ${t.available_prev}`,
                'Статус': t.status === 'ready' ? 'Готова за пускане' : (t.status === 'completed' ? 'Завършена' : 'Чака заготовки'),
                'Бележка': t.notes || ''
            });
        });
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Всички Задачи");
    XLSX.writeFile(wb, `Zadachi_Vsichki_Mashini_${selectedMonth}.xlsx`);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#039;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
