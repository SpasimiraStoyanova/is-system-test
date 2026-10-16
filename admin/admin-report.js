// ============================================================
// IS-SYSTEMS Executive Periodic Report & Daily/Weekly Summary
// ============================================================

let currentReportPeriod = 'week'; // 'today', 'week', 'month', 'custom'
let customReportStart = '';
let customReportEnd = '';

let reportCachedData = null;

function openExecutiveReportModal() {
    const backdrop = document.getElementById('reportModalBackdrop');
    if (!backdrop) return;
    backdrop.style.display = 'flex';
    setReportPeriod(currentReportPeriod || 'week');
}

function closeExecutiveReportModal() {
    const backdrop = document.getElementById('reportModalBackdrop');
    if (backdrop) backdrop.style.display = 'none';
}

function setReportPeriod(period) {
    currentReportPeriod = period;
    const now = new Date();
    
    // Calculate dates
    let startDate = new Date();
    let endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (period === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    } else if (period === 'week') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        startDate.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    } else if (period === 'custom') {
        const sVal = document.getElementById('reportCustomStart')?.value;
        const eVal = document.getElementById('reportCustomEnd')?.value;
        if (sVal) startDate = new Date(sVal + 'T00:00:00');
        if (eVal) endDate = new Date(eVal + 'T23:59:59');
    }

    loadAndRenderExecutiveReport(startDate, endDate);
}

async function loadAndRenderExecutiveReport(startDate, endDate) {
    const contentEl = document.getElementById('reportModalContent');
    if (!contentEl) return;

    contentEl.innerHTML = `
        <div style="text-align:center; padding: 50px 20px; color:#64748b;">
            <div style="font-size: 2.5em; margin-bottom: 12px; animation: spin 1s infinite linear;">⚙️</div>
            <div style="font-size: 1.2em; font-weight: 800; color:#1e293b;">Генериране на сводка и отчет...</div>
            <div style="font-size: 0.9em; margin-top: 5px;">Обобщаване на отчети за производство, брак, складови наличности и сервизни събития</div>
        </div>
    `;

    try {
        const startIso = startDate.toISOString();
        const endIso = endDate.toISOString();
        const nowIso = new Date().toISOString();
        const next7DaysIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Fetch data in parallel
        const [otchetiRes, skladRes, invRes, eventsRes, persRes] = await Promise.all([
            client.from('otcheti').select('*').gte('Дата', startIso).lte('Дата', endIso).order('Дата', { ascending: false }).limit(20000),
            client.from('sklad').select('*').limit(20000),
            client.from('inventory').select('*').limit(20000),
            client.from('factory_events').select('*').limit(20000),
            client.from('personal').select('Имейл, Име, Длъжност').limit(500)
        ]);

        const otcheti = otchetiRes.data || [];
        const sklad = skladRes.data || [];
        const inventory = invRes.data || [];
        const events = eventsRes.data || [];
        const personal = persRes.data || [];

        // Personal mapping
        const nameMap = {};
        personal.forEach(p => {
            if (p['Имейл']) nameMap[p['Имейл'].trim().toLowerCase()] = p['Име'] || p['Имейл'];
        });

        // 1. Production KPIs
        let totalProducedQty = 0;
        let totalScrapQty = 0;
        let totalReportsCount = otcheti.length;
        const activeOperatorsSet = new Set();
        const itemStats = {}; // { 'Part': { code, produced, scrap, ops: Set, lastDate } }
        const operatorStats = {}; // { 'Operator': { name, produced, scrap, count } }

        otcheti.forEach(r => {
            const opName = String(r['Оператор'] || 'Неизвестен').trim();
            activeOperatorsSet.add(opName);

            const part = String(r['ID Детайл'] || 'Н/А').trim();
            const qty = parseFloat(r['Количество']) || 0;
            const status = String(r['Статус'] || '').trim();
            const operation = String(r['Операция'] || '').trim();
            const isScrap = status === 'Брак' || operation.toLowerCase().includes('брак');

            if (isScrap) {
                totalScrapQty += qty;
            } else {
                totalProducedQty += qty;
            }

            // Item stats
            if (!itemStats[part]) {
                itemStats[part] = { code: part, produced: 0, scrap: 0, ops: new Set(), lastDate: r['Дата'] };
            }
            if (isScrap) {
                itemStats[part].scrap += qty;
            } else {
                itemStats[part].produced += qty;
            }
            if (operation) itemStats[part].ops.add(operation);

            // Operator stats
            if (!operatorStats[opName]) {
                operatorStats[opName] = { name: opName, produced: 0, scrap: 0, count: 0 };
            }
            operatorStats[opName].count += 1;
            if (isScrap) {
                operatorStats[opName].scrap += qty;
            } else {
                operatorStats[opName].produced += qty;
            }
        });

        const totalWorkQty = totalProducedQty + totalScrapQty;
        const scrapPercentage = totalWorkQty > 0 ? ((totalScrapQty / totalWorkQty) * 100).toFixed(1) : '0.0';

        // 2. Critical Inventory & Deficits
        const criticalMaterials = [];
        sklad.forEach(s => {
            const stock = parseFloat(s['Остатък']) || 0;
            const minStock = parseFloat(s['Минимално количество']) || 0;
            if (minStock > 0 && stock <= minStock) {
                criticalMaterials.push({
                    type: 'Материал',
                    code: s['ID Детайл'],
                    stock: stock,
                    minStock: minStock,
                    deficit: Math.max(0, minStock - stock),
                    unit: s['Мерна единица'] || 'бр.'
                });
            }
        });

        const criticalParts = [];
        inventory.forEach(inv => {
            const stock = parseFloat(inv['Общо']) || 0;
            const minStock = parseFloat(inv['Минимално количество/Буфер']) || 0;
            if (minStock > 0 && stock < minStock) {
                criticalParts.push({
                    type: 'Детайл/Полуфабрикат',
                    code: inv['ID Детайл'],
                    stock: stock,
                    minStock: minStock,
                    deficit: Math.max(0, minStock - stock),
                    unit: 'бр.'
                });
            }
        });

        const totalCriticalAlerts = criticalMaterials.length + criticalParts.length;

        // 3. Maintenance Events
        const todayStr = new Date().toISOString().split('T')[0];
        const upcomingEvents = events.filter(e => {
            if (e.status === 'completed') return false;
            const eDate = e.event_date;
            // Overdue or due in next 7 days
            return eDate && eDate <= next7DaysIso;
        }).sort((a, b) => a.event_date.localeCompare(b.event_date));

        reportCachedData = {
            startDate,
            endDate,
            totalProducedQty,
            totalScrapQty,
            scrapPercentage,
            totalReportsCount,
            activeOperatorsCount: activeOperatorsSet.size,
            itemStats: Object.values(itemStats).sort((a, b) => b.produced - a.produced),
            operatorStats: Object.values(operatorStats).sort((a, b) => b.produced - a.produced),
            criticalMaterials,
            criticalParts,
            totalCriticalAlerts,
            upcomingEvents
        };

        renderReportUI(reportCachedData);

    } catch (err) {
        console.error('Error generating report:', err);
        contentEl.innerHTML = `
            <div style="color:#dc2626; text-align:center; padding:30px; background:#fef2f2; border-radius:8px;">
                <div style="font-size:1.4em; font-weight:800; margin-bottom:8px;">⚠️ Грешка при генериране на отчета</div>
                <div>${err.message || err}</div>
            </div>
        `;
    }
}

function renderReportUI(data) {
    const contentEl = document.getElementById('reportModalContent');
    if (!contentEl) return;

    const startFormatted = data.startDate.toLocaleDateString('bg-BG');
    const endFormatted = data.endDate.toLocaleDateString('bg-BG');

    contentEl.innerHTML = `
        <div class="report-container">
            <!-- Period & Action Controls -->
            <div class="report-controls-bar">
                <div class="report-period-pills">
                    <button class="report-pill-btn ${currentReportPeriod === 'today' ? 'active' : ''}" onclick="setReportPeriod('today')">📅 Днес</button>
                    <button class="report-pill-btn ${currentReportPeriod === 'week' ? 'active' : ''}" onclick="setReportPeriod('week')">🗓️ Последните 7 дни</button>
                    <button class="report-pill-btn ${currentReportPeriod === 'month' ? 'active' : ''}" onclick="setReportPeriod('month')">📆 Този месец</button>
                    <button class="report-pill-btn ${currentReportPeriod === 'custom' ? 'active' : ''}" onclick="toggleCustomReportDates()">⚙️ Персонализиран</button>
                </div>
                <div class="report-actions-group">
                    <button class="btn-primary" onclick="copyReportSummaryToClipboard()" style="background:#0284c7; padding:6px 12px; font-size:0.85em;" title="Копирай структуриран текст за съобщения">
                        📋 Копирай за Viber / Имейл
                    </button>
                    <button class="btn-primary" onclick="sendReportPushNotification()" style="background:#f59e0b; padding:6px 12px; font-size:0.85em;" title="Изпрати Push известие през OneSignal">
                        📲 Изпрати Push
                    </button>
                    <button class="btn-primary" onclick="exportReportToExcel()" style="background:#059669; padding:6px 12px; font-size:0.85em;" title="Свали като Excel файл">
                        📊 Excel (.xlsx)
                    </button>
                    <button class="btn-primary" onclick="window.print()" style="background:#475569; padding:6px 12px; font-size:0.85em;" title="Принтирай отчета">
                        🖨️ Печат
                    </button>
                </div>
            </div>

            <div id="reportCustomDatesRow" style="display:${currentReportPeriod === 'custom' ? 'flex' : 'none'}; gap:12px; align-items:center; background:#ffffff; padding:10px 16px; border-radius:8px; border:1px solid #cbd5e1; margin-top:-6px;">
                <label style="font-weight:bold; font-size:0.9em; color:#334155;">От дата:</label>
                <input type="date" id="reportCustomStart" class="form-input" style="width:auto; padding:5px 8px;" value="${data.startDate.toISOString().split('T')[0]}">
                <label style="font-weight:bold; font-size:0.9em; color:#334155;">До дата:</label>
                <input type="date" id="reportCustomEnd" class="form-input" style="width:auto; padding:5px 8px;" value="${data.endDate.toISOString().split('T')[0]}">
                <button class="btn-primary" onclick="setReportPeriod('custom')" style="padding:6px 14px; font-size:0.85em;">Приложи</button>
            </div>

            <!-- Header Title -->
            <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #e2e8f0; padding-bottom:8px; margin-top:6px;">
                <div>
                    <h2 style="margin:0; font-size:1.35em; color:#0f172a; font-weight:800;">
                        Оперативна сводка: ${startFormatted} – ${endFormatted}
                    </h2>
                    <div style="font-size:0.85em; color:#64748b; margin-top:2px;">
                        Генериран на: ${new Date().toLocaleString('bg-BG')} | Общо отчетени операции: <b>${data.totalReportsCount}</b>
                    </div>
                </div>
            </div>

            <!-- KPI Cards Grid -->
            <div class="report-kpi-grid">
                <div class="report-kpi-card" style="border-left-color: #10b981;">
                    <div class="report-kpi-label">🟢 Произведена продукция</div>
                    <div class="report-kpi-value" style="color: #047857;">${data.totalProducedQty.toLocaleString('bg-BG')} <small style="font-size:0.5em; color:#64748b;">бр.</small></div>
                    <div class="report-kpi-sub">Завършени бройки за периода</div>
                </div>
                <div class="report-kpi-card" style="border-left-color: #ef4444;">
                    <div class="report-kpi-label">⚠️ Регистриран брак</div>
                    <div class="report-kpi-value" style="color: #b91c1c;">${data.totalScrapQty.toLocaleString('bg-BG')} <small style="font-size:0.5em; color:#64748b;">бр. (${data.scrapPercentage}%)</small></div>
                    <div class="report-kpi-sub">Процент фира/дефекти</div>
                </div>
                <div class="report-kpi-card" style="border-left-color: #f59e0b;">
                    <div class="report-kpi-label">🚨 Критични наличности</div>
                    <div class="report-kpi-value" style="color: #b45309;">${data.totalCriticalAlerts} <small style="font-size:0.5em; color:#64748b;">позиции</small></div>
                    <div class="report-kpi-sub">${data.criticalMaterials.length} суровини + ${data.criticalParts.length} детайла под буфер</div>
                </div>
                <div class="report-kpi-card" style="border-left-color: #0891b2;">
                    <div class="report-kpi-label">🔧 Сервиз & Поддръжка</div>
                    <div class="report-kpi-value" style="color: #0e7490;">${data.upcomingEvents.length} <small style="font-size:0.5em; color:#64748b;">задачи</small></div>
                    <div class="report-kpi-sub">Срок в следващите 7 дни / просрочени</div>
                </div>
            </div>

            <!-- Report Sections -->
            <div style="display: flex; flex-direction: column; gap: 20px;">

                <!-- Section 1: Production by Item -->
                <div class="resolver-section">
                    <div class="resolver-section-header">
                        <div class="resolver-section-title">
                            <span>🏭 Изработена продукция по детайли</span>
                            <span style="font-size:0.85em; color:#64748b; font-weight:normal;">– топ ${Math.min(15, data.itemStats.length)} отчетени детайла</span>
                        </div>
                    </div>
                    <div style="overflow-x: auto;">
                        <table class="resolver-table">
                            <thead>
                                <tr>
                                    <th>Детайл</th>
                                    <th style="text-align:center;">Произведено</th>
                                    <th style="text-align:center;">Брак</th>
                                    <th style="text-align:center;">% Брак</th>
                                    <th>Отчетени операции</th>
                                    <th style="text-align:right;">Последно отчитане</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.itemStats.length > 0 ? data.itemStats.slice(0, 15).map(it => {
                                    const total = it.produced + it.scrap;
                                    const pct = total > 0 ? ((it.scrap / total) * 100).toFixed(1) : '0';
                                    const opsList = Array.from(it.ops).join(', ') || '—';
                                    const lastDateStr = it.lastDate ? new Date(it.lastDate).toLocaleDateString('bg-BG') : '—';
                                    return `
                                        <tr>
                                            <td style="font-weight: 800; color:#1e293b;">${it.code}</td>
                                            <td style="text-align:center; font-weight:800; color:#047857; font-size:1.05em;">${it.produced.toLocaleString('bg-BG')} бр.</td>
                                            <td style="text-align:center; font-weight:bold; color:${it.scrap > 0 ? '#b91c1c' : '#94a3b8'};">${it.scrap} бр.</td>
                                            <td style="text-align:center; font-weight:bold; color:${parseFloat(pct) > 2 ? '#b91c1c' : '#64748b'};">${pct}%</td>
                                            <td style="font-size:0.85em; color:#475569;"><div style="max-width:350px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${opsList}</div></td>
                                            <td style="text-align:right; font-size:0.85em; color:#64748b;">${lastDateStr}</td>
                                        </tr>
                                    `;
                                }).join('') : '<tr><td colspan="6" style="text-align:center; padding:20px; color:#94a3b8;">Няма отчетена продукция за избрания период.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Section 2: Operator Performance -->
                <div class="resolver-section">
                    <div class="resolver-section-header">
                        <div class="resolver-section-title">
                            <span>👥 Активност по оператори (${data.operatorStats.length} служители)</span>
                        </div>
                    </div>
                    <div style="overflow-x: auto;">
                        <table class="resolver-table">
                            <thead>
                                <tr>
                                    <th>Оператор</th>
                                    <th style="text-align:center;">Произведено (бр.)</th>
                                    <th style="text-align:center;">Брак (бр.)</th>
                                    <th style="text-align:center;">Брой отчети</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.operatorStats.length > 0 ? data.operatorStats.map(op => `
                                    <tr>
                                        <td style="font-weight: 800; color:#1e293b;">👤 ${op.name}</td>
                                        <td style="text-align:center; font-weight:800; color:#047857;">${op.produced.toLocaleString('bg-BG')}</td>
                                        <td style="text-align:center; font-weight:bold; color:${op.scrap > 0 ? '#b91c1c' : '#94a3b8'};">${op.scrap}</td>
                                        <td style="text-align:center; font-weight:bold; color:#475569;">${op.count}</td>
                                    </tr>
                                `).join('') : '<tr><td colspan="4" style="text-align:center; padding:20px; color:#94a3b8;">Няма активност за периода.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Section 3: Critical Inventory -->
                <div class="resolver-section">
                    <div class="resolver-section-header">
                        <div class="resolver-section-title">
                            <span>🚨 Критични наличности под минимум (${data.totalCriticalAlerts} позиции)</span>
                        </div>
                    </div>
                    <div style="overflow-x: auto;">
                        <table class="resolver-table">
                            <thead>
                                <tr>
                                    <th>Тип</th>
                                    <th>Артикул / Код</th>
                                    <th style="text-align:center;">Текущ остатък</th>
                                    <th style="text-align:center;">Минимален буфер</th>
                                    <th style="text-align:center;">Недостиг</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.totalCriticalAlerts > 0 ? [
                                    ...data.criticalMaterials.map(m => `
                                        <tr>
                                            <td><span class="resolver-pill" style="background:#e0e7ff; color:#4338ca; font-size:0.75em;">📦 Суровина</span></td>
                                            <td style="font-weight:800; color:#1e293b;">${m.code}</td>
                                            <td style="text-align:center; font-weight:800; color:#b91c1c;">${m.stock.toLocaleString('bg-BG')} ${m.unit}</td>
                                            <td style="text-align:center; font-weight:bold; color:#475569;">${m.minStock.toLocaleString('bg-BG')} ${m.unit}</td>
                                            <td style="text-align:center;"><span class="resolver-stock-deficit">🔴 -${m.deficit.toLocaleString('bg-BG')} ${m.unit}</span></td>
                                        </tr>
                                    `),
                                    ...data.criticalParts.map(p => `
                                        <tr>
                                            <td><span class="resolver-pill" style="background:#fef3c7; color:#92400e; font-size:0.75em;">🛠️ Детайл</span></td>
                                            <td style="font-weight:800; color:#1e293b;">${p.code}</td>
                                            <td style="text-align:center; font-weight:800; color:#b91c1c;">${p.stock.toLocaleString('bg-BG')} бр.</td>
                                            <td style="text-align:center; font-weight:bold; color:#475569;">${p.minStock.toLocaleString('bg-BG')} бр.</td>
                                            <td style="text-align:center;"><span class="resolver-stock-deficit">🔴 -${p.deficit.toLocaleString('bg-BG')} бр.</span></td>
                                        </tr>
                                    `)
                                ].join('') : '<tr><td colspan="5" style="text-align:center; padding:20px; color:#15803d; font-weight:bold;">✅ Всички материали и детайли са над минималните си нива.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Section 4: Upcoming Maintenance -->
                <div class="resolver-section">
                    <div class="resolver-section-header">
                        <div class="resolver-section-title">
                            <span>🔧 Предстоящи сервизи и поддръжка (${data.upcomingEvents.length} задачи)</span>
                        </div>
                    </div>
                    <div style="overflow-x: auto;">
                        <table class="resolver-table">
                            <thead>
                                <tr>
                                    <th>Дата</th>
                                    <th>Машина / Обект</th>
                                    <th>Задача</th>
                                    <th style="text-align:center;">Приоритет</th>
                                    <th style="text-align:right;">Статус</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.upcomingEvents.length > 0 ? data.upcomingEvents.map(e => {
                                    const isOverdue = e.event_date < todayStr;
                                    return `
                                        <tr>
                                            <td style="font-weight:800; color:${isOverdue ? '#b91c1c' : '#1e293b'};">
                                                ${e.event_date ? new Date(e.event_date).toLocaleDateString('bg-BG') : '—'}
                                                ${isOverdue ? '<span style="color:#b91c1c; font-size:0.75em; margin-left:4px;">(Просрочено!)</span>' : ''}
                                            </td>
                                            <td style="font-weight:800; color:#4338ca;">${e.machine_name || 'Н/А'}</td>
                                            <td style="font-weight:600; color:#1e293b;">${e.title || 'Поддръжка'}</td>
                                            <td style="text-align:center;"><span class="resolver-pill" style="background:#fee2e2; color:#b91c1c; font-size:0.75em;">${e.priority || 'Нормален'}</span></td>
                                            <td style="text-align:right;"><span class="resolver-pill" style="background:#fef3c7; color:#92400e; font-size:0.75em;">⏳ В очакване</span></td>
                                        </tr>
                                    `;
                                }).join('') : '<tr><td colspan="5" style="text-align:center; padding:20px; color:#15803d; font-weight:bold;">✅ Няма спешни или просрочени задачи за поддръжка.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    `;
}

function toggleCustomReportDates() {
    currentReportPeriod = 'custom';
    const row = document.getElementById('reportCustomDatesRow');
    if (row) row.style.display = row.style.display === 'none' ? 'flex' : 'none';
    const pills = document.querySelectorAll('.report-pill-btn');
    pills.forEach(p => p.classList.remove('active'));
    event.target.classList.add('active');
}

function generateReportTextSummary() {
    if (!reportCachedData) return '';
    const d = reportCachedData;
    const startStr = d.startDate.toLocaleDateString('bg-BG');
    const endStr = d.endDate.toLocaleDateString('bg-BG');

    let text = `📊 *ИС-СИСТЕМС | ОПЕРАТИВНА СВОДКА*\n`;
    text += `Период: ${startStr} – ${endStr}\n`;
    text += `----------------------------------------\n`;
    text += `🟢 Произведена продукция: ${d.totalProducedQty.toLocaleString('bg-BG')} бр.\n`;
    text += `⚠️ Регистриран брак: ${d.totalScrapQty.toLocaleString('bg-BG')} бр. (${d.scrapPercentage}%)\n`;
    text += `🚨 Критични наличности под минимум: ${d.totalCriticalAlerts} позиции\n`;
    text += `🔧 Предстоящи сервизни задачи: ${d.upcomingEvents.length}\n`;
    text += `👥 Активни оператори: ${d.activeOperatorsCount}\n`;
    text += `----------------------------------------\n`;

    if (d.itemStats.length > 0) {
        text += `\n🏭 *ТОП ПРОИЗВЕДЕНИ ДЕТАЙЛИ:*\n`;
        d.itemStats.slice(0, 5).forEach((it, i) => {
            text += `${i + 1}. ${it.code}: ${it.produced.toLocaleString('bg-BG')} бр. (брак: ${it.scrap})\n`;
        });
    }

    if (d.criticalMaterials.length > 0) {
        text += `\n🚨 *СПЕШНИ МАТЕРИАЛИ ЗА ДОСТАВКА:*\n`;
        d.criticalMaterials.slice(0, 5).forEach(m => {
            text += `• ${m.code}: налично ${m.stock} ${m.unit} (мин: ${m.minStock} ${m.unit})\n`;
        });
    }

    if (d.upcomingEvents.length > 0) {
        text += `\n🔧 *ПРЕДСТОЯЩ СЕРВИЗ & ПОДДРЪЖКА:*\n`;
        d.upcomingEvents.slice(0, 3).forEach(e => {
            text += `• ${e.machine_name}: ${e.title} (${e.event_date})\n`;
        });
    }

    text += `\nГенерирано автоматично от IS-SYSTEMS Cloud.`;
    return text;
}

function copyReportSummaryToClipboard() {
    const text = generateReportTextSummary();
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: '📋 Резюмето е копирано!',
            text: 'Готово е за поставяне във Viber, WhatsApp или Имейл.',
            showConfirmButton: false,
            timer: 2500
        });
    }).catch(err => {
        alert('Грешка при копиране: ' + err);
    });
}

async function sendReportPushNotification() {
    if (!reportCachedData) return;
    const d = reportCachedData;
    const title = `📊 Оперативна сводка (${d.startDate.toLocaleDateString('bg-BG')})`;
    const body = `Произведено: ${d.totalProducedQty} бр. | Брак: ${d.totalScrapQty} бр. (${d.scrapPercentage}%) | Критични материали: ${d.totalCriticalAlerts}`;

    const { isConfirmed } = await Swal.fire({
        title: 'Изпращане на Push Известие',
        html: `
            <div style="text-align:left; font-size:0.95em; color:#334155;">
                Системата ще изпрати оперативно Push съобщение през OneSignal до абонираните устройства:<br><br>
                <b>Заглавие:</b> ${title}<br>
                <b>Съобщение:</b> ${body}
            </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Изпрати веднага 🚀',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#0d9488'
    });

    if (isConfirmed && typeof sendOneSignalNotification === 'function') {
        sendOneSignalNotification('ALL', title, body);
    }
}

function exportReportToExcel() {
    if (!reportCachedData || typeof XLSX === 'undefined') {
        alert('Няма заредени данни или библиотеката SheetJS не е готова.');
        return;
    }
    const d = reportCachedData;
    const wb = XLSX.utils.book_new();

    // Sheet 1: Production
    const prodRows = d.itemStats.map(it => ({
        'Детайл': it.code,
        'Произведено (бр.)': it.produced,
        'Брак (бр.)': it.scrap,
        'Общо (бр.)': it.produced + it.scrap,
        '% Брак': ((it.scrap / (it.produced + it.scrap || 1)) * 100).toFixed(1) + '%',
        'Операции': Array.from(it.ops).join(', ')
    }));
    const wsProd = XLSX.utils.json_to_sheet(prodRows);
    XLSX.utils.book_append_sheet(wb, wsProd, 'Производство');

    // Sheet 2: Operators
    const opRows = d.operatorStats.map(op => ({
        'Оператор': op.name,
        'Произведено (бр.)': op.produced,
        'Брак (бр.)': op.scrap,
        'Брой отчети': op.count
    }));
    const wsOps = XLSX.utils.json_to_sheet(opRows);
    XLSX.utils.book_append_sheet(wb, wsOps, 'Оператори');

    // Sheet 3: Critical Materials
    const critRows = [
        ...d.criticalMaterials.map(m => ({
            'Тип': 'Материал',
            'Артикул': m.code,
            'Текуща наличност': m.stock,
            'Минимален буфер': m.minStock,
            'Недостиг': m.deficit,
            'Мерна единица': m.unit
        })),
        ...d.criticalParts.map(p => ({
            'Тип': 'Детайл',
            'Артикул': p.code,
            'Текуща наличност': p.stock,
            'Минимален буфер': p.minStock,
            'Недостиг': p.deficit,
            'Мерна единица': 'бр.'
        }))
    ];
    const wsCrit = XLSX.utils.json_to_sheet(critRows);
    XLSX.utils.book_append_sheet(wb, wsCrit, 'Критичен Склад');

    const fileName = `IS_Systems_Svodka_${d.startDate.toISOString().split('T')[0]}_${d.endDate.toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
}
