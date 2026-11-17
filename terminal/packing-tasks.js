// packing-tasks.js - Модернизирана логика за Опаковане (1. Опаковане -> 2. Разпределяне в кашони)

let currentPackingTab = 'tasks'; // 'tasks' | 'boxes' | 'doneBoxes'
let globalUnboxedItems = [];     // Опаковани детайли, чакащи разпределяне в кашон
let globalBoxedCartons = {};     // Оформени кашони с техните детайли
let currentActiveMonth = '';
let currentActiveYear = '';
window.__boxedCartonList = [];   // Безопасен масив за кашоните

function switchPackingTab(tabName) {
    currentPackingTab = tabName;

    const btnTasks = document.getElementById('tabBtn_tasks');
    const btnBoxes = document.getElementById('tabBtn_boxes');
    const btnDoneBoxes = document.getElementById('tabBtn_doneBoxes');

    if (btnTasks) btnTasks.classList.toggle('active', tabName === 'tasks');
    if (btnBoxes) btnBoxes.classList.toggle('active', tabName === 'boxes');
    if (btnDoneBoxes) btnDoneBoxes.classList.toggle('active', tabName === 'doneBoxes');

    const cTasks = document.getElementById('tasksContainer');
    const cBoxes = document.getElementById('boxesContainer');
    const cDoneBoxes = document.getElementById('doneBoxesContainer');

    if (cTasks) cTasks.style.display = (tabName === 'tasks') ? 'flex' : 'none';
    if (cBoxes) cBoxes.style.display = (tabName === 'boxes') ? 'flex' : 'none';
    if (cDoneBoxes) cDoneBoxes.style.display = (tabName === 'doneBoxes') ? 'flex' : 'none';

    if (tabName === 'tasks') {
        renderTasks(globalTasks);
    } else if (tabName === 'boxes') {
        renderUnboxedBoxDistribution();
    } else if (tabName === 'doneBoxes') {
        renderDoneBoxes();
    }
}

async function loadTasks(isSilent = false) {
    isUserCheckedIn = await fetchUserCheckInStatus();
    
    if (!isUserCheckedIn) {
        document.getElementById('mainAppContent').style.display = 'none';
        document.getElementById('bigLoginScreen').style.display = 'flex';
        return; 
    }
    
    document.getElementById('bigLoginScreen').style.display = 'none';
    document.getElementById('mainAppContent').style.display = 'block';

    var container = document.getElementById('tasksContainer');
    if (!isSilent && currentPackingTab === 'tasks') {
        container.innerHTML = '<div id="loadingMsg" style="text-align:center; padding: 40px; font-weight:bold; color:#64748b; font-size: 1.2em;">Търсене на задачи за опаковане... 🔄</div>';
    }
    
    try {
        const [plansRes, routesRes, reportsRes, nomRes, gpRes] = await Promise.all([
            client.from('plan').select('*').in('Статус', ['Активен', 'Завършен', 'Опакован', '📦 Опакован']).limit(100000), 
            client.from('marshruti').select('*').limit(100000), 
            client.from('otcheti').select('*').order('Дата', {ascending: false}).limit(100000), 
            client.from('Номенклатура').select('*').limit(100000),
            client.from('inventory').select('*').ilike('Операция', '%готов продукт%').limit(100000)
        ]);

        if (plansRes.error) throw plansRes.error;
        if (routesRes.error) throw routesRes.error; 
        if (reportsRes.error) throw reportsRes.error;
        if (gpRes.error) throw gpRes.error;

        let namesMap = {}; 
        if (nomRes.data) {
            nomRes.data.forEach(n => { 
                let code = String(n['ID Детайл']).trim().toLowerCase(); 
                namesMap[code] = n['Вътрешно име'] || ''; 
            });
        }

        let gpStock = {};
        if (gpRes.data) {
            gpRes.data.forEach(row => {
                let code = String(row['ID Детайл']).trim().toLowerCase();
                gpStock[code] = (gpStock[code] || 0) + (parseFloat(row['Количество']) || 0);
            });
        }

        let planRoots = {}; 
        let planNames = {};
        let planIdMap = {};

        plansRes.data.forEach(plan => {
            if (String(plan['Статус']).trim() === 'Изпратен' || String(plan['Статус']).trim() === '🚚 Изпратен') return;
            let planId = String(plan.id).trim(); 
            let rootItem = String(plan['Вътрешно име']).trim(); 
            let targetQty = parseFloat(plan['Целево количество']) || 0;
            let monthYear = (plan['Месец'] && plan['Година']) ? (plan['Месец'] + ' ' + plan['Година']) : '';
            
            if (plan['Месец'] && plan['Година'] && !currentActiveMonth) {
                currentActiveMonth = plan['Месец'];
                currentActiveYear = plan['Година'];
                window.currentActiveMonth = currentActiveMonth;
                window.currentActiveYear = currentActiveYear;
            }

            let groupKey = planId; 
            
            if (nomRes.data) {
                let translated = nomRes.data.find(n => String(n['Вътрешно име']).trim() === rootItem);
                if (translated && translated['ID Детайл']) rootItem = String(translated['ID Детайл']).trim();
            }
            rootItem = rootItem.toLowerCase();

            if(!planRoots[groupKey]) planRoots[groupKey] = {};
            planRoots[groupKey][rootItem] = (planRoots[groupKey][rootItem] || 0) + targetQty;
            planNames[groupKey] = monthYear ? monthYear : plan['Вътрешно име'];
            planIdMap[groupKey] = planId;
        });

        let packagedQty = {};
        let explicitPlanPackagedQty = {};
        let unboxedMap = {};
        let boxedCartons = {};

        let sortedReports = (reportsRes.data || []).map(r => {
            r._ts = new Date(r['Време Старт'] || r['Дата']).getTime();
            return r;
        }).sort((a,b) => a._ts - b._ts);

        sortedReports.forEach(r => {
            if (r['Статус'] !== 'Отчетено') return;

            let code = String(r['ID Детайл']).trim().toLowerCase();
            let op = String(r['Операция']).trim().toLowerCase();
            let rawPId = String(r['ID План'] || '').trim();
            let qty = parseFloat(r['Количество']) || 0;

            if (op.startsWith('опаковане')) {
                packagedQty[code] = (packagedQty[code] || 0) + qty;
                if (rawPId) {
                    let planKey = code + '_' + rawPId;
                    explicitPlanPackagedQty[planKey] = (explicitPlanPackagedQty[planKey] || 0) + qty;
                }

                // Проверяваме дали редът има номер на кашон
                let boxMatch = r['Операция'].match(/Кашон №\s*(.+)/i);
                if (boxMatch) {
                    let boxNum = boxMatch[1].trim();
                    if (!boxedCartons[boxNum]) {
                        boxedCartons[boxNum] = {
                            boxNum: boxNum,
                            totalQty: 0,
                            items: {},
                            reports: [],
                            lastDate: r['Дата'] || r['Време Старт']
                        };
                    }
                    boxedCartons[boxNum].totalQty += qty;
                    boxedCartons[boxNum].reports.push(r);
                    let itemKey = code + '___' + rawPId;
                    if (!boxedCartons[boxNum].items[itemKey]) {
                        boxedCartons[boxNum].items[itemKey] = {
                            code: code,
                            name: code.toUpperCase(),
                            internalName: namesMap[code] || '',
                            plan_id: rawPId,
                            plan_name: planNames[rawPId] || ('План ' + rawPId),
                            qty: 0
                        };
                    }
                    boxedCartons[boxNum].items[itemKey].qty += qty;
                    if (r['Дата'] && new Date(r['Дата']) > new Date(boxedCartons[boxNum].lastDate)) {
                        boxedCartons[boxNum].lastDate = r['Дата'];
                    }
                } else {
                    // Това е ОПАКОВАН ДЕТАЙЛ БЕЗ КАШОН (чакащ за кашон)!
                    let unboxedKey = code + '___' + rawPId;
                    if (!unboxedMap[unboxedKey]) {
                        unboxedMap[unboxedKey] = {
                            code: code,
                            name: code.toUpperCase(),
                            internalName: namesMap[code] || '',
                            plan_id: rawPId,
                            plan_name: planNames[rawPId] || (rawPId ? ('План ' + rawPId) : 'Общ'),
                            availableQty: 0,
                            reports: []
                        };
                    }
                    unboxedMap[unboxedKey].availableQty += qty;
                    unboxedMap[unboxedKey].reports.push(r);
                }
            }
        });

        // 1. Задачи за опаковане от цеха
        globalTasks = [];
        let taskCounter = 0;

        Object.keys(planRoots).forEach(groupKey => {
            Object.keys(planRoots[groupKey]).forEach(code => {
                let targetQty = planRoots[groupKey][code];
                
                let totalPackaged = packagedQty[code] || 0;
                let availableToPack = Math.max(0, (gpStock[code] || 0) - totalPackaged);
                
                let explicitPackaged = explicitPlanPackagedQty[code + '_' + planIdMap[groupKey]] || 0;
                let remainingTarget = Math.max(0, targetQty - explicitPackaged);
                
                if (availableToPack > 0 && remainingTarget > 0) {
                    globalTasks.push({
                        id: 'packTask_' + (++taskCounter),
                        plan_id: planIdMap[groupKey],
                        plan_name: planNames[groupKey],
                        name: code.toUpperCase(),
                        internalName: namesMap[code] || '',
                        available: availableToPack,
                        target: remainingTarget
                    });
                }
            });
        });

        // 2. Чакащи за кашон детайли
        globalUnboxedItems = Object.values(unboxedMap).filter(item => item.availableQty > 0);
        globalBoxedCartons = boxedCartons;

        // 3. Обновяваме броячите в табовете
        updateTabBadges();

        // 4. Рендерираме активния изглед
        if (currentPackingTab === 'tasks') {
            let activeEl = document.activeElement;
            let isUserEditing = isSilent && activeEl && activeEl.tagName === 'INPUT' && activeEl.id && (activeEl.id.startsWith('qty_') || activeEl.id.startsWith('box_'));
            if (!isUserEditing) {
                renderTasks(globalTasks);
            }
        } else if (currentPackingTab === 'boxes') {
            let activeEl = document.activeElement;
            let isUserEditing = isSilent && activeEl && activeEl.tagName === 'INPUT';
            if (!isUserEditing) {
                renderUnboxedBoxDistribution();
            }
        } else if (currentPackingTab === 'doneBoxes') {
            renderDoneBoxes();
        }

    } catch (err) { 
        console.error(err); 
        document.getElementById('tasksContainer').innerHTML = '<div style="text-align:center; padding: 40px; color:#ef4444; font-weight:bold;">❌ Грешка:<br>' + err.message + '</div>'; 
    }
}

function updateTabBadges() {
    const bTasks = document.getElementById('badgeTasksCount');
    const bUnboxed = document.getElementById('badgeUnboxedCount');
    const bBoxes = document.getElementById('badgeBoxesCount');

    if (bTasks) bTasks.innerText = globalTasks.length;

    let totalUnboxedPieces = 0;
    globalUnboxedItems.forEach(i => totalUnboxedPieces += i.availableQty);

    if (bUnboxed) {
        bUnboxed.innerText = totalUnboxedPieces > 0 ? (totalUnboxedPieces + ' бр.') : '0';
        if (totalUnboxedPieces > 0) {
            bUnboxed.style.fontWeight = '900';
            bUnboxed.style.color = '#0284c7';
        } else {
            bUnboxed.style.fontWeight = 'normal';
            bUnboxed.style.color = '';
        }
    }

    let boxCount = Object.keys(globalBoxedCartons).length;
    if (bBoxes) bBoxes.innerText = boxCount;
}

function renderTasks(tasks) {
    var container = document.getElementById('tasksContainer');
    if (!container) return;

    if (tasks.length === 0) { 
        let extraMsg = '';
        if (globalUnboxedItems.length > 0) {
            extraMsg = `
                <div style="margin-top: 18px;">
                    <button type="button" class="btn" onclick="switchPackingTab('boxes')" style="background-color: #2563eb; padding: 14px 22px; font-size: 1.05em; border-radius: 12px; font-weight: 800; box-shadow: 0 4px 10px rgba(37,99,235,0.3);">
                        📦 Отиди към разпределяне по кашони (${globalUnboxedItems.length} детайла чакат) ➔
                    </button>
                </div>`;
        }
        container.innerHTML = `
            <div class="card" style="text-align:center; padding: 40px 20px; font-size:1.2em; color: #16a34a; font-weight: 900; border-radius: 16px;">
                🎉 Няма детайли, чакащи първоначално опаковане!
                ${extraMsg}
            </div>`; 
        return; 
    }
    
    var html = '';
    tasks.forEach(function(t) {
        let borderStyle = 'border-left: 6px solid #16a34a;';
        let labelHtml = `<span class="plan-label" style="background:#fef3c7; color:#d97706; padding: 4px 8px; border-radius: 6px; font-weight: 800;">ПЛАН: ${t.plan_name}</span>`;
        let partCode = t.name; 
        let internalNameHtml = t.internalName ? `<div class="detail-code" style="color: #64748b; font-weight: 700; margin-top: 3px;">${t.internalName}</div>` : '';
        
        let unboxedItem = globalUnboxedItems.find(u => u.code === t.name.toLowerCase() && String(u.plan_id) === String(t.plan_id));
        let unboxedQty = unboxedItem ? unboxedItem.availableQty : 0;
        let unboxedNoticeHtml = '';
        if (unboxedQty > 0) {
            unboxedNoticeHtml = `
                <div style="background-color: #eff6ff; border: 1.5px solid #bfdbfe; padding: 8px 12px; border-radius: 10px; margin-bottom: 12px; font-size: 13px; color: #1d4ed8; font-weight: 800; display: flex; justify-content: space-between; align-items: center;">
                    <span>📦 Вече опаковани (чакащи кашон):</span>
                    <span style="background: #2563eb; color: white; padding: 2px 8px; border-radius: 12px;">${unboxedQty} бр.</span>
                </div>`;
        }

        let maxCanPack = Math.min(t.available, t.target);

        html += `
          <div class="card" id="card_${t.id}" style="${borderStyle} margin-bottom: 20px;">
            <div class="task-header">
                ${labelHtml}
                <div style="display:flex; gap: 6px;">
                    <span class="qty-badge" style="background-color:#f59e0b; padding: 4px 10px; font-weight: 900;">Очакват: ${t.target} бр.</span>
                </div>
            </div>
            
            <div class="detail-info" style="margin-bottom: 12px;">
                <div class="internal-name" style="font-size: 1.3em; font-weight: 900; color: #0f172a;">${partCode}</div>
                ${internalNameHtml}
            </div>
            
            <div style="background-color: #dcfce7; border: 1px solid #bbf7d0; padding: 10px; border-radius: 10px; margin-bottom: 12px; font-size: 14px; color: #166534; font-weight: 900; text-align: center;">
                🏭 Възможни за опаковане от цеха: ${t.available} бр.
            </div>

            ${unboxedNoticeHtml}
            
            <div style="background-color: #f8fafc; padding: 16px; border-radius: 14px; border: 2px solid #bae6fd;">
                <p style="color: #0369a1; font-weight: 900; text-align:center; margin-top:0; margin-bottom: 14px; font-size: 1.1em; letter-spacing: 0.3px;">
                    📦 ОПАКОВАЙ ДЕТАЙЛИ
                </p>
                
                <div style="display: grid; grid-template-columns: 1.1fr 1fr; gap: 12px; margin-bottom: 14px;">
                    <!-- Поле 1: Брой детайли за опаковане -->
                    <div>
                        <label style="font-weight: 800; color: #334155; display: flex; align-items: flex-end; min-height: 34px; margin-bottom: 6px; font-size: 0.88em; line-height: 1.25;">
                            <span>Брой детайли за опаковане: <span style="color:#dc2626;">*</span></span>
                        </label>
                        <div style="display: flex; gap: 6px; align-items: stretch; height: 48px;">
                            <input type="number" id="qty_${t.id}" min="1" max="${t.available}" value="${maxCanPack}" class="box-input" inputmode="numeric" style="margin-bottom: 0; font-size: 1.25em; height: 48px; flex: 1; padding: 6px 8px; text-align: center;" oninput="updateTaskBtn('${t.id}')">
                            <button type="button" onclick="setTaskQtyMax('${t.id}', ${t.available})" style="background: #e2e8f0; border: none; border-radius: 8px; padding: 0 12px; font-weight: 900; color: #334155; cursor: pointer; white-space: nowrap; height: 48px; transition: background 0.2s ease;">
                                MAX
                            </button>
                        </div>
                    </div>

                    <!-- Поле 2: Кашон № -->
                    <div>
                        <label style="font-weight: 800; color: #334155; display: flex; align-items: flex-end; min-height: 34px; margin-bottom: 6px; font-size: 0.88em; line-height: 1.25;">
                            <span>Кашон №: <span style="font-weight: 600; color: #64748b; font-size: 0.85em;">(по избор)</span></span>
                        </label>
                        <div style="height: 48px;">
                            <input type="text" id="box_${t.id}" class="box-input" placeholder="Въведи № (или празно)" style="margin-bottom: 0; font-size: 1.1em; background: white; height: 48px; width: 100%; padding: 6px 10px; text-align: center;" oninput="updateTaskBtn('${t.id}')">
                        </div>
                    </div>
                </div>
                
                <button class="btn" id="btn_${t.id}" onclick="handlePackingSubmit('${t.id}', this)" style="background-color: #16a34a; width: 100%; padding: 16px; font-size: 1.15em; font-weight: 900; box-shadow: 0 4px 8px rgba(22, 163, 74, 0.3); border-radius: 12px; transition: all 0.2s ease;">
                    ✅ ОТЧЕТИ ОПАКОВАНИ (<span id="btnQtySpan_${t.id}">${maxCanPack}</span> бр.)
                </button>
                <div id="btnHint_${t.id}" style="font-size: 0.82em; color: #64748b; text-align: center; margin-top: 6px; font-weight: 600;">
                    ℹ️ Кашонът е празен — детайлите ще отидат в таб <b>„За кашони“</b>
                </div>
            </div>
          </div>`;
    });
    container.innerHTML = html;
}

function renderUnboxedBoxDistribution() {
    var container = document.getElementById('boxesContainer');
    if (!container) return;

    if (globalUnboxedItems.length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align: center; padding: 40px 20px; border-radius: 16px;">
                <div style="font-size: 4em; margin-bottom: 10px;">📦</div>
                <h3 style="color: #1e293b; margin-top: 0; font-size: 1.4em;">Няма детайли, чакащи кашон</h3>
                <p style="color: #64748b; font-size: 1em; line-height: 1.5; margin-bottom: 25px;">
                    Когато опаковате детайли от таб <b>„Опаковане“</b> без номер на кашон, те автоматично се появяват тук. След това можете да изберете кои детайли в кой номер кашон да поставите.
                </p>
                <button type="button" class="btn" onclick="switchPackingTab('tasks')" style="background-color: #16a34a; padding: 14px 24px; font-size: 1.1em; font-weight: 800; border-radius: 12px;">
                    🟢 Отиди към Опаковане
                </button>
            </div>`;
        return;
    }

    let itemsHtml = '';
    globalUnboxedItems.forEach((item, index) => {
        let safeId = 'ub_' + index;
        itemsHtml += `
            <div class="unboxed-row" style="background: white; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div>
                        <div style="font-weight: 900; color: #0f172a; font-size: 1.15em;">${escapeHtml(item.name)}</div>
                        ${item.internalName ? `<div style="font-size: 0.88em; color: #64748b; font-weight: 700;">${escapeHtml(item.internalName)}</div>` : ''}
                        <div style="font-size: 0.8em; color: #d97706; font-weight: 800; margin-top: 2px;">ПЛАН: ${escapeHtml(item.plan_name)}</div>
                    </div>
                    <div style="text-align: right;">
                        <span class="qty-badge" style="background: #0284c7; font-size: 0.88em; padding: 4px 10px; font-weight: 900;">
                            Опаковани: ${item.availableQty} бр.
                        </span>
                    </div>
                </div>

                <div style="display: flex; gap: 8px; align-items: center; margin-top: 10px; flex-wrap: wrap;">
                    <span style="font-size: 0.9em; font-weight: 800; color: #334155; white-space: nowrap;">Слагам в кашона:</span>
                    <input type="number" id="assign_qty_${safeId}" min="0" max="${item.availableQty}" value="0" class="box-input assign-qty-input" style="padding: 10px; font-size: 1.15em; margin-bottom: 0; width: 95px; text-align: center; flex: 0 0 95px;" oninput="updateBoxAssignmentSummary()" data-max="${item.availableQty}" data-index="${index}" inputmode="numeric">
                    <button type="button" onclick="setAssignMaxQty('${safeId}', ${item.availableQty})" style="background: #f1f5f9; border: 1.5px solid #cbd5e1; padding: 10px 14px; border-radius: 8px; font-weight: 900; font-size: 0.85em; color: #1e293b; cursor: pointer; white-space: nowrap;">
                        Всички (${item.availableQty})
                    </button>
                    <button type="button" onclick="setAssignZeroQty('${safeId}')" style="background: transparent; border: 1px solid #cbd5e1; padding: 10px 12px; border-radius: 8px; font-weight: bold; font-size: 0.85em; color: #94a3b8; cursor: pointer;">
                        0
                    </button>
                </div>
            </div>`;
    });

    let html = `
        <div class="card" style="border-left: 6px solid #2563eb; margin-bottom: 20px; background: #f8fafc; border: 2px solid #93c5fd; padding: 20px;">
            <div style="font-weight: 900; color: #1e40af; font-size: 1.25em; text-align: center; margin-bottom: 8px;">
                📦 СЪБИРАНЕ НА КАШОН
            </div>
            <p style="color: #64748b; font-size: 0.92em; text-align: center; margin-top: 0; margin-bottom: 16px; font-weight: 600;">
                Въведете номер на кашон и изберете кои опаковани детайли слагате в него:
            </p>

            <label style="font-weight: 900; color: #1e293b; display: block; margin-bottom: 6px; font-size: 1em;">
                Кашон №: <span style="color:#dc2626;">*</span>
            </label>
            <input type="text" id="masterBoxNumber" class="box-input" placeholder="Въведи номер на кашон (напр. 1, 2, 3...)" style="font-size: 1.35em; margin-bottom: 16px; border: 2.5px solid #3b82f6; background: white;" oninput="updateBoxAssignmentSummary()">

            <div style="font-weight: 800; color: #334155; font-size: 0.95em; margin-bottom: 10px;">
                Детайли, чакащи разпределяне:
            </div>

            <div id="unboxedItemsSelectionList" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;">
                ${itemsHtml}
            </div>

            <div id="boxSummaryBar" style="background: #e0f2fe; border: 1.5px solid #7dd3fc; border-radius: 10px; padding: 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 800; color: #0369a1; font-size: 1em;">Общо детайли за този кашон:</span>
                <span id="boxSummaryTotalQty" style="font-weight: 900; font-size: 1.35em; color: #0284c7;">0 бр.</span>
            </div>

            <button class="btn" id="btnAssignBox" onclick="executeBoxAssignment(this)" style="background-color: #2563eb; width: 100%; padding: 18px; font-size: 1.2em; font-weight: 900; box-shadow: 0 6px 14px rgba(37, 99, 235, 0.35); border-radius: 12px; opacity: 0.5; cursor: not-allowed;" disabled>
                📦 ПРИБЕРИ В КАШОНА
            </button>
        </div>`;

    container.innerHTML = html;
    updateBoxAssignmentSummary();
}

function renderDoneBoxes() {
    var container = document.getElementById('doneBoxesContainer');
    if (!container) return;

    let boxKeys = Object.keys(globalBoxedCartons);
    if (boxKeys.length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align: center; padding: 40px 20px; border-radius: 16px;">
                <div style="font-size: 4em; margin-bottom: 10px;">📋</div>
                <h3 style="color: #1e293b; margin-top: 0; font-size: 1.4em;">Все още няма оформени кашони</h3>
                <p style="color: #64748b; font-size: 1em; line-height: 1.5; margin-bottom: 25px;">
                    Когато разпределите детайли в кашон, те ще се появят тук с пълен списък на съдържанието.
                </p>
                <button type="button" class="btn" onclick="switchPackingTab('boxes')" style="background-color: #2563eb; padding: 14px 24px; font-size: 1.1em; font-weight: 800; border-radius: 12px;">
                    📦 Отиди към За кашони
                </button>
            </div>`;
        return;
    }

    boxKeys.sort((a, b) => {
        let numA = parseInt(a);
        let numB = parseInt(b);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b, undefined, { numeric: true });
    });

    window.__boxedCartonList = boxKeys;

    let printPackingListBtn = '';
    if (currentActiveMonth && currentActiveYear) {
        printPackingListBtn = `
            <div style="margin-bottom: 16px; text-align: center;">
                <button type="button" class="btn" onclick="window.open('packing-list.html?month=${encodeURIComponent(currentActiveMonth)}&year=${encodeURIComponent(currentActiveYear)}', '_blank')" style="background-color: #0f172a; width: 100%; padding: 15px; font-size: 1.05em; font-weight: 800; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 10px rgba(15, 23, 42, 0.25);">
                    <span>🖨️</span> <span>Отвори Packing List за ${escapeHtml(currentActiveMonth)} ${escapeHtml(currentActiveYear)}</span>
                </button>
            </div>`;
    }

    let html = printPackingListBtn;

    boxKeys.forEach((boxNum, idx) => {
        let box = globalBoxedCartons[boxNum];
        let itemsListHtml = '';
        Object.values(box.items).forEach(item => {
            itemsListHtml += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
                    <div>
                        <div style="font-weight: 800; color: #1e293b; font-size: 1.05em;">${escapeHtml(item.name)}</div>
                        ${item.internalName ? `<div style="font-size: 0.85em; color: #64748b; font-weight: 600;">${escapeHtml(item.internalName)}</div>` : ''}
                        <div style="font-size: 0.78em; color: #94a3b8; font-weight: 600;">${escapeHtml(item.plan_name)}</div>
                    </div>
                    <div style="font-weight: 900; color: #0284c7; font-size: 1.2em;">
                        ${item.qty} бр.
                    </div>
                </div>`;
        });

        html += `
            <div class="card" style="border-left: 6px solid #0284c7; margin-bottom: 16px; padding: 18px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                    <div>
                        <span style="font-size: 1.3em; font-weight: 900; color: #0f172a;">📦 Кашон № ${escapeHtml(boxNum)}</span>
                    </div>
                    <div>
                        <span class="qty-badge" style="background: #0284c7; font-size: 0.95em; padding: 5px 12px; font-weight: 900;">
                            Общо: ${box.totalQty} бр.
                        </span>
                    </div>
                </div>

                <div style="margin-bottom: 14px;">
                    ${itemsListHtml}
                </div>

                <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; border-top: 1px solid #f1f5f9; padding-top: 10px; flex-wrap: wrap;">
                    <button type="button" onclick="printBoxByIndex(${idx})" style="background: #eff6ff; border: 1.5px solid #93c5fd; padding: 8px 14px; border-radius: 8px; font-weight: 800; font-size: 0.85em; color: #1d4ed8; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                        🖨️ Принт
                    </button>
                    <button type="button" onclick="renameBoxByIndex(${idx})" style="background: #f8fafc; border: 1.5px solid #cbd5e1; padding: 8px 14px; border-radius: 8px; font-weight: 800; font-size: 0.85em; color: #334155; cursor: pointer;">
                        ✏️ Промени №
                    </button>
                    <button type="button" onclick="unpackBoxByIndex(${idx})" style="background: #fee2e2; border: 1.5px solid #fca5a5; padding: 8px 14px; border-radius: 8px; font-weight: 800; font-size: 0.85em; color: #b91c1c; cursor: pointer;">
                        ↩️ Разопаковай
                    </button>
                </div>
            </div>`;
    });

    container.innerHTML = html;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function setTaskFilter(filterType) { 
    renderTasks(globalTasks); 
}
