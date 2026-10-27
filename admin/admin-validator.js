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
            <div style="font-size: 0.85em; color: #94a3b8; margin-top: 5px;">Проверка на технологични маршрути, BOM състав, цехови детайли и склад материали</div>
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
        const [routesRes, bomRes, skladRes, invRes, nomRes] = await Promise.all([
            client.from('marshruti').select('*'),
            client.from('bom').select('*'),
            client.from('sklad').select('*'),
            client.from('inventory').select('*'),
            client.from('Номенклатура').select('*')
        ]);

        const routesData = routesRes.data || [];
        const bomData = bomRes.data || [];
        const skladData = skladRes.data || [];
        const invData = invRes.data || [];
        const nomData = nomRes.data || [];

        // Build Nomenclature mapping (Name <-> Code)
        const nomMap = {};
        nomData.forEach(n => {
            const code = String(n['ID Детайл'] || '').trim().toUpperCase();
            const name = String(n['Вътрешно име'] || '').trim().toUpperCase();
            if (code) nomMap[code] = n;
            if (name && !nomMap[name]) nomMap[name] = n;
        });

        // Group Marshruti by normalized detail code/name
        const marshrutiMap = {};
        routesData.forEach(r => {
            const code = String(r['Код на детайла'] || r['ID Детайл'] || '').trim().toUpperCase();
            if (!code) return;
            if (!marshrutiMap[code]) marshrutiMap[code] = [];
            marshrutiMap[code].push(r);
        });
        // Sort operations by operation number
        Object.keys(marshrutiMap).forEach(k => {
            marshrutiMap[k].sort((a,b) => (parseInt(a['№ Операция'])||0) - (parseInt(b['№ Операция'])||0));
        });

        // Group BOM by normalized parent code/name
        const bomMap = {};
        bomData.forEach(b => {
            const parent = String(b['ID Родител'] || b['ID Детайл'] || b['Детайл'] || b['Вътрешно име'] || '').trim().toUpperCase();
            if (!parent) return;
            if (!bomMap[parent]) bomMap[parent] = [];
            bomMap[parent].push(b);
        });

        // Map Sklad (Raw materials & purchased parts)
        const skladMap = {};
        skladData.forEach(s => {
            const itemCode = String(s['ID Детайл'] || s['Код'] || '').trim().toUpperCase();
            if (!itemCode) return;
            const qty = parseFloat(s['Остатък'] !== undefined && s['Остатък'] !== null ? s['Остатък'] : (s['Наличност'] || s['Количество'] || 0)) || 0;
            skladMap[itemCode] = (skladMap[itemCode] || 0) + qty;
        });

        // Map Inventory (WIP / shopfloor semi-finished products & buffers)
        const invMap = {};
        invData.forEach(item => {
            const itemCode = String(item['ID Детайл'] || item['Име'] || '').trim().toUpperCase();
            if (!itemCode) return;
            const freeQty = parseFloat(item['Свободни'] !== undefined && item['Свободни'] !== null ? item['Свободни'] : (item['Общо'] || 0)) || 0;
            invMap[itemCode] = (invMap[itemCode] || 0) + freeQty;
        });

        // Helper to find routes
        function findRoutesFor(code, name) {
            const upperC = (code || '').toUpperCase();
            const upperN = (name || '').toUpperCase();
            if (upperC && marshrutiMap[upperC]) return marshrutiMap[upperC];
            if (upperN && marshrutiMap[upperN]) return marshrutiMap[upperN];
            if (upperN && nomMap[upperN] && marshrutiMap[String(nomMap[upperN]['ID Детайл']).toUpperCase()]) {
                return marshrutiMap[String(nomMap[upperN]['ID Детайл']).toUpperCase()];
            }
            if (upperC && nomMap[upperC] && marshrutiMap[String(nomMap[upperC]['Вътрешно име']).toUpperCase()]) {
                return marshrutiMap[String(nomMap[upperC]['Вътрешно име']).toUpperCase()];
            }
            return [];
        }

        // Helper to find BOM
        function findBomsFor(code, name) {
            const upperC = (code || '').toUpperCase();
            const upperN = (name || '').toUpperCase();
            if (upperC && bomMap[upperC]) return bomMap[upperC];
            if (upperN && bomMap[upperN]) return bomMap[upperN];
            if (upperN && nomMap[upperN] && bomMap[String(nomMap[upperN]['ID Детайл']).toUpperCase()]) {
                return bomMap[String(nomMap[upperN]['ID Детайл']).toUpperCase()];
            }
            if (upperC && nomMap[upperC] && bomMap[String(nomMap[upperC]['Вътрешно име']).toUpperCase()]) {
                return bomMap[String(nomMap[upperC]['Вътрешно име']).toUpperCase()];
            }
            return [];
        }

        // 3. Analyze each detail in the plan
        validatorResults = plans.map(p => {
            const rawCode = String(p['ID Детайл'] || '').trim();
            const rawName = String(p['Вътрешно име'] || '').trim();
            const upperCode = rawCode.toUpperCase();
            const upperName = rawName.toUpperCase();
            const targetQty = parseFloat(p['Целево количество']) || 0;
            const status = String(p['Статус'] || 'Активен');

            // Find matching routes for main product
            const routes = findRoutesFor(upperCode, upperName);

            // Find matching BOM for main product
            const boms = findBomsFor(upperCode, upperName);

            const errors = [];
            const warnings = [];
            const inHouseParts = [];
            const warehouseMaterialsOk = [];
            const materialDeficits = [];

            // Check 1: Main product Route
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
                        desc: `${unassignedOps.length} оп. нямат посочена машина: ` + unassignedOps.map(o => o['Име на операция'] || o['Операция'] || 'Без име').join(', ')
                    });
                }
            }

            // Check 2: BOM Breakdown
            if (boms.length === 0) {
                // If it's a finished product or assembly, warn about missing BOM
                warnings.push({
                    type: 'missing_bom',
                    title: 'Няма въведен BOM',
                    desc: 'Липсва рецепта за вложени материали/заготовки.'
                });
            } else {
                // Check 3: Process BOM components
                boms.forEach(b => {
                    const compCode = String(b['ID Компонент'] || b['ID Съставна част'] || b['ID Материал'] || b['Съставна част'] || b['Материал'] || '').trim();
                    if (!compCode) return;
                    const compUpper = compCode.toUpperCase();
                    const ratio = parseFloat(b['Количество']) || 1;
                    const needed = Math.ceil(targetQty * ratio);

                    // Check if component has workshop routes or sub-BOM
                    const compRoutes = findRoutesFor(compUpper, compUpper);
                    const hasRoutes = compRoutes.length > 0;
                    const subBoms = findBomsFor(compUpper, compUpper);
                    const hasSubBom = subBoms.length > 0;
                    const isTrackedInSklad = skladMap[compUpper] !== undefined || (nomMap[compUpper] && skladMap[String(nomMap[compUpper]['ID Детайл']).toUpperCase()] !== undefined);

                    // Check shop buffer in inventory
                    const shopBuffer = invMap[compUpper] !== undefined ? invMap[compUpper] : 
                                      (nomMap[compUpper] && invMap[String(nomMap[compUpper]['ID Детайл']).toUpperCase()] !== undefined ? invMap[String(nomMap[compUpper]['ID Детайл']).toUpperCase()] : 0);

                    // Check warehouse stock in sklad
                    const skladStock = skladMap[compUpper] !== undefined ? skladMap[compUpper] : 
                                      (nomMap[compUpper] && skladMap[String(nomMap[compUpper]['ID Детайл']).toUpperCase()] !== undefined ? skladMap[String(nomMap[compUpper]['ID Детайл']).toUpperCase()] : 0);

                    // Differentiate in-house manufactured child detail vs warehouse material
                    const isChildPart = hasRoutes || hasSubBom || !isTrackedInSklad;

                    if (isChildPart) {
                        // In-house child detail (дете на резолвер / цехов детайл):
                        // Produced in the workshop according to routes! Not ordered from outside.
                        if (!hasRoutes && !hasSubBom) {
                            warnings.push({
                                type: 'missing_child_route',
                                title: `Съставен детайл: ${compCode}`,
                                desc: `Детайлът се влага като съставна част, но няма въведена маршрутна карта за изработка в цеха.`
                            });
                        }
                        inHouseParts.push({
                            code: compCode,
                            needed,
                            shopBuffer,
                            hasRoutes,
                            routesCount: compRoutes.length,
                            opsSummary: compRoutes.map(o => o['Име на операция'] || o['Операция']).filter(Boolean).slice(0, 3).join(' → ')
                        });
                    } else {
                        // Warehouse material / purchased standard part (лагери, крепежи, пръти):
                        if (skladStock < needed) {
                            const def = needed - skladStock;
                            materialDeficits.push({
                                code: compCode,
                                needed,
                                available: skladStock,
                                deficit: def
                            });
                            errors.push({
                                type: 'material_deficit',
                                title: `Дефицит в Склад Материали: ${compCode}`,
                                desc: `Нужни: ${needed} бр. | На склад: ${skladStock} бр. (Недостигат: ${def} бр.)`
                            });
                        } else {
                            warehouseMaterialsOk.push({
                                code: compCode,
                                needed,
                                available: skladStock
                            });
                        }
                    }
                });
            }

            // Overall rating:
            // Error only if main detail lacks route OR warehouse material is actually missing
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
                inHouseParts,
                warehouseMaterialsOk,
                materialDeficits,
                errors,
                warnings,
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
        subTitle = `Има детайли без маршрутна карта или с реален недостиг на изходни суровини в Склад Материали.`;
    } else if (warnsCount > 0) {
        headerTitle = `Няма блокиращи проблеми (${warnsCount} детайла с препоръки)`;
        subTitle = `${okCount} от ${total} позиции (${okPct}%) са напълно готови. Препоръките са за липсващ BOM или ненасочена машина.`;
    } else {
        headerTitle = `Планът е 100% готов за старт!`;
        subTitle = `Всички ${total} детайла са обезпечени с маршрутни карти и материали.`;
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
                        <div style="font-size: 0.75em; color: #b45309; font-weight: 700;">ПРЕПОРЪКИ</div>
                        <div style="font-size: 1.15em; font-weight: 800; color: #d97706;">${warnsCount}</div>
                    </div>
                    <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 6px 14px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 0.75em; color: #b91c1c; font-weight: 700;">БЛОКИРАЩИ</div>
                        <div style="font-size: 1.15em; font-weight: 800; color: #dc2626;">${errorsCount}</div>
                    </div>
                </div>
            </div>

            <!-- Health Progress Bar -->
            <div style="margin-top: 15px; background: #e2e8f0; height: 10px; border-radius: 5px; overflow: hidden; display: flex;">
                <div style="background: #10b981; width: ${total > 0 ? (okCount/total)*100 : 0}%; transition: width 0.3s;"></div>
                <div style="background: #f59e0b; width: ${total > 0 ? (warnsCount/total)*100 : 0}%; transition: width 0.3s;"></div>
                <div style="background: #ef4444; width: ${total > 0 ? (errorsCount/total)*100 : 0}%; transition: width 0.3s;"></div>
            </div>
        </div>

        <!-- Filter Buttons -->
        <div style="display: flex; gap: 8px; margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
            <button type="button" onclick="filterValidatorList('all')" style="padding: 6px 14px; border-radius: 6px; font-weight: 700; font-size: 0.85em; cursor: pointer; border: 1px solid ${currentValidatorFilter === 'all' ? '#2563eb' : '#cbd5e1'}; background: ${currentValidatorFilter === 'all' ? '#eff6ff' : 'white'}; color: ${currentValidatorFilter === 'all' ? '#1d4ed8' : '#64748b'};">Всички (${total})</button>
            <button type="button" onclick="filterValidatorList('error')" style="padding: 6px 14px; border-radius: 6px; font-weight: 700; font-size: 0.85em; cursor: pointer; border: 1px solid ${currentValidatorFilter === 'error' ? '#ef4444' : '#cbd5e1'}; background: ${currentValidatorFilter === 'error' ? '#fef2f2' : 'white'}; color: ${currentValidatorFilter === 'error' ? '#b91c1c' : '#64748b'};">Блокиращи (${errorsCount})</button>
            <button type="button" onclick="filterValidatorList('warn')" style="padding: 6px 14px; border-radius: 6px; font-weight: 700; font-size: 0.85em; cursor: pointer; border: 1px solid ${currentValidatorFilter === 'warn' ? '#f59e0b' : '#cbd5e1'}; background: ${currentValidatorFilter === 'warn' ? '#fffbeb' : 'white'}; color: ${currentValidatorFilter === 'warn' ? '#b45309' : '#64748b'};">Препоръки (${warnsCount})</button>
            <button type="button" onclick="filterValidatorList('ok')" style="padding: 6px 14px; border-radius: 6px; font-weight: 700; font-size: 0.85em; cursor: pointer; border: 1px solid ${currentValidatorFilter === 'ok' ? '#10b981' : '#cbd5e1'}; background: ${currentValidatorFilter === 'ok' ? '#f0fdf4' : 'white'}; color: ${currentValidatorFilter === 'ok' ? '#15803d' : '#64748b'};">Напълно готови (${okCount})</button>
        </div>

        <!-- Detail Cards List -->
        <div style="display: flex; flex-direction: column; gap: 12px;">
    `;

    if (items.length === 0) {
        html += `
            <div style="text-align: center; padding: 35px 20px; color: #64748b;">
                Няма детайли в избраната категория.
            </div>
        `;
    } else {
        items.forEach(item => {
            const isError = item.rating === 'error';
            const isWarn = item.rating === 'warn';
            const borderColor = isError ? '#fecaca' : (isWarn ? '#fef3c7' : '#bbf7d0');
            const bgColor = isError ? '#fffafb' : (isWarn ? '#fffdf7' : '#ffffff');
            const badgeBg = isError ? '#fee2e2' : (isWarn ? '#fef3c7' : '#dcfce7');
            const badgeColor = isError ? '#b91c1c' : (isWarn ? '#92400e' : '#166534');
            const badgeText = isError ? '🔴 БЛОКИРАЩ ПРОБЛЕМ' : (isWarn ? '🟡 ПРЕПОРЪКА' : '🟢 100% ГОТОВ ЗА СТАРТ');

            html += `
                <div style="background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 10px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.03); display: flex; flex-direction: column; gap: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <span style="font-weight: 800; font-size: 1.05em; color: #0f172a;">${item.name}</span>
                            ${item.code && item.code !== item.name ? `<span style="color: #64748b; font-size: 0.88em; margin-left: 6px;">(${item.code})</span>` : ''}
                            <span style="margin-left: 10px; background: #f1f5f9; color: #334155; font-weight: 700; padding: 2px 8px; border-radius: 6px; font-size: 0.82em;">План: ${item.targetQty} бр.</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            ${item.bomsCount > 0 ? `
                                <button type="button" onclick="openResolverTree('${item.code || item.name}')" style="background:#f1f5f9; color:#0284c7; border:1px solid #cbd5e1; padding:4px 10px; border-radius:6px; font-weight:700; cursor:pointer; font-size:0.8em;" title="Визуален състав и дърво на изделието">🌳 Състав (Резолвер)</button>
                            ` : ''}
                            <span style="background: ${badgeBg}; color: ${badgeColor}; font-weight: 800; font-size: 0.78em; padding: 4px 10px; border-radius: 12px; letter-spacing: 0.3px;">${badgeText}</span>
                        </div>
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
                            ${item.materialDeficits.length > 0 ? `
                                <span style="color:#dc2626; font-weight:bold;">🚨 Дефицит на склад: ${item.materialDeficits.length} позиции</span>
                            ` : (item.inHouseParts.length > 0 ? `
                                <span style="color:#0284c7; font-weight:bold;">⚙️ Цехови детайли: ${item.inHouseParts.length} бр.</span>
                            ` : `
                                <span style="color:#16a34a; font-weight:bold;">✅ Материали: На склад</span>
                            `)}
                        </div>
                    </div>

                    <!-- In-house child parts list (if any) -->
                    ${item.inHouseParts.length > 0 ? `
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; font-size: 0.84em; display: flex; flex-direction: column; gap: 6px;">
                            <div style="font-weight: 700; color: #475569; display: flex; justify-content: space-between; align-items: center;">
                                <span>🏭 Детайли за изработка в цеха (${item.inHouseParts.length}):</span>
                                <span style="font-size: 0.85em; color: #64748b; font-weight: normal;">Изработват се по маршрутни карти в цеха</span>
                            </div>
                            ${item.inHouseParts.map(p => `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 3px 0; border-bottom: 1px dashed #e2e8f0;">
                                    <div>
                                        <b style="color: #0f172a;">${p.code}</b> — ${p.needed} бр.
                                        <span style="color: #64748b; font-size: 0.9em; margin-left: 6px;">
                                            (${p.hasRoutes ? `⚙️ ${p.routesCount} оп.: ${p.opsSummary}` : '<span style="color:#d97706; font-weight:700;">⚠️ Липсва маршрут</span>'})
                                        </span>
                                    </div>
                                    <div>
                                        ${p.shopBuffer > 0 ? `
                                            <span style="color: #16a34a; font-weight: 700;">✅ Наличен буфер в цеха: ${p.shopBuffer} бр.</span>
                                        ` : `
                                            <span style="color: #0284c7; font-weight: 600;">🔧 За изработка по план</span>
                                        `}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}

                    <!-- Issues list (if any) -->
                    ${item.errors.length > 0 || item.warnings.length > 0 ? `
                        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 2px;">
                            ${item.errors.map(e => `
                                <div style="display: flex; align-items: center; justify-content: space-between; background: #fef2f2; border: 1px solid #fecaca; padding: 6px 12px; border-radius: 6px; font-size: 0.85em; color: #991b1b;">
                                    <div><b>❌ ${e.title}:</b> ${e.desc}</div>
                                    ${e.type === 'missing_route' ? `
                                        <button type="button" onclick="quickAddRouteFromValidator('${item.code || item.name}')" style="background:#dc2626; color:white; border:none; padding:4px 10px; border-radius:4px; font-weight:700; cursor:pointer; font-size:0.8em; white-space:nowrap; margin-left:10px;">➕ Добави Маршрут</button>
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
            const el = document.getElementById('inp_ID Родител') || document.getElementById('inp_ID Детайл') || document.getElementById('inp_Детайл');
            if (el) el.value = detailName;
        }, 150);
    }, 100);
};
