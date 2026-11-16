// ==============================================================================
// IS-SYSTEMS: МЕНИДЖЪР НА ИНСТРУМЕНТИ, МАШИНИ И ЗАЯВКИ ЗА ЕКИПИРОВКА
// ==============================================================================

let globalToolingRequests = [];
let toolingReqPollInterval = null;
let lastKnownToolingCount = -1;

document.addEventListener('DOMContentLoaded', () => {
    initToolingRequests();
});

// Инициализация на заявките за инструментална екипировка
async function initToolingRequests() {
    await fetchToolingRequests();
    if (toolingReqPollInterval) clearInterval(toolingReqPollInterval);
    toolingReqPollInterval = setInterval(fetchToolingRequests, 15000);
}

// Извличане на заявките от Supabase
async function fetchToolingRequests() {
    try {
        if (typeof client === 'undefined' || !client) return;

        const { data, error } = await client
            .from('tooling_requests')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            // Ако таблицата още не е създадена в базата данни, не чупим интерфейса
            if (error.code === '42P01' || (error.message && error.message.includes('relation'))) {
                return;
            }
            console.warn('Грешка при извличане на заявки за инструменти:', error.message);
            return;
        }

        globalToolingRequests = data || [];
        updateToolingReqBadges();

        // Проверка за нови чакащи заявки и звуково известие
        const pendingCount = globalToolingRequests.filter(r => r.status === 'Чакаща').length;
        if (lastKnownToolingCount !== -1 && pendingCount > lastKnownToolingCount) {
            const newestReq = globalToolingRequests.find(r => r.status === 'Чакаща');
            if (typeof playNotificationChime === 'function') {
                playNotificationChime();
            }
            showToolingRequestToast(newestReq);
        }
        lastKnownToolingCount = pendingCount;
    } catch (err) {
        console.warn('Грешка fetchToolingRequests:', err);
    }
}

// Обновяване на баджовете в навигацията
function updateToolingReqBadges() {
    const pendingCount = globalToolingRequests.filter(r => r.status === 'Чакаща').length;
    const badge = document.getElementById('adminToolingReqBadge');
    if (badge) {
        if (pendingCount > 0) {
            badge.innerText = pendingCount;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
}

// Изскачащо известие (Toast) при нова заявка за инструмент / пластина
function showToolingRequestToast(req) {
    if (!req) return;
    let toastContainer = document.getElementById('adminToastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'adminToastContainer';
        toastContainer.style.cssText = 'position:fixed; top:20px; right:20px; z-index:99999; display:flex; flex-direction:column; gap:10px; max-width:400px; pointer-events:none;';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.style.cssText = 'background:#ffffff; border:1px solid #fde68a; border-left:6px solid #d97706; border-radius:12px; padding:12px 16px; box-shadow:0 8px 24px rgba(0,0,0,0.18); pointer-events:auto; display:flex; flex-direction:column; gap:4px; cursor:pointer; transition:transform 0.15s;';
    toast.onmouseover = () => toast.style.transform = 'scale(1.02)';
    toast.onmouseout = () => toast.style.transform = 'scale(1)';

    const urgencyColor = req.urgency === 'Машината спира!' ? '#ef4444' : (req.urgency === 'Спешна' ? '#ea580c' : '#d97706');

    toast.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-weight:900; color:${urgencyColor}; font-size:0.92em; display:flex; align-items:center; gap:6px;">
                <span>🛠️</span> ЗАЯВКА ЗА ЕКИПИРОВКА / ПЛАСТИНИ
            </div>
            <span style="font-size:0.75em; color:#94a3b8;">току-що</span>
        </div>
        <div style="font-size:0.88em; color:#1e293b; font-weight:700;">
            <b>${escapeHtml(req.operator_name || 'Оператор')}</b> на пост <span style="color:#2563eb;">${escapeHtml(req.workstation_name)}</span> заяви:
        </div>
        <div style="font-size:0.95em; color:#92400e; background:#fef3c7; padding:6px 10px; border-radius:6px; font-weight:800; border:1px solid #fde68a;">
            👉 ${escapeHtml(req.tool_item)}
        </div>
        ${req.notes ? `<div style="font-size:0.8em; color:#64748b;">Бележка: ${escapeHtml(req.notes)}</div>` : ''}
    `;

    toast.onclick = () => {
        openToolingRequestsModal();
        toast.remove();
    };
    toastContainer.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 10000);
}

// Модален прозорец: Дневник на заявките за инструментална екипировка
window.openToolingRequestsModal = function() {
    let modal = document.getElementById('toolingRequestsModal');
    if (!modal) {
        initToolingRequestsModalHtml();
        modal = document.getElementById('toolingRequestsModal');
    }
    renderToolingRequestsTable();
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
};

window.closeToolingRequestsModal = function() {
    const modal = document.getElementById('toolingRequestsModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = 'auto';
};

function initToolingRequestsModalHtml() {
    const div = document.createElement('div');
    div.id = 'toolingRequestsModal';
    div.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.65); z-index:99999; justify-content:center; align-items:center; backdrop-filter:blur(4px); padding:16px; box-sizing:border-box;';
    div.innerHTML = `
        <div style="background:white; border-radius:16px; width:100%; max-width:980px; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 25px 50px -12px rgba(0,0,0,0.35); border:1.5px solid #fed7aa;">
            <!-- Header -->
            <div style="padding:16px 22px; background:linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-bottom:1.5px solid #fde68a; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:42px; height:42px; border-radius:10px; background:#d97706; color:white; display:flex; align-items:center; justify-content:center; font-size:1.3em;">
                        🛠️
                    </div>
                    <div>
                        <div style="font-size:1.2em; font-weight:900; color:#92400e;">Заявки за Инструменти &amp; Пластини от Цеха</div>
                        <div style="font-size:0.82em; color:#b45309;">Оперативни сигнали от терминалите при свършваща или повредена екипировка</div>
                    </div>
                </div>
                <button onclick="closeToolingRequestsModal()" style="border:none; background:#fde68a; border-radius:50%; width:32px; height:32px; font-size:14px; cursor:pointer; color:#92400e; font-weight:bold;">✖</button>
            </div>

            <!-- Controls bar -->
            <div style="padding:10px 20px; background:#fafaf9; border-bottom:1px solid #e7e5e4; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                <div style="display:flex; gap:6px;">
                    <button class="chip active" id="chip_tool_all" onclick="filterToolingRequests('all')">Всички</button>
                    <button class="chip" id="chip_tool_pending" onclick="filterToolingRequests('Чакаща')" style="background:#fffbeb; color:#b45309; border-color:#fde68a;">⏳ Чакащи (<span id="countToolPending">0</span>)</button>
                    <button class="chip" id="chip_tool_ordered" onclick="filterToolingRequests('Поръчана')" style="background:#eff6ff; color:#1d4ed8; border-color:#bfdbfe;">🛒 Поръчани</button>
                    <button class="chip" id="chip_tool_done" onclick="filterToolingRequests('Осигурена')" style="background:#f0fdf4; color:#15803d; border-color:#bbf7d0;">🟢 Осигурени</button>
                </div>
                <button class="btn-secondary" onclick="fetchToolingRequests().then(renderToolingRequestsTable)" style="font-size:0.85em; padding:6px 12px;">
                    🔄 Опресни
                </button>
            </div>

            <!-- Table area -->
            <div id="toolingRequestsTableWrap" style="padding:16px; overflow-y:auto; flex:1; background:#f8fafc;">
                <div style="text-align:center; color:#94a3b8; padding:30px;">Зареждане на заявките...</div>
            </div>

            <!-- Footer -->
            <div style="padding:10px 20px; border-top:1px solid #e2e8f0; background:#fff; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:0.8em; color:#94a3b8;">🔔 При всяка нова заявка от терминала, системата звъни и изкарва цветно известие.</span>
                <button onclick="closeToolingRequestsModal()" style="padding:8px 18px; background:#64748b; color:white; border:none; border-radius:8px; font-weight:700; font-size:0.85em; cursor:pointer;">Затвори</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
}

let currentToolingFilter = 'all';
window.filterToolingRequests = function(filter) {
    currentToolingFilter = filter;
    document.querySelectorAll('#toolingRequestsModal .chip').forEach(c => c.classList.remove('active'));
    if (filter === 'all') document.getElementById('chip_tool_all')?.classList.add('active');
    else if (filter === 'Чакаща') document.getElementById('chip_tool_pending')?.classList.add('active');
    else if (filter === 'Поръчана') document.getElementById('chip_tool_ordered')?.classList.add('active');
    else if (filter === 'Осигурена') document.getElementById('chip_tool_done')?.classList.add('active');
    renderToolingRequestsTable();
};

function renderToolingRequestsTable() {
    const wrap = document.getElementById('toolingRequestsTableWrap');
    if (!wrap) return;

    const pending = globalToolingRequests.filter(r => r.status === 'Чакаща').length;
    const countEl = document.getElementById('countToolPending');
    if (countEl) countEl.innerText = pending;

    let filtered = globalToolingRequests;
    if (currentToolingFilter !== 'all') {
        filtered = globalToolingRequests.filter(r => r.status === currentToolingFilter);
    }

    if (filtered.length === 0) {
        wrap.innerHTML = `<div style="text-align:center; color:#94a3b8; padding:40px 10px; font-size:1.05em;">Няма намерени заявки в тази категория.</div>`;
        return;
    }

    let html = `
        <table style="width:100%; border-collapse:collapse; background:white; border-radius:8px; overflow:hidden; font-size:0.88em; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
            <thead>
                <tr style="background:#f1f5f9; color:#475569; text-align:left; border-bottom:2px solid #cbd5e1;">
                    <th style="padding:10px 12px;">Дата/Час</th>
                    <th style="padding:10px 12px;">Работно Място</th>
                    <th style="padding:10px 12px;">Оператор</th>
                    <th style="padding:10px 12px;">Изисквана екипировка / Пластина</th>
                    <th style="padding:10px 12px;">Спешност</th>
                    <th style="padding:10px 12px;">Статус</th>
                    <th style="padding:10px 12px; text-align:right;">Действия</th>
                </tr>
            </thead>
            <tbody>
    `;

    filtered.forEach(req => {
        const d = req.created_at ? new Date(req.created_at).toLocaleString('bg-BG') : '-';
        let statusBadge = '';
        if (req.status === 'Чакаща') {
            statusBadge = `<span style="background:#fffbeb; color:#b45309; border:1px solid #fde68a; padding:3px 8px; border-radius:6px; font-weight:800;">⏳ Чакаща</span>`;
        } else if (req.status === 'Поръчана') {
            statusBadge = `<span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:3px 8px; border-radius:6px; font-weight:800;">🛒 Поръчана</span>`;
        } else if (req.status === 'Осигурена') {
            statusBadge = `<span style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; padding:3px 8px; border-radius:6px; font-weight:800;">🟢 Осигурена</span>`;
        } else {
            statusBadge = `<span style="background:#f1f5f9; color:#64748b; padding:3px 8px; border-radius:6px;">${escapeHtml(req.status)}</span>`;
        }

        let urgencyBadge = `<span style="color:#64748b; font-weight:700;">${escapeHtml(req.urgency || 'Нормална')}</span>`;
        if (req.urgency === 'Машината спира!') {
            urgencyBadge = `<span style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:2px 6px; border-radius:4px; font-weight:900;">🚨 Спира работа!</span>`;
        } else if (req.urgency === 'Спешна') {
            urgencyBadge = `<span style="background:#fff7ed; color:#ea580c; border:1px solid #fed7aa; padding:2px 6px; border-radius:4px; font-weight:800;">⚠️ Спешна</span>`;
        }

        html += `
            <tr style="border-bottom:1px solid #e2e8f0; transition:background 0.15s;" onmouseover="this.style.background='#fafaf9'" onmouseout="this.style.background='white'">
                <td style="padding:10px 12px; color:#64748b; font-size:0.85em;">${d}</td>
                <td style="padding:10px 12px; font-weight:800; color:#1e293b;">🏭 ${escapeHtml(req.workstation_name)}</td>
                <td style="padding:10px 12px; font-weight:600; color:#475569;">${escapeHtml(req.operator_name || '-')}</td>
                <td style="padding:10px 12px;">
                    <div style="font-weight:800; color:#92400e;">${escapeHtml(req.tool_item)}</div>
                    ${req.notes ? `<div style="font-size:0.8em; color:#64748b; margin-top:2px;">${escapeHtml(req.notes)}</div>` : ''}
                </td>
                <td style="padding:10px 12px;">${urgencyBadge}</td>
                <td style="padding:10px 12px;">${statusBadge}</td>
                <td style="padding:10px 12px; text-align:right;">
                    <div style="display:flex; justify-content:flex-end; gap:6px;">
                        ${req.status === 'Чакаща' ? `
                            <button onclick="updateToolingReqStatus(${req.id}, 'Поръчана')" style="padding:5px 9px; font-size:0.8em; background:#2563eb; color:white; border:none; border-radius:6px; font-weight:700; cursor:pointer;" title="Маркирай като поръчана">🛒 Поръчай</button>
                            <button onclick="updateToolingReqStatus(${req.id}, 'Осигурена')" style="padding:5px 9px; font-size:0.8em; background:#16a34a; color:white; border:none; border-radius:6px; font-weight:700; cursor:pointer;" title="Осигурена в цеха">✅ Осигурена</button>
                        ` : ''}
                        ${req.status === 'Поръчана' ? `
                            <button onclick="updateToolingReqStatus(${req.id}, 'Осигурена')" style="padding:5px 9px; font-size:0.8em; background:#16a34a; color:white; border:none; border-radius:6px; font-weight:700; cursor:pointer;" title="Пристигнала и предадена">✅ Предадена</button>
                        ` : ''}
                        <button onclick="deleteToolingRequest(${req.id})" style="padding:5px 8px; font-size:0.8em; background:#f1f5f9; color:#94a3b8; border:1px solid #cbd5e1; border-radius:6px; cursor:pointer;" title="Изтрий запис">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    wrap.innerHTML = html;
}

window.updateToolingReqStatus = async function(reqId, newStatus) {
    try {
        const { error } = await client
            .from('tooling_requests')
            .update({
                status: newStatus,
                resolved_at: new Date().toISOString(),
                resolved_by: localStorage.getItem('last_admin_email') || 'Администратор'
            })
            .eq('id', reqId);

        if (error) throw error;
        await fetchToolingRequests();
        renderToolingRequestsTable();
    } catch (err) {
        Swal.fire('Грешка', 'Неуспешно обновяване на статуса: ' + err.message, 'error');
    }
};

window.deleteToolingRequest = async function(reqId) {
    const res = await Swal.fire({
        title: 'Изтриване на заявка?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Да, изтрий',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#ef4444'
    });
    if (res.isConfirmed) {
        try {
            const { error } = await client.from('tooling_requests').delete().eq('id', reqId);
            if (error) throw error;
            await fetchToolingRequests();
            renderToolingRequestsTable();
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
};

// Функция за автоматично синхронизиране на машини от Маршрутните карти в factory_machines
window.syncMachinesFromRoutes = async function() {
    try {
        Swal.fire({ title: 'Проверка на машините...', didOpen: () => Swal.showLoading() });
        const { data: routes, error: rErr } = await client.from('marshruti').select('Машина');
        if (rErr) throw rErr;

        let routeMachines = new Set();
        (routes || []).forEach(r => {
            let m = String(r['Машина'] || '').trim();
            if (m) routeMachines.add(m);
        });

        const { data: existing, error: eErr } = await client.from('factory_machines').select('name');
        if (eErr && !eErr.message.includes('relation')) throw eErr;

        let existingNames = new Set((existing || []).map(e => e.name));
        let toInsert = [];

        routeMachines.forEach(name => {
            if (!existingNames.has(name)) {
                toInsert.push({
                    name: name,
                    code: null, // Потребителят ще го въведе
                    floor: 'Етаж 1',
                    department: 'Механичен цех',
                    status: 'active'
                });
            }
        });

        if (toInsert.length > 0) {
            const { error: insErr } = await client.from('factory_machines').insert(toInsert);
            if (insErr) throw insErr;
            Swal.fire({
                icon: 'success',
                title: 'Синхронизацията е успешна!',
                text: `Добавени са ${toInsert.length} машини от маршрутните карти. Сега можете да въведете техните номера.`
            });
            if (window.switchTab) switchTab(currentTab, true);
        } else {
            Swal.fire({
                icon: 'info',
                title: 'Всички машини са налични',
                text: 'Всички машини от маршрутните карти вече присъстват в регистъра.'
            });
        }
    } catch (err) {
        Swal.fire('Грешка', 'Неуспешна синхронизация: ' + err.message, 'error');
    }
};

