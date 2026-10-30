// ==============================================================
// МОДУЛ "ПРОБИ" (R&D / ПРОТОТИПИ И ОПИТНИ СЕРИИ)
// За ИС-СИСТЕМС Административен Панел
// ==============================================================

let probiCache = [];
let probiComponentsCache = {};
let probiFilter = 'all'; // 'all', 'Чернова', 'В производство', 'Одобрена', 'Отхвърлена'
let probiSearchQuery = '';

async function renderProbiTab(forceRefresh = false) {
    const mainTable = document.getElementById('mainTable');
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    const loadingLayout = document.getElementById('loadingLayout');
    const addNewBtn = document.getElementById('addNewBtn');

    if (mainTable) mainTable.style.display = 'none';
    if (addNewBtn) {
        addNewBtn.style.display = 'flex';
        addNewBtn.innerText = '➕ Нова Проба';
        addNewBtn.onclick = () => openCreateProbaModal();
    }

    let container = document.getElementById('probiContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'probiContainer';
        container.style.cssText = 'padding: 10px; width: 100%; box-sizing: border-box;';
        const wrapper = document.querySelector('.table-container');
        if (wrapper) wrapper.appendChild(container);
    }
    container.style.display = 'block';

    if (loadingLayout) loadingLayout.style.display = 'block';
    container.innerHTML = '<div style="text-align:center; padding: 40px; font-weight:700; color:#64748b;">Зареждане на пробите... 🧪</div>';

    try {
        await fetchProbiData(forceRefresh);
        if (loadingLayout) loadingLayout.style.display = 'none';
        buildProbiUI();
    } catch (err) {
        console.error('Грешка при зареждане на проби:', err);
        container.innerHTML = `<div style="text-align:center; padding:40px; color:#ef4444; font-weight:800;">
            ❌ Грешка при зареждане на модул Проби:<br>${err.message}<br><br>
            <span style="font-size:0.9em; color:#64748b; font-weight:400;">
            Уверете се, че таблицата <code>probi</code> е създадена в базата данни чрез скрипта <code>setup_probi.sql</code>.
            </span>
        </div>`;
    }
}

async function fetchProbiData(forceRefresh = false) {
    const { data: probiList, error: probiErr } = await client
        .from('probi')
        .select('*')
        .order('created_at', { ascending: false });

    if (probiErr) throw probiErr;
    probiCache = probiList || [];

    if (probiCache.length > 0) {
        const probiIds = probiCache.map(p => p.id);
        const { data: comps, error: compErr } = await client
            .from('probi_components')
            .select('*')
            .in('proba_id', probiIds);

        if (compErr) console.warn('Грешка при зареждане на компоненти:', compErr);
        
        probiComponentsCache = {};
        (comps || []).forEach(c => {
            if (!probiComponentsCache[c.proba_id]) probiComponentsCache[c.proba_id] = [];
            probiComponentsCache[c.proba_id].push(c);
        });
    } else {
        probiComponentsCache = {};
    }
}

function buildProbiUI() {
    const container = document.getElementById('probiContainer');
    if (!container) return;

    let filtered = probiCache;
    if (probiFilter !== 'all') {
        filtered = filtered.filter(p => p.status === probiFilter);
    }
    if (probiSearchQuery.trim() !== '') {
        let q = probiSearchQuery.trim().toLowerCase();
        filtered = filtered.filter(p => 
            (p.name && p.name.toLowerCase().includes(q)) ||
            (p.notes && p.notes.toLowerCase().includes(q))
        );
    }

    let filterPills = [
        { id: 'all', label: `Всички (${probiCache.length})` },
        { id: 'Чернова', label: `Чернови (${probiCache.filter(p=>p.status==='Чернова').length})` },
        { id: 'В производство', label: `⚡ В производство (${probiCache.filter(p=>p.status==='В производство').length})` },
        { id: 'Одобрена', label: `✅ Одобрени (${probiCache.filter(p=>p.status==='Одобрена').length})` },
        { id: 'Отхвърлена', label: `❌ Отхвърлени (${probiCache.filter(p=>p.status==='Отхвърлена').length})` }
    ];

    let pillsHtml = filterPills.map(f => {
        let activeStyle = probiFilter === f.id 
            ? 'background: #7c3aed; color: white; border-color: #7c3aed; box-shadow: 0 2px 6px rgba(124,58,237,0.3);' 
            : 'background: white; color: #475569; border-color: #cbd5e1;';
        return `<button type="button" onclick="setProbiFilter('${f.id}')" style="padding: 6px 14px; border-radius: 20px; font-weight: 700; font-size: 0.88rem; cursor: pointer; border: 1px solid; transition: all 0.2s; ${activeStyle}">${f.label}</button>`;
    }).join(' ');

    let html = `
        <div style="background: white; border-radius: 12px; padding: 18px 22px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
            <div>
                <h2 style="margin: 0 0 6px 0; font-size: 1.4rem; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                    <span>🧪 Прототипи и Опитни Серии (Проби)</span>
                </h2>
                <div style="color: #64748b; font-size: 0.9rem;">
                    Конструирайте и тествайте нови резолвери изолирано от серийното производство.
                </div>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
                <input type="text" id="probiSearchInput" placeholder="🔍 Търси проба по име..." value="${probiSearchQuery}" oninput="onProbiSearch(event)" 
                    style="padding: 8px 14px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 0.9rem; width: 220px;">
                <button type="button" onclick="renderProbiTab(true)" style="padding: 8px 14px; background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; border-radius: 8px; font-weight: 700; cursor: pointer;" title="Опресни списъка">🔄</button>
            </div>
        </div>

        <div style="display: flex; gap: 8px; margin-bottom: 18px; flex-wrap: wrap;">
            ${pillsHtml}
        </div>
    `;

    if (filtered.length === 0) {
        html += `
            <div style="background: white; border-radius: 12px; padding: 60px 20px; text-align: center; border: 2px dashed #cbd5e1; margin-top: 10px;">
                <div style="font-size: 3rem; margin-bottom: 10px;">🧪</div>
                <h3 style="color: #334155; margin: 0 0 8px 0;">Няма намерени проби</h3>
                <p style="color: #64748b; margin: 0 0 20px 0; font-size: 0.95rem;">Създайте първата опитна серия с бутона „Нова Проба“ горе вдясно.</p>
                <button type="button" onclick="openCreateProbaModal()" style="padding: 10px 20px; background: #7c3aed; color: white; border: none; border-radius: 8px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 10px rgba(124,58,237,0.3);">➕ Създай Нова Проба</button>
            </div>
        `;
    } else {
        html += `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 18px;">`;
        filtered.forEach(proba => {
            html += generateProbaCardHTML(proba);
        });
        html += `</div>`;
    }

    container.innerHTML = html;
}

function generateProbaCardHTML(proba) {
    const comps = probiComponentsCache[proba.id] || [];
    
    let statusBg = '#94a3b8';
    let statusText = proba.status;
    let statusIcon = '📝';
    let cardBorder = '#e2e8f0';

    if (proba.status === 'Чернова') {
        statusBg = '#64748b';
        statusIcon = '✏️';
    } else if (proba.status === 'В производство') {
        statusBg = '#7c3aed';
        statusIcon = '⚡';
        cardBorder = '#c4b5fd';
    } else if (proba.status === 'Одобрена') {
        statusBg = '#16a34a';
        statusIcon = '✅';
        cardBorder = '#86efac';
    } else if (proba.status === 'Отхвърлена') {
        statusBg = '#ef4444';
        statusIcon = '❌';
        cardBorder = '#fca5a5';
    }

    let createdDate = proba.created_at ? new Date(proba.created_at).toLocaleDateString('bg-BG') : '';
    let launchedDate = proba.launched_at ? new Date(proba.launched_at).toLocaleDateString('bg-BG') : '';

    let compsListHtml = '';
    if (comps.length === 0) {
        compsListHtml = `<span style="color:#94a3b8; font-style:italic; font-size:0.85rem;">Все още няма добавени компоненти</span>`;
    } else {
        compsListHtml = comps.map(c => {
            let newBadge = c.is_new ? `<span style="background:#fef3c7; color:#b45309; font-size:0.7rem; padding:1px 5px; border-radius:4px; font-weight:800; margin-left:4px;">НОВ</span>` : '';
            return `<span style="display:inline-block; background:#f1f5f9; color:#334155; padding:2px 8px; border-radius:6px; font-size:0.82rem; font-weight:600; margin:2px 3px 2px 0; border:1px solid #e2e8f0;">
                ${c.part_code} <span style="color:#64748b;">(x${c.qty_per_unit})</span>${newBadge}
            </span>`;
        }).join('');
    }

    let actionButtonsHtml = '';
    if (proba.status === 'Чернова') {
        actionButtonsHtml = `
            <button type="button" onclick="openProbiConstructorModal(${proba.id})" style="flex:1; padding:7px 10px; background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; border-radius:6px; font-weight:700; font-size:0.85rem; cursor:pointer;">🔧 Конструктор</button>
            <button type="button" onclick="launchProba(${proba.id})" style="flex:1.2; padding:7px 10px; background:#7c3aed; color:white; border:none; border-radius:6px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow:0 2px 6px rgba(124,58,237,0.3);">🚀 Пусни в Цеха</button>
            <button type="button" onclick="deleteProba(${proba.id})" style="padding:7px 10px; background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; border-radius:6px; font-weight:700; font-size:0.85rem; cursor:pointer;" title="Изтрий пробата">🗑️</button>
        `;
    } else if (proba.status === 'В производство') {
        actionButtonsHtml = `
            <button type="button" onclick="openProbiProgressModal(${proba.id})" style="flex:1; padding:7px 10px; background:#ede9fe; color:#6d28d9; border:1px solid #ddd6fe; border-radius:6px; font-weight:800; font-size:0.85rem; cursor:pointer;">📊 Напредък</button>
            <button type="button" onclick="approveProba(${proba.id})" style="flex:1; padding:7px 10px; background:#16a34a; color:white; border:none; border-radius:6px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow:0 2px 6px rgba(22,163,74,0.3);">✅ Одобри (Годна)</button>
            <button type="button" onclick="rejectProba(${proba.id})" style="padding:7px 10px; background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; border-radius:6px; font-weight:700; font-size:0.85rem; cursor:pointer;">❌</button>
        `;
    } else if (proba.status === 'Одобрена') {
        actionButtonsHtml = `
            <button type="button" onclick="openExportModal(${proba.id})" style="width:100%; padding:8px 12px; background:#059669; color:white; border:none; border-radius:6px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow:0 2px 6px rgba(5,150,105,0.3);">
                📥 Вкарай в Официална Номенклатура & БОМ
            </button>
        `;
    } else {
        actionButtonsHtml = `
            <button type="button" onclick="deleteProba(${proba.id})" style="width:100%; padding:7px 10px; background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; border-radius:6px; font-weight:700; font-size:0.85rem; cursor:pointer;">🗑️ Изтрий запис</button>
        `;
    }

    return `
        <div style="background: white; border-radius: 12px; border: 2px solid ${cardBorder}; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); display: flex; flex-direction: column; justify-content: space-between;">
            <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                    <span style="font-size:1.15rem; font-weight:800; color:#1e293b; line-height:1.3;">${proba.name}</span>
                    <span style="background:${statusBg}; color:white; padding:3px 9px; border-radius:20px; font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap; margin-left:8px;">
                        ${statusIcon} ${statusText}
                    </span>
                </div>

                <div style="display:flex; gap:14px; font-size:0.88rem; color:#475569; margin-bottom:12px; font-weight:600;">
                    <span>🎯 Целева бройка: <b style="color:#1e293b; font-size:1rem;">${proba.target_qty} бр.</b></span>
                    ${createdDate ? `<span style="color:#64748b;">📅 Създадена: ${createdDate}</span>` : ''}
                </div>

                ${proba.notes ? `<div style="background:#f8fafc; border-left:3px solid #7c3aed; padding:6px 10px; font-size:0.83rem; color:#475569; border-radius:4px; margin-bottom:12px;">${proba.notes}</div>` : ''}

                <div style="margin-bottom:14px;">
                    <div style="font-size:0.8rem; font-weight:700; color:#64748b; text-transform:uppercase; margin-bottom:5px;">
                        Компоненти (${comps.length}):
                    </div>
                    <div style="line-height:1.4;">
                        ${compsListHtml}
                    </div>
                </div>
            </div>

            <div style="display:flex; gap:8px; margin-top:12px; padding-top:12px; border-top:1px solid #f1f5f9;">
                ${actionButtonsHtml}
            </div>
        </div>
    `;
}

function setProbiFilter(f) {
    probiFilter = f;
    buildProbiUI();
}

function onProbiSearch(e) {
    probiSearchQuery = e.target.value;
    buildProbiUI();
}

// --- CREATE PROBA MODAL ---
async function openCreateProbaModal() {
    const { value: formValues } = await Swal.fire({
        title: '🧪 Нова Проба / Опитна Серия',
        html: `
            <div style="text-align:left; font-size:0.95rem;">
                <label style="display:block; font-weight:700; margin-bottom:4px; color:#1e293b;">Име на пробния модел / резолвер *</label>
                <input id="swalProbaName" class="swal2-input" placeholder="напр. Проба Вар. 25-Special" style="width:100%; box-sizing:border-box; margin:0 0 14px 0;">

                <label style="display:block; font-weight:700; margin-bottom:4px; color:#1e293b;">Целева бройка за изработка *</label>
                <input id="swalProbaQty" type="number" min="1" value="5" class="swal2-input" style="width:100%; box-sizing:border-box; margin:0 0 14px 0;">

                <label style="display:block; font-weight:700; margin-bottom:4px; color:#1e293b;">Бележки и изисквания към пробата</label>
                <textarea id="swalProbaNotes" class="swal2-textarea" placeholder="напр. Тест с нов вал и модифициран заден капак..." style="width:100%; box-sizing:border-box; margin:0; height:80px;"></textarea>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Създай и отвори конструктора ➔',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#7c3aed',
        preConfirm: () => {
            const name = document.getElementById('swalProbaName').value.trim();
            const qty = parseFloat(document.getElementById('swalProbaQty').value);
            const notes = document.getElementById('swalProbaNotes').value.trim();
            if (!name) {
                Swal.showValidationMessage('Моля, въведете име на новия резолвер!');
                return false;
            }
            if (isNaN(qty) || qty <= 0) {
                Swal.showValidationMessage('Въведете валидна целева бройка!');
                return false;
            }
            return { name, target_qty: qty, notes };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Запазване...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const { data, error } = await client
                .from('probi')
                .insert([{
                    name: formValues.name,
                    target_qty: formValues.target_qty,
                    notes: formValues.notes,
                    status: 'Чернова'
                }])
                .select();

            if (error) throw error;
            await fetchProbiData(true);
            buildProbiUI();
            Swal.close();

            if (data && data[0]) {
                openProbiConstructorModal(data[0].id);
            }
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
}

// --- CONSTRUCTOR MODAL ---
async function openProbiConstructorModal(probaId) {
    const proba = probiCache.find(p => p.id === probaId);
    if (!proba) return;

    // Fetch nomenclature for searching
    let nomList = [];
    try {
        const { data } = await client.from('Номенклатура').select('*').limit(3000);
        nomList = data || [];
    } catch (e) {
        console.warn('Номенклатура fetch failed:', e);
    }

    // Refresh components
    const { data: comps } = await client.from('probi_components').select('*').eq('proba_id', probaId);
    probiComponentsCache[probaId] = comps || [];

    const renderModalBody = () => {
        const currentComps = probiComponentsCache[probaId] || [];

        let compsRowsHtml = '';
        if (currentComps.length === 0) {
            compsRowsHtml = `<tr><td colspan="5" style="text-align:center; padding:25px; color:#94a3b8; font-style:italic;">Няма добавени детайли. Използвайте търсачката вляво.</td></tr>`;
        } else {
            compsRowsHtml = currentComps.map((c, idx) => {
                let newBadge = c.is_new ? `<span style="background:#fef3c7; color:#b45309; padding:1px 6px; border-radius:4px; font-weight:800; font-size:0.75rem;">НОВ</span>` : '';
                let totalQty = (parseFloat(proba.target_qty) || 1) * (parseFloat(c.qty_per_unit) || 1);

                let routesDesc = '';
                if (c.is_new && c.custom_routes && c.custom_routes.length > 0) {
                    routesDesc = c.custom_routes.map(r => `${r.op_name} (${r.machine || 'без машина'})`).join(' ➔ ');
                } else {
                    routesDesc = `<span style="color:#64748b;">от маршрутна карта</span>`;
                }

                return `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:10px 8px; font-weight:700; color:#1e293b;">${c.part_code} ${newBadge}</td>
                        <td style="padding:10px 8px; text-align:center;">
                            <input type="number" min="0.1" step="0.1" value="${c.qty_per_unit}" onchange="updateCompQty(${c.id}, this.value, ${probaId})" 
                                style="width:55px; text-align:center; padding:4px; border:1px solid #cbd5e1; border-radius:4px; font-weight:700;">
                        </td>
                        <td style="padding:10px 8px; text-align:center; font-weight:800; color:#7c3aed;">${totalQty} бр.</td>
                        <td style="padding:10px 8px; font-size:0.8rem; color:#475569;">${routesDesc}</td>
                        <td style="padding:10px 8px; text-align:center;">
                            <button type="button" onclick="removeCompFromProba(${c.id}, ${probaId})" style="background:none; border:none; cursor:pointer; color:#ef4444; font-size:1.1rem;" title="Премахни">🗑️</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        return `
            <div style="text-align:left; font-size:0.9rem;">
                <div style="background:#f5f3ff; border:1px solid #ddd6fe; border-radius:8px; padding:10px 14px; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <span style="font-weight:800; color:#6d28d9; font-size:1.05rem;">🧪 ${proba.name}</span>
                        <span style="color:#5b21b6; margin-left:12px;">Цел: <b>${proba.target_qty} бр.</b></span>
                    </div>
                    <button type="button" onclick="openNewPartDialog(${probaId})" style="padding:6px 12px; background:#7c3aed; color:white; border:none; border-radius:6px; font-weight:800; font-size:0.82rem; cursor:pointer; box-shadow:0 2px 5px rgba(124,58,237,0.3);">
                        ✨ Създай НОВ детайл
                    </button>
                </div>

                <div style="display:grid; grid-template-columns: 320px 1fr; gap:16px;">
                    <!-- LEFT: SEARCH NOMENCLATURE -->
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; display:flex; flex-direction:column; height:380px;">
                        <div style="font-weight:800; color:#334155; margin-bottom:8px;">📁 Каталог Номенклатура</div>
                        <input type="text" id="nomSearchBox" placeholder="🔍 Търси детайл (тяло, капак, вал)..." oninput="filterNomSearch(this.value)" 
                            style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; margin-bottom:10px; font-size:0.88rem;">
                        <div id="nomResultsList" style="flex:1; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px; background:white; padding:4px;">
                            <!-- dynamically filled -->
                        </div>
                    </div>

                    <!-- RIGHT: CURRENT COMPONENTS -->
                    <div style="background:white; border:1px solid #e2e8f0; border-radius:8px; padding:12px; display:flex; flex-direction:column; height:380px;">
                        <div style="font-weight:800; color:#334155; margin-bottom:8px;">🧩 Избрани деца в състава (${currentComps.length})</div>
                        <div style="flex:1; overflow-y:auto;">
                            <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
                                <thead>
                                    <tr style="background:#f1f5f9; color:#475569; border-bottom:2px solid #cbd5e1; font-size:0.8rem;">
                                        <th style="padding:8px; text-align:left;">Детайл</th>
                                        <th style="padding:8px; text-align:center;">За 1 бр.</th>
                                        <th style="padding:8px; text-align:center;">Общо</th>
                                        <th style="padding:8px; text-align:left;">Операции</th>
                                        <th style="padding:8px; text-align:center;">Действие</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${compsRowsHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    window._probaNomList = nomList;
    window._currentProbaId = probaId;

    Swal.fire({
        title: 'Конструктор на състава на пробата',
        html: `<div id="probaConstructorContainer">${renderModalBody()}</div>`,
        width: 950,
        showCancelButton: true,
        confirmButtonText: '🚀 Пусни за изпълнение',
        cancelButtonText: 'Затвори',
        confirmButtonColor: '#7c3aed',
        didOpen: () => {
            filterNomSearch('');
        }
    }).then((res) => {
        if (res.isConfirmed) {
            launchProba(probaId);
        } else {
            buildProbiUI();
        }
    });
}

function filterNomSearch(query) {
    const box = document.getElementById('nomResultsList');
    if (!box || !window._probaNomList) return;

    let q = (query || '').toLowerCase().trim();
    let matches = window._probaNomList.filter(n => {
        let code = String(n['ID Детайл'] || '').toLowerCase();
        let name = String(n['Вътрешно име'] || '').toLowerCase();
        let type = String(n['Тип'] || '').toLowerCase();
        return code.includes(q) || name.includes(q) || type.includes(q);
    }).slice(0, 50);

    if (matches.length === 0) {
        box.innerHTML = `<div style="text-align:center; padding:20px; color:#94a3b8; font-size:0.85rem;">Няма съвпадения</div>`;
        return;
    }

    box.innerHTML = matches.map(n => {
        let code = String(n['ID Детайл']).trim();
        let type = n['Тип'] ? `<span style="color:#64748b; font-size:0.75rem;">[${n['Тип']}]</span>` : '';
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:7px 8px; border-bottom:1px solid #f1f5f9;">
                <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px;">
                    <b style="color:#1e293b; font-size:0.85rem;">${code}</b> ${type}
                </div>
                <button type="button" onclick="addExistingPartToProba('${code.replace(/'/g, "\\'")}')" 
                    style="padding:3px 8px; background:#e0e7ff; color:#4338ca; border:1px solid #c7d2fe; border-radius:5px; font-weight:800; font-size:0.78rem; cursor:pointer;">
                    ➕ Добави
                </button>
            </div>
        `;
    }).join('');
}

async function addExistingPartToProba(partCode) {
    const probaId = window._currentProbaId;
    if (!probaId) return;

    try {
        const { error } = await client.from('probi_components').insert([{
            proba_id: probaId,
            part_code: partCode,
            qty_per_unit: 1,
            is_new: false
        }]);
        if (error) throw error;

        const { data: comps } = await client.from('probi_components').select('*').eq('proba_id', probaId);
        probiComponentsCache[probaId] = comps || [];

        // Re-render modal inside container
        const cContainer = document.getElementById('probaConstructorContainer');
        if (cContainer) {
            openProbiConstructorModal(probaId);
        }
    } catch (err) {
        Swal.fire('Грешка', err.message, 'error');
    }
}

async function removeCompFromProba(compId, probaId) {
    try {
        await client.from('probi_components').delete().eq('id', compId);
        const { data: comps } = await client.from('probi_components').select('*').eq('proba_id', probaId);
        probiComponentsCache[probaId] = comps || [];
        openProbiConstructorModal(probaId);
    } catch (err) {
        Swal.fire('Грешка', err.message, 'error');
    }
}

async function updateCompQty(compId, newQty, probaId) {
    let q = parseFloat(newQty);
    if (isNaN(q) || q <= 0) q = 1;
    try {
        await client.from('probi_components').update({ qty_per_unit: q }).eq('id', compId);
        const { data: comps } = await client.from('probi_components').select('*').eq('proba_id', probaId);
        probiComponentsCache[probaId] = comps || [];
        openProbiConstructorModal(probaId);
    } catch (err) {
        console.error('Update qty error:', err);
    }
}

// --- NEW PART DIALOG ---
async function openNewPartDialog(probaId) {
    // Get unique machines from routes
    let machines = [];
    try {
        const { data } = await client.from('marshruti').select('Машина').limit(1000);
        if (data) {
            data.forEach(r => {
                let m = (r['Машина'] || '').trim();
                if (m && !machines.includes(m)) machines.push(m);
            });
            machines.sort();
        }
    } catch (e) {
        console.warn('Machines fetch failed:', e);
    }

    let machinesOptionsHtml = machines.map(m => `<option value="${m}">${m}</option>`).join('');

    const { value: result } = await Swal.fire({
        title: '✨ Създай НОВ пробен детайл',
        html: `
            <div style="text-align:left; font-size:0.9rem;">
                <label style="display:block; font-weight:700; margin-bottom:4px; color:#1e293b;">Наименование на новия детайл *</label>
                <input id="swalNewPartName" class="swal2-input" placeholder="напр. Вал Пробен 25-Special" style="width:100%; box-sizing:border-box; margin:0 0 14px 0;">

                <label style="display:block; font-weight:700; margin-bottom:4px; color:#1e293b;">Бройка за 1 резолвер *</label>
                <input id="swalNewPartQty" type="number" min="0.1" step="0.1" value="1" class="swal2-input" style="width:100%; box-sizing:border-box; margin:0 0 16px 0;">

                <div style="border-top:1px solid #e2e8f0; padding-top:12px; margin-top:12px;">
                    <div style="font-weight:800; color:#1e293b; margin-bottom:8px;">Маршрут (Операции):</div>
                    
                    <div style="margin-bottom:10px;">
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                            <input type="radio" name="swalRouteType" value="copy" checked onchange="toggleRouteInputType(this.value)">
                            <span>Опция 1: Копирай операциите от съществуващ детайл</span>
                        </label>
                        <div id="copyRouteBox" style="margin-top:6px; margin-left:22px;">
                            <input type="text" id="copyPartCode" placeholder="Въведи код на съществуващ детайл (напр. Вал Вар. 25)..." style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.88rem;">
                        </div>
                    </div>

                    <div>
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                            <input type="radio" name="swalRouteType" value="manual" onchange="toggleRouteInputType(this.value)">
                            <span>Опция 2: Ръчно въвеждане на операции</span>
                        </label>
                        <div id="manualRouteBox" style="display:none; margin-top:8px; margin-left:22px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px;">
                            <div id="manualOpsList">
                                <div class="manual-op-row" style="display:flex; gap:6px; margin-bottom:6px;">
                                    <input type="number" class="manual-op-num" value="10" placeholder="№" style="width:50px; padding:4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center;">
                                    <input type="text" class="manual-op-name" value="Струговане" placeholder="Име операция" style="flex:1; padding:4px; border:1px solid #cbd5e1; border-radius:4px;">
                                    <select class="manual-op-machine" style="flex:1; padding:4px; border:1px solid #cbd5e1; border-radius:4px;">
                                        <option value="">-- Избери машина --</option>
                                        ${machinesOptionsHtml}
                                    </select>
                                </div>
                            </div>
                            <button type="button" onclick="addManualOpRow()" style="padding:4px 10px; background:#e2e8f0; border:none; border-radius:4px; font-weight:700; font-size:0.8rem; cursor:pointer; margin-top:4px;">+ Добави операция</button>
                        </div>
                    </div>
                </div>
            </div>
        `,
        width: 600,
        showCancelButton: true,
        confirmButtonText: '💾 Запази детайла',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#7c3aed',
        preConfirm: async () => {
            const name = document.getElementById('swalNewPartName').value.trim();
            const qty = parseFloat(document.getElementById('swalNewPartQty').value);
            const routeType = document.querySelector('input[name="swalRouteType"]:checked').value;

            if (!name) {
                Swal.showValidationMessage('Въведете наименование на детайла!');
                return false;
            }

            let customRoutes = [];
            if (routeType === 'copy') {
                const copyCode = document.getElementById('copyPartCode').value.trim();
                if (!copyCode) {
                    Swal.showValidationMessage('Въведете код на детайла за копиране на маршрута!');
                    return false;
                }
                const { data: routes } = await client.from('marshruti').select('*').ilike('Код на детайла', copyCode).order('№ Операция');
                if (!routes || routes.length === 0) {
                    Swal.showValidationMessage(`Не бяха намерени операции за детайл "${copyCode}"!`);
                    return false;
                }
                customRoutes = routes.map(r => ({
                    op_num: parseInt(r['№ Операция']) || 10,
                    op_name: String(r['Име на операция']).trim(),
                    machine: String(r['Машина'] || '').trim()
                }));
            } else {
                const rows = document.querySelectorAll('.manual-op-row');
                rows.forEach(r => {
                    let opNum = parseInt(r.querySelector('.manual-op-num').value) || 10;
                    let opName = r.querySelector('.manual-op-name').value.trim();
                    let machine = r.querySelector('.manual-op-machine').value.trim();
                    if (opName) {
                        customRoutes.push({ op_num: opNum, op_name: opName, machine: machine });
                    }
                });
                if (customRoutes.length === 0) {
                    Swal.showValidationMessage('Въведете поне 1 операция за новия детайл!');
                    return false;
                }
            }

            return { name, qty_per_unit: qty || 1, customRoutes };
        }
    });

    if (result) {
        Swal.fire({ title: 'Добавяне...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const { error } = await client.from('probi_components').insert([{
                proba_id: probaId,
                part_code: result.name,
                part_name: result.name,
                qty_per_unit: result.qty_per_unit,
                is_new: true,
                custom_routes: result.customRoutes
            }]);
            if (error) throw error;
            Swal.close();
            openProbiConstructorModal(probaId);
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
}

window.toggleRouteInputType = function(val) {
    const copyBox = document.getElementById('copyRouteBox');
    const manualBox = document.getElementById('manualRouteBox');
    if (copyBox && manualBox) {
        copyBox.style.display = (val === 'copy') ? 'block' : 'none';
        manualBox.style.display = (val === 'manual') ? 'block' : 'none';
    }
};

window.addManualOpRow = function() {
    const list = document.getElementById('manualOpsList');
    if (!list) return;
    const count = list.querySelectorAll('.manual-op-row').length;
    const nextNum = (count + 1) * 10;
    const firstRow = list.querySelector('.manual-op-row');
    const cloned = firstRow.cloneNode(true);
    cloned.querySelector('.manual-op-num').value = nextNum;
    cloned.querySelector('.manual-op-name').value = '';
    list.appendChild(cloned);
};

// --- LAUNCH PROBA ---
async function launchProba(probaId) {
    const proba = probiCache.find(p => p.id === probaId);
    const comps = probiComponentsCache[probaId] || [];

    if (comps.length === 0) {
        Swal.fire('Внимание', 'Моля, добавете поне 1 компонент в състава на пробата преди да я пуснете!', 'warning');
        return;
    }

    const { isConfirmed } = await Swal.fire({
        title: '🚀 Пускане за изпълнение в цеха?',
        html: `
            Сигурни ли сте, че искате да пуснете <b>${proba.name}</b> за изработка?<br><br>
            В MES терминалите в цеха ще се генерират <b style="color:#7c3aed;">виолетови карти 🧪 ПРОБА</b> за съответните работни места на детайлите.
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Да, пусни картите!',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#7c3aed'
    });

    if (isConfirmed) {
        Swal.fire({ title: 'Пускане на пробата...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const { error } = await client.from('probi').update({
                status: 'В производство',
                launched_at: new Date().toISOString()
            }).eq('id', probaId);

            if (error) throw error;
            await fetchProbiData(true);
            buildProbiUI();
            Swal.fire('Готово!', 'Пробата е пусната за изпълнение. Картите вече са видими на терминалите!', 'success');
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
}

// --- PROGRESS MODAL ---
async function openProbiProgressModal(probaId) {
    const proba = probiCache.find(p => p.id === probaId);
    const comps = probiComponentsCache[probaId] || [];

    Swal.fire({ title: 'Зареждане на прогреса...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        // Fetch otcheti for this proba
        const planKey = 'PROBA_' + probaId;
        const { data: reports } = await client.from('otcheti').select('*').eq('ID План', planKey);
        const otchetiList = reports || [];

        // Build progress matrix
        let progressHtml = `
            <div style="text-align:left; font-size:0.9rem;">
                <div style="background:#f5f3ff; border:1px solid #ddd6fe; border-radius:8px; padding:10px 14px; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <span style="font-weight:800; color:#6d28d9; font-size:1.1rem;">🧪 ${proba.name}</span>
                        <span style="color:#5b21b6; margin-left:12px;">Цел: <b>${proba.target_qty} бр.</b></span>
                    </div>
                    <span style="background:#7c3aed; color:white; padding:3px 10px; border-radius:15px; font-weight:800; font-size:0.8rem;">⚡ В ПРОИЗВОДСТВО</span>
                </div>

                <div style="max-height:400px; overflow-y:auto;">
        `;

        for (const comp of comps) {
            let needed = (parseFloat(proba.target_qty) || 1) * (parseFloat(comp.qty_per_unit) || 1);
            
            // Get routes
            let routes = [];
            if (cIsNewAndCustom(comp)) {
                routes = comp.custom_routes;
            } else {
                const { data: rData } = await client.from('marshruti').select('*').ilike('Код на детайла', comp.part_code).order('№ Операция');
                routes = (rData || []).map(r => ({
                    op_num: parseInt(r['№ Операция']) || 10,
                    op_name: String(r['Име на операция']).trim(),
                    machine: String(r['Машина'] || '').trim()
                }));
            }

            let opsProgressHtml = '';
            if (routes.length === 0) {
                opsProgressHtml = `<span style="color:#94a3b8; font-size:0.85rem;">Няма дефинирани операции (складов детайл)</span>`;
            } else {
                opsProgressHtml = routes.map(op => {
                    let done = 0;
                    otchetiList.forEach(r => {
                        if (String(r['ID Детайл']).trim().toLowerCase() === comp.part_code.toLowerCase() &&
                            String(r['Операция']).trim().toLowerCase() === op.op_name.toLowerCase() &&
                            r['Статус'] === 'Отчетено') {
                            done += (parseFloat(r['Количество']) || 0);
                        }
                    });

                    let isDone = done >= needed;
                    let badgeBg = isDone ? '#dcfce7' : (done > 0 ? '#dbeafe' : '#f1f5f9');
                    let badgeColor = isDone ? '#15803d' : (done > 0 ? '#1d4ed8' : '#64748b');

                    return `
                        <div style="background:${badgeBg}; color:${badgeColor}; border:1px solid rgba(0,0,0,0.06); padding:4px 8px; border-radius:6px; font-size:0.82rem; font-weight:700; margin-bottom:4px; display:flex; justify-content:space-between;">
                            <span>${op.op_name} <span style="font-weight:400; font-size:0.75rem;">(${op.machine || 'без машина'})</span></span>
                            <span>${done} / ${needed} бр.</span>
                        </div>
                    `;
                }).join('');
            }

            progressHtml += `
                <div style="background:white; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-weight:800; color:#1e293b; font-size:0.95rem;">${comp.part_code}</span>
                        <span style="font-weight:700; color:#7c3aed; font-size:0.85rem;">Нужни: ${needed} бр.</span>
                    </div>
                    <div>
                        ${opsProgressHtml}
                    </div>
                </div>
            `;
        }

        progressHtml += `</div></div>`;

        Swal.fire({
            title: 'Напредък на пробата в цеха',
            html: progressHtml,
            width: 750,
            confirmButtonText: 'Затвори',
            confirmButtonColor: '#7c3aed'
        });
    } catch (err) {
        Swal.fire('Грешка', err.message, 'error');
    }
}

function cIsNewAndCustom(c) {
    return c.is_new && c.custom_routes && Array.isArray(c.custom_routes) && c.custom_routes.length > 0;
}

// --- APPROVE & REJECT ---
async function approveProba(probaId) {
    const { isConfirmed } = await Swal.fire({
        title: '✅ Одобряване на модела',
        text: 'Потвърждавате ли, че пробният модел е преминал успешно тестовете и е годен за серийно производство?',
        icon: 'success',
        showCancelButton: true,
        confirmButtonText: 'Да, моделът е годен!',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#16a34a'
    });

    if (isConfirmed) {
        try {
            await client.from('probi').update({
                status: 'Одобрена',
                completed_at: new Date().toISOString()
            }).eq('id', probaId);

            await fetchProbiData(true);
            buildProbiUI();

            Swal.fire({
                title: '🎉 Моделът е одобрен!',
                text: 'Искате ли сега да го прехвърлите автоматично в официалната Номенклатура и БОМ?',
                icon: 'success',
                showCancelButton: true,
                confirmButtonText: '📥 Прехвърли в Номенклатура',
                cancelButtonText: 'По-късно',
                confirmButtonColor: '#059669'
            }).then((res) => {
                if (res.isConfirmed) {
                    openExportModal(probaId);
                }
            });
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
}

async function rejectProba(probaId) {
    const { isConfirmed } = await Swal.fire({
        title: '❌ Отхвърляне на пробата',
        text: 'Сигурни ли сте, че моделът не отговаря на изискванията и трябва да се прекрати?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Да, прекрати пробата',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#ef4444'
    });

    if (isConfirmed) {
        try {
            await client.from('probi').update({ status: 'Отхвърлена' }).eq('id', probaId);
            await fetchProbiData(true);
            buildProbiUI();
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
}

async function deleteProba(probaId) {
    const { isConfirmed } = await Swal.fire({
        title: '🗑️ Изтриване на проба?',
        text: 'Това ще изтрие дефиницията на пробата и нейните компоненти.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Да, изтрий',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#ef4444'
    });

    if (isConfirmed) {
        try {
            await client.from('probi').delete().eq('id', probaId);
            await fetchProbiData(true);
            buildProbiUI();
            Swal.fire('Изтрита', 'Пробата беше премахната.', 'success');
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
}

// --- EXPORT TO OFFICIAL NOMENKLATURA & BOM ---
async function openExportModal(probaId) {
    const proba = probiCache.find(p => p.id === probaId);
    const comps = probiComponentsCache[probaId] || [];

    const { isConfirmed } = await Swal.fire({
        title: '📥 Прехвърляне в Номенклатура и БОМ',
        html: `
            <div style="text-align:left; font-size:0.9rem;">
                Системата ще извърши следните действия:
                <ul style="margin:10px 0; padding-left:20px; line-height:1.5;">
                    <li>Вкарване на <b>${proba.name}</b> в таблица <code>Номенклатура</code> (Тип: "Резолвер")</li>
                    <li>Вкарване на всички нови детайли (${comps.filter(c=>c.is_new).length} бр.) в <code>Номенклатура</code> и <code>marshruti</code></li>
                    <li>Генериране на записите в <code>bom</code> за сглобяването на новия резолвер</li>
                </ul>
                Потвърждавате ли операцията?
            </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Да, прехвърли!',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#059669'
    });

    if (isConfirmed) {
        Swal.fire({ title: 'Прехвърляне на данните...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            // 1. Insert root resolver into Номенклатура
            await client.from('Номенклатура').upsert([{
                "ID Детайл": proba.name,
                "Вътрешно име": proba.name,
                "Тип": "Резолвер",
                "Описание": proba.notes || 'Одобрен след проба'
            }], { onConflict: 'ID Детайл' });

            // 2. Insert new components into Номенклатура and marshruti
            for (const c of comps) {
                if (c.is_new) {
                    await client.from('Номенклатура').upsert([{
                        "ID Детайл": c.part_code,
                        "Вътрешно име": c.part_code,
                        "Тип": "Детайл (от проба)"
                    }], { onConflict: 'ID Детайл' });

                    if (c.custom_routes && c.custom_routes.length > 0) {
                        for (const r of c.custom_routes) {
                            await client.from('marshruti').insert([{
                                "Код на детайла": c.part_code,
                                "№ Операция": r.op_num || 10,
                                "Име на операция": r.op_name,
                                "Машина": r.machine || ''
                            }]);
                        }
                    }
                }

                // 3. Insert BOM line
                await client.from('bom').insert([{
                    "ID Родител": proba.name,
                    "ID Компонент": c.part_code,
                    "Количество": c.qty_per_unit || 1
                }]);
            }

            Swal.fire('Готово!', 'Моделът и компонентите му бяха успешно прехвърлени в Номенклатура и БОМ!', 'success');
        } catch (err) {
            Swal.fire('Грешка при прехвърляне', err.message, 'error');
        }
    }
}


window.onProbiSearchFromGlobal = function(q) {
    probiSearchQuery = q;
    buildProbiUI();
};
