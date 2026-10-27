// ==============================================================
// 🔍 ВАЛИДАТОР ЗА ГОТОВНОСТ НА МЕСЕЧЕН ПЛАН
// ==============================================================

let validatorResults = [];
let currentValidatorFilter = 'all';

window.openPlanValidatorModal = async function() {
    const backdrop = document.getElementById('planValidatorModalBackdrop');
    if (!backdrop) return;
    backdrop.style.display = 'flex';
    
    // Populate month and year select boxes based on plans
    await initValidatorSelectors();
    
    // Run validation immediately for selected month/year
    await runPlanValidation();
};

window.closePlanValidatorModal = function() {
    const backdrop = document.getElementById('planValidatorModalBackdrop');
    if (backdrop) backdrop.style.display = 'none';
};

async function initValidatorSelectors() {
    const monthSel = document.getElementById('validatorMonthSelect');
    const yearSel = document.getElementById('validatorYearSelect');
    if (!monthSel || !yearSel) return;
    
    const months = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни', 'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'];
    const currentMonthIndex = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    // Check available months and years from plan table or use defaults
    try {
        const { data: plans } = await client.from('plan').select('Месец, Година').limit(500);
        let foundMonths = new Set();
        let foundYears = new Set();
        
        if (plans && plans.length > 0) {
            plans.forEach(p => {
                if (p['Месец']) foundMonths.add(p['Месец']);
                if (p['Година']) foundYears.add(p['Година']);
            });
        }
        
        monthSel.innerHTML = '';
        months.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.innerText = m;
            if (m === months[currentMonthIndex]) opt.selected = true;
            monthSel.appendChild(opt);
        });
        
        yearSel.innerHTML = '';
        const yearsToUse = foundYears.size > 0 ? Array.from(foundYears).sort((a,b) => b-a) : [currentYear, currentYear - 1];
        yearsToUse.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y;
            opt.innerText = y;
            if (parseInt(y) === currentYear) opt.selected = true;
            yearSel.appendChild(opt);
        });
    } catch(e) {
        console.error("Error initializing validator selectors:", e);
    }
}

window.runPlanValidation = async function() {
    const monthSel = document.getElementById('validatorMonthSelect');
    const yearSel = document.getElementById('validatorYearSelect');
    const content = document.getElementById('validatorContent');
    const statusText = document.getElementById('validatorStatusText');
    
    if (!monthSel || !yearSel || !content) return;
    const selectedMonth = monthSel.value;
    const selectedYear = yearSel.value;
    
    content.innerHTML = `
        <div style="text-align: center; padding: 50px 20px;">
            <div style="font-size: 2.2em; animation: spin 1s linear infinite; display: inline-block;">⚙️</div>
            <div style="font-size: 1.1em; font-weight: 700; color: #475569; margin-top: 15px;">Анализиране на план за ${selectedMonth} ${selectedYear}...</div>
            <div style="font-size: 0.85em; color: #94a3b8; margin-top: 5px;">Проверка на технологични маршрути, BOM състав и складови заготовки</div>
        </div>
    `;
    if (statusText) statusText.innerText = 'Зареждане...';

    try {
        // 1. Fetch plans for selected month/year
        const { data: plans, error: pErr } = await client.from('plan')
            .select('*')
            .eq('Месец', selectedMonth)
            .eq('Година', selectedYear);
        if (pErr) throw pErr;

        if (!plans || plans.length === 0) {
            content.innerHTML = `
                <div style="text-align:center; padding:50px 20px; color:#64748b;">
                    <div style="font-size: 3em; margin-bottom: 10px;">📅</div>
                    <div style="font-weight: 700; font-size: 1.15em; color: #334155;">Няма въведени детайли в плана за ${selectedMonth} ${selectedYear}.</div>
                    <div style="margin-top: 8px;">Можете да заредите план от PDF или да добавите детайли от таб "Месечен План".</div>
                </div>
            `;
            if (statusText) statusText.innerText = '0 детайла';
            return;
        }

        // 2. Fetch routes, BOMs, inventory and nomenclature
        const [routesRes, bomRes, skladRes, nomRes] = await Promise.all([
            client.from('marshruti').select('*'),
            client.from('bom').select('*'),
            client.from('sklad').select('*'),
            client.from('Номенклатура').select('*')
        ]);

        const routesData = routesRes.data || [];
        const bomData = bomRes.data || [];
        const skladData = skladRes.data || [];
        const nomData = nomRes.data || [];

        // Build Nomenclature mapping (Name <-> Code)
        const nomMap = {};
        nomData.forEach(n => {
            const code = String(n['ID Детайл'] || '').trim().toUpperCase();
            const name = String(n['Вътрешно име'] || '').trim().toUpperCase();
            if (code && name) {
                nomMap[name] = code;
                nomMap[code] = name;
            }
        });

        // Group Marshruti by normalized detail code/name
        const marshrutiMap = {};
        routesData.forEach(r => {
            const code = String(r['Код на детайла'] || r['ID Детайл'] || '').trim().toUpperCase();
            if (!code) return;
            if (!marshrutiMap[code]) marshrutiMap[code] = [];
            marshrutiMap[code].push(r);
        });

        // Group BOM by normalized detail code/name
        const bomMap = {};
        bomData.forEach(b => {
            const parent = String(b['ID Детайл'] || b['Детайл'] || b['Вътрешно име'] || '').trim().toUpperCase();
            if (!parent) return;
            if (!bomMap[parent]) bomMap[parent] = [];
            bomMap[parent].push(b);
        });

        // Sum available inventory stock
        const stockMap = {};
        skladData.forEach(s => {
            const itemCode = String(s['ID Детайл'] || s['Код'] || '').trim().toUpperCase();
            if (!itemCode) return;
            const qty = parseFloat(s['Наличност'] || s['Количество'] || 0) || 0;
            stockMap[itemCode] = (stockMap[itemCode] || 0) + qty;
        });

        // 3. Analyze each detail in the plan
        validatorResults = plans.map(p => {
            const rawCode = String(p['ID Детайл'] || '').trim();
            const rawName = String(p['Вътрешно име'] || '').trim();
            const upperCode = rawCode.toUpperCase();
            const upperName = rawName.toUpperCase();
            const targetQty = parseFloat(p['Целево количество']) || 0;
            const status = String(p['Статус'] || 'Активен');

            // Find matching routes
            const routes = marshrutiMap[upperCode] || marshrutiMap[upperName] || 
                           (nomMap[upperName] && marshrutiMap[nomMap[upperName]]) ||
                           (nomMap[upperCode] && marshrutiMap[nomMap[upperCode]]) || [];

            // Find matching BOM
            const boms = bomMap[upperCode] || bomMap[upperName] ||
                         (nomMap[upperName] && bomMap[nomMap[upperName]]) ||
                         (nomMap[upperCode] && bomMap[nomMap[upperCode]]) || [];

            const errors = [];
            const warnings = [];
            const deficits = [];

            // Check 1: Marshruti
            if (routes.length === 0) {
                errors.push({
                    type: 'missing_route',
                    title: 'Липсва маршрутна карта',
                    desc: 'Детайлът няма въведени технологични операции и няма да се появи на терминалите в цеха.'
                });
            } else {
                const unassignedOps = routes.filter(r => !r['Машина'] || String(r['Машина']).trim() === '');
                if (unassignedOps.length > 0) {
                    warnings.push({
                        type: 'unassigned_machine',
                        title: 'Операция без машина',
                        desc: `${unassignedOps.length} оп. нямат посочена машина: ` + unassignedOps.map(o => o['Операция'] || 'Без име').join(', ')
                    });
                }
            }

            // Check 2: BOM
            if (boms.length === 0) {
                warnings.push({
                    type: 'missing_bom',
                    title: 'Няма въведен BOM',
                    desc: 'Липсва рецепта за вложени материали/заготовки.'
                });
            } else {
                // Check 3: Material Availability
                boms.forEach(b => {
                    const compCode = String(b['ID Съставна част'] || b['ID Материал'] || b['Съставна част'] || b['Материал'] || '').trim();
                    const compUpper = compCode.toUpperCase();
                    const ratio = parseFloat(b['Количество']) || 1;
                    const needed = Math.ceil(targetQty * ratio);
                    const available = stockMap[compUpper] || 0;

                    if (available < needed) {
                        const def = needed - available;
                        deficits.push({
                            compCode,
                            needed,
                            available,
                            deficit: def
                        });
                        errors.push({
                            type: 'stock_deficit',
                            title: `Дефицит: ${compCode}`,
                            desc: `Нужни: ${needed} бр. | На склад: ${available} бр. (Недостигат: ${def} бр.)`
                        });
                    }
                });
            }

            // Overall rating
            let rating = 'ok';
            if (errors.length > 0) rating = 'error';
            else if (warnings.length > 0) rating = 'warn';

            return {
                id: p.id,
                code: rawCode,
                name: rawName || rawCode,
                targetQty,
                status,
                routesCount: routes.length,
                bomsCount: boms.length,
                errors,
                warnings,
                deficits,
                rating
            };
        });

        // Render UI
        renderValidatorResults();
        if (statusText) statusText.innerText = `Общо ${validatorResults.length} детайла`;

    } catch (err) {
        console.error('Validation error:', err);
        content.innerHTML = `<div style="text-align:center; padding:30px; color:#ef4444; font-weight:700;">Грешка при валидиране: ${err.message}</div>`;
    }
};

window.filterValidatorList = function(filter) {
    currentValidatorFilter = filter;
    renderValidatorResults();
};

function renderValidatorResults() {
    const content = document.getElementById('validatorContent');
    if (!content) return;

    const total = validatorResults.length;
    const errorsCount = validatorResults.filter(r => r.rating === 'error').length;
    const warnsCount = validatorResults.filter(r => r.rating === 'warn').length;
    const okCount = validatorResults.filter(r => r.rating === 'ok').length;
    const okPct = total > 0 ? Math.round((okCount / total) * 100) : 0;

    // Filter items
    let items = validatorResults;
    if (currentValidatorFilter === 'error') items = items.filter(r => r.rating === 'error');
    else if (currentValidatorFilter === 'warn') items = items.filter(r => r.rating === 'warn');
    else if (currentValidatorFilter === 'ok') items = items.filter(r => r.rating === 'ok');

    let headerTitle = '';
    let subTitle = '';
    if (errorsCount > 0) {
        headerTitle = `Открити са ${errorsCount} блокиращи проблема в плана`;
        subTitle = `Има детайли без маршрутна карта или с недостиг на заготовки на склад.`;
    } else if (warnsCount > 0) {
        headerTitle = `Няма блокиращи проблеми (${warnsCount} детайла с предупреждения)`;
        subTitle = `${okCount} от ${total} детайла (${okPct}%) са напълно готови. Предупрежденията са за липсващ BOM състав.`;
    } else {
        headerTitle = `Планът е 100% готов за старт!`;
        subTitle = `Всички ${total} детайла са напълно обезпечени с маршрути и налични заготовки.`;
    }

    let html = `
        <!-- Summary Health Bar -->
        <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 24px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
                <div style="display: flex; align-items: center; gap: 14px;">
                    <div style="background: ${errorsCount > 0 ? '#ef4444' : (warnsCount > 0 ? '#f59e0b' : '#10b981')}; color: white; width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5em; font-weight: 900; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                        ${errorsCount > 0 ? '🚨' : (warnsCount > 0 ? '⚠️' : '✅')}
                    </div>
                    <div>
                        <div style="font-size: 1.15em; font-weight: 800; color: #1e293b;">
                            ${headerTitle}
                        </div>
                        <div style="font-size: 0.88em; color: #64748b; margin-top: 3px;">
                            ${subTitle}
                        </div>
                    </div>
                </div>

                <!-- Metrics Pills -->
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <div style="background: white; border: 1px solid #e2e8f0; padding: 6px 14px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 0.75em; color: #64748b; font-weight: 700;">ОБЩО</div>
                        <div style="font-size: 1.15em; font-weight: 800; color: #0f172a;">${total}</div>
                    </div>
                    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 6px 14px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 0.75em; color: #15803d; font-weight: 700;">ГОТОВИ</div>
                        <div style="font-size: 1.15em; font-weight: 800; color: #16a34a;">${okCount}</div>
                    </div>
                    <div style="background: #fffbeb; border: 1px solid #fef3c7; padding: 6px 14px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 0.75em; color: #b45309; font-weight: 700;">ПРЕДУПРЕЖДЕНИЯ</div>
                        <div style="font-size: 1.15em; font-weight: 800; color: #d97706;">${warnsCount}</div>
                    </div>
                    <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 6px 14px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 0.75em; color: #b91c1c; font-weight: 700;">БЛОКИРАЩИ</div>
                        <div style="font-size: 1.15em; font-weight: 800; color: #dc2626;">${errorsCount}</div>
                    </div>
                </div>
            </div>

            <!-- Progress Bar -->
            <div style="margin-top: 15px; background: #e2e8f0; height: 8px; border-radius: 4px; overflow: hidden; display: flex;">
                <div style="width: ${okPct}%; background: #10b981; transition: width 0.3s;"></div>
                <div style="width: ${total > 0 ? (warnsCount/total)*100 : 0}%; background: #f59e0b;"></div>
                <div style="width: ${total > 0 ? (errorsCount/total)*100 : 0}%; background: #ef4444;"></div>
            </div>
        </div>

        <!-- Filter Pills Bar -->
        <div style="display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; flex-wrap: wrap;">
            <button type="button" onclick="filterValidatorList('all')" style="padding: 6px 14px; border-radius: 20px; border: 1px solid ${currentValidatorFilter === 'all' ? '#0284c7' : '#cbd5e1'}; background: ${currentValidatorFilter === 'all' ? '#0284c7' : '#ffffff'}; color: ${currentValidatorFilter === 'all' ? '#ffffff' : '#475569'}; font-weight: 700; cursor: pointer; font-size: 0.85em;">Всички позиции (${total})</button>
            <button type="button" onclick="filterValidatorList('error')" style="padding: 6px 14px; border-radius: 20px; border: 1px solid ${currentValidatorFilter === 'error' ? '#dc2626' : '#fecaca'}; background: ${currentValidatorFilter === 'error' ? '#dc2626' : '#fff5f5'}; color: ${currentValidatorFilter === 'error' ? '#ffffff' : '#b91c1c'}; font-weight: 700; cursor: pointer; font-size: 0.85em;">🔴 С проблеми (${errorsCount})</button>
            <button type="button" onclick="filterValidatorList('warn')" style="padding: 6px 14px; border-radius: 20px; border: 1px solid ${currentValidatorFilter === 'warn' ? '#d97706' : '#fef3c7'}; background: ${currentValidatorFilter === 'warn' ? '#d97706' : '#fffdf5'}; color: ${currentValidatorFilter === 'warn' ? '#ffffff' : '#b45309'}; font-weight: 700; cursor: pointer; font-size: 0.85em;">🟡 С предупреждения (${warnsCount})</button>
            <button type="button" onclick="filterValidatorList('ok')" style="padding: 6px 14px; border-radius: 20px; border: 1px solid ${currentValidatorFilter === 'ok' ? '#16a34a' : '#bbf7d0'}; background: ${currentValidatorFilter === 'ok' ? '#16a34a' : '#f0fdf4'}; color: ${currentValidatorFilter === 'ok' ? '#ffffff' : '#15803d'}; font-weight: 700; cursor: pointer; font-size: 0.85em;">🟢 Напълно готови (${okCount})</button>
        </div>

        <!-- Detail Cards -->
        <div style="display: flex; flex-direction: column; gap: 12px;">
    `;

    if (items.length === 0) {
        html += `<div style="text-align: center; color: #94a3b8; padding: 40px; font-weight: 600;">Няма детайли в тази категория.</div>`;
    } else {
        items.forEach(item => {
            const isError = item.rating === 'error';
            const isWarn = item.rating === 'warn';
            const borderColor = isError ? '#fecaca' : (isWarn ? '#fef3c7' : '#bbf7d0');
            const bgColor = isError ? '#fffafb' : (isWarn ? '#fffdf7' : '#ffffff');
            const badgeBg = isError ? '#fee2e2' : (isWarn ? '#fef3c7' : '#dcfce7');
            const badgeColor = isError ? '#b91c1c' : (isWarn ? '#92400e' : '#166534');
            const badgeText = isError ? '🔴 БЛОКИРАЩ ПРОБЛЕМ' : (isWarn ? '🟡 ПРЕДУПРЕЖДЕНИЕ' : '🟢 100% ГОТОВ');

            html += `
                <div style="background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 10px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.03); display: flex; flex-direction: column; gap: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <span style="font-weight: 800; font-size: 1.05em; color: #0f172a;">${item.name}</span>
                            ${item.code && item.code !== item.name ? `<span style="color: #64748b; font-size: 0.88em; margin-left: 6px;">(${item.code})</span>` : ''}
                            <span style="margin-left: 10px; background: #f1f5f9; color: #334155; font-weight: 700; padding: 2px 8px; border-radius: 6px; font-size: 0.82em;">План: ${item.targetQty} бр.</span>
                        </div>
                        <span style="background: ${badgeBg}; color: ${badgeColor}; font-weight: 800; font-size: 0.78em; padding: 4px 10px; border-radius: 12px; letter-spacing: 0.3px;">${badgeText}</span>
                    </div>

                    <!-- Checklist row -->
                    <div style="display: flex; gap: 15px; flex-wrap: wrap; font-size: 0.85em; background: rgba(0,0,0,0.02); padding: 8px 12px; border-radius: 6px;">
                        <div>
                            ${item.routesCount > 0 ? `✅ <b>Маршрут:</b> ${item.routesCount} операции` : `<span style="color:#dc2626; font-weight:bold;">❌ Липсва технологичен маршрут</span>`}
                        </div>
                        <div>
                            ${item.bomsCount > 0 ? `✅ <b>BOM:</b> ${item.bomsCount} съставни части` : `<span style="color:#d97706; font-weight:bold;">⚠️ Няма въведен BOM</span>`}
                        </div>
                        <div>
                            ${item.deficits.length === 0 ? `✅ <b>Заготовки:</b> Налични на склад` : `<span style="color:#dc2626; font-weight:bold;">🚨 Дефицит на ${item.deficits.length} позиции</span>`}
                        </div>
                    </div>

                    <!-- Issues list (if any) -->
                    ${item.errors.length > 0 || item.warnings.length > 0 ? `
                        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 2px;">
                            ${item.errors.map(e => `
                                <div style="display: flex; align-items: center; justify-content: space-between; background: #fef2f2; border: 1px solid #fecaca; padding: 6px 12px; border-radius: 6px; font-size: 0.85em; color: #991b1b;">
                                    <div><b>❌ ${e.title}:</b> ${e.desc}</div>
                                    ${e.type === 'missing_route' ? `
                                        <button type="button" onclick="quickAddRouteFromValidator('${item.code || item.name}')" style="background:#dc2626; color:white; border:none; padding:4px 10px; border-radius:4px; font-weight:700; cursor:pointer; font-size:0.8em; white-space:nowrap; margin-left:10px;">➕ Добави Маршрут</button>
                                    ` : ''}
                                    ${e.type === 'stock_deficit' ? `
                                        <button type="button" onclick="closePlanValidatorModal(); openMrpModal();" style="background:#ea580c; color:white; border:none; padding:4px 10px; border-radius:4px; font-weight:700; cursor:pointer; font-size:0.8em; white-space:nowrap; margin-left:10px;">🚨 Поръчай</button>
                                    ` : ''}
                                </div>
                            `).join('')}

                            ${item.warnings.map(w => `
                                <div style="display: flex; align-items: center; justify-content: space-between; background: #fffbeb; border: 1px solid #fef3c7; padding: 6px 12px; border-radius: 6px; font-size: 0.85em; color: #92400e;">
                                    <div><b>⚠️ ${w.title}:</b> ${w.desc}</div>
                                    ${w.type === 'missing_bom' ? `
                                        <button type="button" onclick="quickAddBomFromValidator('${item.code || item.name}')" style="background:#d97706; color:white; border:none; padding:4px 10px; border-radius:4px; font-weight:700; cursor:pointer; font-size:0.8em; white-space:nowrap; margin-left:10px;">➕ Добави BOM</button>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        });
    }

    html += `</div>`;
    content.innerHTML = html;
}

// Quick action helpers to bridge directly to forms
window.quickAddRouteFromValidator = function(detailName) {
    window.closePlanValidatorModal();
    switchTab('marshruti');
    setTimeout(() => {
        openAddModal();
        setTimeout(() => {
            const el = document.getElementById('inp_Код на детайла') || document.getElementById('inp_ID Детайл');
            if (el) el.value = detailName;
        }, 150);
    }, 100);
};

window.quickAddBomFromValidator = function(detailName) {
    window.closePlanValidatorModal();
    switchTab('bom');
    setTimeout(() => {
        openAddModal();
        setTimeout(() => {
            const el = document.getElementById('inp_ID Детайл') || document.getElementById('inp_Детайл');
            if (el) el.value = detailName;
        }, 150);
    }, 100);
};
