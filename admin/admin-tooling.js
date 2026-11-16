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

// ==============================================================================
// МЕТРОЛОГИЧЕН КОНТРОЛ: ЗАМЕРВАНИЯ, ОТКЛОНЕНИЯ И КАЛИБРАЦИОНЕН ДНЕВНИК
// ==============================================================================

// Функция за отваряне на формуляр за ново замерване на измервателен уред
window.openToolCalibrationModal = function(toolId, toolCode, toolName) {
    const todayStr = new Date().toISOString().split('T')[0];
    const defaultChecker = localStorage.getItem('last_admin_email') || 'БТК / Метролог';

    // Изчисляване на 6 месеца напред по подразбиране
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    const defaultValidStr = d.toISOString().split('T')[0];

    Swal.fire({
        title: `📏 Замерване на уред: ${escapeHtml(toolCode)}`,
        width: 720,
        html: `
            <div style="text-align: left; font-size: 0.9em; display: flex; flex-direction: column; gap: 12px;">
                <div style="background: #eff6ff; border: 1.5px solid #bfdbfe; border-radius: 8px; padding: 10px 14px; font-weight: 700; color: #1e40af;">
                    Инструмент: <span style="color: #1e3a8a; font-size: 1.05em;">${escapeHtml(toolName || toolCode)}</span> (Инв. № ${escapeHtml(toolCode)})
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                        <label style="font-weight: 700; color: #475569;">📅 Дата на замерване:</label>
                        <input type="date" id="calibDate" class="swal2-input" value="${todayStr}" style="margin: 4px 0 0; width: 100%; box-sizing: border-box; height: 38px;">
                    </div>
                    <div>
                        <label style="font-weight: 700; color: #475569;">👷 Проверяващ (БТК/Метролог):</label>
                        <input type="text" id="calibChecker" class="swal2-input" value="${escapeHtml(defaultChecker)}" placeholder="Име на проверяващия" style="margin: 4px 0 0; width: 100%; box-sizing: border-box; height: 38px;">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                        <label style="font-weight: 700; color: #475569;">🔬 Вид проверка:</label>
                        <select id="calibType" class="swal2-input" style="margin: 4px 0 0; width: 100%; box-sizing: border-box; height: 38px;">
                            <option value="Вътрешна проверка с еталонни мерки" selected>Вътрешна проверка с еталони</option>
                            <option value="Външна калибрация (Лаборатория)">Външна калибрация (Лаборатория)</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-weight: 700; color: #475569;">⏳ Валидност на проверката:</label>
                        <select id="calibPeriodSelect" class="swal2-input" onchange="updateCalibDueDate(this.value)" style="margin: 4px 0 0; width: 100%; box-sizing: border-box; height: 38px;">
                            <option value="3">3 месеца</option>
                            <option value="6" selected>6 месеца</option>
                            <option value="12">1 година (12 месеца)</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label style="font-weight: 700; color: #475569;">📅 Валиден до (крайна дата):</label>
                    <input type="date" id="calibValidUntil" class="swal2-input" value="${defaultValidStr}" style="margin: 4px 0 0; width: 100%; box-sizing: border-box; height: 38px;">
                </div>

                <!-- Контролни точки / Замервания -->
                <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: #fafaf9;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: 800; color: #334155;">📐 Контролни точки за замерване (с еталони):</span>
                        <button type="button" onclick="addCalibPointRow()" style="padding: 4px 10px; background: #2563eb; color: white; border: none; border-radius: 6px; font-weight: 700; font-size: 0.85em; cursor: pointer;">➕ Добави точка</button>
                    </div>

                    <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;" id="calibPointsTable">
                        <thead>
                            <tr style="background: #f1f5f9; text-align: left; border-bottom: 2px solid #cbd5e1;">
                                <th style="padding: 6px;">Еталон (Номинал, mm)</th>
                                <th style="padding: 6px;">Отчетено от уреда (mm)</th>
                                <th style="padding: 6px;">Отклонение</th>
                                <th style="padding: 6px; width: 30px;"></th>
                            </tr>
                        </thead>
                        <tbody id="calibPointsTbody">
                            <tr class="calib-pt-row">
                                <td style="padding: 4px;"><input type="number" step="0.001" class="pt-nominal" value="10.00" oninput="calcCalibRow(this)" style="width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;"></td>
                                <td style="padding: 4px;"><input type="number" step="0.001" class="pt-measured" placeholder="напр. 10.01" oninput="calcCalibRow(this)" style="width: 100%; padding: 6px; border: 1.5px solid #2563eb; border-radius: 4px; box-sizing: border-box; font-weight: 800;"></td>
                                <td style="padding: 4px; font-weight: 800;" class="pt-diff">-</td>
                                <td style="padding: 4px;"><button type="button" onclick="this.closest('tr').remove(); calcCalibOverall();" style="border:none; background:transparent; color:#ef4444; font-weight:bold; cursor:pointer;">✖</button></td>
                            </tr>
                            <tr class="calib-pt-row">
                                <td style="padding: 4px;"><input type="number" step="0.001" class="pt-nominal" value="25.00" oninput="calcCalibRow(this)" style="width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;"></td>
                                <td style="padding: 4px;"><input type="number" step="0.001" class="pt-measured" placeholder="напр. 25.00" oninput="calcCalibRow(this)" style="width: 100%; padding: 6px; border: 1.5px solid #2563eb; border-radius: 4px; box-sizing: border-box; font-weight: 800;"></td>
                                <td style="padding: 4px; font-weight: 800;" class="pt-diff">-</td>
                                <td style="padding: 4px;"><button type="button" onclick="this.closest('tr').remove(); calcCalibOverall();" style="border:none; background:transparent; color:#ef4444; font-weight:bold; cursor:pointer;">✖</button></td>
                            </tr>
                            <tr class="calib-pt-row">
                                <td style="padding: 4px;"><input type="number" step="0.001" class="pt-nominal" value="50.00" oninput="calcCalibRow(this)" style="width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;"></td>
                                <td style="padding: 4px;"><input type="number" step="0.001" class="pt-measured" placeholder="напр. 50.01" oninput="calcCalibRow(this)" style="width: 100%; padding: 6px; border: 1.5px solid #2563eb; border-radius: 4px; box-sizing: border-box; font-weight: 800;"></td>
                                <td style="padding: 4px; font-weight: 800;" class="pt-diff">-</td>
                                <td style="padding: 4px;"><button type="button" onclick="this.closest('tr').remove(); calcCalibOverall();" style="border:none; background:transparent; color:#ef4444; font-weight:bold; cursor:pointer;">✖</button></td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: center;">
                    <div>
                        <label style="font-weight: 700; color: #475569;">📊 Макс. отчетено отклонение:</label>
                        <div id="calibMaxDevDisplay" style="font-size: 1.1em; font-weight: 900; color: #1e293b; padding: 6px 0;">0.000 mm</div>
                    </div>
                    <div>
                        <label style="font-weight: 700; color: #475569;">🏆 Заключение за годност:</label>
                        <select id="calibResult" class="swal2-input" style="margin: 4px 0 0; width: 100%; box-sizing: border-box; height: 38px; font-weight: 800;">
                            <option value="Годен (В допуск)" selected>🟢 Годен (В допуск)</option>
                            <option value="Условно годен">🟡 Условно годен</option>
                            <option value="Брак / Извън допуск">🔴 Брак / За ремонт</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label style="font-weight: 700; color: #475569;">📝 Забележки / Номер на протокол / Сертификат:</label>
                    <input type="text" id="calibNotes" class="swal2-input" placeholder="напр. Измерено при t=20°C, еталони КМД клас 1" style="margin: 4px 0 0; width: 100%; box-sizing: border-box;">
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: '💾 Запази Замерването',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#16a34a',
        preConfirm: () => {
            const checkDate = document.getElementById('calibDate').value;
            const checker = document.getElementById('calibChecker').value.trim();
            const validUntil = document.getElementById('calibValidUntil').value;
            const result = document.getElementById('calibResult').value;
            const notes = document.getElementById('calibNotes').value.trim();
            const checkType = document.getElementById('calibType').value;

            if (!checkDate || !validUntil) {
                Swal.showValidationMessage('Моля, попълнете дата на замерване и срок на валидност!');
                return false;
            }

            // Събиране на точките за замерване
            const points = [];
            let maxDev = 0;
            document.querySelectorAll('.calib-pt-row').forEach(row => {
                const nom = parseFloat(row.querySelector('.pt-nominal')?.value);
                const measVal = row.querySelector('.pt-measured')?.value;
                if (measVal !== '' && !isNaN(parseFloat(measVal))) {
                    const meas = parseFloat(measVal);
                    const diff = Math.round((meas - nom) * 1000) / 1000;
                    points.push({ nominal: nom, measured: meas, diff: diff });
                    if (Math.abs(diff) > maxDev) maxDev = Math.abs(diff);
                }
            });

            return {
                tool_id: toolId || null,
                tool_code: toolCode,
                tool_name: toolName || toolCode,
                check_date: checkDate,
                checked_by: checker || 'БТК',
                check_type: checkType,
                points: points,
                max_deviation: maxDev,
                result: result,
                valid_until: validUntil,
                notes: notes || null
            };
        }
    }).then(async (res) => {
        if (res.isConfirmed && res.value) {
            Swal.fire({ title: 'Запис на данните...', didOpen: () => Swal.showLoading() });
            try {
                // 1. Запис в дневника за калибрации
                const { error: calErr } = await client.from('factory_tool_calibrations').insert([res.value]);
                if (calErr) throw calErr;

                // 2. Обновяване на инструмента в главната таблица factory_tools
                const toolStatus = (res.value.result === 'Брак / Извън допуск') ? 'repair' : 'active';
                const updatePayload = {
                    calibration_date: res.value.check_date,
                    calibration_due: res.value.valid_until,
                    status: toolStatus
                };

                let q = client.from('factory_tools').update(updatePayload);
                if (toolId) q = q.eq('id', toolId);
                else q = q.eq('tool_code', toolCode);
                await q;

                if (window.invalidateAdminCache) window.invalidateAdminCache();
                if (window.switchTab) switchTab(currentTab, true);

                Swal.fire({
                    icon: 'success',
                    title: 'Замерването е записано успешно!',
                    html: `
                        Уред: <b>${escapeHtml(toolCode)}</b><br>
                        Статус: <b>${escapeHtml(res.value.result)}</b><br>
                        Максимално отклонение: <b>${res.value.max_deviation.toFixed(3)} mm</b><br>
                        Валиден до: <b>${res.value.valid_until}</b>
                    `,
                    timer: 2500,
                    showConfirmButton: false
                });
            } catch (err) {
                Swal.fire('Грешка', 'Неуспешен запис: ' + err.message, 'error');
            }
        }
    });
};

// Помощни функции за динамичните редове в модала за замерване
window.updateCalibDueDate = function(months) {
    const checkDateInp = document.getElementById('calibDate');
    const baseDate = checkDateInp && checkDateInp.value ? new Date(checkDateInp.value) : new Date();
    baseDate.setMonth(baseDate.getMonth() + parseInt(months));
    const targetInp = document.getElementById('calibValidUntil');
    if (targetInp) targetInp.value = baseDate.toISOString().split('T')[0];
};

window.addCalibPointRow = function() {
    const tbody = document.getElementById('calibPointsTbody');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.className = 'calib-pt-row';
    tr.innerHTML = `
        <td style="padding: 4px;"><input type="number" step="0.001" class="pt-nominal" value="100.00" oninput="calcCalibRow(this)" style="width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;"></td>
        <td style="padding: 4px;"><input type="number" step="0.001" class="pt-measured" placeholder="напр. 100.02" oninput="calcCalibRow(this)" style="width: 100%; padding: 6px; border: 1.5px solid #2563eb; border-radius: 4px; box-sizing: border-box; font-weight: 800;"></td>
        <td style="padding: 4px; font-weight: 800;" class="pt-diff">-</td>
        <td style="padding: 4px;"><button type="button" onclick="this.closest('tr').remove(); calcCalibOverall();" style="border:none; background:transparent; color:#ef4444; font-weight:bold; cursor:pointer;">✖</button></td>
    `;
    tbody.appendChild(tr);
};

window.calcCalibRow = function(inputEl) {
    const row = inputEl.closest('tr');
    if (!row) return;
    const nom = parseFloat(row.querySelector('.pt-nominal')?.value);
    const measVal = row.querySelector('.pt-measured')?.value;
    const diffCell = row.querySelector('.pt-diff');

    if (measVal !== '' && !isNaN(parseFloat(measVal)) && !isNaN(nom)) {
        const meas = parseFloat(measVal);
        const diff = Math.round((meas - nom) * 1000) / 1000;
        const sign = diff > 0 ? '+' : '';
        const color = Math.abs(diff) <= 0.02 ? '#16a34a' : (Math.abs(diff) <= 0.05 ? '#d97706' : '#dc2626');
        diffCell.innerHTML = `<span style="color: ${color};">${sign}${diff.toFixed(3)} mm</span>`;
    } else {
        diffCell.innerText = '-';
    }
    calcCalibOverall();
};

window.calcCalibOverall = function() {
    let maxDev = 0;
    let hasPoints = false;
    document.querySelectorAll('.calib-pt-row').forEach(row => {
        const nom = parseFloat(row.querySelector('.pt-nominal')?.value);
        const measVal = row.querySelector('.pt-measured')?.value;
        if (measVal !== '' && !isNaN(parseFloat(measVal)) && !isNaN(nom)) {
            hasPoints = true;
            const diff = Math.abs(parseFloat(measVal) - nom);
            if (diff > maxDev) maxDev = diff;
        }
    });

    const display = document.getElementById('calibMaxDevDisplay');
    if (display) {
        display.innerHTML = hasPoints ? `${maxDev.toFixed(3)} mm` : '0.000 mm';
        display.style.color = maxDev <= 0.02 ? '#16a34a' : (maxDev <= 0.05 ? '#d97706' : '#dc2626');
    }

    const resSelect = document.getElementById('calibResult');
    if (resSelect && hasPoints) {
        if (maxDev <= 0.02) resSelect.value = 'Годен (В допуск)';
        else if (maxDev <= 0.04) resSelect.value = 'Условно годен';
        else resSelect.value = 'Брак / Извън допуск';
    }
};

// Функция за преглед на пълната хронология / паспорт на замерванията на даден инструмент
window.openToolCalibrationHistoryModal = async function(toolCode, toolName) {
    Swal.fire({ title: 'Зареждане на досието на уреда...', didOpen: () => Swal.showLoading() });
    try {
        const { data, error } = await client
            .from('factory_tool_calibrations')
            .select('*')
            .eq('tool_code', toolCode)
            .order('check_date', { ascending: false });

        if (error && !error.message.includes('relation')) throw error;
        const history = data || [];

        if (history.length === 0) {
            Swal.fire({
                title: `📋 Метрологично Досие: ${escapeHtml(toolCode)}`,
                html: `
                    <div style="padding: 15px; color: #64748b;">
                        За този инструмент все още няма записани исторически проверки и замервания.<br>
                        <small style="color: #94a3b8; display:block; margin-top: 8px;">Натиснете бутона <b>📏</b>, за да въведете първото замерване с еталони.</small>
                    </div>
                `,
                icon: 'info'
            });
            return;
        }

        let cardsHtml = '';
        history.forEach(item => {
            const checkD = item.check_date ? new Date(item.check_date).toLocaleDateString('bg-BG') : '-';
            const validD = item.valid_until ? new Date(item.valid_until).toLocaleDateString('bg-BG') : '-';
            
            let statusBadge = '<span style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; padding:3px 8px; border-radius:6px; font-weight:800;">🟢 Годен</span>';
            if (item.result === 'Условно годен') {
                statusBadge = '<span style="background:#fffbeb; color:#b45309; border:1px solid #fde68a; padding:3px 8px; border-radius:6px; font-weight:800;">🟡 Условно годен</span>';
            } else if (item.result.includes('Брак') || item.result.includes('Извън')) {
                statusBadge = '<span style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:3px 8px; border-radius:6px; font-weight:800;">🔴 Брак / Извън допуск</span>';
            }

            let pointsList = '';
            if (Array.isArray(item.points) && item.points.length > 0) {
                pointsList = item.points.map(p => {
                    const sign = p.diff > 0 ? '+' : '';
                    return `• ${p.nominal}mm ➔ ${p.measured}mm (${sign}${p.diff}mm)`;
                }).join(' &nbsp;|&nbsp; ');
            }

            cardsHtml += `
                <div style="background: white; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; margin-bottom: 10px; text-align: left; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 6px;">
                        <div>
                            <span style="font-weight: 800; color: #1e293b; font-size: 1.05em;">📅 Проверка на ${checkD} г.</span>
                            <span style="font-size: 0.85em; color: #64748b; margin-left: 8px;">от <b>${escapeHtml(item.checked_by || 'БТК')}</b></span>
                        </div>
                        <div>${statusBadge}</div>
                    </div>
                    <div style="font-size: 0.85em; color: #475569; margin-bottom: 6px;">
                        Вид: <b>${escapeHtml(item.check_type || 'Вътрешна проверка')}</b> &nbsp;|&nbsp; 
                        Макс. отклонение: <b style="color: #2563eb;">${parseFloat(item.max_deviation || 0).toFixed(3)} mm</b> &nbsp;|&nbsp; 
                        Валиден до: <b style="color: #15803d;">${validD} г.</b>
                    </div>
                    ${pointsList ? `<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; font-size: 0.82em; color: #334155; margin-bottom: 6px;"><b>Точки:</b> ${pointsList}</div>` : ''}
                    ${item.notes ? `<div style="font-size: 0.8em; color: #64748b; font-style: italic;">Бележка: ${escapeHtml(item.notes)}</div>` : ''}
                </div>
            `;
        });

        Swal.fire({
            title: `📋 Досие на замерванията: ${escapeHtml(toolCode)}`,
            width: 750,
            html: `
                <div style="background: #f8fafc; padding: 10px; border-radius: 8px; margin-bottom: 12px; font-size: 0.9em; text-align: left;">
                    Уред: <b>${escapeHtml(toolName || toolCode)}</b> &nbsp;|&nbsp; Общо извършени проверки: <b>${history.length}</b>
                </div>
                <div style="max-height: 420px; overflow-y: auto;">
                    ${cardsHtml}
                </div>
            `,
            confirmButtonText: 'Затвори',
            confirmButtonColor: '#2563eb'
        });
    } catch (err) {
        Swal.fire('Грешка', err.message, 'error');
    }
};

// ==============================================================================
// ПРИЕМО-ПРЕДАВАТЕЛНИ ПРОТОКОЛИ ЗА ЛПС, РАБОТНО ОБЛЕКЛО И ИНСТРУМЕНТИ
// (С потвърждение чрез личен ПИН код на служителя)
// ==============================================================================

window.openCreateEquipmentProtocolModal = async function(preselectedEmail = null) {
    Swal.fire({ title: 'Зареждане на служителите...', didOpen: () => Swal.showLoading() });
    
    let workers = [];
    try {
        const { data, error } = await client.from('personal').select('Име, Имейл').eq('Статус', 'Активен').order('Име');
        if (error) throw error;
        workers = data || [];
    } catch(e) {
        console.warn('Error loading workers:', e);
    }

    if (workers.length === 0) {
        Swal.fire('Внимание', 'Няма намерени активни служители в таблицата с персонал.', 'warning');
        return;
    }

    const cleanPreselected = preselectedEmail ? preselectedEmail.toLowerCase().trim() : null;
    const workerOptions = workers.map(w => {
        const isSel = (cleanPreselected && w['Имейл'] && w['Имейл'].toLowerCase().trim() === cleanPreselected) ? 'selected' : '';
        return `<option value="${escapeHtml(w['Имейл'])}" data-name="${escapeHtml(w['Име'])}" ${isSel}>${escapeHtml(w['Име'])} (${escapeHtml(w['Имейл'])})</option>`;
    }).join('');
    const today = new Date().toISOString().split('T')[0];
    const defaultHandedBy = localStorage.getItem('last_admin_email') || 'Администрация';
    const protoNum = `ППП-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

    Swal.fire({
        title: '🦺 Нов Приемо-Предавателен Протокол',
        width: 760,
        html: `
            <div style="text-align: left; font-size: 0.9em; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                        <label style="font-weight: 700; color: #475569;">📋 Протокол №:</label>
                        <input type="text" id="swalProtoNum" class="swal2-input" value="${protoNum}" style="margin: 4px 0 0; width: 100%; box-sizing: border-box; font-weight: 800; height: 38px;">
                    </div>
                    <div>
                        <label style="font-weight: 700; color: #475569;">📅 Дата на предаване:</label>
                        <input type="date" id="swalProtoDate" class="swal2-input" value="${today}" style="margin: 4px 0 0; width: 100%; box-sizing: border-box; height: 38px;">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 10px;">
                    <div>
                        <label style="font-weight: 700; color: #475569;">👤 Получател (Служител): *</label>
                        <select id="swalProtoWorker" class="swal2-input" style="margin: 4px 0 0; width: 100%; box-sizing: border-box; height: 38px; font-weight: 700;">
                            ${workerOptions}
                        </select>
                    </div>
                    <div>
                        <label style="font-weight: 700; color: #475569;">📤 Предадено от:</label>
                        <input type="text" id="swalProtoHandedBy" class="swal2-input" value="${escapeHtml(defaultHandedBy)}" style="margin: 4px 0 0; width: 100%; box-sizing: border-box; height: 38px;">
                    </div>
                </div>

                <!-- Списък с вещи за зачисляване -->
                <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; background: #fafaf9;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: 800; color: #1e293b;">📦 Вещи, ЛПС и уреди за зачисляване:</span>
                        <button type="button" onclick="addProtoItemRow()" style="padding: 4px 10px; background: #ea580c; color: white; border: none; border-radius: 6px; font-weight: 700; font-size: 0.85em; cursor: pointer;">➕ Добави вещ</button>
                    </div>

                    <table style="width: 100%; border-collapse: collapse; font-size: 0.88em;" id="protoItemsTable">
                        <thead>
                            <tr style="background: #f1f5f9; text-align: left; border-bottom: 2px solid #cbd5e1; color: #475569;">
                                <th style="padding: 6px;">Наименование на вещ / уред</th>
                                <th style="padding: 6px; width: 130px;">Категория</th>
                                <th style="padding: 6px; width: 65px;">Кол.</th>
                                <th style="padding: 6px; width: 100px;">Инв. №/Код</th>
                                <th style="padding: 6px; width: 30px;"></th>
                            </tr>
                        </thead>
                        <tbody id="protoItemsTbody">
                            <tr class="proto-item-row">
                                <td style="padding: 4px;"><input type="text" class="item-name" placeholder="напр. Работна манта (р-р L)" value="Работна манта" style="width: 100%; padding: 6px; border: 1.5px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-weight: 700;"></td>
                                <td style="padding: 4px;">
                                    <select class="item-cat" style="width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;">
                                        <option value="Работно облекло" selected>Работно облекло</option>
                                        <option value="ЛПС">ЛПС</option>
                                        <option value="Инструмент">Инструмент</option>
                                        <option value="Оборудване">Оборудване</option>
                                    </select>
                                </td>
                                <td style="padding: 4px;"><input type="number" min="1" class="item-qty" value="1" style="width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-weight: 800;"></td>
                                <td style="padding: 4px;"><input type="text" class="item-code" placeholder="по избор" style="width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;"></td>
                                <td style="padding: 4px;"><button type="button" onclick="this.closest('tr').remove()" style="border:none; background:transparent; color:#ef4444; font-weight:bold; cursor:pointer;">✖</button></td>
                            </tr>
                            <tr class="proto-item-row">
                                <td style="padding: 4px;"><input type="text" class="item-name" placeholder="напр. Предпазни очила" value="Предпазни очила UV" style="width: 100%; padding: 6px; border: 1.5px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-weight: 700;"></td>
                                <td style="padding: 4px;">
                                    <select class="item-cat" style="width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;">
                                        <option value="Работно облекло">Работно облекло</option>
                                        <option value="ЛПС" selected>ЛПС</option>
                                        <option value="Инструмент">Инструмент</option>
                                        <option value="Оборудване">Оборудване</option>
                                    </select>
                                </td>
                                <td style="padding: 4px;"><input type="number" min="1" class="item-qty" value="1" style="width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-weight: 800;"></td>
                                <td style="padding: 4px;"><input type="text" class="item-code" placeholder="по избор" style="width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;"></td>
                                <td style="padding: 4px;"><button type="button" onclick="this.closest('tr').remove()" style="border:none; background:transparent; color:#ef4444; font-weight:bold; cursor:pointer;">✖</button></td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div>
                    <label style="font-weight: 700; color: #475569;">📝 Допълнителни бележки / указания:</label>
                    <input type="text" id="swalProtoNotes" class="swal2-input" placeholder="напр. ново оборудване за пост Струг" style="margin: 4px 0 0; width: 100%; box-sizing: border-box; height: 38px;">
                </div>

                <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 10px 12px; font-size: 0.85em; color: #9a3412;">
                    ℹ️ <b>Как се подписва:</b> При издаване, протоколът веднага ще излезе на Терминала на избрания служител. Той ще въведе своя <b>персонален ПИН код</b> (същия като за заплатите/досието), за да потвърди получаването.
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: '🚀 Издай за подпис към Терминала',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#ea580c',
        preConfirm: () => {
            const protoNum = document.getElementById('swalProtoNum').value.trim();
            const protoDate = document.getElementById('swalProtoDate').value;
            const workerSel = document.getElementById('swalProtoWorker');
            const workerEmail = workerSel.value;
            const workerName = workerSel.options[workerSel.selectedIndex]?.dataset?.name || workerEmail;
            const handedBy = document.getElementById('swalProtoHandedBy').value.trim();
            const notes = document.getElementById('swalProtoNotes').value.trim();

            if (!protoNum || !workerEmail) {
                Swal.showValidationMessage('Моля, попълнете номер на протокол и изберете служител!');
                return false;
            }

            const items = [];
            document.querySelectorAll('.proto-item-row').forEach(row => {
                const name = row.querySelector('.item-name')?.value.trim();
                const cat = row.querySelector('.item-cat')?.value;
                const qty = parseFloat(row.querySelector('.item-qty')?.value) || 1;
                const code = row.querySelector('.item-code')?.value.trim();
                if (name) {
                    items.push({ name, category: cat, qty, code: code || null });
                }
            });

            if (items.length === 0) {
                Swal.showValidationMessage('Моля, въведете поне една вещ или инструмент за зачисляване!');
                return false;
            }

            return {
                protocol_number: protoNum,
                worker_email: workerEmail,
                worker_name: workerName,
                handed_by: handedBy,
                items: items,
                status: 'Чака подпис',
                notes: notes ? `${notes} (Издаден на ${protoDate})` : `Издаден на ${protoDate}`,
                created_at: new Date().toISOString()
            };
        }
    }).then(async (res) => {
        if (res.isConfirmed && res.value) {
            Swal.fire({ title: 'Издаване на протокола...', didOpen: () => Swal.showLoading() });
            try {
                const { error } = await client.from('equipment_protocols').insert([res.value]);
                if (error) throw error;
                if (window.invalidateAdminCache) window.invalidateAdminCache();
                if (window.switchTab) switchTab(currentTab, true);

                Swal.fire({
                    icon: 'success',
                    title: 'Протоколът е издаден успешно!',
                    html: `
                        Протокол № <b>${escapeHtml(res.value.protocol_number)}</b><br>
                        Служител: <b>${escapeHtml(res.value.worker_name)}</b><br>
                        Статус: <b style="color:#ea580c;">⏳ Чака подпис с ПИН код в терминала</b>
                    `,
                    timer: 3000,
                    showConfirmButton: false
                });
            } catch(err) {
                Swal.fire('Грешка', 'Неуспешно издаване: ' + err.message, 'error');
            }
        }
    });
};

window.addProtoItemRow = function() {
    const tbody = document.getElementById('protoItemsTbody');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.className = 'proto-item-row';
    tr.innerHTML = `
        <td style="padding: 4px;"><input type="text" class="item-name" placeholder="напр. Шублер Ш-02, Винтоверт..." style="width: 100%; padding: 6px; border: 1.5px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-weight: 700;"></td>
        <td style="padding: 4px;">
            <select class="item-cat" style="width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;">
                <option value="Инструмент">Инструмент</option>
                <option value="ЛПС">ЛПС</option>
                <option value="Работно облекло">Работно облекло</option>
                <option value="Оборудване">Оборудване</option>
            </select>
        </td>
        <td style="padding: 4px;"><input type="number" min="1" class="item-qty" value="1" style="width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-weight: 800;"></td>
        <td style="padding: 4px;"><input type="text" class="item-code" placeholder="по избор" style="width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;"></td>
        <td style="padding: 4px;"><button type="button" onclick="this.closest('tr').remove()" style="border:none; background:transparent; color:#ef4444; font-weight:bold; cursor:pointer;">✖</button></td>
    `;
    tbody.appendChild(tr);
};

window.openEquipmentProtocolViewModal = async function(protocolId) {
    Swal.fire({ title: 'Зареждане на протокола...', didOpen: () => Swal.showLoading() });
    try {
        const { data, error } = await client.from('equipment_protocols').select('*').eq('id', protocolId).single();
        if (error) throw error;
        if (!data) return;

        let statusBadge = '<span style="background:#fff7ed; color:#c2410c; border:1px solid #fed7aa; padding:3px 8px; border-radius:6px; font-weight:800;">⏳ Чака подпис с ПИН</span>';
        if (data.status === 'Приет') {
            statusBadge = '<span style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; padding:3px 8px; border-radius:6px; font-weight:800;">🟢 Приет (Подписан с ПИН)</span>';
        } else if (data.status === 'Върнат') {
            statusBadge = '<span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:3px 8px; border-radius:6px; font-weight:800;">🔄 Върнат в склад</span>';
        } else if (data.status === 'Бракуван') {
            statusBadge = '<span style="background:#f1f5f9; color:#64748b; border:1px solid #cbd5e1; padding:3px 8px; border-radius:6px; font-weight:800;">🗑️ Бракуван</span>';
        }

        let itemsHtml = '';
        if (Array.isArray(data.items)) {
            itemsHtml = data.items.map((it, idx) => `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px;">${idx + 1}</td>
                    <td style="padding: 8px; font-weight: 700; color: #1e293b;">${escapeHtml(it.name)}</td>
                    <td style="padding: 8px;"><span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.85em;">${escapeHtml(it.category || 'ЛПС')}</span></td>
                    <td style="padding: 8px; font-weight: 800; color: #0284c7;">${it.qty || 1} бр.</td>
                    <td style="padding: 8px; color: #64748b;">${escapeHtml(it.code || '-')}</td>
                </tr>
            `).join('');
        }

        const signedDateStr = data.signed_at ? new Date(data.signed_at).toLocaleString('bg-BG') : 'Още не е подписан';

        Swal.fire({
            title: `📋 Протокол ${escapeHtml(data.protocol_number)}`,
            width: 700,
            html: `
                <div style="text-align: left; font-size: 0.9em; display: flex; flex-direction: column; gap: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 10px 14px; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <div>
                            <div>Служител: <b>${escapeHtml(data.worker_name)}</b> (${escapeHtml(data.worker_email)})</div>
                            <div style="font-size: 0.85em; color: #64748b; margin-top: 2px;">Предал: <b>${escapeHtml(data.handed_by)}</b></div>
                        </div>
                        <div>${statusBadge}</div>
                    </div>

                    <div style="font-size: 0.85em; color: #475569;">
                        <b>Подпис / Валидация:</b> ${signedDateStr} ${data.signed_by_pin ? '🔒 <i>(Удостоверено с ПИН код)</i>' : ''}
                    </div>

                    <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.88em;">
                            <thead>
                                <tr style="background: #f1f5f9; text-align: left; border-bottom: 2px solid #cbd5e1; color: #475569;">
                                    <th style="padding: 8px;">#</th>
                                    <th style="padding: 8px;">Вещ / Оборудване</th>
                                    <th style="padding: 8px;">Категория</th>
                                    <th style="padding: 8px;">Количество</th>
                                    <th style="padding: 8px;">Код / Сериен №</th>
                                </tr>
                            </thead>
                            <tbody>${itemsHtml}</tbody>
                        </table>
                    </div>

                    ${data.notes ? `<div style="font-size: 0.85em; color: #64748b; font-style: italic;">Бележка: ${escapeHtml(data.notes)}</div>` : ''}
                </div>
            `,
            showCancelButton: data.status === 'Приет',
            cancelButtonText: 'Затвори',
            confirmButtonText: (data.status === 'Приет') ? '🔄 Отбележи като върнати в склада' : 'Затвори',
            confirmButtonColor: (data.status === 'Приет') ? '#2563eb' : '#64748b'
        }).then(async (res) => {
            if (res.isConfirmed && data.status === 'Приет') {
                await client.from('equipment_protocols').update({
                    status: 'Върнат',
                    return_date: new Date().toISOString()
                }).eq('id', protocolId);
                if (window.invalidateAdminCache) window.invalidateAdminCache();
                if (window.switchTab) switchTab(currentTab, true);
                Swal.fire({ icon: 'success', title: 'Оборудването е отбелязано като върнато в склада!', timer: 2000, showConfirmButton: false });
            }
        });
    } catch(err) {
        Swal.fire('Грешка', err.message, 'error');
    }
};



