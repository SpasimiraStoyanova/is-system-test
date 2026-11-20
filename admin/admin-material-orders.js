// ==============================================================================
// IS-SYSTEMS: МЕНИДЖЪР НА ПОРЪЧКИ НА МАТЕРИАЛИ & ДОСТАВКИ КЪМ СКЛАД МАТЕРИАЛИ
// ==============================================================================

function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

let globalMaterialOrders = [];
let materialOrdersPollInterval = null;
let currentMaterialOrdersFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
    initMaterialOrders();
});

// Инициализация на модула за поръчки на материали
async function initMaterialOrders() {
    await fetchMaterialOrders();
    await checkMonthlyMaterialDeficits(true);
    if (materialOrdersPollInterval) clearInterval(materialOrdersPollInterval);
    materialOrdersPollInterval = setInterval(async () => {
        await fetchMaterialOrders();
        await checkMonthlyMaterialDeficits(false);
    }, 20000);
}

// Зареждане на поръчките от базата данни
async function fetchMaterialOrders() {
    try {
        if (typeof client === 'undefined' || !client) return;

        const { data, error } = await client
            .from('porachki_materiali')
            .select('*')
            .order('id', { ascending: false })
            .limit(200);

        if (error) {
            console.warn('Грешка fetchMaterialOrders:', error.message);
            return;
        }

        globalMaterialOrders = data || [];
        updateMaterialOrdersBadges();

        // Ако модалът е отворен, опресняваме таблицата
        const modal = document.getElementById('materialOrdersModal');
        if (modal && modal.style.display === 'flex') {
            renderMaterialOrdersTable();
        }
    } catch (err) {
        console.warn('fetchMaterialOrders catch:', err);
    }
}

// Обновяване на броячите / баджовете
function updateMaterialOrdersBadges() {
    const pendingOrders = globalMaterialOrders.filter(o => o['Статус'] === 'Поръчано').length;
    const badge = document.getElementById('materialOrdersBtnBadge');
    if (badge) {
        if (pendingOrders > 0) {
            badge.innerText = pendingOrders;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
    const subBadge = document.getElementById('adminMaterialOrdersSubBadge');
    if (subBadge) {
        if (pendingOrders > 0) {
            subBadge.innerText = pendingOrders;
            subBadge.style.display = 'inline-block';
        } else {
            subBadge.style.display = 'none';
        }
    }
    if (typeof updateMonthlyDeficitBadges === 'function') {
        updateMonthlyDeficitBadges();
    }
}

// Отваряне на дневника на поръчките
window.openMaterialOrdersModal = function() {
    let modal = document.getElementById('materialOrdersModal');
    if (!modal) {
        initMaterialOrdersModalHtml();
        modal = document.getElementById('materialOrdersModal');
    }
    renderMaterialOrdersTable();
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
};

// Затваряне на дневника на поръчките
window.closeMaterialOrdersModal = function() {
    const modal = document.getElementById('materialOrdersModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = 'auto';
};

// Създаване на DOM структурата за модала на поръчките
function initMaterialOrdersModalHtml() {
    const div = document.createElement('div');
    div.id = 'materialOrdersModal';
    div.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.65); z-index:99999; justify-content:center; align-items:center; backdrop-filter:blur(4px); padding:16px; box-sizing:border-box;';
    div.innerHTML = `
        <div style="background:white; border-radius:16px; width:100%; max-width:1050px; max-height:92vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 25px 50px -12px rgba(0,0,0,0.35); border:1.5px solid #bae6fd;">
            <!-- Header -->
            <div style="padding:16px 22px; background:linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-bottom:1.5px solid #bae6fd; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:42px; height:42px; border-radius:10px; background:#0284c7; color:white; display:flex; align-items:center; justify-content:center; font-size:1.35em;">
                        🛒
                    </div>
                    <div>
                        <div style="font-size:1.22em; font-weight:900; color:#0369a1;">Поръчки на Материали &amp; Доставки</div>
                        <div style="font-size:0.83em; color:#0284c7;">Управление на доставките на суровини, метали, заготовки и автоматично заприходяване в Склад Материали</div>
                    </div>
                </div>
                <button onclick="closeMaterialOrdersModal()" style="border:none; background:#bae6fd; border-radius:50%; width:32px; height:32px; font-size:14px; cursor:pointer; color:#0369a1; font-weight:bold; transition:all 0.2s;" onmouseover="this.style.background='#7dd3fc'" onmouseout="this.style.background='#bae6fd'">✖</button>
            </div>

            <!-- Controls bar -->
            <div style="padding:12px 20px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                    <button class="chip active" id="chip_mat_all" onclick="filterMaterialOrders('all')">Всички (<span id="countMatAll">0</span>)</button>
                    <button class="chip" id="chip_mat_pending" onclick="filterMaterialOrders('Поръчано')" style="background:#fffbeb; color:#b45309; border-color:#fde68a;">⏳ Чакащи доставка (<span id="countMatPending">0</span>)</button>
                    <button class="chip" id="chip_mat_done" onclick="filterMaterialOrders('Прието')" style="background:#f0fdf4; color:#15803d; border-color:#bbf7d0;">🟢 Приети в склада (<span id="countMatDone">0</span>)</button>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <input type="text" id="matOrderSearchInput" placeholder="🔍 Търси материал или доставчик..." oninput="renderMaterialOrdersTable()" style="padding:6px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:0.86em; width:220px;">
                    <button type="button" onclick="openMonthlyMaterialDeficitsModal()" style="background:linear-gradient(135deg, #7c3aed, #6d28d9); color:white; border:none; padding:7px 13px; border-radius:8px; font-weight:800; font-size:0.85em; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 2px 4px rgba(124,58,237,0.25);" title="Пресметни дефицитите спрямо минималното количество след 20-то число">
                        <span>📅 Нужди на цеха (20-то)</span>
                        <span id="monthlyDeficitBtnBadge" style="display:none; background:#ef4444; color:white; border-radius:10px; padding:1px 6px; font-size:0.75rem;">0</span>
                    </button>
                    <button type="button" onclick="openCreateMaterialOrderModal()" style="background:#0284c7; color:white; border:none; padding:7px 14px; border-radius:8px; font-weight:800; font-size:0.85em; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 2px 4px rgba(2,132,199,0.25);">
                        <span>➕ Нова Поръчка</span>
                    </button>
                    <button type="button" onclick="fetchMaterialOrders().then(renderMaterialOrdersTable)" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:7px 10px; border-radius:8px; font-size:0.85em; cursor:pointer;" title="Опресни данните">
                        🔄
                    </button>
                </div>
            </div>

            <!-- Table area -->
            <div id="materialOrdersTableWrap" style="padding:16px; overflow-y:auto; flex:1; background:#f8fafc;">
                <div style="text-align:center; color:#94a3b8; padding:30px;">Зареждане на поръчките...</div>
            </div>

            <!-- Footer -->
            <div style="padding:10px 20px; border-top:1px solid #e2e8f0; background:#fff; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:0.8em; color:#64748b;">💡 Когато пратката пристигне в цеха, натиснете <b>„Приеми / Заприходи“</b>, за да влезе автоматично в наличността на Склад Материали.</span>
                <button onclick="closeMaterialOrdersModal()" style="padding:8px 18px; background:#64748b; color:white; border:none; border-radius:8px; font-weight:700; font-size:0.85em; cursor:pointer;">Затвори</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
}

// Филтриране на поръчките
window.filterMaterialOrders = function(filter) {
    currentMaterialOrdersFilter = filter;
    document.querySelectorAll('#materialOrdersModal .chip').forEach(c => c.classList.remove('active'));
    if (filter === 'all') document.getElementById('chip_mat_all')?.classList.add('active');
    else if (filter === 'Поръчано') document.getElementById('chip_mat_pending')?.classList.add('active');
    else if (filter === 'Прието') document.getElementById('chip_mat_done')?.classList.add('active');
    renderMaterialOrdersTable();
};

// Рендериране на таблицата с поръчки
function renderMaterialOrdersTable() {
    const wrap = document.getElementById('materialOrdersTableWrap');
    if (!wrap) return;

    const allCount = globalMaterialOrders.length;
    const pendingCount = globalMaterialOrders.filter(o => o['Статус'] === 'Поръчано').length;
    const doneCount = globalMaterialOrders.filter(o => o['Статус'] === 'Прието').length;

    if (document.getElementById('countMatAll')) document.getElementById('countMatAll').innerText = allCount;
    if (document.getElementById('countMatPending')) document.getElementById('countMatPending').innerText = pendingCount;
    if (document.getElementById('countMatDone')) document.getElementById('countMatDone').innerText = doneCount;

    const searchQ = (document.getElementById('matOrderSearchInput')?.value || '').trim().toLowerCase();

    let filtered = globalMaterialOrders;
    if (currentMaterialOrdersFilter !== 'all') {
        filtered = filtered.filter(o => o['Статус'] === currentMaterialOrdersFilter);
    }
    if (searchQ) {
        filtered = filtered.filter(o => {
            const mat = String(o['Материал'] || '').toLowerCase();
            const sup = String(o['Доставчик'] || '').toLowerCase();
            const mail = String(o['Имейл на доставчик'] || '').toLowerCase();
            return mat.includes(searchQ) || sup.includes(searchQ) || mail.includes(searchQ);
        });
    }

    if (filtered.length === 0) {
        wrap.innerHTML = `<div style="text-align:center; color:#94a3b8; padding:45px 10px; font-size:1.05em;">Няма намерени поръчки в тази категория.</div>`;
        return;
    }

    let html = `
        <table style="width:100%; border-collapse:collapse; background:white; border-radius:10px; overflow:hidden; font-size:0.88em; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
            <thead>
                <tr style="background:#f1f5f9; color:#475569; text-align:left; border-bottom:2px solid #cbd5e1;">
                    <th style="padding:10px 12px; width:110px;">Дата Поръчка</th>
                    <th style="padding:10px 12px;">Материал / Суровина</th>
                    <th style="padding:10px 12px;">Доставчик &amp; Контакт</th>
                    <th style="padding:10px 12px; text-align:center; width:120px;">Количество</th>
                    <th style="padding:10px 12px; width:130px;">Статус</th>
                    <th style="padding:10px 12px; width:110px;">Дата Приемане</th>
                    <th style="padding:10px 12px; text-align:right; width:190px;">Действия</th>
                </tr>
            </thead>
            <tbody>
    `;

    filtered.forEach(order => {
        const orderDate = order['Дата на поръчка'] || '-';
        const receiveDate = order['Дата на приемане'] || '-';
        const isPending = order['Статус'] === 'Поръчано';
        const statusBadge = isPending 
            ? `<span style="background:#fffbeb; color:#b45309; border:1px solid #fde68a; padding:4px 9px; border-radius:12px; font-weight:800; font-size:0.85em; display:inline-flex; align-items:center; gap:4px;">⏳ Поръчано</span>`
            : `<span style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; padding:4px 9px; border-radius:12px; font-weight:800; font-size:0.85em; display:inline-flex; align-items:center; gap:4px;">🟢 Прието</span>`;

        const safeMat = String(order['Материал'] || '').replace(/"/g, '&quot;').replace(/'/g, '\\\'');
        const supplierInfo = order['Доставчик'] || 'Непосочен';
        const emailInfo = order['Имейл на доставчик'] ? `<div style="font-size:0.8em; color:#0284c7;">✉️ ${escapeHtml(order['Имейл на доставчик'])}</div>` : '';

        html += `
            <tr style="border-bottom:1px solid #e2e8f0; transition:background 0.15s;" onmouseover="this.style.background='#fafaf9'" onmouseout="this.style.background='white'">
                <td style="padding:10px 12px; color:#64748b; font-weight:600;">${orderDate}</td>
                <td style="padding:10px 12px;">
                    <div style="font-weight:900; color:#0f172a; font-size:0.95em;">${escapeHtml(order['Материал'])}</div>
                </td>
                <td style="padding:10px 12px;">
                    <div style="font-weight:700; color:#334155;">${escapeHtml(supplierInfo)}</div>
                    ${emailInfo}
                </td>
                <td style="padding:10px 12px; text-align:center; font-weight:900; color:#0369a1; font-size:1.02em;">
                    ${order['Количество']}
                </td>
                <td style="padding:10px 12px;">
                    ${statusBadge}
                </td>
                <td style="padding:10px 12px; color:#64748b; font-size:0.85em;">
                    ${receiveDate !== '-' ? `<b>${receiveDate}</b>` : '<span style="color:#cbd5e1;">—</span>'}
                </td>
                <td style="padding:10px 12px; text-align:right;">
                    <div style="display:flex; justify-content:flex-end; gap:6px;">
                        ${isPending ? `
                            <button onclick="receiveMaterialOrder(${order.id})" style="padding:5px 10px; font-size:0.8em; background:#16a34a; color:white; border:none; border-radius:6px; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:4px;" title="Пратката е получена — заприходи в Склад Материали">
                                <span>📦 Приеми</span>
                            </button>
                            <button onclick="reopenMaterialOrderEmail(${order.id})" style="padding:5px 8px; font-size:0.8em; background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; border-radius:6px; font-weight:700; cursor:pointer;" title="Отвори Gmail бланка за доставчика">
                                ✉️
                            </button>
                        ` : `
                            <span style="font-size:0.78em; color:#15803d; font-weight:700; padding:4px 6px;">Заприходено</span>
                        `}
                        <button onclick="deleteMaterialOrder(${order.id})" style="padding:5px 8px; font-size:0.8em; background:#f1f5f9; color:#94a3b8; border:1px solid #cbd5e1; border-radius:6px; cursor:pointer;" title="Изтрий поръчка">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    wrap.innerHTML = html;
}

// Заприходяване на получена поръчка в склада
window.receiveMaterialOrder = async function(orderId) {
    const order = globalMaterialOrders.find(o => o.id === orderId);
    if (!order) return;

    const materialName = order['Материал'] || '';
    const orderQty = parseFloat(order['Количество']) || 0;

    // Взимаме наличността от sklad
    let currentStock = 0;
    let currentDostaveno = 0;
    let unit = 'бр.';

    try {
        const { data: skData } = await client.from('sklad').select('*').eq('ID Детайл', materialName);
        if (skData && skData.length > 0) {
            currentStock = parseFloat(skData[0]['Остатък']) || 0;
            currentDostaveno = parseFloat(skData[0]['Доставено']) || 0;
            unit = skData[0]['Мерна единица'] || 'бр.';
        }
    } catch(e) {}

    const { value: confirmedQty } = await Swal.fire({
        title: '📦 Заприходяване на доставка',
        html: `
            <div style="text-align:left; font-size:0.92em; line-height:1.5;">
                <div style="margin-bottom:12px; background:#f0f9ff; border:1px solid #bae6fd; padding:10px 12px; border-radius:8px;">
                    <div>Материал: <strong style="color:#0369a1; font-size:1.05em;">${escapeHtml(materialName)}</strong></div>
                    <div>Текущ остатък в склада: <strong>${currentStock} ${unit}</strong></div>
                    <div>Поръчано количество: <strong>${orderQty} ${unit}</strong></div>
                </div>
                <label style="display:block; font-weight:700; color:#334155; margin-bottom:5px;">
                    Реално пристигнало количество за заприходяване (${unit}):
                </label>
                <input id="swalReceiveQty" type="number" step="any" value="${orderQty}" class="swal2-input" style="width:100%; box-sizing:border-box; margin:0; height:42px;">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: '✅ Заприходи в Склада',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#16a34a',
        preConfirm: () => {
            const q = parseFloat(document.getElementById('swalReceiveQty')?.value);
            if (isNaN(q) || q <= 0) {
                Swal.showValidationMessage('Моля, въведете валидно положително количество!');
                return false;
            }
            return q;
        }
    });

    if (confirmedQty) {
        Swal.fire({ title: 'Заприходяване в склада...', didOpen: () => Swal.showLoading() });
        try {
            const todayStr = new Date().toISOString().split('T')[0];

            // 1. Обновяваме поръчката в porachki_materiali
            const { error: updOrderErr } = await client
                .from('porachki_materiali')
                .update({
                    'Статус': 'Прието',
                    'Дата на приемане': todayStr
                })
                .eq('id', orderId);

            if (updOrderErr) throw updOrderErr;

            // 2. Обновяваме sklad
            const { data: skData, error: skFetchErr } = await client.from('sklad').select('Доставено, Остатък').eq('ID Детайл', materialName);
            if (skFetchErr) throw skFetchErr;

            if (skData && skData.length > 0) {
                const newDostaveno = (parseFloat(skData[0]['Доставено']) || 0) + confirmedQty;
                const newOstatuk = (parseFloat(skData[0]['Остатък']) || 0) + confirmedQty;

                const { error: skUpdErr } = await client
                    .from('sklad')
                    .update({
                        'Доставено': newDostaveno,
                        'Остатък': newOstatuk
                    })
                    .eq('ID Детайл', materialName);

                if (skUpdErr) throw skUpdErr;
            }

            // 3. Записваме в одит лога
            try {
                const adminEmail = localStorage.getItem('last_admin_email') || 'Администратор';
                await client.from('audit_logs').insert([{
                    table_name: 'sklad',
                    action_type: 'DELIVERY_RECEIVE',
                    new_data: {
                        'ID Детайл': materialName,
                        'Заприходено': confirmedQty,
                        'Поръчка_ID': orderId,
                        'Приел': adminEmail
                    }
                }]);
            } catch(e) {}

            // Инвалидираме кеша и презареждаме таблицата на склада ако сме в него
            if (window.invalidateAdminCache) {
                window.invalidateAdminCache('sklad');
                window.invalidateAdminCache('porachki');
            }

            if (typeof loadCurrentTableData === 'function' && currentTab === 'sklad') {
                loadCurrentTableData(true);
            }

            await fetchMaterialOrders();
            renderMaterialOrdersTable();

            Swal.fire({
                icon: 'success',
                title: 'Успешно заприходено!',
                html: `Материалът <b>${escapeHtml(materialName)}</b> (+${confirmedQty} ${unit}) е добавен към наличността в склада.`,
                timer: 2500,
                showConfirmButton: false
            });

        } catch (err) {
            Swal.fire('Грешка', 'Неуспешно заприходяване: ' + err.message, 'error');
        }
    }
};

// Изтриване на поръчка
window.deleteMaterialOrder = async function(orderId) {
    const res = await Swal.fire({
        title: 'Изтриване на поръчката?',
        text: 'Записът ще бъде премахнат от дневника.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Да, изтрий',
        cancelButtonText: 'Отказ'
    });

    if (res.isConfirmed) {
        try {
            Swal.fire({ title: 'Изтриване...', didOpen: () => Swal.showLoading() });
            const { error } = await client.from('porachki_materiali').delete().eq('id', orderId);
            if (error) throw error;

            if (window.invalidateAdminCache) window.invalidateAdminCache('porachki');
            await fetchMaterialOrders();
            renderMaterialOrdersTable();

            Swal.fire({ icon: 'success', title: 'Изтрито!', timer: 1000, showConfirmButton: false });
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
};

// Повторно отваряне на Gmail бланка за съществуваща поръчка
window.reopenMaterialOrderEmail = function(orderId) {
    const order = globalMaterialOrders.find(o => o.id === orderId);
    if (!order) return;

    const recipient = order['Имейл на доставчик'] || '';
    const matName = order['Материал'] || '';
    const qty = order['Количество'] || 1;

    const subject = encodeURIComponent("Поръчка на материал: " + matName);
    const body = encodeURIComponent(`Здравейте,\n\nБихме искали да поръчаме следната позиция за нашето производство:\nМатериал: ${matName}\nКоличество: ${qty}\n\nМоля да потвърдите получаването на поръчката и очаквано време за доставка.\n\nПоздрави,\nAMCI`);

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipient)}&su=${subject}&body=${body}`;
    window.open(gmailUrl, 'GmailPopup', 'width=800,height=600,left=200,top=100,scrollbars=yes');
};

// ==============================================================================
// ФОРМА ЗА БЪРЗА ПОРЪЧКА НА МАТЕРИАЛ (С ИЗЧИСЛЯВАНЕ НА КУТИИ & GMAIL БЛАНКА)
// ==============================================================================
window.openCreateMaterialOrderModal = async function(prefillMaterial = '', recommendedQty = null) {
    let materialCode = (prefillMaterial || '').trim();
    let currentStock = 0;
    let minStock = 0;
    let unit = 'бр.';
    let packSize = '';
    let knownSupplier = '';
    let knownEmail = '';

    // Търсим детайла в кеша или в базата
    if (materialCode) {
        try {
            const { data: skRows } = await client.from('sklad').select('*').eq('ID Детайл', materialCode);
            if (skRows && skRows.length > 0) {
                const s = skRows[0];
                currentStock = parseFloat(s['Остатък']) || 0;
                minStock = parseFloat(s['Минимално количество']) || 0;
                unit = s['Мерна единица'] || 'бр.';
                packSize = s['pack_size'] || '';
            }
        } catch(e) {}

        // Ако packSize е празен, проверяваме в Номенклатура
        if (!packSize) {
            try {
                const { data: nomRows } = await client.from('Номенклатура').select('pack_size, Единици').eq('ID Детайл', materialCode);
                if (nomRows && nomRows.length > 0) {
                    if (nomRows[0].pack_size) packSize = nomRows[0].pack_size;
                    if (nomRows[0]['Единици'] && unit === 'бр.') unit = nomRows[0]['Единици'];
                }
            } catch(e) {}
        }

        // Търсим последния доставчик от предишни поръчки за този материал
        const prevOrder = globalMaterialOrders.find(o => String(o['Материал'] || '').trim().toLowerCase() === materialCode.toLowerCase());
        if (prevOrder) {
            knownSupplier = prevOrder['Доставчик'] || '';
            knownEmail = prevOrder['Имейл на доставчик'] || '';
        }
    }

    // Ако няма запазен имейл, проверяваме localStorage
    if (knownSupplier && !knownEmail) {
        knownEmail = localStorage.getItem('material_supplier_email_' + knownSupplier.trim().toLowerCase()) || '';
    }

    // Определяме препоръчително количество
    let defaultQty = 10;
    if (recommendedQty !== null && recommendedQty !== undefined && recommendedQty > 0) {
        defaultQty = recommendedQty;
    } else if (minStock > currentStock) {
        defaultQty = Math.max(1, minStock - currentStock);
    } else {
        const numPack = parseFloat(packSize);
        if (!isNaN(numPack) && numPack > 0) {
            defaultQty = numPack;
        }
    }

    // Списък с доставчици за datalist
    const pastSuppliers = Array.from(new Set(
        globalMaterialOrders.map(o => (o['Доставчик'] || '').trim()).filter(Boolean)
    ));

    // Списък с материали от склада за datalist (ако не е префилнат)
    let materialOptionsHtml = '';
    if (typeof globalRows !== 'undefined' && currentTab === 'sklad' && globalRows.length > 0) {
        materialOptionsHtml = globalRows.map(r => `<option value="${escapeHtml(r['ID Детайл'])}">${escapeHtml(r['ID Детайл'])} (${r['Остатък'] || 0} ${r['Мерна единица'] || 'бр.'})</option>`).join('');
    }

    // Изчисляване на текстов ред за опаковката
    const getPackDisplay = (qty, pack) => {
        if (!pack || String(pack).trim() === '' || String(pack).trim() === 'null') return '';
        const cleanPack = String(pack).trim();
        const numPack = parseFloat(cleanPack);
        if (!isNaN(numPack) && numPack > 0 && /^\d+(\.\d+)?$/.test(cleanPack)) {
            let boxes = (qty % numPack === 0) ? (qty / numPack) : (qty / numPack).toFixed(1);
            return `📦 <b>${boxes} ${boxes == 1 ? 'кутия' : 'кутии'}</b> по ${numPack} ${unit}`;
        }
        return `📦 Опаковка: <b>${escapeHtml(cleanPack)}</b>`;
    };

    const initialPackDisplay = getPackDisplay(defaultQty, packSize);

    const { value: formValues } = await Swal.fire({
        title: '🛒 Поръчка на Материал',
        width: '580px',
        html: `
            <div style="text-align: left; font-size: 0.9em; display: flex; flex-direction: column; gap: 12px; font-family: inherit;">
                <div>
                    <label style="font-weight: 700; color: #334155; display: block; margin-bottom: 4px;">Материал / Суровина:</label>
                    <input type="text" id="swalMatOrderCode" list="dl_available_materials" value="${escapeHtml(materialCode)}" placeholder="напр. Ф12 S303, Меден лист 2мм" style="width: 100%; padding: 8px 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; box-sizing: border-box; font-weight: 800; font-size: 0.95em;">
                    <datalist id="dl_available_materials">
                        ${materialOptionsHtml}
                    </datalist>
                </div>

                <div id="swalMatStockInfo" style="background: #f1f5f9; border-radius: 8px; padding: 8px 12px; font-size: 0.85em; color: #475569; display: flex; justify-content: space-between; align-items: center;">
                    <span>Текуща наличност: <b style="color: ${currentStock <= minStock ? '#dc2626' : '#166534'};">${currentStock} ${unit}</b></span>
                    <span>Мин. буфер: <b>${minStock} ${unit}</b></span>
                </div>

                <div style="display: flex; gap: 12px;">
                    <div style="flex: 1;">
                        <label style="font-weight: 700; color: #334155; display: block; margin-bottom: 4px;">Количество (${unit}):</label>
                        <input type="number" id="swalMatOrderQty" step="any" value="${defaultQty}" style="width: 100%; padding: 8px 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; box-sizing: border-box; font-size: 1.05em; font-weight: 800; color: #0284c7;">
                    </div>
                    <div style="flex: 1.3;">
                        <label style="font-weight: 700; color: #334155; display: block; margin-bottom: 4px;">Опаковка / Кашон:</label>
                        <input type="text" id="swalMatOrderPack" value="${escapeHtml(packSize)}" placeholder="напр. 10 бр., пръти 1.5м" style="width: 100%; padding: 8px 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                    </div>
                </div>

                <div id="swalMatBoxCalc" style="font-size: 0.85em; color: #0369a1; background: #e0f2fe; padding: 6px 10px; border-radius: 6px; font-weight: 700; ${initialPackDisplay ? '' : 'display:none;'}">
                    ${initialPackDisplay}
                </div>

                <div>
                    <label style="font-weight: 700; color: #334155; display: block; margin-bottom: 4px;">Доставчик:</label>
                    <input type="text" id="swalMatOrderSupplier" list="dl_mat_suppliers" value="${escapeHtml(knownSupplier)}" placeholder="Име на фирмата доставчик" style="width: 100%; padding: 8px 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                    <datalist id="dl_mat_suppliers">
                        ${pastSuppliers.map(s => `<option value="${escapeHtml(s)}">`).join('')}
                    </datalist>
                </div>

                <div>
                    <label style="font-weight: 700; color: #334155; display: block; margin-bottom: 4px;">Имейл на доставчик:</label>
                    <input type="email" id="swalMatOrderEmail" value="${escapeHtml(knownEmail)}" placeholder="sales@supplier.com" style="width: 100%; padding: 8px 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                </div>

                <div>
                    <label style="font-weight: 700; color: #334155; display: block; margin-bottom: 4px;">Забележка / Оферта (по избор):</label>
                    <input type="text" id="swalMatOrderNotes" placeholder="напр. По оферта №981 / Срок до петък" style="width: 100%; padding: 8px 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                </div>

                <div style="background: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 8px; padding: 10px; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 1.35em;">✉️</span>
                    <div style="font-size: 0.83em; color: #166534; line-height: 1.4;">
                        При натискане на <b>„Запази и Отвори Имейл“</b> поръчката се записва в дневника и автоматично се отваря <b>Gmail</b> с готова заредена бланка!
                    </div>
                </div>
            </div>
        `,
        didOpen: () => {
            const qtyInput = document.getElementById('swalMatOrderQty');
            const packInput = document.getElementById('swalMatOrderPack');
            const boxCalc = document.getElementById('swalMatBoxCalc');
            const suppInput = document.getElementById('swalMatOrderSupplier');
            const emailInput = document.getElementById('swalMatOrderEmail');

            const updateCalc = () => {
                const q = parseFloat(qtyInput?.value) || 0;
                const p = (packInput?.value || '').trim();
                const disp = getPackDisplay(q, p);
                if (disp && boxCalc) {
                    boxCalc.innerHTML = disp;
                    boxCalc.style.display = 'block';
                } else if (boxCalc) {
                    boxCalc.style.display = 'none';
                }
            };

            if (qtyInput) qtyInput.addEventListener('input', updateCalc);
            if (packInput) packInput.addEventListener('input', updateCalc);

            // Автопопълване на имейл при смяна на доставчик
            if (suppInput && emailInput) {
                suppInput.addEventListener('change', () => {
                    const sup = suppInput.value.trim().toLowerCase();
                    if (sup) {
                        const savedMail = localStorage.getItem('material_supplier_email_' + sup);
                        if (savedMail && !emailInput.value) {
                            emailInput.value = savedMail;
                        }
                    }
                });
            }
        },
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: '🛒 Запази и Отвори Имейл',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#0284c7',
        preConfirm: () => {
            const mat = document.getElementById('swalMatOrderCode')?.value.trim();
            const qty = parseFloat(document.getElementById('swalMatOrderQty')?.value);

            if (!mat) {
                Swal.showValidationMessage('Моля, въведете или изберете материал!');
                return false;
            }
            if (isNaN(qty) || qty <= 0) {
                Swal.showValidationMessage('Моля, въведете валидно количество за поръчка!');
                return false;
            }

            return {
                material: mat,
                qty: qty,
                pack: document.getElementById('swalMatOrderPack')?.value.trim() || '',
                supplier: document.getElementById('swalMatOrderSupplier')?.value.trim() || '',
                email: document.getElementById('swalMatOrderEmail')?.value.trim() || '',
                notes: document.getElementById('swalMatOrderNotes')?.value.trim() || ''
            };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Записване на поръчката...', didOpen: () => Swal.showLoading() });
        try {
            const todayStr = new Date().toISOString().split('T')[0];

            // Запазваме имейла на доставчика в localStorage
            if (formValues.supplier && formValues.email) {
                try {
                    localStorage.setItem('material_supplier_email_' + formValues.supplier.trim().toLowerCase(), formValues.email.trim());
                } catch(e) {}
            }

            // 1. Вкарваме поръчката в porachki_materiali
            const orderPayload = {
                'Материал': formValues.material,
                'Дата на поръчка': todayStr,
                'Доставчик': formValues.supplier,
                'Имейл на доставчик': formValues.email,
                'Количество': formValues.qty,
                'Статус': 'Поръчано'
            };

            const { error: insErr } = await client.from('porachki_materiali').insert([orderPayload]);
            if (insErr) throw insErr;

            // 2. Генериране на кутии / бройки за Gmail писмото
            let packLine = '';
            if (formValues.pack) {
                const numPack = parseFloat(formValues.pack);
                if (!isNaN(numPack) && numPack > 0 && /^\d+(\.\d+)?$/.test(formValues.pack)) {
                    let boxes = (formValues.qty % numPack === 0) ? (formValues.qty / numPack) : (formValues.qty / numPack).toFixed(1);
                    packLine = ` (${boxes} ${boxes == 1 ? 'кутия' : 'кутии'} по ${numPack} ${unit})`;
                } else {
                    packLine = ` (Опаковка: ${formValues.pack})`;
                }
            }

            let noteLine = '';
            if (formValues.notes) {
                noteLine = `Забележка / Оферта: ${formValues.notes}\n`;
            }

            // 3. Отваряме Gmail с готова заредена бланка
            const recipient = formValues.email || '';
            const subject = encodeURIComponent("Поръчка на материал: " + formValues.material);
            const body = encodeURIComponent(`Здравейте,\n\nБихме искали да поръчаме следната позиция за нашето производство:\nМатериал: ${formValues.material}\nКоличество: ${formValues.qty} ${unit}${packLine}\n${noteLine}\nМоля да потвърдите получаването на поръчката и очаквано време за доставка.\n\nПоздрави,\nAMCI`);

            const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipient)}&su=${subject}&body=${body}`;
            window.open(gmailUrl, 'GmailPopup', 'width=800,height=600,left=200,top=100,scrollbars=yes');

            // Инвалидираме кешовете
            if (window.invalidateAdminCache) {
                window.invalidateAdminCache('porachki');
            }

            await fetchMaterialOrders();
            renderMaterialOrdersTable();

            Swal.fire({
                icon: 'success',
                title: 'Поръчката е регистрирана!',
                html: `Поръчката за <b>${escapeHtml(formValues.material)}</b> (${formValues.qty} ${unit}) е записана със статус <b>„Поръчано“</b>.<br>Отворен е прозорец на <b>Gmail</b> с попълнена бланка за доставчика.`,
                timer: 3500,
                showConfirmButton: true,
                confirmButtonText: 'Добре'
            });

        } catch (err) {
            Swal.fire('Грешка', 'Неуспешен запис: ' + err.message, 'error');
        }
    }
};

// ==============================================================================
// 📅 МЕСЕЧНО ПРЕСМЯТАНЕ НА НУЖДИТЕ НА ЦЕХА (СЛЕД 20-ТО ЧИСЛО) & 1-КЛИК ПОРЪЧКИ
// ==============================================================================

let globalMonthlyDeficits = [];
let monthlyDeficitsFilter = 'all'; // 'all', 'needed', 'pending'
let monthlyTotalItemsWithMin = 0;

// 1. Функция за проверка и пресмятане на дефицитите
window.checkMonthlyMaterialDeficits = async function(autoPrompt = false) {
    try {
        if (typeof client === 'undefined' || !client) return [];

        // Взимаме всички материали от sklad
        const { data: skladRows, error: skErr } = await client
            .from('sklad')
            .select('*');

        if (skErr) {
            console.warn('Грешка при четене на sklad:', skErr.message);
            return [];
        }

        // Ако поръчките не са заредени, ги зареждаме
        if (!globalMaterialOrders || globalMaterialOrders.length === 0) {
            const { data: ordData } = await client
                .from('porachki_materiali')
                .select('*')
                .order('id', { ascending: false })
                .limit(200);
            if (ordData) globalMaterialOrders = ordData;
        }

        // Карта на доставчици и имейли от историята на поръчките
        const supplierMap = {};
        (globalMaterialOrders || []).forEach(o => {
            const mat = (o['Материал'] || '').trim().toLowerCase();
            if (mat && !supplierMap[mat] && o['Доставчик']) {
                supplierMap[mat] = {
                    supplier: o['Доставчик'],
                    email: o['Имейл на доставчик'] || ''
                };
            }
        });

        const list = [];
        let itemsWithMinCount = 0;

        (skladRows || []).forEach(r => {
            const matName = (r['ID Детайл'] || '').trim();
            if (!matName) return;

            const minQty = parseFloat(r['Минимално количество']) || 0;
            if (minQty <= 0) return; // Следим само материали със зададено минимално буферно количество!
            itemsWithMinCount++;

            const currentStock = parseFloat(r['Остатък']) || 0;
            const unit = r['Мерна единица'] || 'бр.';
            const packSize = r['pack_size'] || '';

            // Ако наличността е под минималния праг (дефицит):
            if (currentStock < minQty) {
                const deficit = minQty - currentStock; // Точен недостиг до буфера

                // Проверяваме дали за този материал вече има чакаща поръчка със статус 'Поръчано'
                const pendingOrders = (globalMaterialOrders || []).filter(o => 
                    o['Статус'] === 'Поръчано' && 
                    (o['Материал'] || '').trim().toLowerCase() === matName.toLowerCase()
                );
                const pendingQty = pendingOrders.reduce((acc, o) => acc + (parseFloat(o['Количество']) || 0), 0);

                // Количество нужно за поръчка сега (дефицит минус вече чакащите доставки)
                const neededToOrder = Math.max(0, deficit - pendingQty);

                const supInfo = supplierMap[matName.toLowerCase()] || { supplier: '', email: '' };

                list.push({
                    material: matName,
                    stock: currentStock,
                    minQty: minQty,
                    unit: unit,
                    deficit: deficit,
                    pendingQty: pendingQty,
                    neededToOrder: neededToOrder,
                    packSize: packSize,
                    supplier: supInfo.supplier,
                    email: supInfo.email,
                    notes: r['Бележки'] || ''
                });
            }
        });

        // Сортиране: Първо тези с neededToOrder > 0 (по-голям дефицит), след това тези с чакащи поръчки
        list.sort((a, b) => {
            if (a.neededToOrder > 0 && b.neededToOrder <= 0) return -1;
            if (a.neededToOrder <= 0 && b.neededToOrder > 0) return 1;
            return b.deficit - a.deficit;
        });

        globalMonthlyDeficits = list;
        monthlyTotalItemsWithMin = itemsWithMinCount;
        updateMonthlyDeficitBadges();

        // Ако модалът на дефицитите е отворен, опресняваме го
        const defModal = document.getElementById('monthlyMaterialDeficitsModal');
        if (defModal && defModal.style.display === 'flex') {
            renderMonthlyDeficitsTable();
        }

        // Автоматично известие на 20-то число (или след него)
        const today = new Date();
        const is20thOrLater = today.getDate() >= 20;
        const countNeeded = list.filter(x => x.neededToOrder > 0).length;

        if (autoPrompt && is20thOrLater && countNeeded > 0) {
            const promptKey = `dismissed_monthly_material_prompt_${today.getFullYear()}_${today.getMonth() + 1}`;
            if (!sessionStorage.getItem(promptKey)) {
                showMonthlyDeficitToast(countNeeded, promptKey);
            }
        }

        return list;
    } catch (err) {
        console.warn('checkMonthlyMaterialDeficits catch:', err);
        return [];
    }
};

// 2. Обновяване на всички баджове за дефицит
window.updateMonthlyDeficitBadges = function() {
    const countNeeded = (globalMonthlyDeficits || []).filter(x => x.neededToOrder > 0).length;

    // Бадж в главното меню "Планиране"
    const adminBadge = document.getElementById('adminMonthlyDeficitBadge');
    if (adminBadge) {
        if (countNeeded > 0) {
            adminBadge.innerText = countNeeded;
            adminBadge.style.display = 'inline-block';
        } else {
            adminBadge.style.display = 'none';
        }
    }

    // Бадж в бутона вътре в Поръчки на Материали
    const modalBadge = document.getElementById('monthlyDeficitBtnBadge');
    if (modalBadge) {
        if (countNeeded > 0) {
            modalBadge.innerText = countNeeded;
            modalBadge.style.display = 'inline-block';
        } else {
            modalBadge.style.display = 'none';
        }
    }

    // Бадж в контекстния бутон в таб Склад Материали
    const skladBadge = document.getElementById('skladMonthlyDeficitBadge');
    if (skladBadge) {
        if (countNeeded > 0) {
            skladBadge.innerText = countNeeded;
            skladBadge.style.display = 'inline-block';
        } else {
            skladBadge.style.display = 'none';
        }
    }
};

// 3. Автоматично известие на 20-то число
function showMonthlyDeficitToast(countNeeded, promptKey) {
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'info',
        title: '📅 20-то число: Нужди на цеха!',
        html: `Заготовките за месеца приключиха.<br>Намерени са <b>${countNeeded} позиции</b> под минималния праг в Склада.`,
        showConfirmButton: true,
        confirmButtonText: '🛒 Прегледай & Поръчай',
        showCancelButton: true,
        cancelButtonText: 'По-късно',
        confirmButtonColor: '#7c3aed',
        cancelButtonColor: '#94a3b8',
        timer: 16000,
        timerProgressBar: true
    }).then(result => {
        sessionStorage.setItem(promptKey, 'true');
        if (result.isConfirmed) {
            openMonthlyMaterialDeficitsModal();
        }
    });
}

// 4. Отваряне на модала за месечни дефицити
window.openMonthlyMaterialDeficitsModal = async function() {
    let modal = document.getElementById('monthlyMaterialDeficitsModal');
    if (!modal) {
        initMonthlyMaterialDeficitsModalHtml();
        modal = document.getElementById('monthlyMaterialDeficitsModal');
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const wrap = document.getElementById('monthlyDeficitsTableWrap');
    if (wrap) wrap.innerHTML = `<div style="text-align:center; color:#7c3aed; padding:45px 10px; font-size:1.05em; font-weight:700;">🔄 Пресмятане на нуждите спрямо текущата наличност и минималните буфери...</div>`;

    await checkMonthlyMaterialDeficits(false);
    renderMonthlyDeficitsTable();
};

// 5. Затваряне на модала
window.closeMonthlyMaterialDeficitsModal = function() {
    const modal = document.getElementById('monthlyMaterialDeficitsModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = 'auto';
};

// 6. Създаване на DOM структурата за модала на дефицитите
function initMonthlyMaterialDeficitsModalHtml() {
    const div = document.createElement('div');
    div.id = 'monthlyMaterialDeficitsModal';
    div.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.7); z-index:99999; justify-content:center; align-items:center; backdrop-filter:blur(4px); padding:16px; box-sizing:border-box;';

    const today = new Date();
    const dayOfMonth = today.getDate();
    const is20thOrLater = dayOfMonth >= 20;
    const periodPill = is20thOrLater 
        ? `<span style="background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; padding:4px 11px; border-radius:12px; font-weight:800; font-size:0.82em; display:inline-flex; align-items:center; gap:5px;">🟢 Активен период (след 20-то число)</span>`
        : `<span style="background:#fffbeb; color:#92400e; border:1px solid #fde68a; padding:4px 11px; border-radius:12px; font-weight:800; font-size:0.82em; display:inline-flex; align-items:center; gap:5px;">ℹ️ Ден ${dayOfMonth} (заготовките все още текат)</span>`;

    div.innerHTML = `
        <div style="background:white; border-radius:16px; width:100%; max-width:1150px; max-height:92vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 25px 50px -12px rgba(0,0,0,0.35); border:1.5px solid #ddd6fe;">
            <!-- Header -->
            <div style="padding:16px 22px; background:linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); border-bottom:1.5px solid #ddd6fe; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:44px; height:44px; border-radius:12px; background:linear-gradient(135deg, #7c3aed, #6d28d9); color:white; display:flex; align-items:center; justify-content:center; font-size:1.45em; box-shadow:0 4px 10px rgba(124, 58, 237, 0.3);">
                        📅
                    </div>
                    <div>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="font-size:1.24em; font-weight:900; color:#5b21b6;">Месечно Пресмятане на Нуждите (20-то число)</span>
                            ${periodPill}
                        </div>
                        <div style="font-size:0.83em; color:#6d28d9; margin-top:2px;">
                            Сравнение между минималния буфер и остатъка в склада след приключване на заготовките — поръчка до 100% буфер с 1 клик!
                        </div>
                    </div>
                </div>
                <button onclick="closeMonthlyMaterialDeficitsModal()" style="border:none; background:#ddd6fe; border-radius:50%; width:32px; height:32px; font-size:14px; cursor:pointer; color:#5b21b6; font-weight:bold; transition:all 0.2s;" onmouseover="this.style.background='#c4b5fd'" onmouseout="this.style.background='#ddd6fe'">✖</button>
            </div>

            <!-- KPI Cards bar -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; padding:12px 20px; background:#faf5ff; border-bottom:1px solid #e9d5ff;">
                <div style="background:white; padding:10px 14px; border-radius:10px; border:1px solid #e9d5ff; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-size:0.75em; font-weight:700; color:#6b21a8; text-transform:uppercase;">📦 Артикули с буфер</div>
                        <div style="font-size:1.35em; font-weight:900; color:#5b21b6;" id="statDeficitWithMin">0</div>
                    </div>
                    <span style="font-size:1.5em; opacity:0.6;">📋</span>
                </div>
                <div style="background:white; padding:10px 14px; border-radius:10px; border:1px solid #fecdd3; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-size:0.75em; font-weight:700; color:#9f1239; text-transform:uppercase;">🚨 Позиции с дефицит</div>
                        <div style="font-size:1.35em; font-weight:900; color:#e11d48;" id="statDeficitBelowMin">0</div>
                    </div>
                    <span style="font-size:1.5em; opacity:0.6;">📉</span>
                </div>
                <div style="background:white; padding:10px 14px; border-radius:10px; border:1px solid #fef08a; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-size:0.75em; font-weight:700; color:#854d0e; text-transform:uppercase;">⏳ Вече поръчани</div>
                        <div style="font-size:1.35em; font-weight:900; color:#b45309;" id="statDeficitPending">0</div>
                    </div>
                    <span style="font-size:1.5em; opacity:0.6;">📦</span>
                </div>
                <div style="background:white; padding:10px 14px; border-radius:10px; border:1px solid #c7d2fe; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-size:0.75em; font-weight:700; color:#3730a3; text-transform:uppercase;">🛒 За поръчка сега</div>
                        <div style="font-size:1.35em; font-weight:900; color:#4338ca;" id="statDeficitNeeded">0</div>
                    </div>
                    <span style="font-size:1.5em; opacity:0.6;">🚀</span>
                </div>
            </div>

            <!-- Controls bar -->
            <div style="padding:12px 20px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                    <button class="chip active" id="chip_def_all" onclick="filterMonthlyDeficits('all')">Всички дефицити (<span id="countDefAll">0</span>)</button>
                    <button class="chip" id="chip_def_needed" onclick="filterMonthlyDeficits('needed')" style="background:#f5f3ff; color:#6d28d9; border-color:#ddd6fe;">🛒 Само за поръчка (<span id="countDefNeeded">0</span>)</button>
                    <button class="chip" id="chip_def_pending" onclick="filterMonthlyDeficits('pending')" style="background:#fffbeb; color:#b45309; border-color:#fde68a;">⏳ Вече поръчани (<span id="countDefPending">0</span>)</button>
                </div>
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                    <input type="text" id="monthlyDeficitSearchInput" placeholder="🔍 Търси материал или доставчик..." oninput="renderMonthlyDeficitsTable()" style="padding:7px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:0.86em; width:220px;">
                    <button type="button" id="btnOrderAllMonthlyDeficits" onclick="executeBatchMonthlyMaterialOrders()" style="background:linear-gradient(135deg, #7c3aed, #4f46e5); color:white; border:none; padding:8px 16px; border-radius:8px; font-weight:900; font-size:0.88em; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 3px 6px rgba(124,58,237,0.3);">
                        <span>🚀 Поръчай ВСИЧКИ с 1 клик</span>
                        <span id="badgeOrderAllCount" style="background:rgba(255,255,255,0.25); padding:1px 7px; border-radius:8px; font-size:0.82em;">0</span>
                    </button>
                    <button type="button" onclick="simulateMaterialDeficit()" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:7px 11px; border-radius:8px; font-size:0.83em; font-weight:700; cursor:pointer;" title="Добави демонстрационен дефицит (Стомана Ф5: Наличност 10 м, Мин 100 м -> Дефицит 90 м)">
                        🧪 Демо пример
                    </button>
                    <button type="button" onclick="checkMonthlyMaterialDeficits(false).then(renderMonthlyDeficitsTable)" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:7px 10px; border-radius:8px; font-size:0.85em; cursor:pointer;" title="Опресни изчисленията">
                        🔄
                    </button>
                </div>
            </div>

            <!-- Table area -->
            <div id="monthlyDeficitsTableWrap" style="padding:16px; overflow-y:auto; flex:1; background:#f8fafc;">
                <!-- Table will be rendered here -->
            </div>

            <!-- Footer -->
            <div style="padding:10px 20px; border-top:1px solid #e2e8f0; background:#fff; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                <span style="font-size:0.8em; color:#64748b; line-height:1.4;">
                    💡 След 20-то число заготовките за месеца са минали. Натиснете <b>„Поръчай ВСИЧКИ с 1 клик“</b> или бутона за съответния ред, за да генерирате поръчки със статус <b>„Поръчано“</b>. При пристигане на пратките ги заприходете от меню „Поръчки на Материали“ и наличността автоматично ще се възстанови до 100% от буфера.
                </span>
                <button onclick="closeMonthlyMaterialDeficitsModal()" style="padding:8px 18px; background:#64748b; color:white; border:none; border-radius:8px; font-weight:700; font-size:0.85em; cursor:pointer;">Затвори</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
}

// 7. Филтриране на изгледа
window.filterMonthlyDeficits = function(filter) {
    monthlyDeficitsFilter = filter;
    document.querySelectorAll('#monthlyMaterialDeficitsModal .chip').forEach(c => c.classList.remove('active'));
    if (filter === 'all') document.getElementById('chip_def_all')?.classList.add('active');
    else if (filter === 'needed') document.getElementById('chip_def_needed')?.classList.add('active');
    else if (filter === 'pending') document.getElementById('chip_def_pending')?.classList.add('active');
    renderMonthlyDeficitsTable();
};

// 8. Рендериране на таблицата с дефицити
function renderMonthlyDeficitsTable() {
    const wrap = document.getElementById('monthlyDeficitsTableWrap');
    if (!wrap) return;

    const allDeficits = globalMonthlyDeficits || [];
    const neededCount = allDeficits.filter(x => x.neededToOrder > 0).length;
    const pendingCount = allDeficits.filter(x => x.pendingQty > 0).length;

    // Обновяваме KPI индикаторите
    if (document.getElementById('statDeficitWithMin')) document.getElementById('statDeficitWithMin').innerText = monthlyTotalItemsWithMin;
    if (document.getElementById('statDeficitBelowMin')) document.getElementById('statDeficitBelowMin').innerText = allDeficits.length;
    if (document.getElementById('statDeficitPending')) document.getElementById('statDeficitPending').innerText = pendingCount;
    if (document.getElementById('statDeficitNeeded')) document.getElementById('statDeficitNeeded').innerText = neededCount;

    if (document.getElementById('countDefAll')) document.getElementById('countDefAll').innerText = allDeficits.length;
    if (document.getElementById('countDefNeeded')) document.getElementById('countDefNeeded').innerText = neededCount;
    if (document.getElementById('countDefPending')) document.getElementById('countDefPending').innerText = pendingCount;
    if (document.getElementById('badgeOrderAllCount')) document.getElementById('badgeOrderAllCount').innerText = neededCount;

    const searchQ = (document.getElementById('monthlyDeficitSearchInput')?.value || '').trim().toLowerCase();

    let filtered = allDeficits;
    if (monthlyDeficitsFilter === 'needed') {
        filtered = filtered.filter(x => x.neededToOrder > 0);
    } else if (monthlyDeficitsFilter === 'pending') {
        filtered = filtered.filter(x => x.pendingQty > 0);
    }

    if (searchQ) {
        filtered = filtered.filter(x => {
            const mat = String(x.material || '').toLowerCase();
            const sup = String(x.supplier || '').toLowerCase();
            return mat.includes(searchQ) || sup.includes(searchQ);
        });
    }

    if (allDeficits.length === 0) {
        wrap.innerHTML = `
            <div style="text-align:center; padding:50px 20px; background:white; border-radius:12px; border:1px dashed #cbd5e1;">
                <div style="font-size:3em; margin-bottom:10px;">🎉</div>
                <div style="font-size:1.25em; font-weight:800; color:#15803d; margin-bottom:6px;">Всички суровини са над минималния праг!</div>
                <div style="font-size:0.9em; color:#64748b; max-width:550px; margin:0 auto 16px auto;">
                    Няма намерени суровини в Склад Материали с наличност по-малка от зададеното Минимално количество. Складът е напълно обезпечен.
                </div>
                <button type="button" onclick="simulateMaterialDeficit()" style="background:#7c3aed; color:white; border:none; padding:8px 16px; border-radius:8px; font-weight:800; font-size:0.88em; cursor:pointer; box-shadow:0 3px 6px rgba(124,58,237,0.3);">
                    🧪 Зареди демо пример: Стомана Ф5 (10м наличност / 100м минимум)
                </button>
            </div>
        `;
        return;
    }

    if (filtered.length === 0) {
        wrap.innerHTML = `<div style="text-align:center; color:#94a3b8; padding:45px 10px; font-size:1.02em;">Няма намерени дефицити в избрания филтър.</div>`;
        return;
    }

    // Списък с доставчици за datalist
    const pastSuppliers = Array.from(new Set(
        (globalMaterialOrders || []).map(o => (o['Доставчик'] || '').trim()).filter(Boolean)
    ));

    let html = `
        <datalist id="dl_def_suppliers">
            ${pastSuppliers.map(s => `<option value="${escapeHtml(s)}">`).join('')}
        </datalist>
        <table style="width:100%; border-collapse:collapse; background:white; border-radius:10px; overflow:hidden; font-size:0.88em; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
            <thead>
                <tr style="background:#f1f5f9; color:#475569; text-align:left; border-bottom:2px solid #cbd5e1;">
                    <th style="padding:10px 12px; width:40px; text-align:center;">
                        <input type="checkbox" id="chkSelectAllMonthlyDeficits" onchange="toggleSelectAllMonthlyDeficits(this.checked)" checked title="Маркирай/размаркирай всички">
                    </th>
                    <th style="padding:10px 12px;">Материал / Суровина</th>
                    <th style="padding:10px 12px; text-align:center; width:115px;">Текущ Остатък</th>
                    <th style="padding:10px 12px; text-align:center; width:115px;">Мин. Буфер</th>
                    <th style="padding:10px 12px; text-align:center; width:115px;">Недостиг</th>
                    <th style="padding:10px 12px; text-align:center; width:135px;">Чакаща доставка</th>
                    <th style="padding:10px 12px; text-align:center; width:130px;">За поръчка</th>
                    <th style="padding:10px 12px; width:160px;">Доставчик</th>
                    <th style="padding:10px 12px; text-align:right; width:125px;">Действие</th>
                </tr>
            </thead>
            <tbody>
    `;

    filtered.forEach((item, idx) => {
        // Намираме индекса в оригиналния масив globalMonthlyDeficits
        const origIndex = globalMonthlyDeficits.findIndex(x => x.material === item.material);
        const actualIdx = origIndex !== -1 ? origIndex : idx;

        const isFullyPending = item.neededToOrder <= 0 && item.pendingQty > 0;
        const deficitColor = item.deficit > 0 ? '#dc2626' : '#16a34a';

        const pendingDisplay = item.pendingQty > 0 
            ? `<span style="background:#fffbeb; color:#b45309; border:1px solid #fde68a; padding:3px 8px; border-radius:10px; font-weight:800; font-size:0.83em; display:inline-flex; align-items:center; gap:3px;">⏳ Чака ${item.pendingQty} ${item.unit}</span>`
            : `<span style="color:#94a3b8; font-size:0.85em;">—</span>`;

        const packBadge = item.packSize 
            ? `<span style="background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:6px; font-size:0.75em; font-weight:700; margin-left:6px;">📦 ${escapeHtml(item.packSize)}</span>` 
            : '';

        html += `
            <tr style="border-bottom:1px solid #e2e8f0; transition:background 0.15s;" onmouseover="this.style.background='#fafaf9'" onmouseout="this.style.background='white'">
                <td style="padding:10px 12px; text-align:center;">
                    <input type="checkbox" class="chk-monthly-def-row" data-index="${actualIdx}" ${item.neededToOrder > 0 ? 'checked' : ''} onchange="updateMonthlyBatchOrderButtonSummary()">
                </td>
                <td style="padding:10px 12px;">
                    <div style="font-weight:900; color:#0f172a; font-size:0.95em; display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                        <span>${escapeHtml(item.material)}</span>
                        ${packBadge}
                    </div>
                    ${item.notes ? `<div style="font-size:0.78em; color:#64748b;">${escapeHtml(item.notes)}</div>` : ''}
                </td>
                <td style="padding:10px 12px; text-align:center; font-weight:700; color:#334155;">
                    ${item.stock} ${item.unit}
                </td>
                <td style="padding:10px 12px; text-align:center; font-weight:700; color:#475569;">
                    ${item.minQty} ${item.unit}
                </td>
                <td style="padding:10px 12px; text-align:center; font-weight:900; color:${deficitColor};">
                    -${item.deficit} ${item.unit}
                </td>
                <td style="padding:10px 12px; text-align:center;">
                    ${pendingDisplay}
                </td>
                <td style="padding:10px 12px; text-align:center;">
                    <input type="number" id="inp_def_qty_${actualIdx}" value="${item.neededToOrder}" min="0" step="any" style="width:85px; padding:5px 8px; font-weight:900; color:#7c3aed; border:1.5px solid #cbd5e1; border-radius:6px; text-align:center; font-size:0.95em;" oninput="updateMonthlyBatchOrderButtonSummary()">
                </td>
                <td style="padding:10px 12px;">
                    <input type="text" id="inp_def_sup_${actualIdx}" list="dl_def_suppliers" value="${escapeHtml(item.supplier)}" placeholder="Доставчик" style="width:100%; box-sizing:border-box; padding:5px 8px; font-size:0.85em; border:1px solid #cbd5e1; border-radius:6px;">
                </td>
                <td style="padding:10px 12px; text-align:right;">
                    ${item.neededToOrder > 0 ? `
                        <button onclick="executeSingleMonthlyMaterialOrder(${actualIdx})" style="background:linear-gradient(135deg, #7c3aed, #6d28d9); color:white; border:none; padding:6px 12px; border-radius:7px; font-weight:800; font-size:0.82em; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 2px 4px rgba(124,58,237,0.25);" title="Поръчай тази суровина с 1 клик">
                            <span>🛒 Поръчай</span>
                        </button>
                    ` : `
                        <span style="color:#16a34a; font-weight:800; font-size:0.8em; background:#f0fdf4; padding:4px 8px; border-radius:6px; border:1px solid #bbf7d0; display:inline-flex; align-items:center; gap:4px;">
                            ✅ Обезпечено
                        </span>
                    `}
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    wrap.innerHTML = html;
    updateMonthlyBatchOrderButtonSummary();
}

// 9. Маркиране на всички редове
window.toggleSelectAllMonthlyDeficits = function(checked) {
    document.querySelectorAll('.chk-monthly-def-row').forEach(cb => {
        cb.checked = checked;
    });
    updateMonthlyBatchOrderButtonSummary();
};

// 10. Обновяване на броячите върху бутона за групова поръчка
window.updateMonthlyBatchOrderButtonSummary = function() {
    let count = 0;
    document.querySelectorAll('.chk-monthly-def-row').forEach(cb => {
        if (cb.checked) {
            const idx = parseInt(cb.getAttribute('data-index'), 10);
            const qtyInp = document.getElementById(`inp_def_qty_${idx}`);
            const q = parseFloat(qtyInp?.value) || 0;
            if (q > 0) count++;
        }
    });

    const badge = document.getElementById('badgeOrderAllCount');
    if (badge) badge.innerText = count;

    const btn = document.getElementById('btnOrderAllMonthlyDeficits');
    if (btn) {
        if (count === 0) {
            btn.style.opacity = '0.6';
        } else {
            btn.style.opacity = '1';
        }
    }
};

// 11. Изпълнение на единична поръчка с 1 клик
window.executeSingleMonthlyMaterialOrder = async function(idx) {
    const item = globalMonthlyDeficits[idx];
    if (!item) return;

    const qtyInp = document.getElementById(`inp_def_qty_${idx}`);
    const supInp = document.getElementById(`inp_def_sup_${idx}`);

    const qty = parseFloat(qtyInp?.value) || 0;
    const supplier = (supInp?.value || item.supplier || '').trim();

    if (isNaN(qty) || qty <= 0) {
        Swal.fire('Невалидно количество', 'Моля, въведете количество по-голямо от 0!', 'warning');
        return;
    }

    try {
        Swal.fire({ title: 'Записване на поръчката...', didOpen: () => Swal.showLoading() });
        const todayStr = new Date().toISOString().split('T')[0];

        // Запазваме доставчик в localStorage ако има
        if (supplier && item.email) {
            try { localStorage.setItem('material_supplier_email_' + supplier.toLowerCase(), item.email); } catch(e) {}
        }

        const newOrder = {
            'Материал': item.material,
            'Дата на поръчка': todayStr,
            'Доставчик': supplier || 'AMCI Склад Доставки',
            'Имейл на доставчик': item.email || '',
            'Количество': qty,
            'Статус': 'Поръчано'
        };

        const { error: insErr } = await client.from('porachki_materiali').insert([newOrder]);
        if (insErr) throw insErr;

        // Одит лог
        try {
            const adminEmail = localStorage.getItem('last_admin_email') || 'Администратор';
            await client.from('audit_logs').insert([{
                table_name: 'porachki_materiali',
                action_type: 'MONTHLY_MATERIAL_ORDER_20TH',
                new_data: {
                    material: item.material,
                    quantity: qty,
                    deficit: item.deficit,
                    user: adminEmail
                }
            }]);
        } catch(e) {}

        if (window.invalidateAdminCache) {
            window.invalidateAdminCache('porachki');
        }

        await fetchMaterialOrders();
        await checkMonthlyMaterialDeficits(false);
        renderMonthlyDeficitsTable();

        Swal.fire({
            icon: 'success',
            title: 'Поръчката е създадена!',
            html: `Успешно поръчани <b>${qty} ${item.unit}</b> от <b>${escapeHtml(item.material)}</b> със статус <b>„Поръчано“</b>.<br>При пристигане на пратката, отворете дневника на поръчките и натиснете <b>„Приеми“</b>.`,
            timer: 3500,
            showConfirmButton: true,
            confirmButtonText: 'Добре'
        });

    } catch (err) {
        Swal.fire('Грешка', 'Неуспешна поръчка: ' + err.message, 'error');
    }
};

// 12. Изпълнение на групова поръчка с 1 клик на ВСИЧКИ дефицити
window.executeBatchMonthlyMaterialOrders = async function() {
    const itemsToOrder = [];
    document.querySelectorAll('.chk-monthly-def-row').forEach(cb => {
        if (cb.checked) {
            const idx = parseInt(cb.getAttribute('data-index'), 10);
            const item = globalMonthlyDeficits[idx];
            if (item) {
                const qtyInp = document.getElementById(`inp_def_qty_${idx}`);
                const supInp = document.getElementById(`inp_def_sup_${idx}`);
                const q = parseFloat(qtyInp?.value) || 0;
                const s = (supInp?.value || item.supplier || '').trim();
                if (q > 0) {
                    itemsToOrder.push({
                        item: item,
                        qty: q,
                        supplier: s
                    });
                }
            }
        }
    });

    if (itemsToOrder.length === 0) {
        Swal.fire('Няма избрани позиции', 'Моля, маркирайте поне един дефицитен материал с количество за поръчка!', 'info');
        return;
    }

    const totalQty = itemsToOrder.reduce((acc, x) => acc + x.qty, 0);

    const res = await Swal.fire({
        title: '🚀 Поръчай ВСИЧКИ дефицити с 1 клик?',
        html: `
            <div style="text-align:left; font-size:0.92em; line-height:1.5;">
                Ще бъдат създадени <b>${itemsToOrder.length}</b> отделни заявки за материали със статус <b>„Поръчано“</b> до достигане на пълния минимален буфер.<br><br>
                Общо бройки/метри за поръчка: <b>${totalQty}</b>.<br><br>
                Потвърждавате ли създаването на поръчките?
            </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '✅ Да, поръчай всички!',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#7c3aed'
    });

    if (res.isConfirmed) {
        try {
            Swal.fire({ title: 'Генериране на поръчките...', didOpen: () => Swal.showLoading() });
            const todayStr = new Date().toISOString().split('T')[0];

            const batchPayload = itemsToOrder.map(entry => ({
                'Материал': entry.item.material,
                'Дата на поръчка': todayStr,
                'Доставчик': entry.supplier || 'AMCI Склад Доставки',
                'Имейл на доставчик': entry.item.email || '',
                'Количество': entry.qty,
                'Статус': 'Поръчано'
            }));

            const { error: insErr } = await client.from('porachki_materiali').insert(batchPayload);
            if (insErr) throw insErr;

            // Одит лог
            try {
                const adminEmail = localStorage.getItem('last_admin_email') || 'Администратор';
                await client.from('audit_logs').insert([{
                    table_name: 'porachki_materiali',
                    action_type: 'MONTHLY_MATERIAL_BATCH_ORDER_20TH',
                    new_data: {
                        count: itemsToOrder.length,
                        total_quantity: totalQty,
                        user: adminEmail
                    }
                }]);
            } catch(e) {}

            if (window.invalidateAdminCache) {
                window.invalidateAdminCache('porachki');
            }

            await fetchMaterialOrders();
            await checkMonthlyMaterialDeficits(false);
            renderMonthlyDeficitsTable();

            Swal.fire({
                icon: 'success',
                title: '🎉 Всички поръчки са създадени!',
                html: `Успешно са регистрирани <b>${itemsToOrder.length} поръчки</b> в дневника със статус <b>„Поръчано“</b>.<br>След пристигането им в цеха, отворете дневника и ги заприходете с <b>„Приеми“</b>!`,
                timer: 4000,
                showConfirmButton: true,
                confirmButtonText: 'Отлично'
            });

        } catch (err) {
            Swal.fire('Грешка', 'Неуспешна групова поръчка: ' + err.message, 'error');
        }
    }
};

// 13. Симулация на примерен дефицит (Стомана Ф5: Наличност 10 м, Мин 100 м -> Дефицит 90 м)
window.simulateMaterialDeficit = function() {
    const testItem = {
        material: 'Стомана Ф5',
        stock: 10,
        minQty: 100,
        unit: 'м',
        deficit: 90,
        pendingQty: 0,
        neededToOrder: 90,
        packSize: 'пръти 3м',
        supplier: 'Метал Инвест ООД',
        email: 'sales@metalinvest.bg',
        notes: 'Демонстрационен пример: на 20-то число поръчва недостигащите 90 метра'
    };

    // Проверяваме дали вече е в списъка
    const exists = globalMonthlyDeficits.find(x => x.material === testItem.material);
    if (!exists) {
        globalMonthlyDeficits.unshift(testItem);
    } else {
        exists.stock = 10;
        exists.minQty = 100;
        exists.deficit = 90;
        exists.neededToOrder = 90;
        exists.pendingQty = 0;
    }

    renderMonthlyDeficitsTable();
    updateMonthlyDeficitBadges();

    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'info',
        title: '🧪 Зареден демонстрационен пример!',
        text: 'Стомана Ф5 (Остатък: 10 м, Мин: 100 м -> Дефицит: 90 м)',
        timer: 3000,
        showConfirmButton: false
    });
};
