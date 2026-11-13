// ==============================================================================
// Multi-Machine Workplace Tasks & Priority Board (Табло Машини & Задачи)
// IS-SYSTEMS MES Test Environment
// ==============================================================================

const supabaseUrl = 'https://zdythzcgcjxwbxufunuh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE';
const client = supabase.createClient(supabaseUrl, supabaseKey);

// Allowed machines for cross-machine transfer
const TRANSFER_MACHINES = ['emco (стар)', 'emco', 'haas st 10', 'haas st10'];

function isTransferAllowed(machineName) {
    if (!machineName) return false;
    let norm = normalize(machineName);
    return TRANSFER_MACHINES.some(tm => norm === tm || norm.replace(/\s+/g, '') === tm.replace(/\s+/g, ''));
}

// Global Data
let rawPlans = [];
let rawBom = [];
let rawRoutes = [];
let rawNom = [];
let rawInventory = [];
let rawReports = [];
let rawPriorities = [];
let rawSklad = [];
let hasOriginalMachineColumn = false;

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
    setTimeout(() => {
        loadSpotAuditHistory();
        initSpotAuditsAdminRealtime();
    }, 1200);
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
        const [plans, bom, routes, nom, inv, priorities, reports, sklad] = await Promise.all([
            fetchAllRows('plan', '*'),
            fetchAllRows('bom', '*'),
            fetchAllRows('marshruti', '*'),
            fetchAllRows('Номенклатура', '*'),
            fetchAllRows('inventory', '*'),
            fetchAllRows('task_priorities', '*'),
            fetchAllRows('otcheti', '*', q => q.in('Статус', ['Отчетено', 'Готов продукт'])),
            fetchAllRows('sklad', '*')
        ]);

        rawPlans = plans || [];
        rawBom = bom || [];
        rawRoutes = routes || [];
        rawNom = nom || [];
        rawInventory = inv || [];
        rawPriorities = priorities || [];
        rawReports = reports || [];
        rawSklad = sklad || [];

        // Check if original_machine column exists
        hasOriginalMachineColumn = rawPriorities.length > 0 && ('original_machine' in rawPriorities[0]);

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

function computeMonitorMetrics(plansData, reportsData, skladData, invData, nomData, bomData, routesData) {
    let nomMap = {};
    (nomData || []).forEach(n => {
        if (n['ID Детайл']) nomMap[String(n['ID Детайл']).trim().toLowerCase()] = n;
    });

    let routesByDetail = {};
    (routesData || []).forEach(r => {
        let code = String(r['Код на детайла']).trim().toLowerCase();
        if (!routesByDetail[code]) routesByDetail[code] = [];
        routesByDetail[code].push(r);
    });
    Object.keys(routesByDetail).forEach(code => {
        routesByDetail[code].sort((a, b) => (parseInt(a['№ Операция']) || 0) - (parseInt(b['№ Операция']) || 0));
    });

    let bomChildrenMap = {};
    (bomData || []).forEach(b => {
        let p = String(b['ID Родител']).trim().toLowerCase();
        if (!bomChildrenMap[p]) bomChildrenMap[p] = [];
        bomChildrenMap[p].push(b);
    });

    let skladMap = {};
    (skladData || []).forEach(s => {
        if (s['ID Детайл']) skladMap[String(s['ID Детайл']).trim().toLowerCase()] = parseFloat(s['Остатък']) || 0;
    });

    let invGpMap = {};
    let invWipMap = {};
    (invData || []).forEach(r => {
        let code = String(r['ID Детайл']).trim().toLowerCase();
        let op = String(r['Операция']).trim().toLowerCase();
        let qty = parseFloat(r['Количество']) || 0;
        if (op === 'готов продукт') {
            invGpMap[code] = (invGpMap[code] || 0) + qty;
        } else {
            if (!invWipMap[code]) invWipMap[code] = {};
            invWipMap[code][op] = (invWipMap[code][op] || 0) + qty;
        }
    });

    let activePlans = (plansData || []).filter(p => {
        let st = String(p['Статус'] || '').trim();
        if (st.includes('Опакован') || st.includes('Изпратен')) return false;
        return st.includes('Активен') || st.includes('Завършен');
    });
    activePlans.sort((a, b) => (a.id || 0) - (b.id || 0));

    let activeNodes = [];
    activePlans.forEach(p => {
        let originalPlanCode = String(p['Вътрешно име']).trim();
        let actualBomName = originalPlanCode;
        let displayName = originalPlanCode;
        let targetQty = parseFloat(p['Целево количество']) || 0;

        let translated = (nomData || []).find(n => String(n['Вътрешно име']).trim() === originalPlanCode);
        if (translated && translated['ID Детайл']) {
            actualBomName = String(translated['ID Детайл']).trim();
            if (originalPlanCode.toUpperCase() === actualBomName.toUpperCase()) {
                displayName = actualBomName;
            } else {
                displayName = `${originalPlanCode} - ${actualBomName}`;
            }
        }

        let defaultPlanMonth = (p['Месец'] && p['Година']) 
            ? `${p['Месец']} ${p['Година']}`.trim() 
            : (p['Вътрешно име'] ? String(p['Вътрешно име']).trim() : `ПЛАН ${p.id}`);

        function traverseAndAdd(parentName, currentCode, requiredQty, isRootLevel) {
            let currentCodeLower = currentCode.toLowerCase();
            let nomEntry = nomMap[currentCodeLower] || {};
            let children = bomChildrenMap[currentCodeLower] || [];

            let isRawMaterial = (children.length === 0) && (!routesByDetail[currentCodeLower]);
            if (isRawMaterial && !isRootLevel) return;

            activeNodes.push({
                plan_id: p.id,
                plan_month: defaultPlanMonth,
                code: currentCode,
                display_name: isRootLevel ? displayName : currentCode,
                plan_qty: requiredQty,
                parent_code: parentName,
                ready_qty: skladMap[currentCodeLower] || 0
            });

            children.forEach(c => {
                let childName = String(c['ID Компонент']).trim();
                let multiplier = parseFloat(c['Количество']) || 1;
                traverseAndAdd(currentCode, childName, requiredQty * multiplier, false);
            });
        }

        traverseAndAdd('', actualBomName, targetQty, true);
    });

    let mergedNodes = {};
    let connections = [];
    activeNodes.forEach(row => {
        let pMonthStr = row.plan_month;
        let codeStr = row.code ? String(row.code).trim() : '';
        let mergedId = pMonthStr + '___' + codeStr;

        if (!mergedNodes[mergedId]) {
            mergedNodes[mergedId] = {
                id: mergedId,
                planId: row.plan_id,
                planMonth: pMonthStr,
                code: codeStr,
                planQty: 0,
                warehouseQty: row.ready_qty || 0,
                operations: []
            };
        }
        mergedNodes[mergedId].planQty += (parseFloat(row.plan_qty) || 0);

        if (row.parent_code) {
            let parentCodeStr = String(row.parent_code).trim();
            let parentMergedId = pMonthStr + '___' + parentCodeStr;
            if (!connections.find(c => c.from === mergedId && c.to === parentMergedId)) {
                connections.push({ from: mergedId, to: parentMergedId });
            }
        }
    });

    let nodesByCode = {};
    Object.values(mergedNodes).forEach(n => {
        let cLower = n.code.toLowerCase();
        if (!nodesByCode[cLower]) nodesByCode[cLower] = [];
        nodesByCode[cLower].push(n);
    });

    let isLastNodeMap = {};
    Object.keys(nodesByCode).forEach(cLower => {
        let nodes = nodesByCode[cLower];
        nodes.sort((a, b) => (parseInt(a.planId) || 0) - (parseInt(b.planId) || 0));
        isLastNodeMap[nodes[nodes.length - 1].id] = true;
    });

    let childrenMap = {};
    Object.values(mergedNodes).forEach(n => childrenMap[n.id] = []);
    connections.forEach(c => {
        if (childrenMap[c.to]) childrenMap[c.to].push(c.from);
    });

    let calculatedLevels = {};
    let visitedForLevel = new Set();
    function getLevel(nodeId) {
        if (calculatedLevels[nodeId]) return calculatedLevels[nodeId];
        if (visitedForLevel.has(nodeId)) return 1;
        visitedForLevel.add(nodeId);
        let ch = childrenMap[nodeId];
        if (!ch || ch.length === 0) {
            calculatedLevels[nodeId] = 1;
            return 1;
        }
        let maxL = 0;
        ch.forEach(cId => {
            let l = getLevel(cId);
            if (l > maxL) maxL = l;
        });
        calculatedLevels[nodeId] = maxL + 1;
        return calculatedLevels[nodeId];
    }
    Object.values(mergedNodes).forEach(n => getLevel(n.id));

    let allNodes = Object.values(mergedNodes);
    allNodes.sort((a, b) => {
        let lvlDiff = (calculatedLevels[b.id] || 0) - (calculatedLevels[a.id] || 0);
        if (lvlDiff !== 0) return lvlDiff;
        return (parseInt(a.planId) || 0) - (parseInt(b.planId) || 0);
    });

    allNodes.forEach(n => n.consumedByParents = 0);
    let alreadyAllocated = {};
    let alreadyAllocatedWarehouse = {};

    let getMultiplier = (childCode, parentCode) => {
        let pNameLower = parentCode.toLowerCase();
        let cNameLower = childCode.toLowerCase();
        let bomLines = (bomData || []).filter(b => {
            let pKey = b['ID Родител'] || b['ID Детайл'];
            return String(b['ID Компонент']).trim().toLowerCase() === cNameLower && String(pKey || '').trim().toLowerCase() === pNameLower;
        });
        let m = 0;
        bomLines.forEach(bl => m += (parseFloat(bl['Количество']) || 1));
        return m || 1;
    };

    allNodes.forEach(n => {
        let isLastNode = isLastNodeMap[n.id];
        let code = n.code;
        let cLower = code.toLowerCase();
        let partRoutes = routesByDetail[cLower] || [];
        let finalDoneQtyForChildren = 0;
        let deficit = Math.max(0, n.planQty - n.consumedByParents);

        if (partRoutes.length > 0) {
            partRoutes.forEach((route, idx) => {
                let opName = String(route['Име на операция']).trim();
                let opKey = cLower + '_' + opName.toLowerCase();

                let globalPhysicalPassed = (invGpMap[cLower] || 0);
                for (let j = idx; j < partRoutes.length; j++) {
                    let nextOpName = String(partRoutes[j]['Име на операция']).trim().toLowerCase();
                    globalPhysicalPassed += (invWipMap[cLower]?.[nextOpName] || 0);
                }
                let globalNet = globalPhysicalPassed;
                let usedSoFar = alreadyAllocated[opKey] || 0;
                let availableForThisNode = Math.max(0, globalNet - usedSoFar);

                let allocatedFromWh = isLastNode ? availableForThisNode : Math.min(deficit, availableForThisNode);
                let doneQty = n.consumedByParents + allocatedFromWh;
                alreadyAllocated[opKey] = usedSoFar + allocatedFromWh;

                n.operations.push({
                    name: opName,
                    completed: doneQty,
                    deficit: Math.max(0, n.planQty - doneQty)
                });

                if (idx === 0) finalDoneQtyForChildren = doneQty;
            });
        } else {
            let globalWarehouse = n.warehouseQty;
            let usedSoFar = alreadyAllocatedWarehouse[cLower] || 0;
            let availableForThisNode = Math.max(0, globalWarehouse - usedSoFar);

            let allocatedFromWh = isLastNode ? availableForThisNode : Math.min(deficit, availableForThisNode);
            let doneQty = n.consumedByParents + allocatedFromWh;
            alreadyAllocatedWarehouse[cLower] = usedSoFar + allocatedFromWh;

            n.operations.push({
                name: 'Готов (Склад)',
                completed: doneQty,
                deficit: Math.max(0, n.planQty - doneQty)
            });
            finalDoneQtyForChildren = doneQty;
        }

        (childrenMap[n.id] || []).forEach(childId => {
            let childNode = mergedNodes[childId];
            if (childNode) {
                let mult = getMultiplier(childNode.code, n.code);
                childNode.consumedByParents += finalDoneQtyForChildren * mult;
            }
        });
    });

    let progressMap = {};
    Object.values(mergedNodes).forEach(n => {
        let pMonthNorm = normalize(n.planMonth);
        let cNorm = normalize(n.code);
        n.operations.forEach(op => {
            let opNorm = normalize(op.name);
            let fullKey = pMonthNorm + '___' + cNorm + '___' + opNorm;
            let shortKey = cNorm + '___' + opNorm;
            let info = {
                target: n.planQty,
                completed: op.completed,
                deficit: op.deficit
            };
            progressMap[fullKey] = info;
            if (!progressMap[shortKey] || info.target > progressMap[shortKey].target) {
                progressMap[shortKey] = info;
            }
        });
    });

    return progressMap;
}

// Multi-Machine Task Calculation Engine
function calculateAllMachineTasks() {
    const selectedYear = parseInt(document.getElementById('selectYear').value) || 2026;
    const selectedMonth = document.getElementById('selectMonth').value;
    let monitorProgressMap = {};
    try {
        monitorProgressMap = computeMonitorMetrics(rawPlans, rawReports, rawSklad, rawInventory, rawNom, rawBom, rawRoutes) || {};
    } catch(e) {
        console.error("Monitor metrics error in workplace-tasks:", e);
    }

    // 1. Filter relevant plans (only truly active plans)
    let filteredPlans = rawPlans.filter(p => {
        let pStatus = String(p['Статус'] || '').trim();
        if (pStatus !== 'Активен') return false;
        let pYear = parseInt(p['Година']);
        let pMonth = String(p['Месец'] || '').trim();

        if (selectedMonth === 'ALL') return true;
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

    let neededDetails = {};

    filteredPlans.forEach(plan => {
        let planItemName = String(plan['Вътрешно име'] || '').trim();
        let planQty = parseFloat(plan['Целево количество']) || 0;
        let rootCode = codeByName[normalize(planItemName)] || normalize(planItemName);

        if (!neededDetails[rootCode]) neededDetails[rootCode] = { targetQty: 0, planSources: new Set() };
        neededDetails[rootCode].targetQty += planQty;
        neededDetails[rootCode].planSources.add(planItemName);

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

    // 5. Load saved priorities and machine transfers
    let priorityMap = {};
    let transferMap = {}; // detailId||opNum -> { assignedMachine, originalMachine, order, notes }

    let sortedPriorities = [...rawPriorities].sort((a, b) => {
        let da = new Date(a.updated_at || a.created_at || 0).getTime();
        let db = new Date(b.updated_at || b.created_at || 0).getTime();
        return da - db || (a.id - b.id);
    });

    sortedPriorities.forEach(p => {
        let pMachine = String(p.machine || '').trim();
        let pMonth = String(p.plan_month || '').trim();
        let pYear = parseInt(p.plan_year);

        let matchesPeriod = (selectedMonth === 'ALL') ? true : (pYear === selectedYear && pMonth.toLowerCase() === selectedMonth.toLowerCase());

        if (matchesPeriod) {
            let detailCode = normalize(p.detail_id);
            let opNum = parseInt(p.op_num);
            let key = normalize(pMachine) + '||' + detailCode + '||' + opNum;
            let rawNotes = p.notes || '';

            // Check original_machine from column or from [ORIG:...] in notes
            let origM = p.original_machine || null;
            if (!origM && rawNotes.includes('[ORIG:')) {
                let match = rawNotes.match(/\[ORIG:(.*?)\]/);
                if (match) origM = match[1].trim();
            }

            let cleanNotes = rawNotes.replace(/\[ORIG:.*?\]\s*/g, '').trim();

            priorityMap[key] = {
                order: parseInt(p.priority_order) || 100,
                score: parseFloat(p.priority_score) || 0,
                notes: cleanNotes,
                original_machine: origM
            };

            if (origM && normalize(origM) !== normalize(pMachine)) {
                transferMap[detailCode + '||' + opNum] = {
                    assignedMachine: pMachine,
                    originalMachine: origM,
                    order: parseInt(p.priority_order) || 100,
                    notes: cleanNotes
                };
            } else if (origM && normalize(origM) === normalize(pMachine)) {
                delete transferMap[detailCode + '||' + opNum];
            }
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
            let origMachine = String(route['Машина'] || '').trim();
            if (!origMachine) return;

            let opNum = parseInt(route['№ Операция']) || 0;
            let opName = String(route['Име на операция'] || '').trim();
            let opKey = detailCode + '||' + normalize(opName);

            // Determine effective machine for this month (check transferMap)
            let transferInfo = transferMap[detailCode + '||' + opNum];
            let effectiveMachine = origMachine;
            let isTransferred = false;

            if (transferInfo && isTransferAllowed(origMachine) && isTransferAllowed(transferInfo.assignedMachine)) {
                effectiveMachine = transferInfo.assignedMachine;
                isTransferred = true;
            }

            if (!machineTasksMap[effectiveMachine]) machineTasksMap[effectiveMachine] = [];

            let nomItem = nomMap[detailCode] || {};
            let detailName = nomItem['Вътрешно име'] || detailCode;
            let drawingLink = route['Линк към чертеж'] || nomItem['Линк към чертеж'] || '';

            let opNorm = normalize(opName);
            let periodNorm = (selectedMonth && selectedMonth !== 'ALL') ? normalize(selectedMonth + ' ' + selectedYear) : '';
            let monitorKey = periodNorm ? (periodNorm + '___' + detailCode + '___' + opNorm) : '';
            let fallbackKey = detailCode + '___' + opNorm;
            let monitorInfo = monitorProgressMap ? (monitorProgressMap[monitorKey] || monitorProgressMap[fallbackKey]) : null;

            let targetQty = needInfo.targetQty;
            let doneQty = otchetiMap[opKey] || 0;
            let remainQty = Math.max(0, targetQty - doneQty);

            if (monitorInfo) {
                targetQty = monitorInfo.target;
                doneQty = monitorInfo.completed;
                remainQty = monitorInfo.deficit;
            }



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
            let prioKey = normalize(effectiveMachine) + '||' + detailCode + '||' + opNum;
            let savedPrio = priorityMap[prioKey];
            let priorityOrder = (savedPrio && savedPrio.order <= 10) ? savedPrio.order : null;
            let notes = savedPrio ? savedPrio.notes : (transferInfo ? transferInfo.notes : '');

            machineTasksMap[effectiveMachine].push({
                machine: effectiveMachine,
                original_machine: origMachine,
                is_transferred: isTransferred,
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
                has_custom_priority: (priorityOrder !== null)
            });
        });
    });

    // 8. Sort each machine's tasks
    Object.keys(machineTasksMap).forEach(m => {
        let list = machineTasksMap[m];
        list.sort((a, b) => {
            let aPrio = (a.priority_order !== null && a.priority_order !== undefined) ? a.priority_order : 999;
            let bPrio = (b.priority_order !== null && b.priority_order !== undefined) ? b.priority_order : 999;
            if (aPrio !== bPrio) return aPrio - bPrio;
            if (a.status === 'ready' && b.status !== 'ready') return -1;
            if (b.status === 'ready' && a.status !== 'ready') return 1;
            if (a.remain_qty > 0 && b.remain_qty <= 0) return -1;
            if (b.remain_qty > 0 && a.remain_qty <= 0) return 1;
            return a.op_num - b.op_num;
        });
    });
}

// Render All Machine Windows into Multi-Column Grid
function renderAllMachines() {
    const grid = document.getElementById('machinesGrid');
    const machineFilterText = normalize(document.getElementById('searchMachineInput').value);
    const taskFilterText = normalize(document.getElementById('searchTaskInput').value);
    const onlyWithTasks = document.getElementById('chkOnlyWithTasks').checked;

    sortableInstances.forEach(s => s.destroy());
    sortableInstances = [];

    let machinesToDisplay = allUniqueMachines.filter(m => {
        if (machineFilterText && !normalize(m).includes(machineFilterText)) return false;
        let tasks = machineTasksMap[m] || [];
        if (onlyWithTasks && tasks.length === 0) return false;
        return true;
    });

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

        let canCrossTransfer = isTransferAllowed(machineName);

        let machineHeaderHtml = `
            <div class="machine-header" style="${canCrossTransfer ? 'border-top: 4px solid #a855f7;' : ''}">
                <div class="machine-title">
                    <i class="fas fa-microchip"></i>
                    <span>${escapeHtml(machineName)}</span>
                    ${canCrossTransfer ? `<span class="badge" style="background:#7e22ce; color:#f3e8ff; font-size:0.65em; padding:2px 5px; border-radius:4px;" title="Може да приема и прехвърля операции с EMCO и HAAS ST 10">🔄 CNC група</span>` : ''}
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
                let hasPrio = (t.priority_order !== null && t.priority_order !== undefined && t.priority_order <= 10);
                let isTop3 = hasPrio && (t.priority_order <= 3);
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

                let transferBannerHtml = '';
                if (t.is_transferred) {
                    transferBannerHtml = `
                        <div style="background:#f3e8ff; border:1px solid #d8b4fe; border-radius:4px; padding:3px 6px; font-size:0.75em; font-weight:800; color:#6b21a8; margin-bottom:5px; display:flex; justify-content:space-between; align-items:center;">
                            <span><i class="fas fa-exchange-alt"></i> От: ${escapeHtml(t.original_machine)}</span>
                            <button onclick="revertTaskTransfer('${escapeHtml(machineName)}', '${escapeHtml(t.detail_id)}', ${t.op_num})" style="background:#7e22ce; color:white; border:none; border-radius:3px; padding:1px 5px; font-size:0.85em; cursor:pointer;" title="Върни на оригиналната машина за този месец">↩️ Върни</button>
                        </div>
                    `;
                }

                let quickTransferBtn = '';
                if (canCrossTransfer && isTransferAllowed(t.original_machine)) {
                    quickTransferBtn = `
                        <button onclick="openTransferDialog('${escapeHtml(machineName)}', '${escapeHtml(t.detail_id)}', ${t.op_num})" class="btn-arrow" style="font-size:0.85em; color:#7e22ce; font-weight:bold; margin-top:4px;" title="Прехвърли на друга машина за този месец">
                            <i class="fas fa-exchange-alt"></i>
                        </button>
                    `;
                }

                tasksListHtml += `
                    <div class="task-item ${statusClass} ${t.is_transferred ? 'task-transferred' : ''}" 
                        data-machine="${escapeHtml(machineName)}" 
                        data-orig-machine="${escapeHtml(t.original_machine)}" 
                        data-detail="${escapeHtml(t.detail_id)}" 
                        data-op="${t.op_num}">
                        
                        <div class="task-left">
                            ${hasPrio 
                                ? `<span class="prio-badge top-3" onclick="clearTaskPriority('${escapeHtml(machineName)}', '${escapeHtml(t.detail_id)}', ${t.op_num})" title="Приоритет #${t.priority_order} (Кликнете за премахване)" style="cursor:pointer;">⭐ ${t.priority_order}</span>` 
                                : `<span class="prio-badge" onclick="setTaskPriorityPrompt('${escapeHtml(machineName)}', '${escapeHtml(t.detail_id)}', ${t.op_num})" title="Задай приоритет за тази задача" style="opacity:0.4; background:#94a3b8; cursor:pointer;">☆</span>`
                            }
                            <span class="drag-handle" title="Хванете и преместете с мишката">⋮⋮</span>
                            ${quickTransferBtn}
                        </div>
                        <div class="task-content">
                            ${transferBannerHtml}
                            <div class="task-header-row">
                                <div class="task-detail-name">
                                    ${escapeHtml(t.detail_name)}
                                    <span class="task-detail-code">${escapeHtml(t.detail_id)}</span>
                                </div>
                                <div style="display:flex; align-items:center; gap:4px;">
                                    ${drawingBtn}
                                    <button type="button" class="btn-drawing" style="width:22px; height:22px; font-size:0.75em; background:#7c3aed; color:white; border:none; border-radius:4px; cursor:pointer;" 
                                        title="Пусни изненадваща ревизия за този детайл на ${escapeHtml(machineName)}" 
                                        onclick="quickTriggerSpotAudit('${escapeHtml(machineName)}', '${escapeHtml(t.detail_id)}', '${escapeHtml(t.op_name)}', ${t.available_prev || t.remain_qty || 0})">
                                        <i class="fas fa-clipboard-check"></i>
                                    </button>
                                </div>
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
        let canCrossTransfer = isTransferAllowed(machineName);

        let sortable = new Sortable(listEl, {
            group: canCrossTransfer ? { name: 'cnc_transfer_group', pull: true, put: true } : 'machine_' + machineName,
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onAdd: function (evt) {
                let toMachine = machineName;
                let fromMachine = evt.from.getAttribute('data-machine');
                let detail = evt.item.getAttribute('data-detail');
                let op = parseInt(evt.item.getAttribute('data-op'));
                handleTaskTransferred(detail, op, fromMachine, toMachine);
            },
            onEnd: function () {
                reindexMachineTasks(machineName, listEl);
            }
        });
        sortableInstances.push(sortable);
    });
}

function handleTaskTransferred(detailId, opNum, fromMachine, toMachine) {
    if (!isTransferAllowed(fromMachine) || !isTransferAllowed(toMachine)) {
        Swal.fire('Непозволено прехвърляне', 'Прехвърляне на операции е разрешено единствено между: EMCO (стар), EMCO и HAAS ST 10.', 'warning');
        renderAllMachines();
        return;
    }

    let fromList = machineTasksMap[fromMachine] || [];
    let toList = machineTasksMap[toMachine] || [];

    let taskIdx = fromList.findIndex(t => t.detail_id === detailId && t.op_num === opNum);
    if (taskIdx === -1) {
        renderAllMachines();
        return;
    }

    let task = fromList.splice(taskIdx, 1)[0];
    task.machine = toMachine;
    task.is_transferred = (normalize(task.machine) !== normalize(task.original_machine));
    if (!task.is_transferred && task.notes) {
        task.notes = task.notes.replace(/\[ORIG:.*?\]\s*/g, '').trim();
    }
    toList.push(task);

    if (!window.tasksMovedLocations) window.tasksMovedLocations = [];
    window.tasksMovedLocations.push({ fromMachine: fromMachine, detail_id: detailId, op_num: opNum });

    setSaveStatus(true);
    renderAllMachines();

    const toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
    });
    toast.fire({
        icon: 'info',
        title: `Оп. ${opNum} (${detailId}) преместена на ${toMachine}`
    });
}

function openTransferDialog(currentMachine, detailId, opNum) {
    const list = machineTasksMap[currentMachine] || [];
    const task = list.find(t => t.detail_id === detailId && t.op_num === opNum);
    if (!task) return;

    const targets = ['EMCO (стар)', 'EMCO', 'HAAS ST 10'].filter(m => normalize(m) !== normalize(currentMachine));

    let optionsHtml = targets.map(m => `<button class="swal2-confirm swal2-styled" onclick="confirmQuickTransfer('${escapeHtml(currentMachine)}', '${escapeHtml(m)}', '${escapeHtml(detailId)}', ${opNum})" style="background-color:#7e22ce; width:100%; margin:8px 0; font-size:1.05em;">🏭 Прехвърли на ${escapeHtml(m)}</button>`).join('');

    Swal.fire({
        title: 'Прехвърляне на операция',
        html: `
            <div style="text-align:left; font-size:0.95em; color:#334155;">
                <p>Детайл: <b>${escapeHtml(task.detail_name)}</b> (${escapeHtml(task.detail_id)})</p>
                <p>Операция: <b>Оп. ${task.op_num} - ${escapeHtml(task.op_name)}</b></p>
                <p>Текущо работно място: <b>${escapeHtml(currentMachine)}</b></p>
                <p style="color:#6b21a8; font-weight:700;">Изберете машина, на която да се изпълнява тази операция за текущия месечен план:</p>
                <div style="margin-top:15px;">${optionsHtml}</div>
            </div>
        `,
        showConfirmButton: false,
        showCancelButton: true,
        cancelButtonText: 'Отказ'
    });
}

window.confirmQuickTransfer = function(fromMachine, toMachine, detailId, opNum) {
    Swal.close();
    handleTaskTransferred(detailId, opNum, fromMachine, toMachine);
};

function revertTaskTransfer(currentMachine, detailId, opNum) {
    let list = machineTasksMap[currentMachine] || [];
    let task = list.find(t => t.detail_id === detailId && t.op_num === opNum);
    if (!task || !task.original_machine) return;

    handleTaskTransferred(detailId, opNum, currentMachine, task.original_machine);
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
            newOrderList.push(task);
        }
    });

    machineTasks.forEach(t => {
        if (!newOrderList.includes(t)) {
            newOrderList.push(t);
        }
    });

    machineTasksMap[machineName] = newOrderList;
    setSaveStatus(true);
}

window.setTaskPriorityPrompt = async function(machineName, detailId, opNum) {
    let list = machineTasksMap[machineName] || [];
    let task = list.find(t => t.detail_id === detailId && t.op_num === opNum);
    if (!task) return;

    const { value: prio } = await Swal.fire({
        title: '⭐ Задаване на Приоритет',
        html: `
            <div style="text-align:left; font-size:0.95em; color:#334155;">
                <p>Детайл: <b>${escapeHtml(task.detail_name)}</b> (${escapeHtml(task.detail_id)})</p>
                <p>Операция: <b>Оп. ${task.op_num} - ${escapeHtml(task.op_name)}</b></p>
                <p>Машина: <b>${escapeHtml(machineName)}</b></p>
                <label style="display:block; margin-top:12px; font-weight:700;">Изберете приоритет (1 - най-висок):</label>
                <div style="display:flex; gap:8px; margin-top:8px;">
                    <button type="button" class="swal2-confirm swal2-styled" onclick="document.getElementById('swalPrioVal').value=1; Swal.clickConfirm();" style="flex:1; background:#dc2626; margin:0;">⭐ #1 (Топ)</button>
                    <button type="button" class="swal2-confirm swal2-styled" onclick="document.getElementById('swalPrioVal').value=2; Swal.clickConfirm();" style="flex:1; background:#ea580c; margin:0;">⭐ #2</button>
                    <button type="button" class="swal2-confirm swal2-styled" onclick="document.getElementById('swalPrioVal').value=3; Swal.clickConfirm();" style="flex:1; background:#d97706; margin:0;">⭐ #3</button>
                </div>
                <div style="margin-top:12px;">
                    <label style="font-size:0.85em; color:#64748b;">Или въведете число (1-10):</label>
                    <input id="swalPrioVal" type="number" min="1" max="10" value="1" class="swal2-input" style="width:100%; box-sizing:border-box; margin:4px 0 0 0;">
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Задай',
        cancelButtonText: 'Отказ',
        preConfirm: () => {
            let val = parseInt(document.getElementById('swalPrioVal').value);
            if (isNaN(val) || val < 1) val = 1;
            return val;
        }
    });

    if (prio !== undefined) {
        task.priority_order = prio;
        task.has_custom_priority = true;
        setSaveStatus(true);
        list.sort((a, b) => {
            let aPrio = (a.priority_order !== null && a.priority_order !== undefined) ? a.priority_order : 999;
            let bPrio = (b.priority_order !== null && b.priority_order !== undefined) ? b.priority_order : 999;
            if (aPrio !== bPrio) return aPrio - bPrio;
            return a.op_num - b.op_num;
        });
        renderAllMachines();
    }
};

window.clearTaskPriority = async function(machineName, detailId, opNum) {
    let list = machineTasksMap[machineName] || [];
    let task = list.find(t => t.detail_id === detailId && t.op_num === opNum);
    if (!task) return;

    const { isConfirmed } = await Swal.fire({
        title: 'Премахване на приоритет',
        text: `Премахване на приоритет #${task.priority_order} за ${task.detail_name} (Оп. ${task.op_num})?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Да, премахни',
        cancelButtonText: 'Отказ'
    });

    if (isConfirmed) {
        task.priority_order = null;
        task.has_custom_priority = false;
        setSaveStatus(true);
        list.sort((a, b) => {
            let aPrio = (a.priority_order !== null && a.priority_order !== undefined) ? a.priority_order : 999;
            let bPrio = (b.priority_order !== null && b.priority_order !== undefined) ? b.priority_order : 999;
            if (aPrio !== bPrio) return aPrio - bPrio;
            return a.op_num - b.op_num;
        });
        renderAllMachines();
    }
};

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

// Global Save: Upsert priorities & transfers to Supabase
async function saveAllPriorities() {
    const selectedYear = parseInt(document.getElementById('selectYear').value) || 2026;
    const selectedMonth = document.getElementById('selectMonth').value;

    let allTasksToSave = [];
    let machinesToCleanForTask = [];

    Object.keys(machineTasksMap).forEach(m => {
        let tasks = machineTasksMap[m] || [];
        tasks.forEach(t => {
            let noteContent = t.notes || '';
            let hasPriority = (t.priority_order !== null && t.priority_order !== undefined && t.priority_order <= 10);
            let isTransferred = t.is_transferred;
            let hasNote = !!noteContent.trim();

            if (!hasPriority && !isTransferred && !hasNote) {
                return; // Do NOT save default unprioritized tasks
            }

            if (t.is_transferred && t.original_machine) {
                noteContent = `[ORIG:${t.original_machine}] ` + noteContent.replace(/\[ORIG:.*?\]\s*/g, '').trim();
                machinesToCleanForTask.push({
                    machineToDelete: t.original_machine,
                    detail_id: t.detail_id,
                    op_num: t.op_num
                });
            } else {
                noteContent = noteContent.replace(/\[ORIG:.*?\]\s*/g, '').trim();
                if (t.original_machine) {
                    machinesToCleanForTask.push({
                        machineToDelete: 'OTHER',
                        currentMachine: t.machine,
                        detail_id: t.detail_id,
                        op_num: t.op_num
                    });
                }
            }

            let rowObj = {
                plan_year: selectedYear,
                plan_month: selectedMonth,
                machine: t.machine,
                detail_id: t.detail_id,
                op_num: t.op_num,
                op_name: t.op_name,
                detail_name: t.detail_name,
                priority_order: hasPriority ? t.priority_order : 999,
                priority_score: 0,
                notes: noteContent.trim() || null,
                updated_at: new Date().toISOString()
            };

            if (hasOriginalMachineColumn) {
                rowObj.original_machine = t.original_machine;
            }

            allTasksToSave.push(rowObj);
        });
    });

    if (window.tasksMovedLocations && window.tasksMovedLocations.length > 0) {
        window.tasksMovedLocations.forEach(item => {
            machinesToCleanForTask.push({
                machineToDelete: item.fromMachine,
                detail_id: item.detail_id,
                op_num: item.op_num
            });
        });
    }

    Swal.fire({
        title: 'Запазване на промените...',
        html: `Записване на приоритетите и прехвърлянията...`,
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // 1. Clean up old machine records for transferred or reverted tasks
        if (machinesToCleanForTask.length > 0) {
            for (let item of machinesToCleanForTask) {
                if (item.machineToDelete === 'OTHER') {
                    await client.from('task_priorities')
                        .delete()
                        .eq('detail_id', item.detail_id)
                        .eq('op_num', item.op_num)
                        .neq('machine', item.currentMachine);
                } else if (item.machineToDelete) {
                    await client.from('task_priorities')
                        .delete()
                        .eq('machine', item.machineToDelete)
                        .eq('detail_id', item.detail_id)
                        .eq('op_num', item.op_num);
                }
            }
        }
        window.tasksMovedLocations = [];

        // 2. Clean up any cleared/removed priorities for this period
        try {
            const { data: existingRows } = await client
                .from('task_priorities')
                .select('id, machine, detail_id, op_num')
                .eq('plan_year', selectedYear)
                .eq('plan_month', selectedMonth);

            if (existingRows && existingRows.length > 0) {
                let idsToDelete = existingRows.filter(er => {
                    let stillKept = allTasksToSave.some(ts => 
                        normalize(ts.machine) === normalize(er.machine) &&
                        normalize(ts.detail_id) === normalize(er.detail_id) &&
                        ts.op_num === er.op_num
                    );
                    return !stillKept;
                }).map(er => er.id);

                if (idsToDelete.length > 0) {
                    await client.from('task_priorities').delete().in('id', idsToDelete);
                }
            }
        } catch (eClean) {
            console.warn('Could not clean obsolete priorities:', eClean);
        }

        // 3. Upsert explicitly prioritized tasks in batches of 500
        for (let i = 0; i < allTasksToSave.length; i += 500) {
            let chunk = allTasksToSave.slice(i, i + 500);
            const { error } = await client
                .from('task_priorities')
                .upsert(chunk, {
                    onConflict: 'plan_year,plan_month,machine,detail_id,op_num'
                });
            if (error) throw error;
        }

        // Refresh local priorities cache
        try {
            const { data: updatedPriorities } = await client.from('task_priorities').select('*');
            if (updatedPriorities) rawPriorities = updatedPriorities;
        } catch (eRef) {
            console.warn('Could not refresh rawPriorities:', eRef);
        }

        setSaveStatus(false);

        Swal.fire({
            icon: 'success',
            title: 'Успешно запазване!',
            html: allTasksToSave.length > 0 
                ? `Приоритетите и прехвърлянията на <b>${allTasksToSave.length} задачи</b> бяха записани.<br><small class="text-muted">Терминалите в цеха веднага отразяват промените за този месец.</small>`
                : `Всички промени са записани.<br><small class="text-muted">Няма активни специфични приоритети.</small>`,
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
                'Машина (Текущ месец)': t.machine,
                'Оригинална Машина (Маршрутна карта)': t.original_machine,
                'Прехвърлена': t.is_transferred ? 'ДА' : 'НЕ',
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

// ==============================================================================
// SPOT AUDITS (ЕКСПРЕСНИ РЕВИЗИИ) - УПРАВЛЕНИЕ В ТАБЛО ЗАДАЧИ
// ==============================================================================

let rawSpotAudits = [];
let currentAuditFilter = 'all';

// Проследяване на прегледаните/прочетените ревизии
function getReadAuditInfo() {
    let lastTime = 0;
    let readIds = new Set();
    try {
        let lastStr = localStorage.getItem('last_read_spot_audit_time');
        if (lastStr) lastTime = new Date(lastStr).getTime();
        let parsedIds = JSON.parse(localStorage.getItem('read_spot_audit_ids') || '[]');
        readIds = new Set(parsedIds);
    } catch(e) {}
    return { lastTime, readIds };
}

function isAuditUnread(audit) {
    if (!audit || audit.status !== 'DISCREPANCY') return false;
    const { lastTime, readIds } = getReadAuditInfo();
    if (readIds.has(audit.id)) return false;
    let auditTime = new Date(audit.answered_at || audit.created_at).getTime();
    return auditTime > lastTime;
}

function markAllSpotAuditsAsRead(showFeedback = false) {
    try {
        localStorage.setItem('last_read_spot_audit_time', new Date().toISOString());
        let allIds = (rawSpotAudits || []).map(a => a.id).filter(Boolean);
        let currentRead = [];
        try { currentRead = JSON.parse(localStorage.getItem('read_spot_audit_ids') || '[]'); } catch(e) {}
        let merged = Array.from(new Set([...currentRead, ...allIds]));
        localStorage.setItem('read_spot_audit_ids', JSON.stringify(merged));
    } catch(e) {}

    updateSpotAuditBadges();

    if (showFeedback && typeof Swal !== 'undefined') {
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 2000,
            timerProgressBar: true
        });
        Toast.fire({
            icon: 'success',
            title: 'Известията са маркирани като прегледани'
        });
    }

    try {
        window.dispatchEvent(new Event('storage'));
    } catch(e) {}
}

function openSpotAuditModal(prefillMachine = '', prefillPart = '', prefillOp = '', prefillQty = '') {
    const backdrop = document.getElementById('spotAuditModalBackdrop');
    if (!backdrop) return;
    backdrop.style.display = 'flex';

    populateAuditMachineSelect();
    loadCheckedInWorkers();
    
    if (prefillMachine) {
        document.getElementById('auditMachineSelect').value = prefillMachine;
        onAuditMachineChange();
    }
    if (prefillPart) {
        document.getElementById('auditPartSelect').value = prefillPart;
        onAuditPartChange();
    }
    if (prefillOp) {
        document.getElementById('auditOpInput').value = prefillOp;
    }
    if (prefillQty !== '' && prefillQty !== null && prefillQty !== undefined) {
        document.getElementById('auditExpectedInput').value = prefillQty;
    }

    if (prefillMachine) {
        switchSpotAuditTab('new');
    } else {
        // Отворено от горния бутон с известието -> отваряме направо дневника и маркираме като прочетено
        switchSpotAuditTab('history');
        markAllSpotAuditsAsRead();
    }
    loadSpotAuditHistory();
}

function closeSpotAuditModal() {
    const backdrop = document.getElementById('spotAuditModalBackdrop');
    if (backdrop) backdrop.style.display = 'none';
    markAllSpotAuditsAsRead();
}

function switchSpotAuditTab(tab) {
    const tabNew = document.getElementById('spotAuditTab_new');
    const tabHistory = document.getElementById('spotAuditTab_history');
    const btnNew = document.getElementById('tabBtn_newAudit');
    const btnHistory = document.getElementById('tabBtn_historyAudit');

    if (tab === 'new') {
        tabNew.style.display = 'block';
        tabHistory.style.display = 'none';
        btnNew.classList.add('active');
        btnHistory.classList.remove('active');
    } else {
        tabNew.style.display = 'none';
        tabHistory.style.display = 'flex';
        btnNew.classList.remove('active');
        btnHistory.classList.add('active');
        markAllSpotAuditsAsRead();
        loadSpotAuditHistory();
    }
}

function populateAuditMachineSelect() {
    const select = document.getElementById('auditMachineSelect');
    if (!select) return;

    let currentVal = select.value;
    let html = '<option value="">-- Изберете машина --</option>';
    allUniqueMachines.forEach(m => {
        html += `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`;
    });
    select.innerHTML = html;
    if (currentVal) select.value = currentVal;
}

function onAuditMachineChange() {
    const mSelect = document.getElementById('auditMachineSelect');
    const pSelect = document.getElementById('auditPartSelect');
    if (!mSelect || !pSelect) return;

    let machine = mSelect.value;
    let tasks = machineTasksMap[machine] || [];

    let uniqueParts = {};
    tasks.forEach(t => {
        if (!uniqueParts[t.detail_id]) uniqueParts[t.detail_id] = t;
    });

    let html = '<option value="">-- Изберете детайл --</option>';
    Object.values(uniqueParts).forEach(t => {
        html += `<option value="${escapeHtml(t.detail_id)}" data-op="${escapeHtml(t.op_name)}" data-qty="${t.available_prev || t.remain_qty || 0}">${escapeHtml(t.detail_id)} (${escapeHtml(t.detail_name)})</option>`;
    });

    pSelect.innerHTML = html;
    document.getElementById('auditOpInput').value = '';
    document.getElementById('auditExpectedInput').value = '';
}

function onAuditPartChange() {
    const pSelect = document.getElementById('auditPartSelect');
    const opInput = document.getElementById('auditOpInput');
    const expInput = document.getElementById('auditExpectedInput');
    if (!pSelect || !opInput || !expInput) return;

    const opt = pSelect.options[pSelect.selectedIndex];
    if (opt && opt.value) {
        opInput.value = opt.getAttribute('data-op') || '';
        expInput.value = opt.getAttribute('data-qty') || '0';
    }
}

function quickTriggerSpotAudit(machine, detailId, opName, qty) {
    openSpotAuditModal(machine, detailId, opName, qty);
}

async function loadCheckedInWorkers() {
    const wSelect = document.getElementById('auditWorkerSelect');
    if (!wSelect) return;

    try {
        let today = new Date();
        today.setHours(0, 0, 0, 0);
        let todayIso = today.toISOString();

        const [chekiraniyaRes, personalRes] = await Promise.all([
            client.from('chekiraniya')
                .select('*')
                .gte('Време', todayIso)
                .order('Време', { ascending: false }),
            client.from('personal').select('Имейл, Име')
        ]);

        let emailToName = {};
        if (personalRes.data) {
            personalRes.data.forEach(p => {
                if (p['Имейл'] && p['Име']) emailToName[p['Имейл'].trim().toLowerCase()] = p['Име'].trim();
            });
        }

        let latestByWorker = {};
        (chekiraniyaRes.data || []).forEach(row => {
            let email = String(row['Имейл'] || '').trim().toLowerCase();
            let name = String(row['Име'] || emailToName[email] || row['Имейл'] || '').trim();
            if (!name) return;
            if (!latestByWorker[name]) {
                latestByWorker[name] = row;
            }
        });

        let checkedInList = [];
        for (let name in latestByWorker) {
            let row = latestByWorker[name];
            if (row['Действие'] === 'Влизане') {
                let time = '';
                try {
                    let d = new Date(row['Време']);
                    time = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
                } catch(e) {}
                let email = String(row['Имейл'] || '').trim().toLowerCase();
                checkedInList.push({ name, email, time });
            }
        }

        checkedInList.sort((a, b) => a.name.localeCompare(b.name, 'bg'));

        let html = '<option value="" data-email="">-- Всеки на това работно място (по подразбиране) --</option>';
        checkedInList.forEach(w => {
            html += `<option value="${escapeHtml(w.name)}" data-email="${escapeHtml(w.email)}">🟢 ${escapeHtml(w.name)} (чекиран в ${w.time} ч.)</option>`;
        });

        if (checkedInList.length === 0) {
            html += '<option value="" disabled>Няма чекирани работници за днес</option>';
        }

        wSelect.innerHTML = html;
    } catch(err) {
        console.warn('Грешка при зареждане на чекирани работници:', err);
    }
}

// ==============================================================================
// ONESIGNAL PUSH ИЗВЕСТИЯ КЪМ МОБИЛНИ ТЕЛЕФОНИ
// ==============================================================================

async function sendSpotAuditPushNotification({ machine, targetWorker, targetEmail, partCode, op, expectedQty }) {
    const ONESIGNAL_APP_ID = "2507a9cb-0d28-4952-9b7b-42e800a61613";
    const ONESIGNAL_API_KEY = "os_v2_app_eud2tsynfbevfg33iluabjqwcngcem2gdkaebuebdt" + "ob2ewfduy6d6lsudjvxyol6gqh7tatgimm7kewbh4sjp7yea5hzqmmdydqxkq";

    let title = `🎯 Експресна Ревизия (${machine})`;
    let body = targetWorker 
        ? `👷 ${targetWorker}, моля проверете бройките за ${partCode} (${op})! Очаквани: ${expectedQty} бр.`
        : `⚠️ Моля, проверете бройките за ${partCode} (${op}) на ${machine}! Очаквани: ${expectedQty} бр.`;

    let terminalUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'terminal.html';

    let payload = {
        app_id: ONESIGNAL_APP_ID,
        headings: { "en": title, "bg": title },
        contents: { "en": body, "bg": body },
        url: terminalUrl,
        priority: 10
    };

    if (targetEmail && targetEmail.trim() !== '') {
        // Насочено персонално към въпросния работник по неговия имейл/external_id
        payload.include_external_user_ids = [targetEmail.toLowerCase().trim()];
    } else {
        // Насочено към всички абонирани устройства
        payload.included_segments = ["Total Subscriptions"];
    }

    try {
        const response = await fetch("https://corsproxy.io/?https://onesignal.com/api/v1/notifications", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json; charset=utf-8", 
                "Authorization": "Key " + ONESIGNAL_API_KEY 
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errTxt = await response.text().catch(() => '');
            console.warn("OneSignal Push грешка от сървъра:", errTxt);
            return false;
        }

        const resData = await response.json().catch(() => ({}));
        console.log("OneSignal Push изпратено успешно:", resData);
        return true;
    } catch (e) {
        console.warn("OneSignal Push грешка при свързване:", e);
        return false;
    }
}

async function submitNewSpotAudit() {
    const machine = (document.getElementById('auditMachineSelect').value || '').trim();
    const wSelect = document.getElementById('auditWorkerSelect');
    const targetWorker = (wSelect.value || '').trim() || null;
    const selectedOpt = wSelect.options[wSelect.selectedIndex];
    const targetEmail = (selectedOpt && selectedOpt.getAttribute('data-email')) || null;

    const partCode = (document.getElementById('auditPartSelect').value || '').trim();
    const op = (document.getElementById('auditOpInput').value || '').trim();
    const expVal = document.getElementById('auditExpectedInput').value;
    const expQty = parseFloat(expVal);

    if (!machine) {
        Swal.fire('Липсва машина', 'Моля, изберете работно място (машина)!', 'warning');
        return;
    }
    if (!partCode) {
        Swal.fire('Липсва детайл', 'Моля, изберете детайл!', 'warning');
        return;
    }
    if (!op) {
        Swal.fire('Липсва операция', 'Моля, въведете операция!', 'warning');
        return;
    }
    if (isNaN(expQty) || expQty < 0) {
        Swal.fire('Невалидно количество', 'Моля, въведете валидно очаквано количество!', 'warning');
        return;
    }

    const workerTargetDesc = targetWorker 
        ? `<div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:6px 10px; color:#166534; font-weight:700; margin-top:8px;">🎯 Насочена персонално към: <b>${escapeHtml(targetWorker)}</b> (ще изпрати и Push съобщение към неговия телефон)</div>`
        : `<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px 10px; color:#64748b; font-weight:600; margin-top:8px;">👥 Насочена към: <b>Всеки на това работно място</b></div>`;

    const confirmRes = await Swal.fire({
        title: 'Изпращане на ревизия',
        html: `Ще изпратите изненадваща проверка към <b>${escapeHtml(machine)}</b>:<br><br>
               Детайл: <b>${escapeHtml(partCode)}</b><br>
               Операция: <b>${escapeHtml(op)}</b><br>
               Очаквани: <b style="color:#7c3aed; font-size:1.15em;">${expQty} бр.</b>
               ${workerTargetDesc}`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#7c3aed',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: '🚀 ДА, ИЗПРАТИ',
        cancelButtonText: 'Отказ'
    });

    if (!confirmRes.isConfirmed) return;

    Swal.fire({ title: 'Изпращане...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { error } = await client.from('spot_audits').insert([{
            target_machine: machine,
            target_worker: targetWorker,
            part_code: partCode,
            operation: op,
            expected_qty: expQty,
            status: 'PENDING'
        }]);

        if (error) throw error;

        // Изпращане на Push известие към мобилния телефон на работника
        let pushSent = false;
        try {
            pushSent = await sendSpotAuditPushNotification({
                machine,
                targetWorker,
                targetEmail,
                partCode,
                op,
                expectedQty: expQty
            });
        } catch(pErr) {
            console.warn('OneSignal Push грешка:', pErr);
        }

        let pushText = pushSent
            ? `<div style="margin-top:8px; color:#16a34a; font-weight:700; font-size:0.95em;">📲 Звуково Push известие беше изпратено директно към телефона!</div>`
            : `<div style="margin-top:8px; color:#64748b; font-size:0.85em;">ℹ️ Записано в системата (терминалът ще го отрази на живо).</div>`;

        Swal.fire({
            icon: 'success',
            title: 'Проверката е изпратена!',
            html: `
                <div>${targetWorker 
                    ? `Сигналът е изпратен персонално към работник: <b>${escapeHtml(targetWorker)}</b>.` 
                    : `Сигналът е изпратен към терминала на работно място "<b>${escapeHtml(machine)}</b>".`}
                </div>
                ${pushText}
            `,
            timer: 3500,
            showConfirmButton: false
        });

        switchSpotAuditTab('history');
        loadSpotAuditHistory();

    } catch (err) {
        console.error('Грешка при изпращане на ревизия:', err);
        Swal.fire('Грешка', err.message, 'error');
    }
}

async function loadSpotAuditHistory() {
    const wrap = document.getElementById('spotAuditsTableWrap');
    if (!wrap) return;

    try {
        const { data, error } = await client
            .from('spot_audits')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;
        rawSpotAudits = data || [];
        updateSpotAuditBadges();
        renderSpotAuditHistoryTable();

    } catch (err) {
        console.error('Грешка при зареждане на дневника за ревизии:', err);
        wrap.innerHTML = `<div style="text-align:center; color:#ef4444; padding:30px;">❌ Грешка при зареждане: ${escapeHtml(err.message)}</div>`;
    }
}

function updateSpotAuditBadges() {
    let pending = rawSpotAudits.filter(a => a.status === 'PENDING').length;
    let diff = rawSpotAudits.filter(a => a.status === 'DISCREPANCY').length;
    let match = rawSpotAudits.filter(a => a.status === 'MATCH').length;
    let total = rawSpotAudits.length;

    // Непрочетени разминавания (за които операторът е подал сигнал, но админът още не ги е прегледал)
    let unreadDiff = rawSpotAudits.filter(a => isAuditUnread(a)).length;

    const elTotal = document.getElementById('countAuditAll');
    const elPending = document.getElementById('countAuditPending');
    const elDiff = document.getElementById('countAuditDiff');
    const elMatch = document.getElementById('countAuditMatch');
    const badgePending = document.getElementById('auditPendingBadge');
    const navBadge = document.getElementById('navSpotAuditBadge');

    if (elTotal) elTotal.innerText = total;
    if (elPending) elPending.innerText = pending;
    if (elDiff) elDiff.innerText = diff;
    if (elMatch) elMatch.innerText = match;

    // Бадж на таб "Дневник на ревизиите" в модала
    if (badgePending) {
        if (unreadDiff > 0) {
            badgePending.style.display = 'inline-block';
            badgePending.style.background = '#ef4444';
            badgePending.innerText = unreadDiff;
            badgePending.title = `Има ${unreadDiff} непрегледани разминавания`;
        } else if (pending > 0) {
            badgePending.style.display = 'inline-block';
            badgePending.style.background = '#ea580c';
            badgePending.innerText = pending;
            badgePending.title = `Има ${pending} чакащи отговор ревизии`;
        } else {
            badgePending.style.display = 'none';
        }
    }

    // Червено известие в горната лента (Бутон "🎯 Експресна Ревизия")
    // Показва се САМО ако има непрегледано разминаване! Когато се прочете -> изчезва!
    if (navBadge) {
        if (unreadDiff > 0) {
            navBadge.style.display = 'inline-block';
            navBadge.style.background = '#ef4444';
            navBadge.innerText = unreadDiff;
            navBadge.title = `Има ${unreadDiff} ново/и непрегледано/и разминаване/я от ревизия!`;
            navBadge.style.animation = 'pulse 1.8s infinite';
        } else {
            navBadge.style.display = 'none';
            navBadge.style.animation = 'none';
        }
    }
}

function filterAuditHistory(filter) {
    currentAuditFilter = filter;
    ['all', 'pending', 'diff', 'match'].forEach(f => {
        const chip = document.getElementById('chip_audit_' + f);
        if (chip) {
            if (f === filter) chip.classList.add('active');
            else chip.classList.remove('active');
        }
    });
    renderSpotAuditHistoryTable();
}

function renderSpotAuditHistoryTable() {
    const wrap = document.getElementById('spotAuditsTableWrap');
    if (!wrap) return;

    let list = rawSpotAudits;
    if (currentAuditFilter === 'pending') list = list.filter(a => a.status === 'PENDING');
    else if (currentAuditFilter === 'diff') list = list.filter(a => a.status === 'DISCREPANCY');
    else if (currentAuditFilter === 'match') list = list.filter(a => a.status === 'MATCH');

    if (list.length === 0) {
        wrap.innerHTML = `<div style="text-align:center; color:#94a3b8; padding:40px; font-weight:700;">Няма намерени записи в дневника.</div>`;
        return;
    }

    let rowsHtml = '';
    list.forEach(a => {
        let createdD = new Date(a.created_at);
        let timeStr = createdD.toLocaleDateString('bg-BG') + ' ' + createdD.getHours().toString().padStart(2, '0') + ':' + createdD.getMinutes().toString().padStart(2, '0');

        let statusHtml = '';
        let diffText = '-';
        let reportedText = '-';
        let workerText = a.worker_name ? `<b>${escapeHtml(a.worker_name)}</b>` : '<span style="color:#94a3b8;">Очаква отговор...</span>';

        if (a.status === 'PENDING') {
            statusHtml = `<span class="audit-status-badge audit-status-pending">⏳ Очаква отговор</span>`;
        } else if (a.status === 'MATCH') {
            statusHtml = `<span class="audit-status-badge audit-status-match">🟢 Точно съвпадение</span>`;
            reportedText = `<b>${a.reported_qty} бр.</b>`;
            diffText = `<span style="color:#16a34a; font-weight:800;">0 бр.</span>`;
        } else if (a.status === 'DISCREPANCY') {
            let diffVal = parseFloat(a.difference_qty) || 0;
            let diffSign = diffVal > 0 ? '+' : '';
            let isUnread = isAuditUnread(a);
            let unreadTag = isUnread ? `<span style="background:#fee2e2; color:#b91c1c; font-size:0.7em; font-weight:900; padding:2px 6px; border-radius:4px; margin-left:5px; border:1px solid #fecaca;">НОВО</span>` : '';
            statusHtml = `<span class="audit-status-badge audit-status-diff">🔴 Разминаване (${diffSign}${diffVal})${unreadTag}</span>`;
            reportedText = `<b style="color:#dc2626;">${a.reported_qty} бр.</b>`;
            diffText = `<b style="color:#dc2626;">${diffSign}${diffVal} бр.</b>`;
        } else if (a.status === 'CANCELLED') {
            statusHtml = `<span class="audit-status-badge" style="background:#f1f5f9; color:#64748b;">⚪ Анулирана</span>`;
        }

        let actionHtml = '';
        if (a.status === 'PENDING') {
            actionHtml = `<button onclick="cancelSpotAudit(${a.id})" style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; padding:3px 8px; font-size:0.8em; color:#dc2626; cursor:pointer; font-weight:700;" title="Анулирай проверката">❌ Отказ</button>`;
        }

        rowsHtml += `
            <tr>
                <td style="font-size:0.85em; color:#64748b; white-space:nowrap;">${timeStr}</td>
                <td>
                    <b style="color:#1e293b;">${escapeHtml(a.target_machine)}</b>
                    ${a.target_worker 
                        ? `<div style="font-size:0.8em; color:#6b21a8; font-weight:800; margin-top:2px;" title="Насочена лично към този работник">🎯 ${escapeHtml(a.target_worker)}</div>` 
                        : '<div style="font-size:0.78em; color:#94a3b8; margin-top:2px;">👥 Всеки на машината</div>'}
                </td>
                <td>
                    <div style="font-weight:800; color:#4338ca;">${escapeHtml(a.part_code)}</div>
                    <div style="font-size:0.82em; color:#64748b;">${escapeHtml(a.operation)}</div>
                </td>
                <td style="font-weight:800; color:#7e22ce;">${a.expected_qty} бр.</td>
                <td>${reportedText}</td>
                <td>${diffText}</td>
                <td>${workerText}</td>
                <td>${statusHtml}</td>
                <td style="text-align:right;">${actionHtml}</td>
            </tr>
        `;
    });

    wrap.innerHTML = `
        <table class="spot-audits-table">
            <thead>
                <tr>
                    <th>Дата / Час</th>
                    <th>Работно място</th>
                    <th>Детайл &amp; Оп.</th>
                    <th>Очаквани</th>
                    <th>Преброени</th>
                    <th>Разлика</th>
                    <th>Проверил (Работник)</th>
                    <th>Резултат</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
        </table>
    `;
}

async function cancelSpotAudit(id) {
    const res = await Swal.fire({
        title: 'Анулиране на ревизия',
        text: 'Сигурни ли сте, че искате да анулирате тази изпратена проверка?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'Да, анулирай',
        cancelButtonText: 'Отказ'
    });
    if (!res.isConfirmed) return;

    try {
        await client.from('spot_audits').update({ status: 'CANCELLED' }).eq('id', id);
        loadSpotAuditHistory();
    } catch(err) {
        Swal.fire('Грешка', err.message, 'error');
    }
}

// Звуково известяване за администратора
function playAuditAlertSound(isDiscrepancy) {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (isDiscrepancy) {
            // Двутонен предупредителен сигнал за разминаване
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(587.33, now); // D5
            osc.frequency.setValueAtTime(440.00, now + 0.18); // A4
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
            osc.start(now);
            osc.stop(now + 0.5);
        } else {
            // Приятен позитивен сигнал за точна ревизия
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.setValueAtTime(659.25, now + 0.12); // E5
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.35);
        }
    } catch(e) {
        console.warn('Audio play error:', e);
    }
}

// Обработка на отговорена ревизия в реално време
function onSpotAuditAnswerReceived(audit) {
    let isDiscrepancy = (audit.status === 'DISCREPANCY');

    if (isDiscrepancy) {
        playAuditAlertSound(true);
        let diffVal = parseFloat(audit.difference_qty) || 0;
        let diffSign = diffVal > 0 ? '+' : '';

        Swal.fire({
            title: '🔴 Внимание: Получено разминаване!',
            html: `
                <div style="font-size:1.02em; line-height:1.5; color:#1e293b; text-align:left; background:#fff1f2; border:1.5px solid #fecdd3; border-radius:10px; padding:14px; margin-top:8px;">
                    <div>👷 <b>Работник:</b> <span style="color:#b91c1c; font-weight:800; font-size:1.1em;">${escapeHtml(audit.worker_name || 'ОПЕРАТОР')}</span></div>
                    <div>🏭 <b>Работно място:</b> <b>${escapeHtml(audit.target_machine)}</b></div>
                    <div>📦 <b>Детайл:</b> <b>${escapeHtml(audit.part_code)}</b> (${escapeHtml(audit.operation)})</div>
                    <hr style="border:none; border-top:1px dashed #f43f5e; margin:10px 0;">
                    <div style="display:flex; justify-content:space-between; font-size:1.05em;">
                        <span>Очаквани: <b>${audit.expected_qty} бр.</b></span>
                        <span>Преброени: <b style="color:#dc2626; font-size:1.15em;">${audit.reported_qty} бр.</b></span>
                    </div>
                    <div style="margin-top:6px; font-size:1.1em; color:#b91c1c; font-weight:900;">
                        ⚠️ Разлика: ${diffSign}${diffVal} бр.
                    </div>
                </div>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#7c3aed',
            cancelButtonColor: '#94a3b8',
            confirmButtonText: '📋 Отвори Дневника',
            cancelButtonText: 'Разбрах',
            backdrop: true
        }).then((res) => {
            // Щом админът е видял съобщението и натисне някой от бутоните, отбелязваме като прочетено
            markAllSpotAuditsAsRead();
            if (res.isConfirmed) {
                openSpotAuditModal();
                switchSpotAuditTab('history');
            }
        });
    } else if (audit.status === 'MATCH') {
        playAuditAlertSound(false);
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 4500,
            timerProgressBar: true
        });
        Toast.fire({
            icon: 'success',
            title: `🟢 Точна ревизия на ${escapeHtml(audit.target_machine)}!`,
            text: `${escapeHtml(audit.worker_name || 'Работник')} потвърди точно ${audit.reported_qty} бр. за ${escapeHtml(audit.part_code)}.`
        });
    }

    loadSpotAuditHistory();
}

let spotAuditAdminChannel = null;
function initSpotAuditsAdminRealtime() {
    try {
        if (!client) return;

        // Синхронизация между различни отворени табове при прочитане
        window.addEventListener('storage', (e) => {
            if (e.key === 'last_read_spot_audit_time' || e.key === 'read_spot_audit_ids') {
                updateSpotAuditBadges();
                renderSpotAuditHistoryTable();
            }
        });

        spotAuditAdminChannel = client.channel('spot-audits-admin-realtime')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'spot_audits' }, (payload) => {
                const newRow = payload.new || {};
                if (newRow && (newRow.status === 'MATCH' || newRow.status === 'DISCREPANCY')) {
                    onSpotAuditAnswerReceived(newRow);
                }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'spot_audits' }, () => {
                loadSpotAuditHistory();
            })
            .subscribe();
    } catch(e) {
        console.warn('Realtime error in admin spot_audits:', e);
    }
}

