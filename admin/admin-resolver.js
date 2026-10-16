// Enhanced Visual Resolver & BOM Explorer
let cachedBom = null;
let cachedRoutes = null;
let cachedSklad = null;
let cachedInventory = null;
let cachedNomenklatura = null;

let resolverHistory = []; // [ { code: '...', multiplier: 1 } ]
let currentResolverMultiplier = 1;
let currentResolverView = 'cards'; // 'cards' or 'tree'
let currentPartCode = '';

function openResolverTreeFromBtn(btn) {
    if (!btn) return;
    const rawPart = btn.getAttribute('data-part');
    const partCode = rawPart ? decodeURIComponent(rawPart) : btn.innerText.trim();
    openResolverTree(partCode);
}

function closeResolverModal() {
    const backdrop = document.getElementById('resolverModalBackdrop');
    if (backdrop) backdrop.style.display = 'none';
    resolverHistory = [];
}

async function ensureResolverData(forceReload = false) {
    if (forceReload || !cachedBom || !cachedRoutes || !cachedSklad || !cachedInventory || !cachedNomenklatura) {
        const [bomRes, routesRes, skladRes, invRes, nomRes] = await Promise.all([
            client.from('bom').select('*').limit(50000),
            client.from('marshruti').select('*').limit(50000),
            client.from('sklad').select('*').limit(50000),
            client.from('inventory').select('*').limit(50000),
            client.from('Номенклатура').select('*').limit(50000)
        ]);
        if (bomRes.error) console.error('BOM error:', bomRes.error);
        if (routesRes.error) console.error('Routes error:', routesRes.error);
        if (skladRes.error) console.error('Sklad error:', skladRes.error);
        if (invRes.error) console.error('Inventory error:', invRes.error);
        if (nomRes.error) console.error('Nomenklatura error:', nomRes.error);

        cachedBom = bomRes.data || [];
        cachedRoutes = routesRes.data || [];
        cachedSklad = skladRes.data || [];
        cachedInventory = invRes.data || [];
        cachedNomenklatura = nomRes.data || [];
    }
}

async function openResolverTree(partCode, isBreadcrumbDrilldown = false) {
    if (!partCode) return;
    currentPartCode = String(partCode).trim();
    
    if (!isBreadcrumbDrilldown) {
        currentResolverMultiplier = 1;
        resolverHistory = [ { code: currentPartCode, multiplier: 1 } ];
    }

    const titleEl = document.getElementById('resolverTitle');
    if (titleEl) titleEl.innerText = currentPartCode;

    const contentEl = document.getElementById('resolverContent');
    if (contentEl) {
        contentEl.innerHTML = `
            <div style="text-align:center; padding: 40px 20px; color:#64748b;">
                <div style="font-size: 2.2em; margin-bottom: 12px; animation: spin 1s infinite linear;">⚙️</div>
                <div style="font-size: 1.1em; font-weight: 700; color:#1e293b;">Зареждане на състава и наличностите...</div>
                <div style="font-size: 0.9em; margin-top: 5px;">Проверка на рецепти (BOM), Склад Детайли и Склад Материали</div>
            </div>
        `;
    }

    const backdrop = document.getElementById('resolverModalBackdrop');
    if (backdrop) backdrop.style.display = 'flex';

    try {
        await ensureResolverData();
        renderResolverView();
    } catch (err) {
        console.error('Error loading resolver:', err);
        if (contentEl) {
            contentEl.innerHTML = `
                <div style="color:#dc2626; text-align:center; padding: 30px; background:#fef2f2; border-radius:8px; border:1px solid #fecaca;">
                    <div style="font-size: 1.5em; margin-bottom: 8px;">⚠️ Грешка при зареждане</div>
                    <div>${err.message || err}</div>
                    <button class="btn-primary" onclick="reloadResolverData()" style="margin: 15px auto 0 auto;">🔄 Опитай отново</button>
                </div>
            `;
        }
    }
}

function drillDownResolverPart(childCode) {
    if (!childCode) return;
    resolverHistory.push({ code: childCode, multiplier: currentResolverMultiplier });
    openResolverTree(childCode, true);
}

function navigateResolverHistory(index) {
    if (index >= 0 && index < resolverHistory.length) {
        const item = resolverHistory[index];
        resolverHistory = resolverHistory.slice(0, index + 1);
        currentResolverMultiplier = item.multiplier || 1;
        openResolverTree(item.code, true);
    }
}

function setResolverView(viewMode) {
    currentResolverView = viewMode;
    renderResolverView();
}

function updateResolverMultiplier(val) {
    let m = parseFloat(val);
    if (isNaN(m) || m <= 0) m = 1;
    currentResolverMultiplier = m;
    if (resolverHistory.length > 0) {
        resolverHistory[resolverHistory.length - 1].multiplier = m;
    }
    renderResolverView();
}

function reloadResolverData() {
    cachedBom = null;
    cachedRoutes = null;
    cachedSklad = null;
    cachedInventory = null;
    cachedNomenklatura = null;
    openResolverTree(currentPartCode, true);
}

function buildResolverMaps() {
    const bomMap = {};
    (cachedBom || []).forEach(b => {
        const parent = String(b['ID Родител'] || '').trim().toUpperCase();
        if (!parent) return;
        if (!bomMap[parent]) bomMap[parent] = [];
        bomMap[parent].push({
            child: String(b['ID Компонент'] || '').trim(),
            qty: parseFloat(b['Количество']) || 1,
            opNum: b['Влага се на Оп. №'] || null
        });
    });

    const routesMap = {};
    (cachedRoutes || []).forEach(r => {
        const code = String(r['Код на детайла'] || '').trim().toUpperCase();
        if (!code) return;
        if (!routesMap[code]) routesMap[code] = [];
        routesMap[code].push(r);
    });
    Object.keys(routesMap).forEach(k => {
        routesMap[k].sort((a, b) => (parseInt(a['№ Операция']) || 0) - (parseInt(b['№ Операция']) || 0));
    });

    const skladMap = {};
    (cachedSklad || []).forEach(s => {
        const code = String(s['ID Детайл'] || '').trim().toUpperCase();
        if (!code) return;
        skladMap[code] = {
            codeOriginal: s['ID Детайл'],
            stock: parseFloat(s['Остатък']) || 0,
            unit: s['Мерна единица'] || 'бр.',
            minStock: parseFloat(s['Минимално количество']) || 0,
            notes: s['Бележки'] || ''
        };
    });

    const invMap = {};
    (cachedInventory || []).forEach(inv => {
        const code = String(inv['ID Детайл'] || '').trim().toUpperCase();
        if (!code) return;
        if (!invMap[code]) {
            invMap[code] = {
                codeOriginal: inv['ID Детайл'],
                name: inv['Име'] || '',
                totalFree: 0,
                totalStock: 0,
                buffer: parseFloat(inv['Минимално количество/Буфер']) || 0,
                items: []
            };
        }
        invMap[code].totalFree += (parseFloat(inv['Свободни']) || 0);
        invMap[code].totalStock += (parseFloat(inv['Общо']) || 0);
        invMap[code].items.push(inv);
    });

    const nomMap = {};
    (cachedNomenklatura || []).forEach(n => {
        const code = String(n['ID Детайл'] || '').trim().toUpperCase();
        if (!code) return;
        nomMap[code] = n;
        const intName = String(n['Вътрешно име'] || '').trim().toUpperCase();
        if (intName && !nomMap[intName]) nomMap[intName] = n;
    });

    return { bomMap, routesMap, skladMap, invMap, nomMap };
}

function renderResolverView() {
    const contentEl = document.getElementById('resolverContent');
    if (!contentEl) return;

    const { bomMap, routesMap, skladMap, invMap, nomMap } = buildResolverMaps();
    const currentUpper = currentPartCode.toUpperCase();

    const rawChildren = bomMap[currentUpper] || [];
    const rootRoutes = routesMap[currentUpper] || [];
    const nomInfo = nomMap[currentUpper] || {};

    // Breadcrumbs
    let breadcrumbsHtml = '<div class="resolver-breadcrumbs">';
    resolverHistory.forEach((h, idx) => {
        const isLast = idx === resolverHistory.length - 1;
        if (idx > 0) breadcrumbsHtml += '<span class="resolver-crumb-sep">›</span>';
        breadcrumbsHtml += `
            <button class="resolver-crumb-btn ${isLast ? 'active' : ''}" 
                    onclick="navigateResolverHistory(${idx})">
                ${idx === 0 ? '🏠 ' : ''}${h.code}
            </button>
        `;
    });
    breadcrumbsHtml += '</div>';

    // Toolbar (Multiplier, View toggle, Refresh)
    const toolbarHtml = `
        <div class="resolver-nav-bar">
            ${breadcrumbsHtml}
            <div class="resolver-controls">
                <div class="resolver-calc-box">
                    <span>🧮 За количество:</span>
                    <input type="number" class="resolver-calc-input" min="1" step="any" 
                           value="${currentResolverMultiplier}" 
                           onchange="updateResolverMultiplier(this.value)" 
                           onkeyup="if(event.key==='Enter') updateResolverMultiplier(this.value)">
                    <span>бр. изделия</span>
                </div>
                <div class="resolver-view-tabs">
                    <button class="resolver-view-tab-btn ${currentResolverView === 'cards' ? 'active' : ''}" 
                            onclick="setResolverView('cards')">📋 Подреден състав</button>
                    <button class="resolver-view-tab-btn ${currentResolverView === 'tree' ? 'active' : ''}" 
                            onclick="setResolverView('tree')">🌳 Дърво</button>
                </div>
                <button class="resolver-view-tab-btn" onclick="reloadResolverData()" title="Презареди данни от базата" style="background:#f1f5f9; border:1px solid #cbd5e1;">🔄 Обнови</button>
            </div>
        </div>
    `;

    // Separate children into Parts vs Materials
    const partsList = [];
    const materialsList = [];

    rawChildren.forEach(c => {
        const childCode = c.child;
        const childUpper = childCode.toUpperCase();
        const hasSubChildren = !!(bomMap[childUpper] && bomMap[childUpper].length > 0);
        const hasSubRoutes = !!(routesMap[childUpper] && routesMap[childUpper].length > 0);
        const isInInventory = !!invMap[childUpper];
        const isInSklad = !!skladMap[childUpper];

        const itemNom = nomMap[childUpper] || {};
        const nomType = String(itemNom['Тип'] || '').toLowerCase();

        // Check if classified as a Manufactured Part/Subassembly:
        const isPart = hasSubChildren || hasSubRoutes || isInInventory || 
                       (nomType && (nomType.includes('детайл') || nomType.includes('възел') || nomType.includes('статор') || nomType.includes('ротор') || nomType.includes('вал') || nomType.includes('пакет')));

        const unitQty = parseFloat(c.qty) || 1;
        const totalQty = unitQty * currentResolverMultiplier;

        const entry = {
            code: childCode,
            codeUpper: childUpper,
            unitQty: unitQty,
            totalQty: totalQty,
            opNum: c.opNum,
            hasSubChildren: hasSubChildren,
            subChildrenCount: (bomMap[childUpper] || []).length,
            hasRoutes: hasSubRoutes,
            routes: routesMap[childUpper] || [],
            sklad: skladMap[childUpper] || null,
            inv: invMap[childUpper] || null,
            nom: itemNom
        };

        if (isPart) {
            partsList.push(entry);
        } else {
            materialsList.push(entry);
        }
    });

    // Hero Header for Current Part
    const partType = nomInfo['Тип'] || 'Детайл';
    const drawingLink = nomInfo['Линк към чертеж'] || '';
    const desc = nomInfo['Описание'] || nomInfo['Вътрешно име'] || '';

    const heroHtml = `
        <div class="resolver-hero-card">
            <div>
                <div class="resolver-hero-title">
                    <span>${currentPartCode}</span>
                    <span class="resolver-pill resolver-pill-type">🏷️ ${partType}</span>
                    ${drawingLink ? `<a href="${drawingLink}" target="_blank" class="resolver-drill-btn" style="background:#0284c7; text-decoration:none;">📐 Чертеж</a>` : ''}
                </div>
                ${desc && desc !== currentPartCode ? `<div class="resolver-hero-desc">📝 ${desc}</div>` : ''}
            </div>
            <div class="resolver-hero-badges">
                <span class="resolver-pill resolver-pill-stat">🛠️ <b>${partsList.length}</b> полуфабриката / детайла</span>
                <span class="resolver-pill resolver-pill-stat">📦 <b>${materialsList.length}</b> суровини / консуматива</span>
                ${rootRoutes.length > 0 ? `<span class="resolver-pill resolver-pill-stat" style="background:#fef3c7; color:#92400e; border-color:#fde68a;">🔄 <b>${rootRoutes.length}</b> операции</span>` : ''}
            </div>
        </div>
    `;

    if (currentResolverView === 'tree') {
        contentEl.innerHTML = `
            <div class="resolver-modal-container">
                ${toolbarHtml}
                ${heroHtml}
                <div class="resolver-section" style="padding: 20px;">
                    <ul class="tree-root">
                        ${renderTreeNode(currentUpper, bomMap, routesMap, skladMap, invMap, currentResolverMultiplier)}
                    </ul>
                </div>
            </div>
        `;
        return;
    }

    // CARDS VIEW (Structured List)
    // Section 1: Child parts table
    let partsHtml = '';
    if (partsList.length > 0) {
        partsHtml = `
            <div class="resolver-section">
                <div class="resolver-section-header">
                    <div class="resolver-section-title">
                        <span>🛠️ Вложени полуфабрикати и детайли (Дечица)</span>
                        <span style="font-size:0.85em; font-weight:normal; color:#64748b;">– общо ${partsList.length} компонента</span>
                    </div>
                </div>
                <div style="overflow-x: auto;">
                    <table class="resolver-table">
                        <thead>
                            <tr>
                                <th>Детайл / Подвъзел</th>
                                <th style="text-align:center;">Норма (1 бр.)</th>
                                <th style="text-align:center;">За ${currentResolverMultiplier} бр.</th>
                                <th>Склад Детайли (Наличност)</th>
                                <th>Технологичен маршрут</th>
                                <th style="text-align:right;">Действие</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${partsList.map(p => {
                                let stockBadge = '<span class="resolver-stock-none">⚪ Няма данни</span>';
                                if (p.inv) {
                                    if (p.inv.totalFree >= p.totalQty) {
                                        stockBadge = `<span class="resolver-stock-ok">🟢 Свободни: ${p.inv.totalFree.toLocaleString('bg-BG')} бр.</span>`;
                                    } else {
                                        stockBadge = `<span class="resolver-stock-deficit">🟡 Свободни: ${p.inv.totalFree.toLocaleString('bg-BG')} бр. (Общо: ${p.inv.totalStock})</span>`;
                                    }
                                } else if (p.sklad) {
                                    stockBadge = `<span class="resolver-stock-ok">🟢 Склад: ${p.sklad.stock.toLocaleString('bg-BG')} ${p.sklad.unit}</span>`;
                                }

                                let routesText = '—';
                                if (p.routes.length > 0) {
                                    routesText = p.routes.map(r => `<span class="op-badge">${r['№ Операция']}. ${r['Име на операция']} <small>(${r['Машина'] || 'Н/А'})</small></span>`).join(' ');
                                }

                                const safeChild = encodeURIComponent(p.code);
                                return `
                                    <tr>
                                        <td>
                                            <div style="font-weight: 800; color: #1e293b; font-size: 1.05em;">${p.code}</div>
                                            ${p.subChildrenCount > 0 ? `<div style="font-size: 0.8em; color: #6366f1; font-weight: bold; margin-top: 2px;">↳ Съдържа още ${p.subChildrenCount} подкомпонента</div>` : ''}
                                        </td>
                                        <td style="text-align:center; font-weight:bold; color:#475569;">${p.unitQty} бр.</td>
                                        <td style="text-align:center; font-weight:800; color:#1e293b; background:#f8fafc;">${p.totalQty.toLocaleString('bg-BG')} бр.</td>
                                        <td>${stockBadge}</td>
                                        <td><div style="display:flex; flex-wrap:wrap; gap:4px;">${routesText}</div></td>
                                        <td style="text-align:right;">
                                            <button class="resolver-drill-btn" onclick="drillDownResolverPart(decodeURIComponent('${safeChild}'))" title="Виж рецептата на този детайл">
                                                🔍 Виж състав ${p.subChildrenCount > 0 ? `(${p.subChildrenCount})` : ''}
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } else {
        partsHtml = `
            <div class="resolver-section" style="padding: 16px 20px; color: #64748b; font-size: 0.95em; background: #ffffff;">
                ℹ️ Този детайл няма вложени полуфабрикати (не се сглобява от други детайли, а се изработва директно от изброените по-долу материали).
            </div>
        `;
    }

    // Section 2: Materials table
    let materialsHtml = '';
    if (materialsList.length > 0) {
        materialsHtml = `
            <div class="resolver-section">
                <div class="resolver-section-header">
                    <div class="resolver-section-title">
                        <span>📦 Суровини, материали и консумативи</span>
                        <span style="font-size:0.85em; font-weight:normal; color:#64748b;">– общо ${materialsList.length} позиции</span>
                    </div>
                </div>
                <div style="overflow-x: auto;">
                    <table class="resolver-table">
                        <thead>
                            <tr>
                                <th>Материал / Суровина</th>
                                <th style="text-align:center;">Разходна норма (1 бр.)</th>
                                <th style="text-align:center;">Необходимо за ${currentResolverMultiplier} бр.</th>
                                <th>Наличност в Склад Материали</th>
                                <th style="text-align:right;">Мерна ед. / Буфер</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${materialsList.map(m => {
                                let stockBadge = '<span class="resolver-stock-none">⚪ Без складов запис</span>';
                                let unit = 'бр.';
                                let bufferText = '—';

                                if (m.sklad) {
                                    unit = m.sklad.unit || 'бр.';
                                    bufferText = m.sklad.minStock ? `Мин: ${m.sklad.minStock.toLocaleString('bg-BG')}` : '—';
                                    if (m.sklad.stock >= m.totalQty) {
                                        stockBadge = `<span class="resolver-stock-ok">🟢 В наличност: ${m.sklad.stock.toLocaleString('bg-BG')} ${unit}</span>`;
                                    } else {
                                        const deficit = m.totalQty - m.sklad.stock;
                                        stockBadge = `<span class="resolver-stock-deficit">🔴 Недостиг: ${m.sklad.stock.toLocaleString('bg-BG')} ${unit} (дефицит: ${deficit.toLocaleString('bg-BG')})</span>`;
                                    }
                                }

                                return `
                                    <tr>
                                        <td>
                                            <div style="font-weight: 700; color: #1e293b;">${m.code}</div>
                                            ${m.opNum ? `<div style="font-size:0.8em; color:#d97706;">Влага се на Оп. № ${m.opNum}</div>` : ''}
                                        </td>
                                        <td style="text-align:center; font-weight:bold; color:#475569;">${m.unitQty} ${unit}</td>
                                        <td style="text-align:center; font-weight:800; color:#0f172a; background:#f8fafc;">${m.totalQty.toLocaleString('bg-BG')} ${unit}</td>
                                        <td>${stockBadge}</td>
                                        <td style="text-align:right; font-size:0.85em; color:#64748b;">${unit} (${bufferText})</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } else {
        materialsHtml = `
            <div class="resolver-section" style="padding: 16px 20px; color: #64748b; font-size: 0.95em; background: #ffffff;">
                ℹ️ Няма записани чисти материали в спецификацията на този детайл.
            </div>
        `;
    }

    // Section 3: Root Part Operations
    let routesHtml = '';
    if (rootRoutes.length > 0) {
        routesHtml = `
            <div class="resolver-section">
                <div class="resolver-section-header">
                    <div class="resolver-section-title">
                        <span>🔄 Технологични операции на детайла (${rootRoutes.length})</span>
                    </div>
                </div>
                <div style="padding: 15px; display: flex; flex-direction: column; gap: 8px;">
                    ${rootRoutes.map(r => `
                        <div class="resolver-route-step">
                            <span style="background:#ca8a04; color:#ffffff; padding:2px 8px; border-radius:4px; font-weight:800; font-size:0.85em;">Оп. ${r['№ Операция']}</span>
                            <span style="font-weight:800; color:#1e293b; font-size:1em;">${r['Име на операция']}</span>
                            <span style="color:#64748b;">(Машина: <b style="color:#334155;">${r['Машина'] || 'Н/А'}</b>)</span>
                            ${r['Норма (мин/бр)'] ? `<span style="background:#e2e8f0; color:#334155; padding:2px 6px; border-radius:4px; font-size:0.8em;">⏱️ ${r['Норма (мин/бр)']} мин/бр.</span>` : ''}
                            ${r['Линк към чертеж'] ? `<a href="${r['Линк към чертеж']}" target="_blank" style="margin-left:auto; color:#2563eb; font-weight:bold; text-decoration:none; font-size:0.85em;">📐 Чертеж</a>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    contentEl.innerHTML = `
        <div class="resolver-modal-container">
            ${toolbarHtml}
            ${heroHtml}
            ${partsHtml}
            ${materialsHtml}
            ${routesHtml}
        </div>
    `;
}

function renderTreeNode(codeUpper, bomMap, routesMap, skladMap, invMap, requiredQty) {
    let stockBadge = '';
    if (skladMap[codeUpper]) {
        const s = skladMap[codeUpper];
        if (s.stock >= requiredQty) {
            stockBadge = `<span class="resolver-stock-ok" style="font-size:0.75em; padding:2px 6px;">🟢 ${s.stock} ${s.unit}</span>`;
        } else {
            stockBadge = `<span class="resolver-stock-deficit" style="font-size:0.75em; padding:2px 6px;">🔴 Недостиг (${s.stock}/${requiredQty})</span>`;
        }
    } else if (invMap[codeUpper]) {
        stockBadge = `<span class="resolver-stock-ok" style="font-size:0.75em; padding:2px 6px;">🟢 Свободни: ${invMap[codeUpper].totalFree}</span>`;
    }

    let html = `<li>
        <div class="tree-node">
            <span class="tree-part">${codeUpper}</span> 
            <span class="tree-qty">[x${requiredQty.toLocaleString('bg-BG')}]</span>
            ${stockBadge}
        </div>`;
    
    const ops = routesMap[codeUpper] || [];
    if (ops.length > 0) {
        html += `<div class="tree-ops">`;
        ops.forEach(op => {
            html += `<span class="op-badge">${op['№ Операция']}. ${op['Име на операция']} <small>(${op['Машина'] || 'Н/А'})</small></span>`;
        });
        html += `</div>`;
    }

    const children = bomMap[codeUpper] || [];
    if (children.length > 0) {
        html += `<ul>`;
        children.forEach(c => {
            const childUpper = String(c.child).trim().toUpperCase();
            html += renderTreeNode(childUpper, bomMap, routesMap, skladMap, invMap, requiredQty * c.qty);
        });
        html += `</ul>`;
    }
    
    html += `</li>`;
    return html;
}
