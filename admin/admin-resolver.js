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
                <div style="font-size: 0.9em; margin-top: 5px;">Проверка на рецепти (BOM), Склад Детайли, Склад Материали и Номенклатура</div>
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
            opNum: b['Влага се на Оп. №'] || null,
            source: 'bom'
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
    function indexSklad(k, entry) {
        if (!k) return;
        const upper = k.trim().toUpperCase();
        skladMap[upper] = entry;
        const norm = upper.replace(/\s+/g, ' ');
        skladMap[norm] = entry;
        skladMap[norm.replace(/\.\s*/g, '.')] = entry;
        skladMap[norm.replace(/\./g, '. ')] = entry;
    }

    (cachedSklad || []).forEach(s => {
        const code = String(s['ID Детайл'] || '').trim();
        if (!code) return;
        const entry = {
            codeOriginal: s['ID Детайл'],
            stock: parseFloat(s['Остатък']) || 0,
            unit: s['Мерна единица'] || 'бр.',
            minStock: parseFloat(s['Минимално количество']) || 0,
            notes: s['Бележки'] || ''
        };
        indexSklad(code, entry);
    });

    const invMap = {};
    function indexInv(code, entry) {
        if (!code) return;
        const upper = code.trim().toUpperCase();
        invMap[upper] = entry;
        const norm = upper.replace(/\s+/g, ' ');
        invMap[norm] = entry;
        invMap[norm.replace(/\.\s*/g, '.')] = entry;
        invMap[norm.replace(/\./g, '. ')] = entry;
    }

    // 1. From cachedInventory table
    (cachedInventory || []).forEach(inv => {
        const code = String(inv['ID Детайл'] || '').trim();
        if (!code) return;
        const norm = code.toUpperCase().replace(/\s+/g, ' ');
        if (!invMap[norm]) {
            invMap[norm] = {
                codeOriginal: inv['ID Детайл'],
                name: inv['Име'] || '',
                totalFree: 0,
                totalStock: 0,
                buffer: parseFloat(inv['Минимално количество/Буфер']) || 0,
                items: []
            };
        }
        const itemEntry = invMap[norm];
        const rawQty = parseFloat(inv['Количество']) != null && !isNaN(parseFloat(inv['Количество']))
            ? parseFloat(inv['Количество'])
            : (parseFloat(inv['Общо']) || 0);
        const freeQty = (inv['Свободни'] != null && !isNaN(parseFloat(inv['Свободни'])))
            ? parseFloat(inv['Свободни'])
            : rawQty;

        itemEntry.totalFree += freeQty;
        itemEntry.totalStock += rawQty;
        itemEntry.items.push(inv);

        indexInv(code, itemEntry);
    });

    // 2. Enrich from adminTabCache['sklad_inventory'] if available
    if (typeof adminTabCache !== 'undefined' && adminTabCache && adminTabCache['sklad_inventory'] && adminTabCache['sklad_inventory'].length > 0) {
        adminTabCache['sklad_inventory'].forEach(item => {
            const code = String(item['ID Детайл'] || '').trim();
            if (!code) return;
            const norm = code.toUpperCase().replace(/\s+/g, ' ');
            const free = parseFloat(item['Свободни']) || 0;
            const total = parseFloat(item['Общо']) || 0;
            const buf = parseFloat(item['Минимално количество/Буфер']) || 0;
            if (invMap[norm]) {
                if (invMap[norm].totalStock === 0 && total > 0) {
                    invMap[norm].totalStock = total;
                    invMap[norm].totalFree = free;
                }
                if (buf > invMap[norm].buffer) invMap[norm].buffer = buf;
            } else {
                const newEntry = {
                    codeOriginal: item['ID Детайл'],
                    name: item['Име'] || '',
                    totalFree: free,
                    totalStock: total,
                    buffer: buf,
                    items: [item]
                };
                indexInv(code, newEntry);
            }
        });
    }

    const nomMap = {};
    (cachedNomenklatura || []).forEach(n => {
        const code = String(n['ID Детайл'] || '').trim().toUpperCase();
        if (code) {
            nomMap[code] = n;
            nomMap[code.replace(/\s+/g, ' ')] = n;
        }
        const intName = String(n['Вътрешно име'] || '').trim().toUpperCase();
        if (intName) {
            if (!nomMap[intName]) nomMap[intName] = n;
            nomMap[intName.replace(/\s+/g, ' ')] = n;
        }
    });

    return { bomMap, routesMap, skladMap, invMap, nomMap };
}

function resolveStockForPart(partCode, requiredQty = 1, skladMap = {}, invMap = {}, nomMap = {}) {
    if (!partCode) return null;
    const raw = String(partCode).trim();
    const upper = raw.toUpperCase();
    const norm = upper.replace(/\s+/g, ' ');
    const noDot = norm.replace(/\.\s*/g, '.');
    const withDot = norm.replace(/\./g, '. ');

    // 1. Check invMap
    let inv = invMap[upper] || invMap[norm] || invMap[noDot] || invMap[withDot] || null;

    // 2. Check skladMap
    let sklad = skladMap[upper] || skladMap[norm] || skladMap[noDot] || skladMap[withDot] || null;

    // 3. Check nomMap for aliases
    const nom = nomMap[upper] || nomMap[norm] || null;
    if (nom) {
        const altCode = String(nom['ID Детайл'] || '').trim().toUpperCase();
        const intName = String(nom['Вътрешно име'] || '').trim().toUpperCase();
        if (!inv) {
            if (altCode) inv = invMap[altCode] || invMap[altCode.replace(/\s+/g, ' ')];
            if (!inv && intName) inv = invMap[intName] || invMap[intName.replace(/\s+/g, ' ')];
        }
        if (!sklad) {
            if (altCode) sklad = skladMap[altCode] || skladMap[altCode.replace(/\s+/g, ' ')];
            if (!sklad && intName) sklad = skladMap[intName] || skladMap[intName.replace(/\s+/g, ' ')];
        }
    }

    const hasInv = !!(inv && (inv.totalStock > 0 || inv.totalFree > 0 || inv.items.length > 0));
    const hasSklad = !!(sklad && (sklad.stock > 0 || sklad.stock === 0));

    let badgeHtml = '';
    let isOk = false;

    if (hasInv && hasSklad) {
        const free = inv.totalFree;
        const total = inv.totalStock;
        const sStock = sklad.stock;
        const sUnit = sklad.unit || 'бр.';
        badgeHtml = `
            <div style="display:inline-flex; flex-direction:column; gap:3px;">
                <span class="${free >= requiredQty ? 'resolver-stock-ok' : (free > 0 ? 'resolver-stock-deficit' : 'resolver-stock-none')}">
                    🏭 Детайли: <b>${free.toLocaleString('bg-BG')}</b> св. (общо ${total.toLocaleString('bg-BG')})
                </span>
                <span class="${sStock >= requiredQty ? 'resolver-stock-ok' : (sStock > 0 ? 'resolver-stock-deficit' : 'resolver-stock-none')}">
                    📦 Материали: <b>${sStock.toLocaleString('bg-BG')}</b> ${sUnit}
                </span>
            </div>
        `;
        isOk = (free >= requiredQty) || (sStock >= requiredQty);
    } else if (hasInv) {
        const free = inv.totalFree;
        const total = inv.totalStock;
        if (free >= requiredQty) {
            badgeHtml = `<span class="resolver-stock-ok">🟢 Свободни: <b>${free.toLocaleString('bg-BG')} бр.</b> (Общо: ${total.toLocaleString('bg-BG')})</span>`;
            isOk = true;
        } else if (free > 0) {
            badgeHtml = `<span class="resolver-stock-deficit">🟡 Свободни: <b>${free.toLocaleString('bg-BG')} бр.</b> (Общо: ${total.toLocaleString('bg-BG')})</span>`;
        } else if (total > 0) {
            badgeHtml = `<span class="resolver-stock-deficit">🟡 Всички ${total.toLocaleString('bg-BG')} бр. са запазени (0 свободни)</span>`;
        } else {
            badgeHtml = `<span class="resolver-stock-none">⚪ 0 бр. свободни (в Склад Детайли)</span>`;
        }
    } else if (hasSklad) {
        const stock = sklad.stock;
        const unit = sklad.unit || 'бр.';
        if (stock >= requiredQty) {
            badgeHtml = `<span class="resolver-stock-ok">🟢 В наличност: <b>${stock.toLocaleString('bg-BG')} ${unit}</b></span>`;
            isOk = true;
        } else if (stock > 0) {
            badgeHtml = `<span class="resolver-stock-deficit">🔴 Недостиг: <b>${stock.toLocaleString('bg-BG')} ${unit}</b> (нужни: ${requiredQty.toLocaleString('bg-BG')})</span>`;
        } else {
            badgeHtml = `<span class="resolver-stock-none">⚪ 0 ${unit} (в Склад Материали)</span>`;
        }
    } else {
        badgeHtml = `<span class="resolver-stock-none">⚪ 0 бр. (Няма наличност)</span>`;
    }

    return {
        rawCode: partCode,
        hasData: hasInv || hasSklad,
        hasInv,
        inv,
        hasSklad,
        sklad,
        badgeHtml,
        isOk
    };
}

function renderResolverView() {
    const contentEl = document.getElementById('resolverContent');
    if (!contentEl) return;

    const { bomMap, routesMap, skladMap, invMap, nomMap } = buildResolverMaps();
    const currentUpper = currentPartCode.toUpperCase();

    // 1. Initial children from BOM
    const rawChildren = [...(bomMap[currentUpper] || [])];

    // 2. Also include any children where ID Родител in Nomenklatura matches currentPartCode
    (cachedNomenklatura || []).forEach(n => {
        const p = String(n['ID Родител'] || '').trim().toUpperCase();
        if (p && (p === currentUpper || p === currentPartCode.toUpperCase())) {
            const childCode = String(n['ID Детайл'] || '').trim();
            if (childCode && !rawChildren.some(c => String(c.child).trim().toUpperCase() === childCode.toUpperCase())) {
                rawChildren.push({
                    child: childCode,
                    qty: parseFloat(n['Разходна норма']) || 1,
                    opNum: null,
                    source: 'nomenklatura'
                });
            }
        }
    });

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
            unitName: itemNom['Единици'] || (skladMap[childUpper] ? skladMap[childUpper].unit : 'бр.'),
            opNum: c.opNum,
            hasSubChildren: hasSubChildren,
            subChildrenCount: (bomMap[childUpper] || []).length,
            hasRoutes: hasSubRoutes,
            routes: routesMap[childUpper] || [],
            sklad: skladMap[childUpper] || null,
            inv: invMap[childUpper] || null,
            nom: itemNom,
            isFromNomenclature: c.source === 'nomenklatura'
        };

        if (isPart) {
            partsList.push(entry);
        } else {
            materialsList.push(entry);
        }
    });

    // Check if Nomenklatura specifies a parent material/blank (Изходен материал / Заготовка):
    const nomParent = String(nomInfo['ID Родител'] || '').trim();
    let originMaterialInfo = null;
    if (nomParent) {
        const nomParentUpper = nomParent.toUpperCase();
        const norm = parseFloat(nomInfo['Разходна норма']) || 1;
        const unit = nomInfo['Единици'] || (skladMap[nomParentUpper] ? skladMap[nomParentUpper].unit : 'бр.');
        const totalQty = norm * currentResolverMultiplier;
        const skladItem = skladMap[nomParentUpper] || null;

        originMaterialInfo = {
            code: nomParent,
            norm: norm,
            unit: unit,
            totalQty: totalQty,
            sklad: skladItem
        };

        // Also add to materialsList if not already present from BOM
        const alreadyInMaterials = materialsList.some(m => m.codeUpper === nomParentUpper);
        const alreadyInParts = partsList.some(p => p.codeUpper === nomParentUpper);
        if (!alreadyInMaterials && !alreadyInParts) {
            materialsList.unshift({
                code: nomParent,
                codeUpper: nomParentUpper,
                unitQty: norm,
                totalQty: totalQty,
                unitName: unit,
                isFromNomenclature: true,
                opNum: null,
                hasSubChildren: false,
                subChildrenCount: 0,
                hasRoutes: !!(routesMap[nomParentUpper] && routesMap[nomParentUpper].length > 0),
                routes: routesMap[nomParentUpper] || [],
                sklad: skladItem,
                inv: invMap[nomParentUpper] || null,
                nom: nomMap[nomParentUpper] || null
            });
        }
    }

    // Hero Header for Current Part
    const partType = nomInfo['Тип'] || 'Детайл';
    const drawingLink = nomInfo['Линк към чертеж'] || '';
    const desc = nomInfo['Описание'] || nomInfo['Вътрешно име'] || '';

    // 🌟 Current Part Stock Resolution for Hero Card
    const currentStock = resolveStockForPart(currentPartCode, currentResolverMultiplier, skladMap, invMap, nomMap);
    let heroStockCardHtml = '';
    if (currentStock) {
        let stockDetailsHtml = '';
        if (currentStock.hasInv && currentStock.hasSklad) {
            stockDetailsHtml = `
                <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                    <span class="${currentStock.inv.totalFree > 0 ? 'resolver-stock-ok' : 'resolver-stock-none'}" style="font-size:0.92em; padding:6px 12px;">
                        🏭 Склад Детайли: <b>${currentStock.inv.totalFree.toLocaleString('bg-BG')} бр. свободни</b> (общо: ${currentStock.inv.totalStock.toLocaleString('bg-BG')} бр.)
                    </span>
                    <span class="${currentStock.sklad.stock > 0 ? 'resolver-stock-ok' : 'resolver-stock-none'}" style="font-size:0.92em; padding:6px 12px;">
                        📦 Склад Материали: <b>${currentStock.sklad.stock.toLocaleString('bg-BG')} ${currentStock.sklad.unit}</b>
                    </span>
                </div>
            `;
        } else if (currentStock.hasInv) {
            stockDetailsHtml = `
                <span class="${currentStock.inv.totalFree > 0 ? 'resolver-stock-ok' : 'resolver-stock-none'}" style="font-size:0.95em; padding:6px 14px;">
                    🏭 Склад Детайли: <b>${currentStock.inv.totalFree.toLocaleString('bg-BG')} бр. свободни</b> (общо: ${currentStock.inv.totalStock.toLocaleString('bg-BG')} бр.)
                </span>
            `;
        } else if (currentStock.hasSklad) {
            stockDetailsHtml = `
                <span class="${currentStock.sklad.stock > 0 ? 'resolver-stock-ok' : 'resolver-stock-none'}" style="font-size:0.95em; padding:6px 14px;">
                    📦 Склад Материали: <b>${currentStock.sklad.stock.toLocaleString('bg-BG')} ${currentStock.sklad.unit}</b> в наличност
                </span>
            `;
        } else {
            stockDetailsHtml = `
                <span class="resolver-stock-none" style="font-size:0.92em; padding:6px 14px; background:#f8fafc; border:1px solid #e2e8f0; color:#64748b;">
                    ⚪ <b>0 бр. на склад</b> (няма налични готови бройки в Склад Детайли или Склад Материали)
                </span>
            `;
        }

        const isGood = (currentStock.hasInv && currentStock.inv.totalFree > 0) || (currentStock.hasSklad && currentStock.sklad.stock > 0);

        heroStockCardHtml = `
            <div class="resolver-hero-stock-box ${isGood ? 'in-stock' : 'out-of-stock'}">
                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                    <span style="font-size:1.35em;">${isGood ? '🏢' : '📦'}</span>
                    <div>
                        <div class="resolver-stock-title ${isGood ? 'in-stock' : ''}">Текуща наличност на склад за този детайл:</div>
                        <div style="margin-top:4px;">
                            ${stockDetailsHtml}
                        </div>
                    </div>
                </div>
                ${nomInfo['Местоположение'] ? `<div style="font-size:0.85em; color:#475569; background:#ffffff; padding:4px 10px; border-radius:6px; border:1px solid #cbd5e1;">📍 Локация: <b>${nomInfo['Местоположение']}</b></div>` : ''}
            </div>
        `;
    }

    let originBoxHtml = '';
    if (originMaterialInfo) {
        let stockBadge = '<span class="resolver-stock-none">⚪ Без складов запис</span>';
        if (originMaterialInfo.sklad) {
            if (originMaterialInfo.sklad.stock >= originMaterialInfo.totalQty) {
                stockBadge = `<span class="resolver-stock-ok">🟢 В наличност: ${originMaterialInfo.sklad.stock.toLocaleString('bg-BG')} ${originMaterialInfo.unit}</span>`;
            } else {
                const def = originMaterialInfo.totalQty - originMaterialInfo.sklad.stock;
                stockBadge = `<span class="resolver-stock-deficit">🔴 Недостиг: ${originMaterialInfo.sklad.stock.toLocaleString('bg-BG')} ${originMaterialInfo.unit} (дефицит: ${def.toLocaleString('bg-BG')})</span>`;
            }
        }
        originBoxHtml = `
            <div class="resolver-raw-origin-box">
                <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span style="font-size:1.5em; background:#dbeafe; width:40px; height:40px; border-radius:8px; display:flex; align-items:center; justify-content:center;">✂️</span>
                        <div>
                            <div style="font-size:0.8em; color:#1e40af; font-weight:800; text-transform:uppercase; letter-spacing:0.04em;">Изходен материал / Заготовка (от Номенклатура):</div>
                            <div style="display:flex; align-items:center; gap:10px; margin-top:2px; flex-wrap:wrap;">
                                <span style="font-size:1.15em; font-weight:900; color:#0f172a; font-family:monospace; background:#ffffff; padding:2px 10px; border-radius:6px; border:1.5px solid #93c5fd; box-shadow:0 1px 2px rgba(0,0,0,0.05);">${originMaterialInfo.code}</span>
                                <span style="font-size:0.92em; font-weight:700; color:#1e3a8a;">Разходна норма: <b>${originMaterialInfo.norm} ${originMaterialInfo.unit}</b> / бр.</span>
                            </div>
                        </div>
                    </div>
                    <div>
                        ${stockBadge}
                    </div>
                </div>
            </div>
        `;
    }

    const heroHtml = `
        <div class="resolver-hero-card">
            <div style="width:100%;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px;">
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
                ${heroStockCardHtml}
                ${originBoxHtml}
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
                        ${renderTreeNode(currentUpper, bomMap, routesMap, skladMap, invMap, nomMap, currentResolverMultiplier)}
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
                                <th style="text-align:center; width: 85px;">Норма</th>
                                <th style="text-align:center; width: 95px;">За ${currentResolverMultiplier} бр.</th>
                                <th style="width: 220px;">Наличност на склад</th>
                                <th>Маршрут</th>
                                <th style="text-align:right; width: 120px;">Действие</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${partsList.map(p => {
                                const stockInfo = resolveStockForPart(p.code, p.totalQty, skladMap, invMap, nomMap);
                                const stockBadge = stockInfo ? stockInfo.badgeHtml : '<span class="resolver-stock-none">⚪ 0 бр. (Няма данни)</span>';

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
                                            <button class="resolver-drill-btn" style="padding: 4px 10px; font-size: 0.82em; white-space: nowrap;" onclick="drillDownResolverPart(decodeURIComponent('${safeChild}'))" title="Виж рецептата на този детайл">
                                                🔍 Виж състав
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
                                const stockInfo = resolveStockForPart(m.code, m.totalQty, skladMap, invMap, nomMap);
                                let stockBadge = '<span class="resolver-stock-none">⚪ Без складов запис</span>';
                                const unit = m.unitName || (stockInfo && stockInfo.hasSklad ? stockInfo.sklad.unit : (m.sklad ? m.sklad.unit : 'бр.'));
                                let bufferText = '—';

                                if (stockInfo && stockInfo.hasSklad) {
                                    const s = stockInfo.sklad;
                                    bufferText = s.minStock ? `Мин: ${s.minStock.toLocaleString('bg-BG')}` : '—';
                                    if (s.stock >= m.totalQty) {
                                        stockBadge = `<span class="resolver-stock-ok">🟢 В наличност: ${s.stock.toLocaleString('bg-BG')} ${unit}</span>`;
                                    } else {
                                        const deficit = m.totalQty - s.stock;
                                        stockBadge = `<span class="resolver-stock-deficit">🔴 Недостиг: ${s.stock.toLocaleString('bg-BG')} ${unit} (дефицит: ${deficit.toLocaleString('bg-BG')})</span>`;
                                    }
                                } else if (m.sklad) {
                                    bufferText = m.sklad.minStock ? `Мин: ${m.sklad.minStock.toLocaleString('bg-BG')}` : '—';
                                    if (m.sklad.stock >= m.totalQty) {
                                        stockBadge = `<span class="resolver-stock-ok">🟢 В наличност: ${m.sklad.stock.toLocaleString('bg-BG')} ${unit}</span>`;
                                    } else {
                                        const deficit = m.totalQty - m.sklad.stock;
                                        stockBadge = `<span class="resolver-stock-deficit">🔴 Недостиг: ${m.sklad.stock.toLocaleString('bg-BG')} ${unit} (дефицит: ${deficit.toLocaleString('bg-BG')})</span>`;
                                    }
                                }

                                const tagHtml = m.isFromNomenclature 
                                    ? `<span style="background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:4px; font-size:0.75em; font-weight:800; margin-left:6px; border:1px solid #bfdbfe;">✂️ Изходна заготовка (Номенклатура)</span>`
                                    : '';

                                return `
                                    <tr>
                                        <td>
                                            <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                                                <span style="font-weight: 700; color: #1e293b;">${m.code}</span>
                                                ${tagHtml}
                                            </div>
                                            ${m.opNum ? `<div style="font-size:0.8em; color:#d97706; margin-top:2px;">Влага се на Оп. № ${m.opNum}</div>` : ''}
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
                        <span>🔄 Маршрут и технологични операции</span>
                        <span style="font-size:0.85em; font-weight:normal; color:#64748b;">– общо ${rootRoutes.length} стъпки за изработка</span>
                    </div>
                </div>
                <div style="padding: 16px 20px; display:flex; flex-direction:column; gap:10px;">
                    ${rootRoutes.map(r => `
                        <div class="resolver-route-step">
                            <span style="background:#eab308; color:#ffffff; padding:2px 8px; border-radius:12px; font-weight:800; font-size:0.85em;">Оп. ${r['№ Операция']}</span>
                            <span style="font-weight:700; color:#1e293b; font-size:1.02em;">${r['Име на операция']}</span>
                            ${r['Машина'] ? `<span style="background:#ffffff; border:1px solid #fde047; padding:2px 8px; border-radius:4px; font-size:0.85em; color:#854d0e;">⚙️ Машина: <b>${r['Машина']}</b></span>` : ''}
                            ${r['Инструкция за оставяне'] ? `<span style="font-size:0.85em; color:#64748b;">📍 Оставяне: ${r['Инструкция за оставяне']}</span>` : ''}
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

function renderTreeNode(codeUpper, bomMap, routesMap, skladMap, invMap, nomMap, requiredQty) {
    const stockInfo = resolveStockForPart(codeUpper, requiredQty, skladMap, invMap, nomMap);
    let stockBadge = stockInfo ? stockInfo.badgeHtml : '';

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
            html += renderTreeNode(childUpper, bomMap, routesMap, skladMap, invMap, nomMap, requiredQty * c.qty);
        });
        html += `</ul>`;
    } else if (nomMap[codeUpper] && nomMap[codeUpper]['ID Родител']) {
        const pCode = String(nomMap[codeUpper]['ID Родител']).trim();
        if (pCode) {
            const pUpper = pCode.toUpperCase();
            const pNorm = parseFloat(nomMap[codeUpper]['Разходна норма']) || 1;
            const pUnit = nomMap[codeUpper]['Единици'] || (skladMap[pUpper] ? skladMap[pUpper].unit : 'бр.');
            const pStockInfo = resolveStockForPart(pUpper, requiredQty * pNorm, skladMap, invMap, nomMap);
            const pStockBadge = pStockInfo ? pStockInfo.badgeHtml : '';
            html += `<ul><li>
                <div class="tree-node">
                    <span style="font-size:0.9em;">✂️</span>
                    <span class="tree-part" style="background:#475569;">${pCode}</span> 
                    <span class="tree-qty">[${(requiredQty * pNorm).toLocaleString('bg-BG')} ${pUnit}]</span>
                    <span style="font-size:0.75em; color:#1e40af; font-weight:bold;">(Изходен материал по Номенклатура)</span>
                    ${pStockBadge}
                </div>
            </li></ul>`;
        }
    }
    
    html += `</li>`;
    return html;
}
