function updateHistoryUI() {
    var list = document.getElementById('historyList');
    if (!list) return;
    if (localHistoryData.length === 0) {
        list.innerHTML = '<li class="history-item" style="color:#94a3b8; text-align:center;">Няма скорошни действия</li>';
        return;
    }
    var html = '';
    localHistoryData.forEach(item => {
        var isScrap = item.type === 'БРАК';
        var color = isScrap ? '#dc2626' : '#16a34a';
        var typeBadge = isScrap
            ? `<span style="background:#fee2e2; color:#b91c1c; font-size:0.75em; font-weight:800; padding:2px 6px; border-radius:4px; margin-right:4px;">БРАК</span>`
            : `<span style="background:#dcfce7; color:#15803d; font-size:0.75em; font-weight:800; padding:2px 6px; border-radius:4px; margin-right:4px;">ГОТОВО</span>`;
        var opBadge = item.op
            ? `<span style="display:inline-block; background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-size:0.8em; font-weight:700; padding:2px 7px; border-radius:6px; margin-left:6px;">⚙️ ${item.op}</span>`
            : '';
        html += `
        <li class="history-item" style="padding: 10px 0; border-bottom: 1px dashed var(--border-subtle, #e2e8f0); display: flex; flex-direction: column; gap: 4px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="history-time" style="color:var(--text-muted, #64748b); font-weight:bold; font-size:11px;">${item.time}</span>
            <span>${typeBadge}<span style="color:${color}; font-weight:900;">${item.qty} бр.</span></span>
          </div>
          <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:4px;">
            <b style="color:#1e293b; font-size:0.95em;">${item.name}</b>
            ${opBadge}
          </div>
        </li>`;
    });
    list.innerHTML = html;
}

async function loadHistoryFromDB() {
    if (!currentOperator || currentOperator === "undefined" || !navigator.onLine) return;
    try {
        const { data, error } = await client.from('otcheti')
            .select('"ID Детайл", "Операция", Количество, Дата, Статус')
            .eq('Оператор', currentOperator)
            .in('Статус', ['Отчетено', 'Брак'])
            .order('Дата', { ascending: false })
            .limit(10);

        if (error) throw error;
        if (data && data.length > 0) {
            localHistoryData = data.map(r => {
                let d = (typeof window.parseSafeUtcDate === 'function') ? window.parseSafeUtcDate(r['Дата']) : new Date(r['Дата']);
                let timeStr = d.getDate().toString().padStart(2, '0') + '.' + (d.getMonth() + 1).toString().padStart(2, '0') + ' ' + d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
                let isScrap = r['Статус'] === 'Брак';
                return {
                    time: timeStr,
                    type: isScrap ? 'БРАК' : 'ГОТОВО',
                    qty: r['Количество'],
                    name: String(r['ID Детайл']).trim(),
                    op: r['Операция'] ? String(r['Операция']).trim() : ''
                };
            });
            updateHistoryUI();
        } else if (data && data.length === 0) {
            localHistoryData = [];
            updateHistoryUI();
        }
    } catch (e) {
        console.error("Грешка при зареждане на история от базата:", e);
    }
}


function toggleHistory() {
    var panel = document.getElementById('historyPanel');
    panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none';
    if (panel.style.display === 'block') {
        document.getElementById('messagesPanel').style.display = 'none';
        if (typeof loadHistoryFromDB === 'function') loadHistoryFromDB();
    }
}

async function toggleMessages() {
    var panel = document.getElementById('messagesPanel');
    if (panel.style.display === 'none' || panel.style.display === '') {
        panel.style.display = 'block';
        document.getElementById('historyPanel').style.display = 'none';
        await fetchMessages();
    } else {
        panel.style.display = 'none';
    }
}

function addLogToHistory(type, qty, taskId) {
    var now = new Date();
    var timeStr = now.getDate().toString().padStart(2, '0') + '.' + (now.getMonth() + 1).toString().padStart(2, '0') + ' ' + now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    let taskData = globalTasks.find(t => t.id === taskId);
    var name = taskData ? (taskData.name) : 'Детайл';
    var op = taskData ? (taskData.op || '') : '';
    localHistoryData.unshift({ time: timeStr, type: type, qty: qty, name: name, op: op });
    if (localHistoryData.length > 10) localHistoryData.pop();
    updateHistoryUI();
}

async function fetchLiveProbaTaskStockLimits(taskData) {
    if (!taskData || !taskData.isProba || !taskData.plan_id || !taskData.probaId) return null;

    const pKey = String(taskData.plan_id).trim();
    const partCode = String(taskData.name || '').trim();
    const partNorm = normalizeStr(partCode);

    const [repRes, probiInvRes, compsRes, skladRes] = await Promise.all([
        client.from('otcheti').select('"ID Детайл", "Операция", "Количество", "Статус"').eq('ID План', pKey),
        client.from('probi_inventory').select('part_code, operation, quantity').eq('proba_id', taskData.probaId),
        client.from('probi_components').select('part_code, parent_part_code, qty_per_unit, is_new, material_code, material_norm, custom_routes').eq('proba_id', taskData.probaId),
        client.from('sklad').select('"ID Детайл", Остатък').limit(10000)
    ]);

    if (repRes.error || skladRes.error) return null;

    const myComps = (compsRes && !compsRes.error && Array.isArray(compsRes.data)) ? compsRes.data : [];
    const compRecord = myComps.find(c => normalizeStr(c.part_code) === partNorm);

    let compRoutes = [];
    if (compRecord && compRecord.is_new && Array.isArray(compRecord.custom_routes) && compRecord.custom_routes.length > 0) {
        compRoutes = compRecord.custom_routes.slice().sort((a, b) => (parseInt(a.op_num || a['№ Операция']) || 0) - (parseInt(b.op_num || b['№ Операция']) || 0));
    } else {
        compRoutes = ((typeof globalRoutesByDetail !== 'undefined' && globalRoutesByDetail[partNorm]) ? globalRoutesByDetail[partNorm] : [])
            .slice()
            .sort((a, b) => (parseInt(a['№ Операция'] || a.op_num) || 0) - (parseInt(b['№ Операция'] || b.op_num) || 0));
    }

    if (compRoutes.length === 0) return null;

    const curOpNum = parseInt(taskData.opNum, 10) || 0;
    const curOpNorm = normalizeStr(taskData.op);
    let rIdx = compRoutes.findIndex(r => (parseInt(r['№ Операция'] || r.op_num) || 0) === curOpNum);
    if (rIdx === -1 && curOpNorm) {
        rIdx = compRoutes.findIndex(r => normalizeStr(r['Име на операция'] || r.op_name) === curOpNorm);
    }
    if (rIdx === -1) return null;

    const reports = repRes.data || [];
    const opDoneMap = {};
    const opInProgressAny = {};
    reports.forEach(rep => {
        if (normalizeStr(rep['ID Детайл']) !== partNorm) return;
        const opN = normalizeStr(rep['Операция']);
        const st = String(rep['Статус'] || '').trim();
        const q = parseFloat(rep['Количество']) || 0;
        if (st === 'Отчетено' || st === 'Изпратено') {
            opDoneMap[opN] = (opDoneMap[opN] || 0) + q;
        } else if (st === 'Започната') {
            opInProgressAny[opN] = (opInProgressAny[opN] || 0) + q;
        }
    });

    const doneQty = opDoneMap[curOpNorm] || 0;
    const inProgQty = opInProgressAny[curOpNorm] || 0;
    const totalTarget = Number(taskData.totalNeed || 0);
    const shortage = Math.max(0, totalTarget - doneQty);
    let limit = shortage;
    let hasPrev = false;
    let livePrevOpStock = taskData.prevOpStock || 0;

    if (rIdx > 0) {
        hasPrev = true;
        const prevRoute = compRoutes[rIdx - 1];
        const prevOpNorm = normalizeStr(prevRoute['Име на операция'] || prevRoute.op_name);
        const donePrev = opDoneMap[prevOpNorm] || 0;
        livePrevOpStock = Math.max(0, donePrev - (doneQty + inProgQty));
        if (livePrevOpStock < limit) limit = livePrevOpStock;
    }

    const myProbaInv = {};
    ((probiInvRes && !probiInvRes.error && Array.isArray(probiInvRes.data)) ? probiInvRes.data : []).forEach(pi => {
        const piKey = normalizeStr(pi.part_code) + '_' + normalizeStr(pi.operation);
        myProbaInv[piKey] = (myProbaInv[piKey] || 0) + (parseFloat(pi.quantity) || 0);
    });

    const freshSkladMap = {};
    (skladRes.data || []).forEach(s => {
        const sc = normalizeStr(s['ID Детайл']);
        if (sc) freshSkladMap[sc] = (parseFloat(s['Остатък']) || 0);
    });

    const bomData = (typeof globalBomData !== 'undefined' && globalBomData) ? globalBomData : [];
    const myChildren = [];
    bomData.filter(b => normalizeStr(b['ID Родител']) === partNorm).forEach(b => {
        myChildren.push({
            code: String(b['ID Компонент']).trim(),
            qty: parseFloat(b['Количество']) || 1,
            opNum: b['Влага се на Оп. №'] ? parseFloat(b['Влага се на Оп. №']) : 0
        });
    });
    myComps.filter(c => c.parent_part_code && normalizeStr(c.parent_part_code) === partNorm).forEach(c => {
        const cNorm = normalizeStr(c.part_code);
        if (!myChildren.some(ex => normalizeStr(ex.code) === cNorm)) {
            myChildren.push({ code: String(c.part_code).trim(), qty: parseFloat(c.qty_per_unit) || 1, opNum: 0 });
        }
    });

    const relevantChildren = myChildren.filter(c => c.opNum > 0 ? c.opNum === curOpNum : rIdx === 0);
    if (relevantChildren.length > 0) {
        let minSets = Infinity;
        relevantChildren.forEach(child => {
            const cNorm = normalizeStr(child.code);
            const childObj = myComps.find(c => normalizeStr(c.part_code) === cNorm);
            let cRoutes = [];
            if (childObj && childObj.is_new && Array.isArray(childObj.custom_routes) && childObj.custom_routes.length > 0) {
                cRoutes = childObj.custom_routes.slice().sort((a, b) => (parseInt(a.op_num || a['№ Операция']) || 0) - (parseInt(b.op_num || b['№ Операция']) || 0));
            } else {
                cRoutes = ((typeof globalRoutesByDetail !== 'undefined' && globalRoutesByDetail[cNorm]) ? globalRoutesByDetail[cNorm] : [])
                    .slice()
                    .sort((a, b) => (parseInt(a['№ Операция'] || a.op_num) || 0) - (parseInt(b['№ Операция'] || b.op_num) || 0));
            }
            let probaChildDone = 0;
            if (cRoutes.length > 0) {
                const lastCOp = normalizeStr(cRoutes[cRoutes.length - 1]['Име на операция'] || cRoutes[cRoutes.length - 1].op_name);
                reports.forEach(rep => {
                    if (normalizeStr(rep['ID Детайл']) === cNorm && normalizeStr(rep['Операция']) === lastCOp && (rep['Статус'] === 'Отчетено' || rep['Статус'] === 'Изпратено')) {
                        probaChildDone += (parseFloat(rep['Количество']) || 0);
                    }
                });
            }
            const probiReadyKey = cNorm + '_готов продукт';
            const otchetiRemaining = Math.max(0, probaChildDone - (doneQty * child.qty));
            let probaChildAvail = 0;
            if (cRoutes.length > 0) {
                probaChildAvail = Object.prototype.hasOwnProperty.call(myProbaInv, probiReadyKey)
                    ? Math.min(otchetiRemaining, Math.max(0, myProbaInv[probiReadyKey]))
                    : otchetiRemaining;
            } else if (Object.prototype.hasOwnProperty.call(myProbaInv, probiReadyKey)) {
                probaChildAvail = Math.max(0, myProbaInv[probiReadyKey]);
            }
            const skladAvail = freshSkladMap[cNorm] || 0;
            const sets = Math.floor((probaChildAvail + skladAvail) / child.qty);
            if (sets < minSets) minSets = sets;
        });
        if (minSets < limit) limit = minSets;
    }

    if (rIdx === 0) {
        const excludedSet = new Set(myChildren.map(mc => normalizeStr(mc.code)));
        const rootNom = (typeof globalNomData !== 'undefined' && globalNomData)
            ? globalNomData.find(n => normalizeStr(n['ID Детайл']) === partNorm)
            : null;
        const rawMat = (rootNom && rootNom['ID Родител'] && normalizeStr(rootNom['ID Родител']) !== '')
            ? String(rootNom['ID Родител']).trim()
            : (compRecord && compRecord.material_code ? String(compRecord.material_code).trim() : '');
        const matNormCode = normalizeStr(rawMat);
        if (matNormCode && !excludedSet.has(matNormCode)) {
            const matNorm = (rootNom && rootNom['Разходна норма'])
                ? (parseFloat(rootNom['Разходна норма']) || 1)
                : (compRecord ? (parseFloat(compRecord.material_norm) || 1) : 1);
            const skladAvail = freshSkladMap[matNormCode] || 0;
            const sets = Math.floor(skladAvail / matNorm);
            if (sets < limit) limit = sets;
        }
    }

    if (limit < 0) limit = 0;
    return { maxAllowed: limit, prevOpStock: livePrevOpStock, hasPrevOp: hasPrev };
}

// Бърза и жива проверка директно в inventory + sklad за конкретната задача (~80ms, без теглене на всички таблици и без прерисуване на DOM)
async function fetchLiveTaskStockLimits(taskData) {
    if (!taskData || !taskData.hasLimit) return null;
    if (taskData.isProba) return await fetchLiveProbaTaskStockLimits(taskData);
    if (taskData.isGreenCard) return null; // За Буфери се ползва пълното пресмятане

    const [invRes, skladRes] = await Promise.all([
        client.from('inventory').select('"ID Детайл", "Операция", Количество').limit(10000),
        client.from('sklad').select('"ID Детайл", Остатък').limit(10000)
    ]);
    if (invRes.error || skladRes.error) return null;

    const freshStock = {};
    (invRes.data || []).forEach(r => {
        const code = normalizeStr(r['ID Детайл']);
        let op = normalizeStr(r['Операция']);
        if (op === 'готов продукт') {
            const routes = (typeof globalRoutesByDetail !== 'undefined' && globalRoutesByDetail[code]) ? globalRoutesByDetail[code] : [];
            if (routes && routes.length > 0) {
                op = normalizeStr(routes[routes.length - 1]['Име на операция']);
            }
        }
        const key = code + '_' + op;
        freshStock[key] = (freshStock[key] || 0) + (parseFloat(r['Количество']) || 0);
    });
    if (window.globalPackedDeductions) {
        Object.keys(window.globalPackedDeductions).forEach(k => {
            if (freshStock[k] !== undefined) {
                freshStock[k] = Math.max(0, freshStock[k] - window.globalPackedDeductions[k]);
            }
        });
    }

    const freshSkladMap = {};
    (skladRes.data || []).forEach(s => {
        const sc = normalizeStr(s['ID Детайл']);
        if (sc) freshSkladMap[sc] = (parseFloat(s['Остатък']) || 0);
    });

    const code = normalizeStr(taskData.name);
    const routes = (typeof globalRoutesByDetail !== 'undefined' && globalRoutesByDetail[code]) ? globalRoutesByDetail[code] : [];
    const currentOpNum = parseInt(taskData.opNum) || 0;
    let curOpIdx = routes.findIndex(r => parseInt(r['№ Операция']) === currentOpNum);
    if (curOpIdx === -1 && taskData.op) {
        curOpIdx = routes.findIndex(r => normalizeStr(r['Име на операция']) === normalizeStr(taskData.op));
    }

    let limit = Infinity;
    let livePrevOpStock = taskData.prevOpStock || 0;

    if (taskData.hasPrevOp && taskData.prevOpName) {
        livePrevOpStock = freshStock[code + '_' + normalizeStr(taskData.prevOpName)] || 0;
        limit = livePrevOpStock;
    }

    const bomData = (typeof globalBomData !== 'undefined' && globalBomData) ? globalBomData : [];
    const children = bomData.filter(b => normalizeStr(b['ID Родител']) === code);
    const relevantChildren = children.filter(c => {
        const opNum = c['Влага се на Оп. №'] ? parseFloat(c['Влага се на Оп. №']) : 0;
        if (opNum > 0) return opNum === currentOpNum;
        return (curOpIdx === 0);
    });

    if (relevantChildren.length > 0) {
        let minSets = Infinity;
        relevantChildren.forEach(child => {
            const cCode = normalizeStr(child['ID Компонент']);
            const mult = parseFloat(child['Количество']) || 1;
            const childRoutes = (typeof globalRoutesByDetail !== 'undefined' && globalRoutesByDetail[cCode]) ? globalRoutesByDetail[cCode] : [];
            let wipAvail = 0;
            if (childRoutes.length > 0) {
                const lastChildOp = normalizeStr(childRoutes[childRoutes.length - 1]['Име на операция']);
                wipAvail = freshStock[cCode + '_' + lastChildOp] || 0;
            }
            const skladAvail = freshSkladMap[cCode] || 0;
            const sets = Math.floor((wipAvail + skladAvail) / mult);
            if (sets < minSets) minSets = sets;
        });
        if (minSets < limit) limit = minSets;
    }

    if (curOpIdx === 0 && typeof globalNomData !== 'undefined' && globalNomData) {
        const rootNom = globalNomData.find(n => normalizeStr(n['ID Детайл']) === code);
        if (rootNom && rootNom['ID Родител'] && normalizeStr(rootNom['ID Родител']) !== '') {
            const parentCode = normalizeStr(rootNom['ID Родител']);
            const alreadyInBom = relevantChildren.some(c => normalizeStr(c['ID Компонент']) === parentCode);
            if (parentCode && !alreadyInBom) {
                const matNorm = parseFloat(rootNom['Разходна норма']) || 1;
                const pRoutes = (typeof globalRoutesByDetail !== 'undefined' && globalRoutesByDetail[parentCode]) ? globalRoutesByDetail[parentCode] : [];
                let wipAvail = 0;
                if (pRoutes.length > 0) {
                    const lastChildOp = normalizeStr(pRoutes[pRoutes.length - 1]['Име на операция']);
                    wipAvail = freshStock[parentCode + '_' + lastChildOp] || 0;
                }
                const skladAvail = freshSkladMap[parentCode] || 0;
                const sets = Math.floor((wipAvail + skladAvail) / matNorm);
                if (sets < limit) limit = sets;
            }
        }
    }

    if (limit === Infinity) return null;
    if (limit < 0) limit = 0;
    if (String(taskData.id || '').endsWith('_scrap') && taskData.scrapAllowance > 0) {
        limit = Math.min(limit, taskData.scrapAllowance);
    }

    return { maxAllowed: limit, prevOpStock: livePrevOpStock };
}

async function validateRealTimeStock(taskData, val, alreadyCheckedAtMs = 0) {
    if (!taskData.hasLimit) return { ok: true };

    if (alreadyCheckedAtMs && (Date.now() - alreadyCheckedAtMs) < 8000) {
        const cachedAllowed = (taskData.realMaxAllowed !== undefined) ? taskData.realMaxAllowed : (taskData.maxAllowed || 0);
        if (val > cachedAllowed) return { ok: false, maxAllowed: cachedAllowed };
        return { ok: true, maxAllowed: cachedAllowed };
    }

    try {
        const live = await fetchLiveTaskStockLimits(taskData);
        if (live) {
            if (val > live.maxAllowed) return { ok: false, maxAllowed: live.maxAllowed };
            return { ok: true, maxAllowed: live.maxAllowed };
        }
    } catch (err) {
        console.warn("Грешка при бърза проверка на наличност:", err);
    }

    try {
        await loadTasks(true);
    } catch (err) {
        console.error("Грешка при фонова валидация:", err);
    }

    let updatedTask = globalTasks.find(x => x.id === taskData.id);
    let allowedNow = updatedTask ? updatedTask.realMaxAllowed : 0;

    if (val > allowedNow) {
        return { ok: false, maxAllowed: allowedNow };
    }
    return { ok: true, maxAllowed: allowedNow };
}

async function refreshTaskStockBeforeSubmit(taskId, taskData, inputElem) {
    if (!taskData || !taskData.hasLimit) return taskData;
    try {
        const live = await fetchLiveTaskStockLimits(taskData);
        if (live) {
            return Object.assign({}, taskData, {
                maxAllowed: live.maxAllowed,
                realMaxAllowed: live.maxAllowed,
                hasPrevOp: Boolean(live.hasPrevOp || taskData.hasPrevOp),
                prevOpStock: (live.hasPrevOp || taskData.hasPrevOp) ? live.prevOpStock : taskData.prevOpStock,
                __liveCheckedAt: Date.now()
            });
        }
    } catch (err) {
        console.warn("Грешка при бързо опресняване на наличност:", err);
    }

    const savedVal = inputElem ? inputElem.value : '';
    try {
        await loadTasks(true);
        const restoredInput = document.getElementById('qty_' + taskId);
        if (restoredInput && savedVal !== '') restoredInput.value = savedVal;
        const freshTask = globalTasks.find(t => t.id === taskId);
        if (freshTask) return Object.assign({}, freshTask, { __liveCheckedAt: Date.now() });
        return Object.assign({}, taskData, { maxAllowed: 0, realMaxAllowed: 0, prevOpStock: 0, __liveCheckedAt: Date.now() });
    } catch (err) {
        console.warn("Грешка при опресняване на наличност преди отчет:", err);
        return taskData;
    }
}

function claimCurrentTaskDOM(taskId) {

    if (window.pendingIdleTaskReminder && !window.pendingIdleTaskReminder.read_at) {
        Swal.fire({
            title: 'Внимание!',
            text: 'Първо трябва да потвърдите полученото напомняне!',
            icon: 'warning',
            confirmButtonText: 'ОК',
            confirmButtonColor: '#2563eb',
            allowOutsideClick: false
        });
        return;
    }
    let taskData = globalTasks.find(t => t.id === taskId);
    if (!taskData || taskData.isBlocked) {
        if (taskData && taskData.isBlocked) {
            Swal.fire('Блокирана задача', 'Липсва наличен материал/заготовка в склада за стартиране на задачата.', 'warning');
        }
        return;
    }
    if (navigator.vibrate) navigator.vibrate(50);
    activeTaskId = taskId;
    try { localStorage.removeItem('mes_last_task_idle_start'); } catch (e) { }
    window['startTime_' + taskId] = new Date().toISOString();

    if (typeof markTaskClaimedInReminders === 'function') {
        markTaskClaimedInReminders();
    }

    if (taskData) {
        taskData.isTaken = true;
        client.from('otcheti').insert([{
            "ID План": taskData.plan_id,
            "ID Детайл": taskData.name,
            "Оператор": currentOperator,
            "Количество": 0,
            "Операция": taskData.op,
            "Статус": "Започната",
            "Дата": new Date().toISOString(),
            "Време Старт": window['startTime_' + taskId]
        }]).then(res => { if (res.error) console.error("Грешка при сигнал Започната", res.error); });
    }

    // Преминаваме директно в таб "Поети задачи", за да виждаме веднага поетата задача в работен режим
    setTaskFilter('taken');

    // Плавно скролваме до поетата задача и фокусираме полето за бройка
    requestAnimationFrame(() => {
        let cardEl = document.getElementById('card_' + taskId);
        if (cardEl) {
            cardEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        let qtyInput = document.getElementById('qty_' + taskId);
        if (qtyInput) {
            qtyInput.focus();
        }
    });
}

function pauseTaskDOM(taskId) {
    if (navigator.vibrate) navigator.vibrate(50);
    activeTaskId = null;
    try { localStorage.setItem('mes_last_task_idle_start', String(Date.now())); } catch (e) { }

    let taskData = globalTasks.find(t => t.id === taskId);
    if (taskData) {
        taskData.isTaken = false;
        client.from('otcheti').insert([{
            "ID План": taskData.plan_id,
            "ID Детайл": taskData.name,
            "Оператор": currentOperator,
            "Количество": 0,
            "Операция": taskData.op,
            "Статус": "Прекъсната",
            "Дата": new Date().toISOString(),
            "Време Старт": window['startTime_' + taskId] || new Date().toISOString()
        }]).then(res => { if (res.error) console.error("Грешка при сигнал Прекъсната", res.error); });
    }

    // Ако операторът прекъсне задачата и няма други поети, го връщаме към свободните задачи
    let remainingTaken = globalTasks.filter(t => t.isTaken);
    if (currentTaskFilter === 'taken' && remainingTaken.length === 0) {
        setTaskFilter('ready');
    } else {
        renderTasks(globalTasks);
    }
}


async function finishTask(taskId, btn) {
    let taskData = globalTasks.find(t => t.id === taskId);
    let startTime = window['startTime_' + taskId] || (taskData && taskData.startedAt);
    if (startTime) {
        let diffSeconds = (new Date() - new Date(startTime)) / 1000;
        if (diffSeconds < 5) {
            Swal.fire('⚡ Светкавица!', 'Но все пак нека наистина направим детайлите първо 😊', 'warning');
            return;
        }
    }

    var inputElem = document.getElementById('qty_' + taskId); if (!inputElem) return; var val = parseFloat(inputElem.value);
    if (isNaN(val) || val <= 0) { Swal.fire('Грешка', 'Въведи валидна бройка!', 'error'); return; }
    taskData = globalTasks.find(t => t.id === taskId);
    if (!taskData) return;

    const origBtnHtml = btn ? btn.innerHTML : '✅ ОТЧЕТИ';
    const restoreSubmitBtn = () => {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origBtnHtml;
        }
    };
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ ПРОВЕРКА...';
    }

    try {
        taskData = await refreshTaskStockBeforeSubmit(taskId, taskData, inputElem);
    } catch (e) {
        console.warn('refreshTaskStockBeforeSubmit warning:', e);
    }

    let isDiscrepancyAccepted = false;
    let prevStock = (taskData.hasPrevOp && taskData.prevOpStock !== undefined) ? taskData.prevOpStock : (taskData.maxAllowed || 0);
    let missingQty = Math.max(0, val - (taskData.maxAllowed || 0));

    if (taskData.hasLimit && val > taskData.maxAllowed) {
        const isPrevOpDiscrepancy = Boolean(taskData.hasPrevOp || taskData.prevOpName);
        const prevOpNumStr = taskData.prevOpNum ? `Оп. ${taskData.prevOpNum}` : 'предходната операция';
        const prevOpNameStr = taskData.prevOpName ? ` (${taskData.prevOpName})` : '';

        let descHtml = '';
        if (isPrevOpDiscrepancy) {
            descHtml = `
              На предходната операция <b>(${prevOpNumStr}${prevOpNameStr})</b> са отчетени само <b>${prevStock} бр.</b>
              <br><br>
              Вие отчитате <b style="color:#16a34a; font-size:1.15em;">${val} бр.</b> (липсват <b>${missingQty} бр.</b> от предходната операция).
          `;
        } else {
            descHtml = `
              В системата / склада има налични материали само за <b>${taskData.maxAllowed} бр.</b>
              <br><br>
              Вие отчитате <b style="color:#16a34a; font-size:1.15em;">${val} бр.</b> (надвишаване с <b>${missingQty} бр.</b>).
          `;
        }

        const notifyTargetStr = isPrevOpDiscrepancy
            ? `до колегата на ${prevOpNumStr} и до администратора да си доотчете бройките`
            : `до склада и администратора за незаприходени материали`;

        const warnResult = await Swal.fire({
            title: '⚠️ Внимание',
            html: `
              <div style="font-size:1.02em; line-height:1.5; color:#1e293b; text-align:left; background:#fff7ed; border:1.5px solid #fed7aa; border-radius:10px; padding:14px; margin-bottom:12px;">
                  ${descHtml}
              </div>
              <div style="font-size:1.05em; font-weight:700; color:#0f172a; margin-top:8px;">
                  Имате ли физически всички ${val} бр. пред машината?
              </div>
              <div style="font-size:0.85em; color:#64748b; margin-top:6px;">
                  При потвърждение отчетът се приема веднага, а системата ще изпрати известие ${notifyTargetStr}.
              </div>
          `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '👍 Да, детайлите са при мен',
            cancelButtonText: 'Отказ',
            confirmButtonColor: '#ea580c',
            cancelButtonColor: '#94a3b8',
            focusConfirm: true
        });

        if (!warnResult.isConfirmed) { restoreSubmitBtn(); return; }
        isDiscrepancyAccepted = true;
    }

    let shouldProceed = isDiscrepancyAccepted;
    if (!shouldProceed) {
        const confirmResult = await Swal.fire({
            title: 'Сигурен ли си?',
            html: `Ще отчетеш <b style="color:#16a34a; font-size:1.2em;">${val} здрави бройки</b>.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#16a34a',
            confirmButtonText: '🟢 ДА, ПРЕДАЙ',
            cancelButtonText: 'Отказ'
        });
        shouldProceed = confirmResult.isConfirmed;
    }

    if (!shouldProceed) { restoreSubmitBtn(); return; }

    btn.disabled = true;
    btn.innerHTML = "ЗАПИС...";
    Swal.fire({ title: 'Проверка и Отчитане...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    try {
        if (taskData.hasLimit && !isDiscrepancyAccepted) {
            let validation = await validateRealTimeStock(taskData, val, taskData.__liveCheckedAt || 0);
            if (!validation.ok) {
                if (validation.maxAllowed <= 0) {
                    await forceCancelTask(taskId, taskData, "Някой друг вече е отчел всички бройки. Задачата се приключва автоматично.");
                    return;
                } else {
                    throw new Error(`Невъзможно! Докато вие работехте, друг е отчел бройки. Оставащ наличен материал за тази операция: ${validation.maxAllowed} бр.`);
                }
            }
        }

        let startedAt = window['startTime_' + taskId] || (taskData && taskData.startedAt) || new Date().toISOString();
        let inserts = [];
        if (taskData.scrapAllowance && taskData.scrapAllowance > 0 && val > taskData.pureQty) {
            let excess = val - taskData.pureQty;
            let normalQty = taskData.pureQty;
            if (normalQty > 0) {
                inserts.push({ "ID План": taskData.plan_id, "ID Детайл": taskData.name, "Оператор": currentOperator, "Количество": normalQty, "Операция": taskData.op, "Статус": "Отчетено", "Дата": new Date().toISOString(), "Време Старт": startedAt });
            }
            inserts.push({ "ID План": "СВРЪХПРОИЗВОДСТВО", "ID Детайл": taskData.name, "Оператор": currentOperator, "Количество": excess, "Операция": taskData.op, "Статус": "Отчетено", "Дата": new Date().toISOString(), "Време Старт": startedAt });
        } else {
            inserts.push({ "ID План": taskData.plan_id, "ID Детайл": taskData.name, "Оператор": currentOperator, "Количество": val, "Операция": taskData.op, "Статус": "Отчетено", "Дата": new Date().toISOString(), "Време Старт": startedAt });
        }
        const { error } = await client.from('otcheti').insert(inserts);
        if (error) throw error;

        if (isDiscrepancyAccepted) {
            await sendDiscrepancyAlerts(taskData, val, prevStock, missingQty);
        }

        if (typeof autoResolveAndonForTask === 'function') { autoResolveAndonForTask(taskData, val); }
        addLogToHistory('ГОТОВО', val, taskId); activeTaskId = null;
        taskData.isTaken = false;
        let remainingTaken = globalTasks.filter(t => t.isTaken && t.id !== taskId);
        if (remainingTaken.length === 0) {
            setTaskFilter('ready');
        }
        try { localStorage.setItem('mes_last_task_idle_start', String(Date.now())); } catch (e) { }
        const bgRefreshPromise = loadTasks(true);
        Swal.fire({ icon: 'success', title: 'Браво!', text: 'Отчетени: ' + val + ' бр.', timer: 1200, showConfirmButton: false }).then(() => {
            if (currentTaskFilter === 'taken') setTaskFilter('ready');
            return bgRefreshPromise;
        });
    } catch (err) {
        if (!navigator.onLine || err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('fetch')) {
            let startedAt = window['startTime_' + taskId] || (taskData && taskData.startedAt) || new Date().toISOString();
            let inserts = [];
            if (taskData.scrapAllowance && taskData.scrapAllowance > 0 && val > taskData.pureQty) {
                let excess = val - taskData.pureQty;
                let normalQty = taskData.pureQty;
                if (normalQty > 0) {
                    inserts.push({ "ID План": taskData.plan_id, "ID Детайл": taskData.name, "Оператор": currentOperator, "Количество": normalQty, "Операция": taskData.op, "Статус": "Отчетено", "Дата": new Date().toISOString(), "Време Старт": startedAt });
                }
                inserts.push({ "ID План": "СВРЪХПРОИЗВОДСТВО", "ID Детайл": taskData.name, "Оператор": currentOperator, "Количество": excess, "Операция": taskData.op, "Статус": "Отчетено", "Дата": new Date().toISOString(), "Време Старт": startedAt });
            } else {
                inserts.push({ "ID План": taskData.plan_id, "ID Детайл": taskData.name, "Оператор": currentOperator, "Количество": val, "Операция": taskData.op, "Статус": "Отчетено", "Дата": new Date().toISOString(), "Време Старт": startedAt });
            }
            if (taskData.hasLimit) { taskData.maxAllowed -= val; if (taskData.maxAllowed < 0) taskData.maxAllowed = 0; }
            saveToOfflineQueue(inserts, taskId, 'Отчетени: ' + val + ' бр.');
        } else {
            Swal.fire('❌ Грешка при запис', err.message, 'error');
            btn.disabled = false; btn.innerHTML = "✅ ОТЧЕТИ";
        }
    }
}

async function sendDiscrepancyAlerts(taskData, val, prevStock, missingQty) {
    try {
        const isPrevOp = Boolean(taskData.hasPrevOp || taskData.prevOpName);
        const curOpNum = taskData.opNum ? `Оп. ${taskData.opNum}` : taskData.op;

        let targetOpNum = '';
        let targetOpName = '';
        let targetMachine = 'Обща';
        let targetOperator = '';
        let targetPart = taskData.name;
        let reasonsText = '';

        let intermediateOp = null;
        let rootOrigin = null;

        // Преди анализ презареждаме реалния актуален инвентар от базата, за да сме сигурни в точните наличности
        try {
            const { data: freshInv } = await client.from('inventory').select('*');
            if (freshInv && freshInv.length > 0) {
                const freshStock = {};
                freshInv.forEach(r => {
                    const code = normalizeStr(r['ID Детайл']);
                    let op = normalizeStr(r['Операция']);
                    if (op === 'готов продукт') {
                        const routes = (typeof globalRoutesByDetail !== 'undefined' && globalRoutesByDetail[code]) ? globalRoutesByDetail[code] : [];
                        if (routes && routes.length > 0) {
                            op = normalizeStr(routes[routes.length - 1]['Име на операция']);
                        }
                    }
                    const key = code + '_' + op;
                    freshStock[key] = (freshStock[key] || 0) + (parseFloat(r['Количество']) || 0);
                });
                window.globalPhysicalStock = freshStock;
            }
        } catch (invRefreshErr) {
            console.warn('Could not refresh inventory in sendDiscrepancyAlerts:', invRefreshErr);
        }

        if (typeof window.traceRootDeficitOrigin === 'function') {
            rootOrigin = window.traceRootDeficitOrigin(taskData.name, taskData.opNum, taskData.op, missingQty);
        }

        if (rootOrigin && rootOrigin.isAnomaly) {
            // СКАЧЕНИ СЪДОВЕ: Установен останал буфер нагоре по маршрута на същия детайл
            targetPart = rootOrigin.rootPart;
            targetOpNum = rootOrigin.rootOpNum ? String(rootOrigin.rootOpNum) : '';
            targetOpName = rootOrigin.rootOpName || '';
            targetMachine = rootOrigin.rootMachine || 'Обща';
            targetOperator = `Колега на ${targetMachine}`;
            intermediateOp = rootOrigin.intermediate;

            let chainInfo = (rootOrigin.chain && rootOrigin.chain.length > 0) ? ` [Верига: ${rootOrigin.chain.join(' ⬅️ ')}]` : '';
            reasonsText = `Разминаване: отчетени ${val} бр. за ${taskData.name} на ${curOpNum} (${taskData.op}). В склада стои дефицит от -${missingQty} бр. Стартирана автоматична ревизия на Оп. ${targetOpNum} (${targetOpName}) на ${targetMachine}.${chainInfo}`;

            // Създаваме автоматична ревизия (Spot Audit) към машината на Оп. 10
            try {
                const spotData = {
                    target_machine: targetMachine,
                    target_worker: null,
                    part_code: taskData.name,
                    operation: targetOpName,
                    expected_qty: rootOrigin.anomaly.upstreamOp.availStock,
                    status: 'PENDING',
                    created_at: new Date().toISOString(),
                    notes: JSON.stringify({
                        type: 'auto_deficit_check',
                        reported_part: taskData.name,
                        reported_op_num: taskData.opNum,
                        reported_op_name: taskData.op,
                        reported_qty: val,
                        reported_machine: (currentMachine && currentMachine !== 'ВСИЧКИ') ? currentMachine : (taskData.machine || 'Обща'),
                        missing_qty: missingQty,
                        upstream_op_num: rootOrigin.anomaly.upstreamOp.opNum,
                        upstream_op_name: rootOrigin.anomaly.upstreamOp.opName,
                        upstream_machine: rootOrigin.anomaly.upstreamOp.machine,
                        intermediate_ops: rootOrigin.intermediateOps
                    })
                };
                await client.from('spot_audits').insert([spotData]);
            } catch (sErr) {
                console.warn('spot_audits insert error:', sErr);
            }

        } else if (rootOrigin) {
            targetPart = rootOrigin.rootPart;
            targetOpNum = rootOrigin.rootOpNum ? String(rootOrigin.rootOpNum) : '';
            targetOpName = rootOrigin.rootOpName || '';
            targetMachine = rootOrigin.rootMachine || 'Обща';
            targetOperator = `Колега на ${targetMachine}`;
            intermediateOp = rootOrigin.intermediate || (isPrevOp ? {
                part: taskData.name,
                opNum: taskData.prevOpNum,
                opName: taskData.prevOpName,
                machine: taskData.prevMachine
            } : null);

            let chainInfo = (rootOrigin.chain && rootOrigin.chain.length > 0) ? ` [Верига: ${rootOrigin.chain.join(' ⬅️ ')}]` : '';
            let intermTxt = (intermediateOp && intermediateOp.part !== targetPart)
                ? ` (преминало през Оп. ${intermediateOp.opNum} ${intermediateOp.opName} без заприходени ${targetPart})`
                : '';

            reasonsText = `Разминаване: отчетени ${val} бр. за ${taskData.name} на ${curOpNum} (${taskData.op}). Липсват ${missingQty} бр. от източник ${targetPart} на ${targetMachine}${targetOpNum ? ' (Оп. ' + targetOpNum + ')' : ''}${intermTxt}.${chainInfo}`;
        } else if (isPrevOp) {
            targetPart = taskData.name;
            targetOpNum = taskData.prevOpNum ? String(taskData.prevOpNum) : '';
            targetOpName = taskData.prevOpName || '';
            targetMachine = taskData.prevMachine || 'Обща';
            targetOperator = taskData.prevOperator || ('Колега от ' + (targetOpNum ? 'Оп. ' + targetOpNum : 'предходна операция'));
            reasonsText = `Разминаване: отчетени ${val} бр., липсват ${missingQty} бр. от предходна операция (${targetOpNum ? 'Оп. ' + targetOpNum + ' ' : ''}${targetOpName})`;
        } else if (taskData.itemsToFetch && taskData.itemsToFetch.length > 0) {
            // Търсим кой точно компонент от BOM не достига
            let deficientItem = taskData.itemsToFetch.find(it => (it.avail !== undefined && it.avail < (val * (it.qty || 1)))) || taskData.itemsToFetch[0];
            targetPart = deficientItem.code;

            let cNorm = normalizeStr(deficientItem.code);
            let childRoutes = (typeof globalRoutesByDetail !== 'undefined' && globalRoutesByDetail[cNorm]) ? globalRoutesByDetail[cNorm] : [];
            if (childRoutes.length > 0) {
                let lastChildOp = childRoutes[childRoutes.length - 1];
                targetOpNum = String(lastChildOp['№ Операция'] || '10');
                targetOpName = lastChildOp['Име на операция'] || 'Склад Готови Детайли';
                targetMachine = lastChildOp['Машина'] || (deficientItem.loc || 'Обща');
                targetOperator = `Колега на ${targetMachine}`;
            } else {
                targetOpNum = (deficientItem.type === 'материал') ? 'Склад' : 'Готов продукт';
                targetOpName = (deficientItem.type === 'материал') ? 'Склад Материали' : (deficientItem.loc || 'Склад Готови Детайли');
                targetMachine = (deficientItem.type === 'материал') ? 'Склад' : (deficientItem.loc || 'Склад');
                targetOperator = 'Склад / Администратор';
            }
            reasonsText = `Разминаване в компоненти: отчетени ${val} бр. за ${taskData.name}, но заготовка/компонент ${targetPart} има само ${deficientItem.avail || 0} бр. (липсват ${missingQty} бр.)`;
        } else {
            targetPart = taskData.name;
            targetOpNum = 'Склад';
            targetOpName = 'Склад Материали';
            targetMachine = 'Склад';
            targetOperator = 'Склад / Администратор';
            reasonsText = `Разминаване в материали: отчетени ${val} бр., в склада са заприходени само ${taskData.maxAllowed || 0} бр. (липсват ${missingQty} бр.)`;
        }

        const myMachine = (currentMachine && currentMachine !== 'ВСИЧКИ') ? currentMachine : (taskData.machine || 'Обща');

        // 1. Запис в material_requests за цеховия Andon банер и известие в Админ панела
        const reqData = {
            task_id: taskData.id,
            part_name: taskData.name,
            op_name: taskData.op,
            machine: myMachine,
            operator: currentOperator,
            operator_email: (typeof currentEmail !== 'undefined' && currentEmail) ? currentEmail : (currentOperatorEmail || currentOperator),
            reasons: reasonsText,
            target_part: targetPart,
            target_op_num: targetOpNum,
            target_op_name: targetOpName,
            target_machine: targetMachine,
            status: 'Чакаща',
            created_at: new Date().toISOString(),
            notes: JSON.stringify({
                type: 'discrepancy',
                phase: (rootOrigin && rootOrigin.isAnomaly) ? 'spot_audit_pending' : 'standard',
                is_prev_op: isPrevOp,
                reported_by_part: taskData.name,
                reported_qty: val,
                prev_qty: (rootOrigin && rootOrigin.isAnomaly) ? (rootOrigin.anomaly.upstreamOp.reportedQty || rootOrigin.anomaly.upstreamOp.availStock || 0) : prevStock,
                missing_qty: missingQty,
                reported_by_operator: currentOperator,
                reported_by_op_num: taskData.opNum,
                reported_by_op_name: taskData.op,
                reported_machine: myMachine,
                target_part: targetPart,
                target_machine: targetMachine,
                target_op_num: targetOpNum,
                target_op_name: targetOpName,
                target_operator: targetOperator,
                upstream_op_num: (rootOrigin && rootOrigin.isAnomaly) ? rootOrigin.anomaly.upstreamOp.opNum : null,
                upstream_op_name: (rootOrigin && rootOrigin.isAnomaly) ? rootOrigin.anomaly.upstreamOp.opName : null,
                upstream_machine: (rootOrigin && rootOrigin.isAnomaly) ? rootOrigin.anomaly.upstreamOp.machine : null,
                intermediate_ops: (rootOrigin && rootOrigin.isAnomaly) ? rootOrigin.intermediateOps : [],
                intermediate_part: intermediateOp ? intermediateOp.part : null,
                intermediate_op_num: intermediateOp ? intermediateOp.opNum : null,
                intermediate_op_name: intermediateOp ? intermediateOp.opName : null,
                intermediate_machine: intermediateOp ? intermediateOp.machine : null,
                chain: rootOrigin ? rootOrigin.chain : []
            })
        };

        const res1 = await client.from('material_requests').insert([reqData]);
        if (res1.error) {
            console.warn('material_requests discrepancy insert error:', res1.error);
        }

        // 2. Лично известие в chekiraniya
        let targetEmail = 'ALL';
        try {
            if (isPrevOp && taskData.prevOperator) {
                const { data: pData } = await client.from('personal').select('Имейл').ilike('Име', `%${taskData.prevOperator.trim()}%`).limit(1);
                if (pData && pData.length > 0 && pData[0]['Имейл']) {
                    targetEmail = pData[0]['Имейл'].trim().toLowerCase();
                }
            }
        } catch (e) { }

        const msgTitle = rootOrigin
            ? `🔔 Липсващи отчетени заготовки (${targetPart})`
            : (isPrevOp ? `🔔 Липсващи отчетени бройки (${taskData.name})` : `🔔 Липсващи заприходени компоненти (${targetPart})`);




        const msgBody = rootOrigin
            ? `Операторът ${currentOperator} на ${curOpNum} (${taskData.op}) отчете ${val} бр. за ${taskData.name}, но в системата липсват ${missingQty} бр. заготовки ${targetPart} от вашето работно място (${targetMachine}${targetOpNum ? ' / Оп. ' + targetOpNum : ''}). Моля, доотчетете си изработените заготовки!`
            : (isPrevOp
                ? `Колегата ${currentOperator} на ${curOpNum} (${taskData.op}) отчете ${val} бр., но от вас на ${targetOpNum ? 'Оп. ' + targetOpNum : 'предходна оп.'} са записани само ${prevStock} бр. (липсват ${missingQty} бр.). Моля, доотчетете си бройките!`
                : `Операторът ${currentOperator} на ${curOpNum} (${taskData.op}) за ${taskData.name} отчете ${val} бр., но от детайл/компонент ${targetPart} има само ${prevStock} бр. (липсват ${missingQty} бр.). Моля, проверете и доотчетете/заприходете!`);








        await client.from('chekiraniya').insert([{
            "Име": "СИСТЕМА",
            "Имейл": "СИСТЕМА",
            "Действие": "Съобщение",
            "Време": new Date().toISOString(),
            "Локация": targetEmail,
            "Бележка": msgTitle + "|||" + msgBody
        }]);


        if (intermediateOp && intermediateOp.part !== targetPart) {
            try {
                let intermEmail = 'ALL';
                if (taskData.prevOperator) {
                    const { data: pData } = await client.from('personal').select('Имейл').ilike('Име', `%${taskData.prevOperator.trim()}%`).limit(1);
                    if (pData && pData.length > 0 && pData[0]['Имейл']) intermEmail = pData[0]['Имейл'].trim().toLowerCase();
                }
                const intermTitle = `ℹ️ Инфо: Транзитни бройки за ${taskData.name}`;
                const intermBody = `През вашето работно място (${intermediateOp.machine || ''} / Оп. ${intermediateOp.opNum || ''} ${intermediateOp.opName || ''}) са преминали ${missingQty} бр. към ${taskData.op}. Тъй като заготовката ${targetPart} липсваше на склад, сигналът за доотчитане е насочен към първоизточника: ${targetMachine}.`;
                await client.from('chekiraniya').insert([{
                    "Име": "СИСТЕМА",
                    "Имейл": "СИСТЕМА",
                    "Действие": "Съобщение",
                    "Време": new Date().toISOString(),
                    "Локация": intermEmail,
                    "Бележка": intermTitle + "|||" + intermBody
                }]);

            } catch (e) { }
        }




    } catch (err) {
        console.error('Грешка при изпращане на сигнали за разминаване:', err);
    }
}

async function reportScrap(taskId, btn) {
    var inputElem = document.getElementById('qty_' + taskId); if (!inputElem) return; var val = parseFloat(inputElem.value);
    if (isNaN(val) || val <= 0) { Swal.fire('Грешка', 'Въведи валидна бройка!', 'error'); return; }
    let taskData = globalTasks.find(t => t.id === taskId);
    if (!taskData) return;

    taskData = await refreshTaskStockBeforeSubmit(taskId, taskData, inputElem);

    let isDiscrepancyAccepted = false;
    let prevStock = (taskData.hasPrevOp && taskData.prevOpStock !== undefined) ? taskData.prevOpStock : (taskData.maxAllowed || 0);
    let missingQty = Math.max(0, val - (taskData.maxAllowed || 0));

    if (taskData.hasLimit && val > taskData.maxAllowed) {
        const isPrevOpDiscrepancy = Boolean(taskData.hasPrevOp || taskData.prevOpName);
        const prevOpNumStr = taskData.prevOpNum ? ('Оп. ' + taskData.prevOpNum) : 'предходната операция';
        const prevOpNameStr = taskData.prevOpName ? (' (' + taskData.prevOpName + ')') : '';

        let descHtml = '';
        if (isPrevOpDiscrepancy) {
            descHtml = `
              На предходната операция <b>(${prevOpNumStr}${prevOpNameStr})</b> са отчетени само <b>${prevStock} бр.</b>
              <br><br>
              Вие бракувате <b style="color:#ef4444; font-size:1.15em;">${val} бр.</b> (липсват <b>${missingQty} бр.</b> от предходната операция).
          `;
        } else {
            descHtml = `
              В системата / склада има налични материали само за <b>${taskData.maxAllowed} бр.</b>
              <br><br>
              Вие бракувате <b style="color:#ef4444; font-size:1.15em;">${val} бр.</b> (надвишаване с <b>${missingQty} бр.</b>).
          `;
        }

        const notifyTargetStr = isPrevOpDiscrepancy
            ? ('до колегата на ' + prevOpNumStr + ' и до администратора да си доотчете бройките')
            : 'до склада и администратора за незаприходени материали';

        const warnResult = await Swal.fire({
            title: '⚠️ Разминаване в наличността при Брак',
            html: `
              <div style="font-size:1.02em; line-height:1.5; color:#1e293b; text-align:left; background:#fff7ed; border:1.5px solid #fed7aa; border-radius:10px; padding:14px; margin-bottom:12px;">
                  ${descHtml}
              </div>
              <div style="font-size:1.05em; font-weight:700; color:#0f172a; margin-top:8px;">
                  Имате ли физически пред машината тези бракувани ${val} бр.?
              </div>
              <div style="font-size:0.85em; color:#64748b; margin-top:6px;">
                  При потвърждение бракът се отразява веднага, а системата ще изпрати известие ${notifyTargetStr}.
              </div>
          `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '🗑️ Да, бракувай детайлите',
            cancelButtonText: 'Отказ',
            confirmButtonColor: '#ea580c',
            cancelButtonColor: '#94a3b8',
            focusConfirm: true
        });

        if (!warnResult.isConfirmed) return;
        isDiscrepancyAccepted = true;
    }

    let allowedResolverOps = ['зареждане', 'хонинговане', 'сглобяване + измерване'];
    if (allowedResolverOps.includes(taskData.op.trim().toLowerCase())) {
        let children = globalBomData.filter(b => String(b['ID Родител']).trim() === taskData.name);
        if (children.length > 0) {
            let checkboxHtml = '<div style="text-align:left; margin-top:15px; font-size:14px; max-height: 250px; overflow-y: auto;"><p style="color:#e74c3c; font-weight:bold; margin-bottom:12px;">Кои компоненти вътре бяха счупени?<br><span style="font-size: 0.8em; color: #64748b;">(Отмаркирайте спасените детайли)</span></p>';
            children.forEach(c => {
                let cName = String(c['ID Компонент']).trim();
                let safeName = cName.replace(/"/g, '&quot;');
                checkboxHtml += `<label style="display:flex; align-items:center; margin-bottom:8px; padding:12px; background:#f8fafc; border-radius:6px; border:1px solid #cbd5e1;"><input type="checkbox" class="scrap-child-cb" value="${safeName}" checked style="transform: scale(1.5); margin-right:15px;"><span style="font-weight:700; font-size: 1.1em; color: #1e293b;">${safeName}</span></label>`;
            });
            checkboxHtml += '</div>';
            const { value: formValues, isConfirmed } = await Swal.fire({ title: 'Бракуване', html: `Ще бракувате <b>${val} бр.</b><br>` + checkboxHtml, icon: 'warning', showCancelButton: true, confirmButtonColor: '#e74c3c', confirmButtonText: 'Да, бракувай!', cancelButtonText: 'Отказ', preConfirm: () => { let scrapped = []; document.querySelectorAll('.scrap-child-cb:checked').forEach(cb => scrapped.push(cb.value)); return scrapped; } });
            if (isConfirmed) await executeScrapLogic(taskData, val, children, formValues, isDiscrepancyAccepted, prevStock, missingQty);
            return;
        }
    }

    if (isDiscrepancyAccepted) {
        await executeScrapLogic(taskData, val, [], [], true, prevStock, missingQty);
    } else {
        Swal.fire({ title: 'Сигурен ли си?', text: "⚠️ БРАКУВАШ " + val + " бр.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#e74c3c', confirmButtonText: 'Да, бракувай!', cancelButtonText: 'Отказ' }).then(async (result) => { if (result.isConfirmed) await executeScrapLogic(taskData, val, [], [], false, prevStock, 0); });
    }
}

async function executeScrapLogic(taskData, val, allChildren, scrappedChildrenNames, isDiscrepancyAccepted = false, prevStock = 0, missingQty = 0) {
    Swal.fire({ title: 'Проверка и Отразяване на брака...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    try {
        if (taskData.hasLimit && !isDiscrepancyAccepted) {
            let validation = await validateRealTimeStock(taskData, val);
            if (!validation.ok) {
                if (validation.maxAllowed <= 0) {
                    await forceCancelTask(taskData.id, taskData, "Някой друг вече е отчел всички бройки. Задачата се приключва автоматично.");
                    return;
                } else {
                    throw new Error(`Невъзможно! Докато вие работехте, друг е отчел бройки. Оставащ наличен материал за тази операция: ${validation.maxAllowed} бр.`);
                }
            }
        }

        let startedAt = window['startTime_' + taskData.id] || (taskData && taskData.startedAt) || new Date().toISOString();
        let inserts = [{ "ID План": taskData.plan_id, "ID Детайл": taskData.name, "Оператор": currentOperator, "Количество": val, "Операция": taskData.op, "Статус": "Брак", "Дата": new Date().toISOString(), "Време Старт": startedAt }];

        let savedMaterials = [];
        allChildren.forEach(child => {
            let cName = String(child['ID Компонент']).trim();
            let multiplier = parseFloat(child['Количество']) || 1;
            let qty = val * multiplier;
            if (!scrappedChildrenNames.includes(cName)) {
                let cRoutes = (typeof globalRoutesByDetail !== 'undefined' && (globalRoutesByDetail[normalizeStr(cName)] || globalRoutesByDetail[cName])) ? (globalRoutesByDetail[normalizeStr(cName)] || globalRoutesByDetail[cName]) : [];
                let isMat = false;
                if (typeof globalNomData !== 'undefined' && globalNomData) {
                    let nomItem = globalNomData.find(n => normalizeStr(n['ID Детайл']) === normalizeStr(cName));
                    if (nomItem && nomItem['Тип'] && String(nomItem['Тип']).toLowerCase().includes('материал')) {
                        isMat = true;
                    }
                }
                if (!isMat && cRoutes.length === 0) isMat = true;

                if (isMat) {
                    savedMaterials.push({ name: cName, qty: qty });
                }

                let opToLog = isMat ? "Склад Материали" : (cRoutes.length > 0 ? String(cRoutes[cRoutes.length - 1]['Име на операция']).trim() : "Склад Материали");
                inserts.push({ "ID План": taskData.plan_id, "ID Детайл": cName, "Оператор": "СИСТЕМА (Спасен)", "Количество": qty, "Операция": opToLog, "Статус": "Отчетено", "Дата": new Date().toISOString(), "Време Старт": startedAt });
            } else {
                inserts.push({ "ID План": taskData.plan_id, "ID Детайл": cName, "Оператор": "СИСТЕМА (Бракуван Компонент)", "Количество": qty, "Операция": "Бракуван в " + taskData.name, "Статус": "Брак", "Дата": new Date().toISOString(), "Време Старт": startedAt });
            }
        });

        const { error } = await client.from('otcheti').insert(inserts);
        if (error) throw error;

        // За спасените суровини/материали: възстановяваме ги в Склад Материали (sklad)
        // и гарантираме, че НЕ остават в Склад Готови Детайли (inventory)
        if (savedMaterials.length > 0) {
            for (let mat of savedMaterials) {
                try {
                    const { data: skRows } = await client.from('sklad').select('ID Детайл, Изразходено, Остатък').ilike('ID Детайл', mat.name).limit(1);
                    if (skRows && skRows.length > 0) {
                        let curUsed = parseFloat(skRows[0]['Изразходено']) || 0;
                        let curRem = parseFloat(skRows[0]['Остатък']) || 0;
                        let newUsed = Math.max(0, curUsed - mat.qty);
                        let newRem = curRem + mat.qty;
                        await client.from('sklad').update({
                            'Изразходено': newUsed,
                            'Остатък': newRem
                        }).eq('ID Детайл', skRows[0]['ID Детайл']);
                    }
                } catch (skErr) {
                    console.warn('Грешка при възстановяване на материал в sklad:', skErr);
                }

                try {
                    await client.from('inventory').delete().ilike('ID Детайл', mat.name);
                } catch (invErr) {
                    console.warn('Грешка при изтриване на спасен материал от inventory:', invErr);
                }
            }
        }

        if (isDiscrepancyAccepted) {
            await sendDiscrepancyAlerts(taskData, val, prevStock, missingQty);
        }

        addLogToHistory('БРАК', val, taskData.id); Swal.close(); activeTaskId = null; loadTasks();
    } catch (err) {
        if (!navigator.onLine || err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('fetch')) {
            let startedAt = window['startTime_' + taskData.id] || (taskData && taskData.startedAt) || new Date().toISOString();
            let inserts = [{ "ID План": taskData.plan_id, "ID Детайл": taskData.name, "Оператор": currentOperator, "Количество": val, "Операция": taskData.op, "Статус": "Брак", "Дата": new Date().toISOString(), "Време Старт": startedAt }];
            allChildren.forEach(child => {
                let cName = String(child['ID Компонент']).trim();
                let multiplier = parseFloat(child['Количество']) || 1;
                let qty = val * multiplier;
                if (!scrappedChildrenNames.includes(cName)) {
                    let cRoutes = (typeof globalRoutesByDetail !== 'undefined' && (globalRoutesByDetail[normalizeStr(cName)] || globalRoutesByDetail[cName])) ? (globalRoutesByDetail[normalizeStr(cName)] || globalRoutesByDetail[cName]) : [];
                    let isMat = false;
                    if (typeof globalNomData !== 'undefined' && globalNomData) {
                        let nomItem = globalNomData.find(n => normalizeStr(n['ID Детайл']) === normalizeStr(cName));
                        if (nomItem && nomItem['Тип'] && String(nomItem['Тип']).toLowerCase().includes('материал')) {
                            isMat = true;
                        }
                    }
                    if (!isMat && cRoutes.length === 0) isMat = true;
                    let opToLog = isMat ? "Склад Материали" : (cRoutes.length > 0 ? String(cRoutes[cRoutes.length - 1]['Име на операция']).trim() : "Склад Материали");
                    inserts.push({ "ID План": taskData.plan_id, "ID Детайл": cName, "Оператор": "СИСТЕМА (Спасен)", "Количество": qty, "Операция": opToLog, "Статус": "Отчетено", "Дата": new Date().toISOString(), "Време Старт": startedAt });
                } else {
                    inserts.push({ "ID План": taskData.plan_id, "ID Детайл": cName, "Оператор": "СИСТЕМА (Бракуван Компонент)", "Количество": qty, "Операция": "Бракуван в " + taskData.name, "Статус": "Брак", "Дата": new Date().toISOString(), "Време Старт": startedAt });
                }
            });

            if (taskData.hasLimit) { taskData.maxAllowed -= val; if (taskData.maxAllowed < 0) taskData.maxAllowed = 0; }
            saveToOfflineQueue(inserts, taskData.id, 'БРАК: ' + val + ' бр.');
        } else {
            Swal.fire('❌ Грешка при запис', err.message, 'error');
        }
    }
}

async function forceCancelTask(taskId, taskData, msg) {
    let startedAt = window['startTime_' + taskId] || new Date().toISOString();
    try {
        await client.from('otcheti').insert([{
            "ID Детайл": taskData.name,
            "Оператор": currentOperator,
            "Количество": 0,
            "Операция": taskData.op,
            "Статус": "Авто приключена",
            "Дата": new Date().toISOString(),
            "Време Старт": startedAt
        }]);

    } catch (e) { console.error(e); }
    activeTaskId = null;
    Swal.fire({ title: 'Автоматично приключена', text: msg, icon: 'info', confirmButtonText: 'Разбрах' }).then(() => { loadTasks(); });
}

// --- OFFLINE SUPPORT ---
function getOfflineQueue() {
    return JSON.parse(localStorage.getItem('offlineReportsQueue') || '[]');
}

function saveToOfflineQueue(insertsArray, taskId, successMsg) {
    let queue = getOfflineQueue();
    queue.push({
        timestamp: Date.now(),
        inserts: insertsArray,
        taskId: taskId,
        successMsg: successMsg
    });
    localStorage.setItem('offlineReportsQueue', JSON.stringify(queue));
    if (taskId) {
        let val = parseFloat(insertsArray[0]['Количество']) || 0;
        let isScrap = insertsArray[0]['Статус'] === 'Брак';
        addLogToHistory(isScrap ? 'БРАК(Офлайн)' : 'ОФЛАЙН', val, taskId);
    }
    activeTaskId = null;
    Swal.fire({
        icon: 'warning',
        title: 'Няма връзка с интернет',
        text: 'Отчетът е запазен локално! Ще се изпрати автоматично при възстановяване на връзката.',
        timer: 3500,
        showConfirmButton: false
    }).then(() => { loadTasks(); });
}

async function syncOfflineReports() {
    if (!navigator.onLine) return;
    let queue = getOfflineQueue();
    if (queue.length === 0) return;

    let newQueue = [];
    let hasSynced = false;

    for (let i = 0; i < queue.length; i++) {
        let item = queue[i];
        let success = true;

        if (item.inserts && item.inserts.length > 0) {
            let firstInsert = item.inserts[0];
            try {
                const { data, error } = await client.from('otcheti').select('id').eq('Дата', firstInsert['Дата']).eq('Оператор', firstInsert['Оператор']).limit(1);
                if (error) throw error;
                if (data && data.length > 0) {
                    hasSynced = true;
                    continue;
                }
                const { error: insErr } = await client.from('otcheti').insert(item.inserts);
                if (insErr) throw insErr;
                hasSynced = true;
                // if (typeof executeSkladUpdates === 'function') await executeSkladUpdates(item.inserts);
            } catch (err) {
                console.error("Грешка при офлайн синхронизация", err);
                success = false;
            }
        }
        if (!success) {
            newQueue.push(item);
        }
    }

    localStorage.setItem('offlineReportsQueue', JSON.stringify(newQueue));
    if (hasSynced && newQueue.length === 0) {
        Swal.fire({ toast: true, position: 'bottom-end', icon: 'success', title: 'Офлайн отчетите бяха изпратени!', showConfirmButton: false, timer: 3000 });
        loadTasks(true);
    }
}

window.addEventListener('online', syncOfflineReports);
setTimeout(syncOfflineReports, 2000);

// --- MATERIAL DEDUCTION LOGIC ---
function _norm(name) {
    let n = String(name || '').trim().toLowerCase();
    n = n.replace(/пакет/g, 'пак');
    n = n.replace(/\./g, '');
    n = n.replace(/\s+/g, '');
    const map = { 'a': 'а', 'e': 'е', 'o': 'о', 'p': 'р', 'c': 'с', 'x': 'х', 'y': 'у' };
    for (let k in map) {
        n = n.split(k).join(map[k]);
    }
    return n;
}

function appendMaterialConsumptionInserts(taskData, val, startedAt, insertsArray) {
    let normName = _norm(taskData.name);
    let lcName = String(taskData.name).trim().toLowerCase();
    let cRoutes = globalRoutesByDetail[lcName] || globalRoutesByDetail[Object.keys(globalRoutesByDetail).find(k => _norm(k) === normName)] || [];
    let isLastOp = false;
    let isFirstOp = false;

    if (cRoutes.length > 0) {
        let lastOp = cRoutes[cRoutes.length - 1];
        if (_norm(lastOp['Име на операция']) === _norm(taskData.op)) {
            isLastOp = true;
        }
        let firstOp = cRoutes[0];
        if (_norm(firstOp['Име на операция']) === _norm(taskData.op)) {
            isFirstOp = true;
        }
    } else {
        isLastOp = true;
        isFirstOp = true;
    }

    let children = globalBomData.filter(b => _norm(b['ID Родител']) === normName);
    for (let child of children) {
        let consumeNow = false;
        let opNum = child['Влага се на Оп. №'] ? parseFloat(child['Влага се на Оп. №']) : 0;

        if (opNum > 0) {
            // Consume at specific operation
            if (opNum === taskData.opNum) {
                consumeNow = true;
            }
        } else {
            // Default behavior: consume at the first operation
            if (isFirstOp) {
                consumeNow = true;
            }
        }

        if (consumeNow) {
            let childName = String(child['ID Компонент']).trim();
            let multiplier = parseFloat(child['Количество']) || 1;
            let consumedQty = val * multiplier;

            if (!insertsArray.find(i => i['ID Детайл'] === childName && i['Оператор'] === "СИСТЕМА (Изписан материал)")) {
                insertsArray.push({
                    "ID План": taskData.plan_id,
                    "ID Детайл": childName,
                    "Оператор": "СИСТЕМА (Изписан материал)",
                    "Количество": consumedQty,
                    "Операция": "Вложен в " + taskData.name,
                    "Статус": "Отчетено",
                    "Дата": new Date().toISOString(),
                    "Време Старт": startedAt
                });
            }
        }
    }

    // Debug info removed as issue is resolved
}

async function executeSkladUpdates(insertsArray) {
    if (!navigator.onLine) return;
    let relevantMaterials = insertsArray.filter(ins => ins['Оператор'] === 'СИСТЕМА (Изписан материал)' || ins['Оператор'] === 'СИСТЕМА (Спасен)');
    if (relevantMaterials.length === 0) return;
    try {
        const { data: allSklad } = await client.from('sklad').select('Изразходено, Остатък, "ID Детайл"');
        if (!allSklad) return;

        let updates = {};
        for (let ins of relevantMaterials) {
            let normChild = _norm(ins['ID Детайл']);
            if (!updates[normChild]) {
                let resData = allSklad.find(s => _norm(s['ID Детайл']) === normChild);
                if (resData) {
                    updates[normChild] = {
                        'ID Детайл': resData['ID Детайл'],
                        'Изразходено': parseFloat(resData['Изразходено']) || 0,
                        'Остатък': parseFloat(resData['Остатък']) || 0
                    };
                }
            }
            if (updates[normChild]) {
                if (ins['Оператор'] === 'СИСТЕМА (Изписан материал)') {
                    updates[normChild]['Изразходено'] += parseFloat(ins['Количество']);
                    updates[normChild]['Остатък'] -= parseFloat(ins['Количество']);
                } else if (ins['Оператор'] === 'СИСТЕМА (Спасен)') {
                    updates[normChild]['Изразходено'] -= parseFloat(ins['Количество']);
                    updates[normChild]['Остатък'] += parseFloat(ins['Количество']);
                }
            }
        }

        for (let key in updates) {
            await client.from('sklad').update({
                'Изразходено': updates[key]['Изразходено'],
                'Остатък': updates[key]['Остатък']
            }).eq('ID Детайл', updates[key]['ID Детайл']);
        }
    } catch (e) {
        console.error("Грешка при изписване от склад:", e);
    }
}
