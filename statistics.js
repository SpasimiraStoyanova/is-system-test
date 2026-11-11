const SUPABASE_URL = 'https://zdythzcgcjxwbxufunuh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

google.charts.load('current', {'packages':['timeline']});
google.charts.setOnLoadCallback(init);

function getTodayString() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function init() {
    document.getElementById('date-from').value = getTodayString();
    document.getElementById('date-to').value = getTodayString();
    fetchAndRenderData();
}

let lastComputedStats = [];
let rawOtchetiData = [];
let currentNormsMap = {};
let currentViewMode = 'detail'; // 'detail' | 'operator'
let selectedOperator = 'ALL';

let currentSearchQuery = '';
let currentSearchScope = 'period'; // 'period' | 'all'
let isGlobalHistoryLoaded = false;
let globalPartHistoryData = [];
let searchDebounceTimer = null;

// Производствени толеранси за нормовремена
const TOLERANCE_FAST_RATIO = 0.70; // под 70% от нормата -> аномално бърз (⚡)
const TOLERANCE_SLOW_RATIO = 1.15; // до +15% над нормата -> в допустим толеранс (✓), над 115% -> забавяне (▲)

function normRouteKey(detail, operation) {
    const d = String(detail || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const op = String(operation || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return `${d}|${op}`;
}

function setViewMode(mode) {
    currentViewMode = mode;
    let btnDet = document.getElementById('btnViewDetail');
    let btnOp = document.getElementById('btnViewOperator');
    if (btnDet && btnOp) {
        if (mode === 'detail') {
            btnDet.style.background = '#38bdf8'; btnDet.style.color = '#0f172a';
            btnOp.style.background = '#334155'; btnOp.style.color = '#94a3b8';
        } else {
            btnOp.style.background = '#38bdf8'; btnOp.style.color = '#0f172a';
            btnDet.style.background = '#334155'; btnDet.style.color = '#94a3b8';
        }
    }
    renderCurrentView();
}

function applyOperatorFilter() {
    let opSelect = document.getElementById('operator-filter');
    selectedOperator = opSelect ? opSelect.value : 'ALL';
    renderCurrentView();
}

function setQuickDate(preset) {
    const fromEl = document.getElementById('date-from');
    const toEl = document.getElementById('date-to');
    const today = new Date();
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'today') {
        fromEl.value = fmt(today);
        toEl.value = fmt(today);
    } else if (preset === 'week') {
        let monday = new Date(today);
        let day = monday.getDay();
        let diff = monday.getDate() - day + (day === 0 ? -6 : 1);
        monday.setDate(diff);
        fromEl.value = fmt(monday);
        toEl.value = fmt(today);
    } else if (preset === 'month') {
        let firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        fromEl.value = fmt(firstDay);
        toEl.value = fmt(today);
    } else if (preset === 'all') {
        fromEl.value = '2024-01-01';
        toEl.value = fmt(today);
    }

    // Reset global search state if active so the date filter takes precedence
    if (isGlobalHistoryLoaded) {
        isGlobalHistoryLoaded = false;
        globalPartHistoryData = [];
        updateSearchBadge();
    }
    fetchAndRenderData();
}

async function fetchAndRenderData() {
    let dateFrom = document.getElementById('date-from').value;
    let dateTo = document.getElementById('date-to').value;
    
    if(!dateFrom || !dateTo) {
        alert("Моля, изберете дати!");
        return;
    }
    
    document.getElementById('loading').style.display = 'flex';
    
    // Convert to ISO range covering full days in UTC relative to local
    let startIso = new Date(dateFrom + 'T00:00:00').toISOString();
    let endIso = new Date(dateTo + 'T23:59:59').toISOString();
    
    try {
        const [otchetiRes, routesRes] = await Promise.all([
            client.from('otcheti')
                  .select('*')
                  .eq('Статус', 'Отчетено')
                  .gte('Дата', startIso)
                  .lte('Дата', endIso)
                  .order('Дата', {ascending: true}),
            client.from('marshruti')
                  .select('*')
                  .limit(100000)
        ]);
        if (otchetiRes.error) throw otchetiRes.error;
        if (routesRes.error) console.warn("Грешка при зареждане на маршрутни карти:", routesRes.error);

        currentNormsMap = {};
        if (routesRes.data) {
            routesRes.data.forEach(r => {
                const norm = parseFloat(r['Норма (мин/бр)']);
                if (!isNaN(norm) && norm > 0) {
                    const rawCode = String(r['Код на детайла'] || '').trim();
                    const rawOp = String(r['Име на операция'] || '').trim();
                    currentNormsMap[`${rawCode}|${rawOp}`] = norm;
                    currentNormsMap[normRouteKey(rawCode, rawOp)] = norm;
                }
            });
        }
        
        rawOtchetiData = otchetiRes.data || [];
        isGlobalHistoryLoaded = false;
        globalPartHistoryData = [];

        // Обновяване на списъка със служители в падащото меню
        let opSelect = document.getElementById('operator-filter');
        let currentSelected = opSelect ? opSelect.value : 'ALL';
        let uniqueOps = [...new Set(rawOtchetiData.map(r => String(r['Оператор'] || 'Неизвестен').trim()).filter(Boolean))].sort();

        let opHtml = '<option value="ALL">Всички служители</option>';
        uniqueOps.forEach(op => {
            let sel = (op === currentSelected) ? 'selected' : '';
            opHtml += `<option value="${op}" ${sel}>${op}</option>`;
        });
        if (opSelect) {
            opSelect.innerHTML = opHtml;
            selectedOperator = opSelect.value;
        }

        updateSearchBadge();
        renderCurrentView();
    } catch(err) {
        alert("Грешка при зареждане на данните: " + err.message);
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

// --- DETAIL SEARCH & HISTORY SCOPE ---

function onDetailSearchInput() {
    const input = document.getElementById('detailSearchInput');
    const val = input ? input.value.trim() : '';
    const clearBtn = document.getElementById('btnClearSearch');
    if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';

    currentSearchQuery = val;
    clearTimeout(searchDebounceTimer);

    if (currentSearchScope === 'period') {
        isGlobalHistoryLoaded = false;
        globalPartHistoryData = [];
        updateSearchBadge();
        renderCurrentView();
    } else {
        if (!val) {
            isGlobalHistoryLoaded = false;
            globalPartHistoryData = [];
            updateSearchBadge();
            renderCurrentView();
        } else {
            searchDebounceTimer = setTimeout(() => {
                executeDetailSearch();
            }, 400);
        }
    }
}

function setSearchScope(scope) {
    currentSearchScope = scope;
    const btnPeriod = document.getElementById('btnScopePeriod');
    const btnAll = document.getElementById('btnScopeAll');
    if (btnPeriod && btnAll) {
        if (scope === 'period') {
            btnPeriod.style.background = '#38bdf8'; btnPeriod.style.color = '#0f172a';
            btnAll.style.background = 'transparent'; btnAll.style.color = '#94a3b8';
        } else {
            btnAll.style.background = '#38bdf8'; btnAll.style.color = '#0f172a';
            btnPeriod.style.background = 'transparent'; btnPeriod.style.color = '#94a3b8';
        }
    }

    if (currentSearchQuery) {
        if (scope === 'all') {
            executeDetailSearch();
        } else {
            isGlobalHistoryLoaded = false;
            globalPartHistoryData = [];
            updateSearchBadge();
            renderCurrentView();
        }
    } else {
        updateSearchBadge();
        renderCurrentView();
    }
}

async function executeDetailSearch() {
    const input = document.getElementById('detailSearchInput');
    const val = input ? input.value.trim() : '';
    currentSearchQuery = val;
    if (!val) {
        clearDetailSearch();
        return;
    }

    if (currentSearchScope === 'all') {
        await fetchPartAllHistory(val);
    } else {
        isGlobalHistoryLoaded = false;
        globalPartHistoryData = [];
        updateSearchBadge();
        renderCurrentView();
    }
}

async function fetchPartAllHistory(query) {
    const loader = document.getElementById('loading');
    if (loader) loader.style.display = 'flex';
    try {
        const [otchetiRes, routesRes] = await Promise.all([
            client.from('otcheti')
                  .select('*')
                  .eq('Статус', 'Отчетено')
                  .ilike('ID Детайл', `%${query}%`)
                  .order('Дата', { ascending: true }),
            client.from('marshruti')
                  .select('*')
                  .limit(100000)
        ]);
        if (otchetiRes.error) throw otchetiRes.error;
        if (routesRes.error) console.warn("Грешка при зареждане на маршрутни карти:", routesRes.error);

        if (routesRes.data) {
            routesRes.data.forEach(r => {
                const norm = parseFloat(r['Норма (мин/бр)']);
                if (!isNaN(norm) && norm > 0) {
                    const rawCode = String(r['Код на детайла'] || '').trim();
                    const rawOp = String(r['Име на операция'] || '').trim();
                    currentNormsMap[`${rawCode}|${rawOp}`] = norm;
                    currentNormsMap[normRouteKey(rawCode, rawOp)] = norm;
                }
            });
        }

        globalPartHistoryData = otchetiRes.data || [];
        isGlobalHistoryLoaded = true;

        // Update operator filter to show who worked on this part
        let opSelect = document.getElementById('operator-filter');
        let currentSelected = opSelect ? opSelect.value : 'ALL';
        let uniqueOps = [...new Set(globalPartHistoryData.map(r => String(r['Оператор'] || 'Неизвестен').trim()).filter(Boolean))].sort();

        let opHtml = '<option value="ALL">Всички служители</option>';
        uniqueOps.forEach(op => {
            let sel = (op === currentSelected) ? 'selected' : '';
            opHtml += `<option value="${op}" ${sel}>${op}</option>`;
        });
        if (opSelect) {
            opSelect.innerHTML = opHtml;
            selectedOperator = opSelect.value;
        }

        updateSearchBadge();
        renderCurrentView();
    } catch (err) {
        alert('Грешка при зареждане на историята: ' + err.message);
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function clearDetailSearch() {
    currentSearchQuery = '';
    isGlobalHistoryLoaded = false;
    globalPartHistoryData = [];
    const input = document.getElementById('detailSearchInput');
    if (input) input.value = '';
    const clearBtn = document.getElementById('btnClearSearch');
    if (clearBtn) clearBtn.style.display = 'none';

    // Restore operators list from rawOtchetiData
    let opSelect = document.getElementById('operator-filter');
    let currentSelected = opSelect ? opSelect.value : 'ALL';
    let uniqueOps = [...new Set(rawOtchetiData.map(r => String(r['Оператор'] || 'Неизвестен').trim()).filter(Boolean))].sort();
    let opHtml = '<option value="ALL">Всички служители</option>';
    uniqueOps.forEach(op => {
        let sel = (op === currentSelected) ? 'selected' : '';
        opHtml += `<option value="${op}" ${sel}>${op}</option>`;
    });
    if (opSelect) {
        opSelect.innerHTML = opHtml;
        selectedOperator = opSelect.value;
    }

    updateSearchBadge();
    renderCurrentView();
}

function quickFilterByDetail(detailName) {
    const input = document.getElementById('detailSearchInput');
    if (input) input.value = detailName;
    const clearBtn = document.getElementById('btnClearSearch');
    if (clearBtn) clearBtn.style.display = 'block';
    currentSearchQuery = detailName;

    if (currentSearchScope === 'all') {
        executeDetailSearch();
    } else {
        isGlobalHistoryLoaded = false;
        globalPartHistoryData = [];
        updateSearchBadge();
        renderCurrentView();
    }
}

function updateSearchBadge() {
    const badge = document.getElementById('searchBadgeInfo');
    const badgeText = document.getElementById('searchBadgeText');
    if (!badge || !badgeText) return;

    if (!currentSearchQuery) {
        badge.style.display = 'none';
        return;
    }

    badge.style.display = 'flex';
    if (isGlobalHistoryLoaded) {
        badgeText.innerHTML = `🌐 Цялата история за <b>"${currentSearchQuery}"</b> (${globalPartHistoryData.length} отчитания от старта на системата)`;
    } else {
        badgeText.innerHTML = `📅 Резултати в избрания период за <b>"${currentSearchQuery}"</b>`;
    }
}

// --- RENDER VIEW ---

function renderCurrentView() {
    let data = isGlobalHistoryLoaded ? globalPartHistoryData : rawOtchetiData;

    // Филтър по служител
    if (selectedOperator && selectedOperator !== 'ALL') {
        data = data.filter(r => String(r['Оператор'] || '').trim() === selectedOperator);
    }

    // Текстово филтриране в рамките на периода (ако не сме в режим пълна история)
    if (!isGlobalHistoryLoaded && currentSearchQuery) {
        const q = currentSearchQuery.toLowerCase();
        data = data.filter(r => {
            const det = String(r['ID Детайл'] || '').toLowerCase();
            const op = String(r['Операция'] || '').toLowerCase();
            return det.includes(q) || op.includes(q);
        });
    }

    let totalQty = 0;
    let totalDurationMs = 0;
    let aggregatedStats = {};
    let timelineData = [];

    data.forEach(row => {
        let opName = String(row['Оператор'] || 'Неизвестен').trim();
        let detail = row['ID Детайл'] || '-';
        let operation = row['Операция'] || '-';
        let qty = parseFloat(row['Количество']) || 0;
        
        let dateStr = row['Дата'];
        if (dateStr && !dateStr.endsWith('Z')) dateStr += 'Z';
        let endTime = new Date(dateStr);
        
        let startStr = row['Време Старт'];
        if (startStr && !startStr.endsWith('Z')) startStr += 'Z';
        let startTime = startStr ? new Date(startStr) : null;
        
        let durationMs = 0;
        let durationMin = 0;
        let durationText = '-';
        
        if(startTime && endTime > startTime) {
            durationMs = endTime.getTime() - startTime.getTime();
            durationMin = Math.floor(durationMs / 60000);
            
            let hLabel = Math.floor(durationMin / 60);
            let mLabel = durationMin % 60;
            if(hLabel > 0) durationText = `${hLabel}ч. ${mLabel}м.`;
            else durationText = `${mLabel} мин.`;
            
            let taskLabel = `${detail} (${operation})`;
            let dateFormatted = `${endTime.getDate().toString().padStart(2, '0')}.${(endTime.getMonth()+1).toString().padStart(2, '0')}.${endTime.getFullYear()}`;
            
            let itemNormKey = normRouteKey(detail, operation);
            let itemNormVal = currentNormsMap[`${detail}|${operation}`] || currentNormsMap[itemNormKey] || null;
            let itemAvgNumber = (qty > 0 && durationMs > 0) ? (durationMs / 60000) / qty : null;
            let normInfoHtml = '';
            if (itemNormVal && itemAvgNumber !== null) {
                if (itemAvgNumber < itemNormVal * TOLERANCE_FAST_RATIO) {
                    normInfoHtml = `<br><span style="color:#facc15; font-weight:800;">⚡ Аномална скорост: ${itemAvgNumber.toFixed(1)} мин/бр (Норма: ${itemNormVal} мин)</span>`;
                } else if (itemAvgNumber <= itemNormVal * TOLERANCE_SLOW_RATIO) {
                    normInfoHtml = `<br><span style="color:#86efac;">✓ В нормата (с толеранс): ${itemAvgNumber.toFixed(1)} мин/бр (Норма: ${itemNormVal} мин)</span>`;
                } else {
                    normInfoHtml = `<br><span style="color:#fca5a5;">▲ Забавяне над толеранса: ${itemAvgNumber.toFixed(1)} мин/бр (Норма: ${itemNormVal} мин)</span>`;
                }
            } else if (itemNormVal) {
                normInfoHtml = `<br><span style="color:#94a3b8;">Норма: ${itemNormVal} мин/бр</span>`;
            }

            // Custom HTML Tooltip for Timeline
            let tooltip = `
                <div style="padding:10px; font-family:'Sofia Sans',sans-serif; background:#334155; color:#f8fafc; border:1px solid #475569; border-radius:4px;">
                    <strong style="color:#38bdf8;">${taskLabel}</strong><br>
                    <span style="color:#94a3b8;">Дата:</span> ${dateFormatted}<br>
                    <span style="color:#94a3b8;">Оператор:</span> ${opName}<br>
                    <span style="color:#94a3b8;">Количество:</span> <strong style="color:#10b981;">${qty} бр.</strong><br>
                    <span style="color:#94a3b8;">Начало:</span> ${startTime.toLocaleTimeString()}<br>
                    <span style="color:#94a3b8;">Край:</span> ${endTime.toLocaleTimeString()}<br>
                    <span style="color:#94a3b8;">Продължителност:</span> <strong style="color:#f59e0b;">${durationText}</strong>${normInfoHtml}
                </div>
            `;
            
            timelineData.push([
                opName, 
                taskLabel, 
                tooltip, 
                startTime, 
                endTime
            ]);
        }
        
        totalQty += qty;
        totalDurationMs += durationMs;
        
        let statKey = (currentViewMode === 'operator') 
            ? `${opName}|||${detail}|||${operation}`
            : `${detail}|||${operation}`;

        if(!aggregatedStats[statKey]) {
            aggregatedStats[statKey] = {
                operator: opName,
                detail: detail,
                operation: operation,
                qty: 0,
                durationMs: 0
            };
        }
        aggregatedStats[statKey].qty += qty;
        aggregatedStats[statKey].durationMs += durationMs;
    });

    // Update Table Header
    let thead = document.getElementById('summary-thead');
    if (thead) {
        if (currentViewMode === 'operator') {
            thead.innerHTML = `
                <tr>
                    <th>Служител</th>
                    <th>Детайл</th>
                    <th>Операция</th>
                    <th>Бройки</th>
                    <th>Общо време</th>
                    <th>Средно / Норма</th>
                </tr>
            `;
        } else {
            thead.innerHTML = `
                <tr>
                    <th>Детайл</th>
                    <th>Операция</th>
                    <th>Бройки</th>
                    <th>Общо време</th>
                    <th>Средно / Норма</th>
                </tr>
            `;
        }
    }

    // Render Summary Table
    let tbody = document.getElementById('summary-tbody');
    tbody.innerHTML = '';
    lastComputedStats = [];
    
    let keys = Object.keys(aggregatedStats);
    if (keys.length === 0) {
        let msg = currentSearchQuery 
            ? `Няма намерени отчитания за детайл "${currentSearchQuery}".`
            : `Няма намерени отчитания за избрания период.`;
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:#94a3b8; font-style:italic;">${msg}</td></tr>`;
    }

    for(let key in aggregatedStats) {
        let stat = aggregatedStats[key];
        
        let tMin = Math.floor(stat.durationMs / 60000);
        let th = Math.floor(tMin / 60);
        let tm = tMin % 60;
        let timeStr = '-';
        if (tMin > 0) {
            timeStr = th > 0 ? `${th}ч. ${tm}м.` : `${tm} мин.`;
        }

        let avgMinStr = '-';
        let avgNumber = null;
        let normKey = normRouteKey(stat.detail, stat.operation);
        let normVal = currentNormsMap[`${stat.detail}|${stat.operation}`] 
                   || currentNormsMap[normKey] 
                   || null;
        let isTooFast = false;

        if (stat.qty > 0 && stat.durationMs > 0) {
            avgNumber = (stat.durationMs / 60000) / stat.qty;
            avgMinStr = `${avgNumber.toFixed(1)} мин/бр`;
            if (normVal) {
                if (avgNumber < normVal * TOLERANCE_FAST_RATIO) {
                    isTooFast = true;
                    const speedRatio = Math.round((normVal / avgNumber) * 100);
                    avgMinStr += ` <span style="background:#78350f; color:#fef08a; border:1px solid #eab308; padding:2px 7px; border-radius:5px; font-size:0.82em; font-weight:800; margin-left:6px; display:inline-block; vertical-align:middle; cursor:help;" title="⚠️ АНОМАЛНА СКОРОСТ (${speedRatio}% от нормата)! Изработено за ${avgNumber.toFixed(1)} мин/бр при норма ${normVal} мин/бр (под ${Math.round(TOLERANCE_FAST_RATIO * 100)}%).">⚡ ${normVal} мин (Твърде бърз!)</span>`;
                } else if (avgNumber <= normVal * TOLERANCE_SLOW_RATIO) {
                    const maxAllowed = (normVal * TOLERANCE_SLOW_RATIO).toFixed(1);
                    avgMinStr += ` <span style="background:#14532d; color:#86efac; border:1px solid #22c55e; padding:2px 6px; border-radius:4px; font-size:0.85em; font-weight:bold; margin-left:4px; display:inline-block; vertical-align:middle; cursor:help;" title="✓ В допустимия толеранс: ${avgNumber.toFixed(1)} мин/бр (Норма: ${normVal} мин, толеранс до ${maxAllowed} мин)">✓ ${normVal} мин</span>`;
                } else {
                    const diffPct = Math.round(((avgNumber - normVal) / normVal) * 100);
                    const maxAllowed = (normVal * TOLERANCE_SLOW_RATIO).toFixed(1);
                    avgMinStr += ` <span style="background:#7f1d1d; color:#fca5a5; border:1px solid #ef4444; padding:2px 6px; border-radius:4px; font-size:0.85em; font-weight:bold; margin-left:4px; display:inline-block; vertical-align:middle; cursor:help;" title="▲ Забавяне над допустимия толеранс (+${diffPct}% над нормата! Норма: ${normVal} мин, допустимо до ${maxAllowed} мин)">▲ ${normVal} мин</span>`;
                }
            }
        } else if (normVal) {
            avgMinStr = `<span style="color:#94a3b8; font-size:0.9em;" title="Няма засечено времетраене, зададена норма: ${normVal} мин/бр">- (Норма: ${normVal} мин)</span>`;
        }

        let exportRow = {};
        if (currentViewMode === 'operator') {
            exportRow['Служител'] = stat.operator;
        }
        exportRow['Детайл'] = stat.detail;
        exportRow['Операция'] = stat.operation;
        exportRow['Количество (бр.)'] = stat.qty;
        exportRow['Общо време'] = timeStr;
        exportRow['Средно време (мин/бр)'] = avgNumber ? parseFloat(avgNumber.toFixed(2)) : '';
        exportRow['Норма (мин/бр)'] = normVal || '';
        if (isTooFast) {
            exportRow['Статус'] = `⚡ Твърде бърз (${Math.round((normVal / avgNumber) * 100)}%)`;
        } else if (avgNumber && normVal && avgNumber <= normVal * TOLERANCE_SLOW_RATIO) {
            exportRow['Статус'] = 'В нормата (с толеранс)';
        } else if (avgNumber && normVal) {
            exportRow['Статус'] = `Забавяне (+${Math.round(((avgNumber - normVal) / normVal) * 100)}%)`;
        } else {
            exportRow['Статус'] = '';
        }
        lastComputedStats.push(exportRow);
        
        let tr = document.createElement('tr');
        if (isTooFast) {
            tr.style.background = 'rgba(234, 179, 8, 0.05)';
        }
        let safeDet = stat.detail.replace(/'/g, "\\'");
        let detailHtml = `<strong style="cursor:pointer; color:#f8fafc; transition:color 0.15s;" onmouseover="this.style.color='#38bdf8'" onmouseout="this.style.color='#f8fafc'" onclick="quickFilterByDetail('${safeDet}')" title="Кликни за бързо филтриране по този детайл">${stat.detail}</strong>`;
        let cellHighlight = isTooFast ? 'background:rgba(234, 179, 8, 0.12); border-left:3px solid #eab308; padding-left:8px;' : '';

        if (currentViewMode === 'operator') {
            tr.innerHTML = `
                <td><strong style="color:#38bdf8;">${stat.operator}</strong></td>
                <td>${detailHtml}</td>
                <td>${stat.operation}</td>
                <td style="color:#10b981; font-weight:900;">${stat.qty} бр.</td>
                <td style="color:#f59e0b; font-weight:600;">${timeStr}</td>
                <td style="font-weight:700; ${cellHighlight}">${avgMinStr}</td>
            `;
        } else {
            tr.innerHTML = `
                <td>${detailHtml}</td>
                <td>${stat.operation}</td>
                <td style="color:#10b981; font-weight:900;">${stat.qty} бр.</td>
                <td style="color:#f59e0b; font-weight:600;">${timeStr}</td>
                <td style="font-weight:700; ${cellHighlight}">${avgMinStr}</td>
            `;
        }
        tbody.appendChild(tr);
    }
    
    // Render Timeline
    renderTimeline(timelineData);
}

function exportStatsToExcel() {
    if (!lastComputedStats || lastComputedStats.length === 0) {
        alert("Няма данни за експорт!");
        return;
    }
    if (typeof XLSX === 'undefined') {
        alert("XLSX библиотеката не е заредена.");
        return;
    }
    let dateFrom = document.getElementById('date-from').value;
    let dateTo = document.getElementById('date-to').value;
    let suffix = currentSearchQuery ? `_${currentSearchQuery.replace(/[^a-zA-Z0-9а-яА-Я]/g, '_')}` : '';
    if (isGlobalHistoryLoaded) suffix += '_ALL_HISTORY';
    const ws = XLSX.utils.json_to_sheet(lastComputedStats);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Справка Нормовремена");
    XLSX.writeFile(wb, `IS_SYSTEM_Normovremena_${dateFrom}_${dateTo}${suffix}.xlsx`);
}

function renderTimeline(timelineData) {
    var container = document.getElementById('timeline-div');
    if (timelineData.length === 0) {
        container.innerHTML = '<div style="padding:20px; color:#94a3b8; text-align:center;">Няма данни с отчетено време (Време Старт) за този период.</div>';
        return;
    }
    
    container.innerHTML = '';
    var chart = new google.visualization.Timeline(container);
    var dataTable = new google.visualization.DataTable();
    
    dataTable.addColumn({ type: 'string', id: 'Оператор' });
    dataTable.addColumn({ type: 'string', id: 'Задача' });
    dataTable.addColumn({ type: 'string', role: 'tooltip', p: {'html': true} });
    dataTable.addColumn({ type: 'date', id: 'Старт' });
    dataTable.addColumn({ type: 'date', id: 'Край' });
    
    dataTable.addRows(timelineData);
    
    let uniqueOps = new Set(timelineData.map(d => d[0])).size;
    let chartHeight = Math.max(200, (uniqueOps * 60) + 80);
    
    let minDate = new Date(Math.min(...timelineData.map(d => d[3].getTime())));
    let maxDate = new Date(Math.max(...timelineData.map(d => d[4].getTime())));
    
    let diffMs = maxDate - minDate;
    if (diffMs < 4 * 60 * 60 * 1000) {
        let padding = (4 * 60 * 60 * 1000 - diffMs) / 2;
        minDate = new Date(minDate.getTime() - padding);
        maxDate = new Date(maxDate.getTime() + padding);
        diffMs = maxDate - minDate;
    }
    
    let hours = diffMs / (1000 * 60 * 60);
    container.style.minWidth = `max(100%, ${Math.floor(hours * 150)}px)`;
    
    var options = {
        backgroundColor: '#1e293b',
        timeline: { 
            rowLabelStyle: {fontName: 'Sofia Sans', fontSize: 14, color: '#cbd5e1' },
            barLabelStyle: { fontName: 'Sofia Sans', fontSize: 12 }
        },
        hAxis: {
            minValue: minDate,
            maxValue: maxDate,
            format: 'HH:mm'
        },
        tooltip: { isHtml: true },
        height: chartHeight
    };
    
    chart.draw(dataTable, options);
}
