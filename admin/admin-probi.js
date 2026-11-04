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
            <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                <input type="text" id="probiSearchInput" placeholder="🔍 Търси проба по име..." value="${probiSearchQuery}" oninput="onProbiSearch(event)" 
                    style="padding: 8px 14px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 0.9rem; width: 200px;">
                <button type="button" onclick="openProbiInventoryModal()" style="padding: 8px 14px; background: #ede9fe; color: #6d28d9; border: 1px solid #ddd6fe; border-radius: 8px; font-weight: 800; font-size: 0.88rem; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                    📦 Склад Проби
                </button>
                <button type="button" onclick="openCreateProbaModal()" style="padding: 8px 16px; background: #7c3aed; color: white; border: none; border-radius: 8px; font-weight: 800; font-size: 0.88rem; cursor: pointer; box-shadow: 0 2px 6px rgba(124,58,237,0.3);">
                    ➕ Нова Проба
                </button>
                <button type="button" onclick="renderProbiTab(true)" style="padding: 8px 12px; background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; border-radius: 8px; font-weight: 700; cursor: pointer;" title="Опресни списъка">🔄</button>
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
            html += renderProbaCard(proba);
        });
        html += `</div>`;
    }

    container.innerHTML = html;
}

function renderProbaCard(proba) {
    const comps = probiComponentsCache[proba.id] || [];
    let statusText = proba.status || 'Чернова';
    let statusBg = '#64748b';
    let statusIcon = '📝';
    let cardBorder = '#e2e8f0';

    if (proba.status === 'В производство') {
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

    let compsListHtml = '';
    if (comps.length === 0) {
        compsListHtml = `<span style="color:#94a3b8; font-style:italic; font-size:0.85rem;">Все още няма добавени компоненти</span>`;
    } else {
        compsListHtml = comps.map(c => {
            let newBadge = c.is_new ? `<span style="background:#fef3c7; color:#b45309; font-size:0.7rem; padding:1px 5px; border-radius:4px; font-weight:800; margin-left:4px;">НОВ</span>` : '';
            let subBadge = c.parent_part_code ? `<span style="color:#6366f1; font-size:0.7rem;">(↳ към ${c.parent_part_code})</span> ` : '';
            return `<span style="display:inline-block; background:#f1f5f9; color:#334155; padding:2px 8px; border-radius:6px; font-size:0.82rem; font-weight:600; margin:2px 3px 2px 0; border:1px solid #e2e8f0;">
                ${subBadge}${c.part_code} <span style="color:#64748b;">(x${c.qty_per_unit})</span>${newBadge}
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

    let isUrgent = (proba.is_urgent === true || (proba.notes && proba.notes.includes('[СПЕШНА]')) || (proba.notes && proba.notes.toLowerCase().includes('спешн')));

    return `
        <div style="background: white; border-radius: 12px; border: 2px solid ${isUrgent ? '#ef4444' : cardBorder}; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); display: flex; flex-direction: column; justify-content: space-between;">
            <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                    <div>
                        <span style="font-size:1.15rem; font-weight:800; color:#1e293b; line-height:1.3;">${proba.name}</span>
                        ${isUrgent ? `<span style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:900; margin-left:8px; display:inline-block;">⚡ СПЕШНА (ТОП ПРИОРИТЕТ)</span>` : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        ${(proba.status === 'Чернова' || proba.status === 'В производство') ? `
                            <button type="button" onclick="toggleProbaUrgent(${proba.id}, ${!isUrgent})" style="background:${isUrgent ? '#fee2e2' : '#f1f5f9'}; color:${isUrgent ? '#b91c1c' : '#475569'}; border:1px solid ${isUrgent ? '#fca5a5' : '#cbd5e1'}; padding:3px 8px; border-radius:14px; font-size:0.75rem; font-weight:800; cursor:pointer;" title="${isUrgent ? 'Премахни спешен приоритет' : 'Направи СПЕШНА (излиза начело в цеха)'}">
                                ${isUrgent ? '⚡ Спешна' : '☆ Направи Спешна'}
                            </button>
                        ` : ''}
                        <span style="background:${statusBg}; color:white; padding:3px 9px; border-radius:20px; font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap;">
                            ${statusIcon} ${statusText}
                        </span>
                    </div>
                </div>

                <div style="display:flex; gap:14px; font-size:0.88rem; color:#475569; margin-bottom:12px; font-weight:600;">
                    <span>🎯 Целева бройка: <b style="color:#1e293b; font-size:1rem;">${proba.target_qty} бр.</b></span>
                    ${createdDate ? `<span style="color:#64748b;">📅 Създадена: ${createdDate}</span>` : ''}
                </div>

                ${proba.notes ? `<div style="background:#f8fafc; border-left:3px solid ${isUrgent ? '#ef4444' : '#7c3aed'}; padding:6px 10px; font-size:0.83rem; color:#475569; border-radius:4px; margin-bottom:12px;">${proba.notes}</div>` : ''}

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
        title: '🧪 Нова Опитна Серия (Проба)',
        html: `
            <div style="text-align:left; font-size:0.9rem;">
                <label style="display:block; font-weight:700; margin-bottom:4px; color:#1e293b;">Наименование на пробния модел *</label>
                <input id="swalProbaName" class="swal2-input" placeholder="напр. Резолвер 575-12345 (Прототип)" style="width:100%; box-sizing:border-box; margin:0 0 14px 0;">

                <label style="display:block; font-weight:700; margin-bottom:4px; color:#1e293b;">Целева бройка за изработка *</label>
                <input id="swalProbaQty" type="number" min="1" value="1" class="swal2-input" placeholder="напр. 5" style="width:100%; box-sizing:border-box; margin:0 0 14px 0;">

                <label style="display:flex; align-items:center; gap:8px; font-weight:700; margin:10px 0 12px 0; color:#b91c1c; cursor:pointer;">
                    <input type="checkbox" id="swalProbaUrgent" style="width:18px; height:18px; cursor:pointer;">
                    <span>⚡ Спешна проба (Топ приоритет в цеха - изпреварва серийния план)</span>
                </label>

                <label style="display:block; font-weight:700; margin-bottom:4px; color:#1e293b;">Бележки и цел на изпитанието (по избор)</label>
                <textarea id="swalProbaNotes" class="swal2-textarea" placeholder="Особености, специални хлабини, изисквания към инженерите..." style="width:100%; box-sizing:border-box; margin:0; height:80px;"></textarea>
            </div>
        `,
        width: 550,
        showCancelButton: true,
        confirmButtonText: 'Създай и отвори конструктора ➔',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#7c3aed',
        focusConfirm: false,
        preConfirm: () => {
            const name = document.getElementById('swalProbaName').value.trim();
            const qty = parseFloat(document.getElementById('swalProbaQty').value);
            let notes = document.getElementById('swalProbaNotes').value.trim();
            const isUrgent = document.getElementById('swalProbaUrgent').checked;

            if (!name) {
                Swal.showValidationMessage('Моля, въведете име на пробата!');
                return false;
            }
            if (isNaN(qty) || qty <= 0) {
                Swal.showValidationMessage('Въведете валидна целева бройка!');
                return false;
            }
            if (isUrgent) {
                notes = ('[СПЕШНА] ' + notes).trim();
            }
            return { name, target_qty: qty, notes };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Запазване...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const { data, error } = await client.from('probi').insert([{
                name: formValues.name,
                target_qty: formValues.target_qty,
                notes: formValues.notes,
                status: 'Чернова',
                created_at: new Date().toISOString()
            }]).select();

            if (error) throw error;
            if (data && data[0]) {
                await fetchProbiData(true);
                buildProbiUI();
                openProbiConstructorModal(data[0].id);
            }
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
}

window.toggleProbaUrgent = async function(probaId, makeUrgent) {
    let proba = probiCache.find(p => p.id === probaId);
    if (!proba) return;
    let cleanNotes = (proba.notes || '').replace(/\[СПЕШНА\]\s*/g, '').trim();
    let newNotes = makeUrgent ? ('[СПЕШНА] ' + cleanNotes).trim() : cleanNotes;

    Swal.fire({ title: 'Обновяване на статус...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const { error } = await client.from('probi').update({ notes: newNotes || null }).eq('id', probaId);
        if (error) throw error;
        await fetchProbiData(true);
        buildProbiUI();
        const toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
        toast.fire({
            icon: makeUrgent ? 'warning' : 'info',
            title: makeUrgent ? '⚡ Пробата е маркирана като СПЕШНА! В Терминала ще застане начело.' : 'Спешният приоритет на пробата беше премахнат.'
        });
    } catch (err) {
        Swal.fire('Грешка', err.message, 'error');
    }
};

// --- CONSTRUCTOR MODAL WITH HIERARCHICAL SUB-COMPONENTS ---
async function openProbiConstructorModal(probaId) {
    const proba = probiCache.find(p => p.id === probaId);
    if (!proba) return;

    let nomList = [];
    try {
        const { data } = await client.from('Номенклатура').select('*').limit(3000);
        nomList = data || [];
    } catch (e) {
        console.warn('Номенклатура fetch failed:', e);
    }

    const { data: comps } = await client.from('probi_components').select('*').eq('proba_id', probaId);
    probiComponentsCache[probaId] = comps || [];

    const renderModalBody = () => {
        const currentComps = probiComponentsCache[probaId] || [];

        // Build hierarchical rows
        let compsRowsHtml = '';
        if (currentComps.length === 0) {
            compsRowsHtml = `<tr><td colspan="5" style="text-align:center; padding:25px; color:#94a3b8; font-style:italic;">Няма добавени детайли. Използвайте каталога вляво или бутона "Създай НОВ детайл".</td></tr>`;
        } else {
            // Recursive helper for rendering tree rows
            const renderTreeLevel = (parentCode, level) => {
                let items = [];
                if (!parentCode) {
                    items = currentComps.filter(c => !c.parent_part_code || c.parent_part_code.trim() === '');
                } else {
                    items = currentComps.filter(c => c.parent_part_code && c.parent_part_code.trim().toLowerCase() === parentCode.trim().toLowerCase());
                }

                items.forEach(c => {
                    let indent = level * 24;
                    let treePrefix = level > 0 ? `<span style="color:#6366f1; font-weight:800; margin-right:4px;">└── ↳</span>` : '';
                    let newBadge = c.is_new ? `<span style="background:#fef3c7; color:#b45309; padding:1px 5px; border-radius:4px; font-weight:800; font-size:0.72rem; margin-left:4px;">НОВ</span>` : '';
                    let rowBg = level > 0 ? 'background:#f8fafc;' : 'background:white;';
                    let totalQty = (parseFloat(proba.target_qty) || 1) * (parseFloat(c.qty_per_unit) || 1);

                    let routesDesc = '';
                    if (c.is_new && c.custom_routes && c.custom_routes.length > 0) {
                        routesDesc = c.custom_routes.map(r => `${r.op_name} (${r.machine || 'без машина'})`).join(' ➔ ');
                    } else {
                        routesDesc = `<span style="color:#64748b;">от маршрутна карта</span>`;
                    }

                    compsRowsHtml += `
                        <tr style="border-bottom:1px solid #f1f5f9; ${rowBg}">
                            <td style="padding:8px 8px; font-weight:700; color:#1e293b;">
                                <div style="display:flex; align-items:center; padding-left:${indent}px;">
                                    ${treePrefix}
                                    <span style="font-size:0.92rem;">${c.part_code}</span>
                                    ${newBadge}
                                </div>
                            </td>
                            <td style="padding:8px 6px; text-align:center;">
                                <input type="number" min="0.1" step="0.1" value="${c.qty_per_unit}" onchange="updateCompQty(${c.id}, this.value, ${probaId})" 
                                    style="width:50px; text-align:center; padding:3px; border:1px solid #cbd5e1; border-radius:4px; font-weight:700;">
                            </td>
                            <td style="padding:8px 6px; text-align:center; font-weight:800; color:#7c3aed;">${totalQty} бр.</td>
                            <td style="padding:8px 6px; font-size:0.78rem; color:#475569;">${routesDesc}</td>
                            <td style="padding:8px 6px; text-align:center;">
                                <div style="display:flex; gap:6px; justify-content:center; align-items:center;">
                                    <button type="button" onclick="openAddSubComponentDialog(${c.id}, '${c.part_code.replace(/'/g, "\\'")}', ${probaId})" 
                                        style="background:#ede9fe; color:#6d28d9; border:1px solid #ddd6fe; border-radius:4px; font-size:0.72rem; font-weight:800; padding:3px 6px; cursor:pointer;" 
                                        title="Добави под-детайл към този възел">↳ ➕ Под-детайл</button>
                                    <button type="button" onclick="removeCompFromProba(${c.id}, ${probaId})" style="background:none; border:none; cursor:pointer; color:#ef4444; font-size:1.05rem;" title="Премахни">🗑️</button>
                                </div>
                            </td>
                        </tr>
                    `;

                    // Recurse down children of this component
                    renderTreeLevel(c.part_code, level + 1);
                });
            };

            renderTreeLevel(null, 0);
        }

        return `
            <div style="text-align:left; font-size:0.9rem;">
                <div style="background:#f5f3ff; border:1px solid #ddd6fe; border-radius:8px; padding:10px 14px; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <span style="font-weight:800; color:#6d28d9; font-size:1.05rem;">🧪 ${proba.name}</span>
                        <span style="color:#5b21b6; margin-left:12px;">Цел: <b>${proba.target_qty} бр.</b></span>
                    </div>
                    <button type="button" onclick="openNewPartDialog(${probaId}, null)" style="padding:6px 12px; background:#7c3aed; color:white; border:none; border-radius:6px; font-weight:800; font-size:0.82rem; cursor:pointer; box-shadow:0 2px 5px rgba(124,58,237,0.3);">
                        ✨ Създай НОВ детайл
                    </button>
                </div>

                <div style="display:grid; grid-template-columns: 310px 1fr; gap:16px;">
                    <!-- LEFT: SEARCH NOMENCLATURE -->
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; display:flex; flex-direction:column; height:400px;">
                        <div style="font-weight:800; color:#334155; margin-bottom:8px;">📁 Каталог Номенклатура</div>
                        <input type="text" id="nomSearchBox" placeholder="🔍 Търси детайл (тяло, вал)..." oninput="filterNomSearch(this.value)" 
                            style="width:100%; box-sizing:border-box; padding:7px 10px; border:1px solid #cbd5e1; border-radius:6px; margin-bottom:10px; font-size:0.85rem;">
                        <div id="nomResultsList" style="flex:1; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px; background:white; padding:4px;">
                        </div>
                    </div>

                    <!-- RIGHT: CURRENT COMPONENTS TREE -->
                    <div style="background:white; border:1px solid #e2e8f0; border-radius:8px; padding:12px; display:flex; flex-direction:column; height:400px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <span style="font-weight:800; color:#334155;">🧩 Дърво на състава (${currentComps.length} детайла)</span>
                            <span style="font-size:0.75rem; color:#64748b;">Бутонът <b>↳ ➕ Под-детайл</b> закача деца към възел</span>
                        </div>
                        <div style="flex:1; overflow-y:auto;">
                            <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
                                <thead>
                                    <tr style="background:#f1f5f9; color:#475569; border-bottom:2px solid #cbd5e1; font-size:0.78rem;">
                                        <th style="padding:8px; text-align:left;">Детайл / Възел</th>
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
    window._currentParentPartCode = null;

    Swal.fire({
        title: 'Конструктор на състава на пробата',
        html: `<div id="probaConstructorContainer">${renderModalBody()}</div>`,
        width: 1000,
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
                <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px;">
                    <b style="color:#1e293b; font-size:0.85rem;">${code}</b> ${type}
                </div>
                <button type="button" onclick="addExistingPartToProba('${code.replace(/'/g, "\\'")}', null)" 
                    style="padding:3px 8px; background:#e0e7ff; color:#4338ca; border:1px solid #c7d2fe; border-radius:5px; font-weight:800; font-size:0.78rem; cursor:pointer;">
                    ➕ Добави
                </button>
            </div>
        `;
    }).join('');
}

async function addExistingPartToProba(partCode, parentPartCode = null) {
    const probaId = window._currentProbaId;
    if (!probaId) return;

    try {
        const { error } = await client.from('probi_components').insert([{
            proba_id: probaId,
            part_code: partCode,
            qty_per_unit: 1,
            is_new: false,
            parent_part_code: parentPartCode
        }]);
        if (error) throw error;

        const { data: comps } = await client.from('probi_components').select('*').eq('proba_id', probaId);
        probiComponentsCache[probaId] = comps || [];
        openProbiConstructorModal(probaId);
    } catch (err) {
        Swal.fire('Грешка', err.message, 'error');
    }
}

// --- ADD SUB-COMPONENT MODAL ---
async function openAddSubComponentDialog(parentCompId, parentPartCode, probaId) {
    const { value: choice } = await Swal.fire({
        title: `↳ Добави под-детайл към:`,
        html: `<b style="color:#6d28d9; font-size:1.1rem;">${parentPartCode}</b><br><br>Какъв детайл искате да закачите?`,
        icon: 'question',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '📁 От Каталог Номенклатура',
        denyButtonText: '✨ Създай НОВ под-детайл',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#4338ca',
        denyButtonColor: '#7c3aed'
    });

    if (choice) {
        // Select from catalog
        const { value: selPart } = await Swal.fire({
            title: `Избор от каталог за: ${parentPartCode}`,
            input: 'text',
            inputPlaceholder: 'Въведете точен код на детайла от Номенклатура...',
            showCancelButton: true,
            confirmButtonText: 'Добави като под-детайл',
            confirmButtonColor: '#4338ca',
            cancelButtonText: 'Отказ',
            inputValidator: (val) => {
                if (!val || !val.trim()) return 'Моля, въведете код на детайл!';
            }
        });
        if (selPart) {
            await addExistingPartToProba(selPart.trim(), parentPartCode);
        }
    } else if (choice === false) {
        // Create new sub-part
        openNewPartDialog(probaId, parentPartCode);
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

// --- NEW PART DIALOG WITH OPTIONAL PARENT ---
async function openNewPartDialog(probaId, parentPartCode = null) {
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

    let skladOptionsHtml = '';
    try {
        const { data: mats } = await client.from('sklad').select('ID Детайл, Мерна единица').order('ID Детайл');
        if (mats) {
            skladOptionsHtml = mats.map(m => `<option value="${m['ID Детайл']}">${m['ID Детайл']} (${m['Мерна единица'] || 'бр.'})</option>`).join('');
        }
    } catch(e) {}

    let subBanner = parentPartCode ? `<div style="background:#ede9fe; color:#5b21b6; padding:8px; border-radius:6px; font-weight:700; margin-bottom:12px; font-size:0.85rem;">↳ Под-детайл за: <b>${parentPartCode}</b></div>` : '';

    const { value: result } = await Swal.fire({
        title: parentPartCode ? '✨ Нов Пробен Под-детайл' : '✨ Създай НОВ пробен детайл',
        html: `
            <div style="text-align:left; font-size:0.9rem;">
                ${subBanner}
                <label style="display:block; font-weight:700; margin-bottom:4px; color:#1e293b;">Наименование на новия детайл *</label>
                <input id="swalNewPartName" class="swal2-input" placeholder="напр. Вал Пробен 25-Special" style="width:100%; box-sizing:border-box; margin:0 0 14px 0;">

                <label style="display:block; font-weight:700; margin-bottom:4px; color:#1e293b;">Бройка за 1 родителски възел *</label>
                <input id="swalNewPartQty" type="number" min="0.1" step="0.1" value="1" class="swal2-input" style="width:100%; box-sizing:border-box; margin:0 0 16px 0;">

                <div style="border-top:1px solid #e2e8f0; padding-top:12px; margin-top:12px; margin-bottom:12px;">
                    <div style="font-weight:800; color:#1e293b; margin-bottom:6px;">📦 Заготовка / Материал от Склад Материали:</div>
                    <div style="display:flex; gap:8px;">
                        <div style="flex:2;">
                            <label style="display:block; font-size:0.75rem; font-weight:700; color:#64748b; margin-bottom:2px;">Материал / Заготовка</label>
                            <input id="swalNewPartMat" list="dlSkladMaterials" placeholder="напр. Прът 316L ф20 (по избор)" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.88rem;">
                            <datalist id="dlSkladMaterials">${skladOptionsHtml}</datalist>
                        </div>
                        <div style="flex:1;">
                            <label style="display:block; font-size:0.75rem; font-weight:700; color:#64748b; margin-bottom:2px;">Норма за 1 бр.</label>
                            <input id="swalNewPartMatNorm" type="number" step="0.001" min="0.001" value="1" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.88rem; font-weight:700;">
                        </div>
                    </div>
                </div>

                <div style="border-top:1px solid #e2e8f0; padding-top:12px; margin-top:12px;">
                    <div style="font-weight:800; color:#1e293b; margin-bottom:8px;">🛠️ Маршрутна карта (Технологични операции) *</div>

                    <div style="display:flex; gap:12px; margin-bottom:12px;">
                        <label style="font-size:0.85rem; font-weight:600; cursor:pointer;">
                            <input type="radio" name="routeType" value="manual" checked onchange="toggleRouteInputType(this.value)"> Ръчно въвеждане на операции
                        </label>
                        <label style="font-size:0.85rem; font-weight:600; cursor:pointer;">
                            <input type="radio" name="routeType" value="copy" onchange="toggleRouteInputType(this.value)"> Копирай от съществуващ детайл
                        </label>
                    </div>

                    <div id="copyRouteBox" style="display:none; background:#f8fafc; padding:10px; border-radius:6px; border:1px solid #e2e8f0; margin-bottom:12px;">
                        <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px; color:#475569;">Изберете детайл, чийто маршрут да копираме:</label>
                        <input id="copyFromPartInput" list="dlNomParts" placeholder="Въведете или изберете код..." style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.85rem;">
                        <datalist id="dlNomParts">
                            ${(window._probaNomList || []).map(n => `<option value="${n['ID Детайл']}">${n['ID Детайл']}</option>`).join('')}
                        </datalist>
                    </div>

                    <div id="manualRouteBox">
                        <div id="manualOpsList" style="max-height:160px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px; padding:8px; background:#f8fafc;">
                            <div class="manual-op-row" style="display:flex; gap:8px; margin-bottom:6px; align-items:center;">
                                <input type="number" step="10" value="10" class="manual-op-num" placeholder="№" style="width:45px; padding:4px; border:1px solid #cbd5e1; border-radius:4px; font-size:0.82rem; text-align:center;">
                                <input type="text" class="manual-op-name" placeholder="Име на операция (напр. Струговане)" style="flex:1; padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px; font-size:0.82rem;">
                                <select class="manual-op-machine" style="flex:1; padding:4px; border:1px solid #cbd5e1; border-radius:4px; font-size:0.82rem;">
                                    <option value="">(Избери машина)</option>
                                    ${machinesOptionsHtml}
                                </select>
                            </div>
                        </div>
                        <button type="button" onclick="addManualOpRow()" style="margin-top:6px; padding:4px 10px; background:#e2e8f0; color:#334155; border:none; border-radius:4px; font-size:0.8rem; font-weight:700; cursor:pointer;">
                            ➕ Добави още една операция
                        </button>
                    </div>
                </div>
            </div>
        `,
        width: 650,
        showCancelButton: true,
        confirmButtonText: 'Запази детайла',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#7c3aed',
        focusConfirm: false,
        preConfirm: async () => {
            const name = document.getElementById('swalNewPartName').value.trim();
            const qty = parseFloat(document.getElementById('swalNewPartQty').value);
            const materialCode = document.getElementById('swalNewPartMat').value.trim();
            const materialNorm = parseFloat(document.getElementById('swalNewPartMatNorm').value) || 1;
            const routeType = document.querySelector('input[name="routeType"]:checked').value;

            if (!name) {
                Swal.showValidationMessage('Въведете наименование на детайла!');
                return false;
            }

            let customRoutes = [];
            if (routeType === 'copy') {
                const copyCode = document.getElementById('copyFromPartInput').value.trim();
                if (!copyCode) {
                    Swal.showValidationMessage('Изберете детайл за копиране на маршрута!');
                    return false;
                }
                const { data: routes } = await client.from('marshruti').select('*').ilike('Код на детайла', copyCode).order('№ Операция');
                if (!routes || routes.length === 0) {
                    Swal.showValidationMessage(`Детайлът ${copyCode} няма въведени операции в marshruti!`);
                    return false;
                }
                customRoutes = routes.map(r => ({
                    op_num: parseInt(r['№ Операция']) || 10,
                    op_name: String(r['Име на операция']).trim(),
                    machine: String(r['Машина'] || '').trim()
                }));
            } else {
                const rows = document.querySelectorAll('#manualOpsList .manual-op-row');
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

            return { name, qty_per_unit: qty || 1, customRoutes, material_code: materialCode, material_norm: materialNorm, parent_part_code: parentPartCode };
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
                parent_part_code: result.parent_part_code,
                material_code: result.material_code,
                material_norm: result.material_norm,
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
            В MES терминалите в цеха ще се генерират <b style="color:#7c3aed;">виолетови карти 🧪 ПРОБА</b> за съответните работни места на детайлите.<br>
            <i>(Наличностите на пробата ще се отчитат в отделен Склад Проби и няма да се показват на телевизионния монитор).</i>
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

// --- DEDICATED TRIAL WAREHOUSE (Склад Проби / Зона Проби) ---
async function openProbiInventoryModal() {
    Swal.fire({ title: 'Зареждане на Склад Проби...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const { data: inv, error } = await client.from('probi_inventory').select('*').order('proba_id');
        if (error) throw error;

        const probiMap = {};
        probiCache.forEach(p => probiMap[p.id] = p.name);

        let rowsHtml = '';
        if (!inv || inv.length === 0) {
            rowsHtml = `<tr><td colspan="5" style="text-align:center; padding:35px; color:#94a3b8; font-style:italic;">Склад Проби (Зона Проби) е празен в момента. Детайлите ще се появяват тук след отчитане на терминала.</td></tr>`;
        } else {
            rowsHtml = inv.map(r => {
                let pName = probiMap[r.proba_id] || ('Проба #' + r.proba_id);
                let dateStr = r.updated_at ? new Date(r.updated_at).toLocaleString('bg-BG') : '';
                let isReady = r.operation === 'готов продукт';
                let opBadge = isReady 
                    ? `<span style="background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:4px; font-weight:800;">Готов продукт</span>` 
                    : `<span style="font-weight:700; color:#334155;">${r.operation}</span>`;
                return `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:10px 8px; font-weight:700; color:#6d28d9;">🧪 ${pName}</td>
                        <td style="padding:10px 8px; font-weight:800; color:#1e293b;">${r.part_code}</td>
                        <td style="padding:10px 8px;">${opBadge}</td>
                        <td style="padding:10px 8px; text-align:center; font-weight:900; color:#0f766e; font-size:1.05rem;">${r.quantity} бр.</td>
                        <td style="padding:10px 8px; font-size:0.8rem; color:#64748b;">${dateStr}</td>
                    </tr>
                `;
            }).join('');
        }

        Swal.fire({
            title: '📦 Наличности в Склад Проби (Зона Проби)',
            html: `
                <div style="text-align:left; font-size:0.9rem;">
                    <p style="color:#64748b; margin-top:0;">Този склад е <b>напълно изолиран</b> от серийния инвентар и съдържа изработените детайли и полуфабрикати за активните проби.</p>
                    <div style="max-height:420px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:8px;">
                        <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
                            <thead>
                                <tr style="background:#f8fafc; color:#475569; border-bottom:2px solid #e2e8f0; font-size:0.8rem;">
                                    <th style="padding:8px; text-align:left;">Проба</th>
                                    <th style="padding:8px; text-align:left;">Детайл</th>
                                    <th style="padding:8px; text-align:left;">Операция / Статус</th>
                                    <th style="padding:8px; text-align:center;">Наличност</th>
                                    <th style="padding:8px; text-align:left;">Последно движение</th>
                                </tr>
                            </thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                    </div>
                </div>
            `,
            width: 850,
            confirmButtonText: 'Затвори',
            confirmButtonColor: '#4338ca'
        });
    } catch(err) {
        Swal.fire('Грешка', err.message, 'error');
    }
}

// --- PROGRESS MODAL ---
async function openProbiProgressModal(probaId) {
    const proba = probiCache.find(p => p.id === probaId);
    if (!proba) {
        Swal.fire('Грешка', 'Пробата не е намерена!', 'error');
        return;
    }

    let comps = probiComponentsCache[probaId] || [];
    if (!comps || comps.length === 0) {
        const { data: cData } = await client.from('probi_components').select('*').eq('proba_id', probaId);
        if (cData) {
            comps = cData;
            probiComponentsCache[probaId] = comps;
        }
    }

    Swal.fire({ title: 'Зареждане на прогреса и наличностите...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const planKey = 'PROBA_' + probaId;
        const [reportsRes, bomRes, probiInvRes, invRes, skladRes, routesRes] = await Promise.all([
            client.from('otcheti').select('*').eq('ID План', planKey),
            client.from('bom').select('*'),
            client.from('probi_inventory').select('*').eq('proba_id', probaId),
            client.from('inventory').select('*'),
            client.from('sklad').select('*'),
            client.from('marshruti').select('*')
        ]);
        const otchetiList = reportsRes.data || [];
        const allBom = bomRes.data || [];
        const probiInvList = probiInvRes.data || [];
        const inventoryList = invRes.data || [];
        const skladList = skladRes.data || [];
        const allRoutes = routesRes.data || [];

        const normStr = s => String(s || '').trim().toLowerCase();

        let partsList = [];
        let partsMap = {};

        comps.forEach(comp => {
            let mult = parseFloat(comp.qty_per_unit) || 1;
            let needed = (parseFloat(proba.target_qty) || 1) * mult;
            let pCode = String(comp.part_code).trim();
            let pNorm = normStr(pCode);

            if (!partsMap[pNorm]) {
                partsMap[pNorm] = {
                    part_code: pCode,
                    needed: needed,
                    is_new: comp.is_new,
                    custom_routes: comp.custom_routes,
                    parent_part_code: comp.parent_part_code,
                    depth: comp.parent_part_code ? 1 : 0
                };
                partsList.push(partsMap[pNorm]);
            } else {
                partsMap[pNorm].needed += needed;
            }
        });

        function expandComponent(parentCode, parentNeeded, curDepth, visited = new Set()) {
            let normP = normStr(parentCode);
            if (visited.has(normP)) return;
            visited.add(normP);

            let children = allBom.filter(b => b['ID Родител'] && normStr(b['ID Родител']) === normP);
            children.forEach(ch => {
                let childCode = String(ch['ID Компонент']).trim();
                let childNorm = normStr(childCode);
                let childMult = parseFloat(ch['Количество']) || 1;
                let childNeeded = parentNeeded * childMult;

                if (!partsMap[childNorm]) {
                    partsMap[childNorm] = {
                        part_code: childCode,
                        needed: childNeeded,
                        is_new: false,
                        custom_routes: [],
                        depth: curDepth + 1
                    };
                    partsList.push(partsMap[childNorm]);
                } else {
                    partsMap[childNorm].needed += childNeeded;
                }

                expandComponent(childCode, childNeeded, curDepth + 1, new Set(visited));
            });
        }

        comps.forEach(comp => {
            if (!comp.is_new) {
                let mult = parseFloat(comp.qty_per_unit) || 1;
                expandComponent(comp.part_code, (parseFloat(proba.target_qty) || 1) * mult, 0);
            }
        });

        let readyCount = 0;
        let inProgressCount = 0;
        let missingCount = 0;
        let totalPiecesInProbiInv = probiInvList.reduce((sum, pi) => sum + (parseFloat(pi.quantity) || 0), 0);

        let cardsHtmlArray = [];

        for (const item of partsList) {
            let pNorm = normStr(item.part_code);
            let needed = item.needed;

            // 1. Stock in Склад Проби
            let pInvMatches = probiInvList.filter(pi => normStr(pi.part_code) === pNorm);
            let probiInvReady = pInvMatches.filter(pi => normStr(pi.operation) === 'готов продукт').reduce((s, pi) => s + (parseFloat(pi.quantity) || 0), 0);
            let probiInvWip = pInvMatches.filter(pi => normStr(pi.operation) !== 'готов продукт').reduce((s, pi) => s + (parseFloat(pi.quantity) || 0), 0);
            let probiInvTotal = pInvMatches.reduce((s, pi) => s + (parseFloat(pi.quantity) || 0), 0);

            // 2. Stock in General Finished Goods (inventory)
            let invMatches = inventoryList.filter(inv => normStr(inv['ID Детайл']) === pNorm);
            let mainInvTotal = invMatches.reduce((s, r) => s + (parseFloat(r['Количество']) || 0), 0);

            // 3. Stock in Materials (sklad)
            let skladMatches = skladList.filter(s => normStr(s['ID Детайл']) === pNorm);
            let skladStock = skladMatches.reduce((s, r) => s + (parseFloat(r['Остатък']) || 0), 0);

            // 4. Routes
            let routes = [];
            if (item.is_new && Array.isArray(item.custom_routes) && item.custom_routes.length > 0) {
                routes = item.custom_routes;
            } else {
                routes = allRoutes.filter(r => normStr(r['Код на детайла']) === pNorm).map(r => ({
                    op_num: parseInt(r['№ Операция']) || 10,
                    op_name: String(r['Име на операция']).trim(),
                    machine: String(r['Машина'] || '').trim()
                })).sort((a, b) => a.op_num - b.op_num);
            }

            let opsProgressHtml = '';
            let partStatusBadge = '';
            let isPartDone = false;
            let isPartInProgress = false;

            if (routes.length > 0) {
                let lastOp = routes[routes.length - 1];
                let lastOpDone = 0;
                let hasAnyDone = false;

                opsProgressHtml = routes.map(op => {
                    let done = 0;
                    otchetiList.forEach(r => {
                        if (normStr(r['ID Детайл']) === pNorm &&
                            normStr(r['Операция']) === normStr(op.op_name) &&
                            r['Статус'] === 'Отчетено') {
                            done += (parseFloat(r['Количество']) || 0);
                        }
                    });
                    if (done > 0) hasAnyDone = true;
                    if (normStr(op.op_name) === normStr(lastOp.op_name)) {
                        lastOpDone = done;
                    }

                    let isOpDone = done >= needed;
                    let badgeBg = isOpDone ? '#dcfce7' : (done > 0 ? '#dbeafe' : '#f8fafc');
                    let badgeBorder = isOpDone ? '#bbf7d0' : (done > 0 ? '#bfdbfe' : '#e2e8f0');
                    let badgeColor = isOpDone ? '#15803d' : (done > 0 ? '#1d4ed8' : '#64748b');
                    let opIcon = isOpDone ? '✅' : (done > 0 ? '⏳' : '⚪');

                    return `
                        <div style="background:${badgeBg}; color:${badgeColor}; border:1px solid ${badgeBorder}; padding:6px 10px; border-radius:6px; font-size:0.83rem; font-weight:700; margin-bottom:5px; display:flex; justify-content:space-between; align-items:center;">
                            <span>${opIcon} ${op.op_num ? op.op_num + '. ' : ''}${op.op_name} <span style="font-weight:500; font-size:0.75rem; color:#64748b;">(${op.machine || 'без машина'})</span></span>
                            <span style="font-weight:900;">${done} / ${needed} бр.</span>
                        </div>
                    `;
                }).join('');

                let readyFinished = Math.max(lastOpDone, probiInvReady);
                isPartDone = readyFinished >= needed;
                isPartInProgress = !isPartDone && (readyFinished > 0 || hasAnyDone || probiInvWip > 0);

                if (isPartDone) {
                    readyCount++;
                    partStatusBadge = `<span style="background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:3px 10px; border-radius:12px; font-weight:800; font-size:0.78rem;">✅ Готов: ${readyFinished} от ${needed} бр.</span>`;
                } else if (isPartInProgress) {
                    inProgressCount++;
                    partStatusBadge = `<span style="background:#dbeafe; color:#1e40af; border:1px solid #93c5fd; padding:3px 10px; border-radius:12px; font-weight:800; font-size:0.78rem;">⏳ В изработка (${readyFinished} готови / ${needed} нужни)</span>`;
                } else {
                    missingCount++;
                    partStatusBadge = `<span style="background:#f1f5f9; color:#64748b; border:1px solid #cbd5e1; padding:3px 10px; border-radius:12px; font-weight:800; font-size:0.78rem;">⚪ Чака изработка (0 / ${needed} бр.)</span>`;
                }

                opsProgressHtml += `
                    <div style="margin-top:8px; padding:6px 10px; background:#faf5ff; border:1px solid #e9d5ff; border-radius:6px; display:flex; justify-content:space-between; align-items:center; font-size:0.82rem;">
                        <span style="color:#6b21a8; font-weight:700;">📦 В Склад Проби:</span>
                        <span style="font-weight:900; color:${probiInvTotal > 0 ? '#7c3aed' : '#94a3b8'};">
                            ${probiInvReady > 0 ? `<b style="color:#15803d;">${probiInvReady} бр.</b> готови` : ''}
                            ${probiInvWip > 0 ? `${probiInvReady > 0 ? ' + ' : ''}<b>${probiInvWip} бр.</b> полуфабрикат` : ''}
                            ${probiInvTotal === 0 ? '0 бр. (очаква се отчитане)' : ''}
                        </span>
                    </div>
                `;
            } else {
                let totalAvail = probiInvTotal + mainInvTotal + skladStock;
                isPartDone = totalAvail >= needed;
                isPartInProgress = !isPartDone && totalAvail > 0;

                if (isPartDone) {
                    readyCount++;
                    partStatusBadge = `<span style="background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:3px 10px; border-radius:12px; font-weight:800; font-size:0.78rem;">✅ Наличен: ${totalAvail} от ${needed} бр.</span>`;
                } else if (isPartInProgress) {
                    inProgressCount++;
                    partStatusBadge = `<span style="background:#fed7aa; color:#c2410c; border:1px solid #fdba74; padding:3px 10px; border-radius:12px; font-weight:800; font-size:0.78rem;">⚠️ Частичен: ${totalAvail} / ${needed} бр. (липсват ${needed - totalAvail})</span>`;
                } else {
                    missingCount++;
                    partStatusBadge = `<span style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; padding:3px 10px; border-radius:12px; font-weight:800; font-size:0.78rem;">❌ Липсва на склад (0 / ${needed} бр.)</span>`;
                }

                opsProgressHtml = `
                    <div style="font-size:0.82rem; color:#475569; margin-bottom:6px; font-weight:600;">
                        📦 Складов детайл / заготовка (няма машинни операции в цеха):
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <div style="flex:1; min-width:130px; background:#faf5ff; border:1px solid #e9d5ff; border-radius:6px; padding:6px 10px;">
                            <div style="font-size:0.73rem; color:#7c3aed; font-weight:700;">📦 Склад Проби</div>
                            <div style="font-size:1.05rem; font-weight:900; color:${probiInvTotal > 0 ? '#6d28d9' : '#94a3b8'};">${probiInvTotal} бр.</div>
                        </div>
                        <div style="flex:1; min-width:130px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:6px 10px;">
                            <div style="font-size:0.73rem; color:#16a34a; font-weight:700;">🏭 Склад Готови Детайли</div>
                            <div style="font-size:1.05rem; font-weight:900; color:${mainInvTotal > 0 ? '#15803d' : '#94a3b8'};">${mainInvTotal} бр.</div>
                        </div>
                        ${skladStock > 0 ? `
                        <div style="flex:1; min-width:130px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:6px 10px;">
                            <div style="font-size:0.73rem; color:#2563eb; font-weight:700;">🪵 Склад Материали</div>
                            <div style="font-size:1.05rem; font-weight:900; color:#1d4ed8;">${skladStock} бр.</div>
                        </div>` : ''}
                    </div>
                `;
            }

            let isSub = item.depth > 0 || !!item.parent_part_code;
            let boxBorder = isPartDone ? '1.5px solid #86efac' : (isSub ? '1px dashed #cbd5e1' : '1px solid #e2e8f0');
            let boxBg = isPartDone ? '#f0fdf4' : (isSub ? '#f8fafc' : 'white');
            let badgeSub = isSub ? `<span style="font-size:0.73rem; background:#e0e7ff; color:#4338ca; padding:1px 6px; border-radius:4px; font-weight:700; margin-left:6px;">под-детайл ${item.parent_part_code ? '(↳ към ' + item.parent_part_code + ')' : ''}</span>` : '';

            cardsHtmlArray.push(`
                <div style="background:${boxBg}; border:${boxBorder}; border-radius:10px; padding:12px; margin-bottom:12px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
                        <span style="font-weight:800; color:#1e293b; font-size:0.95rem;">${item.part_code} ${badgeSub}</span>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-weight:700; color:#64748b; font-size:0.83rem;">Нужни: <b>${needed} бр.</b></span>
                            ${partStatusBadge}
                        </div>
                    </div>
                    <div>
                        ${opsProgressHtml}
                    </div>
                </div>
            `);
        }

        let totalItems = partsList.length || 1;
        let overallPercent = Math.round((readyCount / totalItems) * 100);

        let progressHtml = `
            <div style="text-align:left; font-size:0.9rem;">
                <!-- Header Banner -->
                <div style="background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); border: 1.5px solid #c4b5fd; border-radius: 12px; padding: 14px 18px; margin-bottom: 16px; box-shadow: 0 2px 5px rgba(124, 58, 237, 0.08);">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                        <div>
                            <span style="font-weight:900; color:#5b21b6; font-size:1.25rem;">🧪 ${proba.name}</span>
                            <span style="background:#7c3aed; color:white; padding:3px 10px; border-radius:12px; font-weight:800; font-size:0.8rem; margin-left:10px;">⚡ В ПРОИЗВОДСТВО</span>
                            ${proba.is_urgent ? '<span style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; padding:3px 9px; border-radius:12px; font-weight:900; font-size:0.78rem; margin-left:6px;">⚡ СПЕШНА</span>' : ''}
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="color:#6d28d9; font-weight:700; font-size:0.95rem;">Целева серия: <b style="font-size:1.15rem; color:#4c1d95;">${proba.target_qty} бр.</b></span>
                            <button type="button" onclick="openProbiInventoryModal()" style="background:#ffffff; color:#6d28d9; border:1.5px solid #a78bfa; padding:5px 12px; border-radius:8px; font-weight:800; font-size:0.8rem; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 1px 2px rgba(0,0,0,0.05);" title="Преглед на Склад Проби">📦 Склад Проби</button>
                        </div>
                    </div>

                    <!-- Progress bar -->
                    <div style="margin-top:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.82rem; font-weight:700; margin-bottom:4px; color:#4c1d95;">
                            <span>Обща осигуреност и готовност на компонентите:</span>
                            <span><b>${overallPercent}%</b> (${readyCount} от ${totalItems} напълно готови)</span>
                        </div>
                        <div style="background:#e2e8f0; border-radius:10px; height:12px; overflow:hidden; position:relative;">
                            <div style="background: linear-gradient(90deg, #8b5cf6, #10b981); width:${overallPercent}%; height:100%; transition:width 0.4s ease-in-out;"></div>
                        </div>
                    </div>

                    <!-- Quick Summary Pills -->
                    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; font-size:0.8rem;">
                        <span style="background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:3px 9px; border-radius:8px; font-weight:800;">🟢 Готови: ${readyCount}</span>
                        <span style="background:#dbeafe; color:#1d4ed8; border:1px solid #93c5fd; padding:3px 9px; border-radius:8px; font-weight:800;">🟡 В изработка: ${inProgressCount}</span>
                        <span style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; padding:3px 9px; border-radius:8px; font-weight:800;">🔴 Липсващи: ${missingCount}</span>
                        <span style="background:#ffffff; color:#6b21a8; border:1px solid #ddd6fe; padding:3px 9px; border-radius:8px; font-weight:800; margin-left:auto;">📦 Общо полуфабрикати в Склад Проби: <b>${totalPiecesInProbiInv} бр.</b></span>
                    </div>
                </div>

                <div style="max-height:450px; overflow-y:auto; padding-right:4px;">
                    ${cardsHtmlArray.join('')}
                </div>
            </div>
        `;

        Swal.fire({
            title: 'Напредък на пробата в цеха',
            html: progressHtml,
            width: 820,
            confirmButtonText: 'Затвори',
            confirmButtonColor: '#7c3aed'
        });
    } catch (err) {
        Swal.fire('Грешка', err.message, 'error');
    }
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
        text: 'Това ще изтрие дефиницията на пробата, компонентите и наличностите в Склад Проби.',
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
                    <li>Генериране на записите в <code>bom</code> за пълното дърво на новия резолвер</li>
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
                        "Тип": c.parent_part_code ? "Под-детайл (от проба)" : "Детайл (от проба)",
                        "ID Родител": c.material_code || null,
                        "Разходна норма": c.material_norm || 1
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
                let parentCode = c.parent_part_code ? c.parent_part_code : proba.name;
                await client.from('bom').insert([{
                    "ID Родител": parentCode,
                    "ID Компонент": c.part_code,
                    "Количество": c.qty_per_unit || 1
                }]);
            }

            // 4. Ask to move finished goods from probi_inventory to public.inventory
            const { isConfirmed: moveStock } = await Swal.fire({
                title: '📦 Прехвърляне на наличности?',
                text: 'Искате ли готовите детайли от Склад Проби да се прехвърлят в общия сериен Склад (inventory)?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Да, прехвърли наличностите',
                cancelButtonText: 'Не, остави ги в Зона Проби',
                confirmButtonColor: '#16a34a'
            });

            if (moveStock) {
                const { data: pStock } = await client.from('probi_inventory').select('*').eq('proba_id', probaId).gt('quantity', 0);
                if (pStock && pStock.length > 0) {
                    for (const s of pStock) {
                        await client.from('inventory').insert([{
                            "ID Детайл": s.part_code,
                            "Операция": s.operation,
                            "Количество": s.quantity
                        }]);
                    }
                    await client.from('probi_inventory').delete().eq('proba_id', probaId);
                }
            }

            Swal.fire('Готово!', 'Моделът, компонентите и йерархията бяха успешно прехвърлени в серийно производство!', 'success');
        } catch (err) {
            Swal.fire('Грешка при прехвърляне', err.message, 'error');
        }
    }
}

window.onProbiSearchFromGlobal = function(q) {
    probiSearchQuery = q;
    buildProbiUI();
};
