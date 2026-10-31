// ========================================================
// IS-SYSTEMS: Мениджър на Заявки за Заготовки от Цеха
// ========================================================

let globalMaterialRequests = [];
let materialReqPollInterval = null;
let lastKnownPendingCount = -1;
let isFirstReqLoad = true;
let currentRequestsFilter = 'Чакаща'; // 'all', 'Чакаща', 'Осигурена'
let soundEnabled = true;

document.addEventListener('DOMContentLoaded', () => {
    initMaterialRequests();
});

function playNotificationChime() {
    if (!soundEnabled) return;
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;
        
        // Pleasant two-tone chime (E5 -> A5 with E4 harmonic)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'triangle';

        osc1.frequency.setValueAtTime(659.25, now); // E5
        osc1.frequency.setValueAtTime(880.00, now + 0.12); // A5

        osc2.frequency.setValueAtTime(329.63, now); // E4
        osc2.frequency.setValueAtTime(440.00, now + 0.12); // A4

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.65);
        osc2.stop(now + 0.65);
    } catch (e) {
        console.warn('Audio play skipped:', e);
    }
}

function showAdminRequestToast(req) {
    if (!req) return;
    let toastContainer = document.getElementById('adminToastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'adminToastContainer';
        toastContainer.style.cssText = 'position:fixed; top:20px; right:20px; z-index:99999; display:flex; flex-direction:column; gap:10px; max-width:390px; pointer-events:none;';
        document.body.appendChild(toastContainer);
    }
    
    let targetInfo = '';
    try {
        const tObj = JSON.parse(req.notes || '{}');
        if (tObj.target_machine) {
            targetInfo = `👉 Насочено към: <b>${tObj.target_machine}</b> (${tObj.target_op_name || ''})`;
        }
    } catch(e) {}
    if (!targetInfo && req.target_machine) {
        targetInfo = `👉 Насочено към: <b>${req.target_machine}</b>`;
    }

    const toast = document.createElement('div');
    toast.style.cssText = 'background:#ffffff; border:1px solid #fed7aa; border-left:6px solid #ea580c; border-radius:12px; padding:12px 16px; box-shadow:0 8px 24px rgba(0,0,0,0.15); pointer-events:auto; display:flex; flex-direction:column; gap:4px; cursor:pointer; transition:transform 0.15s;';
    toast.onmouseover = () => toast.style.transform = 'scale(1.02)';
    toast.onmouseout = () => toast.style.transform = 'scale(1)';

    let parsedObj = null;
    try { if (req.notes && req.notes.startsWith('{')) parsedObj = JSON.parse(req.notes); } catch(e) {}

    if (parsedObj && parsedObj.type === 'discrepancy') {
        toast.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="font-weight:900; color:#ea580c; font-size:0.92em; display:flex; align-items:center; gap:6px;">
                    <span>⚠️</span> РАЗМИНАВАНЕ В ОТЧЕТИТЕ
                </div>
                <span style="font-size:0.75em; color:#94a3b8;">току-що</span>
            </div>
            <div style="font-size:0.88em; color:#1e293b; font-weight:700;">
                <b>${req.operator || 'Оператор'}</b> отчете <b>${parsedObj.reported_qty} бр.</b> за <span style="color:#0284c7;">${req.part_name}</span> (Оп. ${parsedObj.reported_by_op_num || ''})!
            </div>
            <div style="font-size:0.82em; color:#854d0e; background:#fefce8; padding:4px 8px; border-radius:6px; border:1px solid #fef08a;">
                👉 Липсват <b>${parsedObj.missing_qty} бр.</b> от Оп. ${parsedObj.target_op_num || ''} (${parsedObj.target_machine || ''}). Чака се доотчитане.
            </div>
        `;
    } else {
        toast.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="font-weight:900; color:#ea580c; font-size:0.92em; display:flex; align-items:center; gap:6px;">
                    <span>🔔</span> СИГНАЛ ЗА БРОЙКИ / ЗАГОТОВКА
                </div>
                <span style="font-size:0.75em; color:#94a3b8;">току-що</span>
            </div>
            <div style="font-size:0.88em; color:#1e293b; font-weight:700;">
                ${req.operator || 'Оператор'} (машина <b>${req.machine || 'Обща'}</b>) чака за <span style="color:#0284c7;">${req.part_name}</span>!
            </div>
            ${targetInfo ? `<div style="font-size:0.82em; color:#854d0e; background:#fefce8; padding:4px 8px; border-radius:6px; border:1px solid #fef08a;">${targetInfo}</div>` : ''}
        `;
    }
    toast.onclick = () => {
        openMaterialRequestsModal();
        toast.remove();
    };
    toastContainer.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 9000);
}

async function initMaterialRequests() {
    await fetchMaterialRequests();
    
    // Периодично опресняване на всеки 15 секунди за бърза реакция
    if (materialReqPollInterval) clearInterval(materialReqPollInterval);
    materialReqPollInterval = setInterval(fetchMaterialRequests, 15000);
}

async function fetchMaterialRequests() {
    try {
        if (typeof client === 'undefined' || !client) return;

        const { data, error } = await client
            .from('material_requests')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            if (error.code === '42P01' || (error.message && error.message.includes('relation'))) {
                console.warn('Таблицата material_requests още не съществува в Supabase. Изпълнете setup_material_requests.sql.');
                return;
            }
            console.error('Грешка при зареждане на заявки за заготовки:', error);
            return;
        }

        globalMaterialRequests = data || [];
        updatePlanningBadgesAndBanner();
    } catch (err) {
        console.error('Неочаквана грешка при fetchMaterialRequests:', err);
    }
}

function updatePlanningBadgesAndBanner() {
    const pendingRequests = globalMaterialRequests.filter(r => r.status === 'Чакаща');
    const count = pendingRequests.length;

    // Звуков сигнал и Toast при нова заявка
    if (!isFirstReqLoad && lastKnownPendingCount >= 0 && count > lastKnownPendingCount) {
        playNotificationChime();
        showAdminRequestToast(pendingRequests[0]);
    }
    lastKnownPendingCount = count;
    isFirstReqLoad = false;

    const badge = document.getElementById('adminPlanningBadge');
    const subBadge = document.getElementById('adminPlanningSubBadge');
    const banner = document.getElementById('adminGlobalAlertBanner');

    // 1. Обновяване на баджа на бутона 'Планиране'
    if (badge) {
        if (count > 0) {
            badge.innerText = count;
            badge.style.display = 'inline-block';
            badge.style.animation = 'pulse 1.8s infinite';
        } else {
            badge.style.display = 'none';
        }
    }

    if (subBadge) {
        if (count > 0) {
            subBadge.innerText = count;
            subBadge.style.display = 'inline-block';
        } else {
            subBadge.style.display = 'none';
        }
    }

    // 2. Информативен банер над контролите
    if (banner) {
        if (count > 0) {
            const first = pendingRequests[0];
            const dateStr = first.created_at ? new Date(first.created_at).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' }) : '';
            
            let targetMachineTxt = '';
            try {
                const tObj = JSON.parse(first.notes || '{}');
                if (tObj.target_machine) targetMachineTxt = ` ➔ насочена към <b>${tObj.target_machine}</b>`;
            } catch(e) {}
            if (!targetMachineTxt && first.target_machine) {
                targetMachineTxt = ` ➔ насочена към <b>${first.target_machine}</b>`;
            }

            let summaryText = '';
            if (tObj && tObj.type === 'discrepancy') {
                summaryText = `В ${dateStr} ч. <b>${first.operator || 'Оператор'}</b> отчете <b>${tObj.reported_qty} бр.</b> за <span style="color:#0284c7; font-weight:800;">${first.part_name}</span> ➔ <b style="color:#c2410c;">разминаване: липсват ${tObj.missing_qty} бр.</b> от Оп. ${tObj.target_op_num} (${tObj.target_machine})`;
            } else {
                summaryText = count === 1 
                    ? `В ${dateStr} ч. <b>${first.operator || 'Оператор'}</b> (машина ${first.machine || 'Обща'}) чака за <span style="color:#0284c7; font-weight:800;">${first.part_name}</span>${targetMachineTxt}`
                    : `<b>${count} чакащи заявки от цеха</b> (последна за <span style="color:#0284c7; font-weight:800;">${first.part_name}</span> от ${first.operator || 'Оператор'})`;
            }

            banner.innerHTML = `
                <div style="background: #fff7ed; border: 1px solid #fed7aa; border-left: 5px solid #ea580c; padding: 10px 16px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 5px rgba(234, 88, 12, 0.08); flex-wrap: wrap; gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 10px; font-size: 0.92em; color: #9a3412;">
                        <span style="font-size: 1.3em;">🔔</span>
                        <span>${summaryText}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button type="button" onclick="playNotificationChime()" title="Тест на звука" style="background:#fed7aa; border:none; padding:7px 10px; border-radius:8px; cursor:pointer; font-size:0.9em;">🔊</button>
                        <button type="button" onclick="openMaterialRequestsModal()" style="background: linear-gradient(135deg, #ea580c, #c2410c); color: white; border: none; padding: 7px 15px; border-radius: 8px; font-weight: 800; font-size: 0.85em; cursor: pointer; box-shadow: 0 2px 4px rgba(234, 88, 12, 0.3);">
                            📋 Преглед на заявките (${count})
                        </button>
                    </div>
                </div>
            `;
            banner.style.display = 'block';
        } else {
            banner.innerHTML = '';
            banner.style.display = 'none';
        }
    }
}

function openMaterialRequestsModal() {
    const backdrop = document.getElementById('materialRequestsModalBackdrop');
    if (!backdrop) return;
    backdrop.style.display = 'flex';
    renderMaterialRequestsList();
}

function closeMaterialRequestsModal() {
    const backdrop = document.getElementById('materialRequestsModalBackdrop');
    if (!backdrop) return;
    backdrop.style.display = 'none';
}

function setRequestsFilter(status) {
    currentRequestsFilter = status;
    renderMaterialRequestsList();
}

function renderMaterialRequestsList() {
    const container = document.getElementById('materialRequestsList');
    const badge = document.getElementById('modalReqCountBadge');
    if (!container) return;

    const pendingCount = globalMaterialRequests.filter(r => r.status === 'Чакаща').length;
    const resolvedCount = globalMaterialRequests.filter(r => r.status === 'Осигурена').length;
    const totalCount = globalMaterialRequests.length;

    if (badge) {
        badge.innerText = `${pendingCount} чакащи`;
        badge.style.background = pendingCount > 0 ? '#ea580c' : '#16a34a';
    }

    // Filter controls HTML
    let filterBarHtml = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
            <div style="display: inline-flex; background: #f1f5f9; padding: 3px; border-radius: 8px; gap: 4px;">
                <button type="button" onclick="setRequestsFilter('Чакаща')" style="border:none; padding:5px 12px; border-radius:6px; font-size:0.82em; font-weight:800; cursor:pointer; background:${currentRequestsFilter === 'Чакаща' ? '#ea580c' : 'transparent'}; color:${currentRequestsFilter === 'Чакаща' ? '#ffffff' : '#64748b'};">
                    Чакащи (${pendingCount})
                </button>
                <button type="button" onclick="setRequestsFilter('Осигурена')" style="border:none; padding:5px 12px; border-radius:6px; font-size:0.82em; font-weight:800; cursor:pointer; background:${currentRequestsFilter === 'Осигурена' ? '#16a34a' : 'transparent'}; color:${currentRequestsFilter === 'Осигурена' ? '#ffffff' : '#64748b'};">
                    Осигурени (${resolvedCount})
                </button>
                <button type="button" onclick="setRequestsFilter('all')" style="border:none; padding:5px 12px; border-radius:6px; font-size:0.82em; font-weight:800; cursor:pointer; background:${currentRequestsFilter === 'all' ? '#475569' : 'transparent'}; color:${currentRequestsFilter === 'all' ? '#ffffff' : '#64748b'};">
                    Всички (${totalCount})
                </button>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; font-size: 0.82em; color: #64748b;">
                <label style="cursor: pointer; display: flex; align-items: center; gap: 4px;">
                    <input type="checkbox" ${soundEnabled ? 'checked' : ''} onchange="soundEnabled = this.checked">
                    <span>Звуков сигнал 🔊</span>
                </label>
            </div>
        </div>
    `;

    const filtered = globalMaterialRequests.filter(r => {
        if (currentRequestsFilter === 'all') return true;
        return r.status === currentRequestsFilter;
    });

    if (filtered.length === 0) {
        container.innerHTML = filterBarHtml + `
            <div style="text-align: center; padding: 40px 20px; color: #64748b;">
                <div style="font-size: 2.2em; margin-bottom: 8px;">🎉</div>
                <div style="font-weight: 800; font-size: 1.05em; color: #334155;">Няма намерени заявки в тази категория!</div>
                <div style="font-size: 0.85em; margin-top: 4px;">Когато оператор заяви заготовка от терминала, тя ще се появи тук.</div>
            </div>
        `;
        return;
    }

    let html = filterBarHtml + '<div style="display: flex; flex-direction: column; gap: 12px;">';
    filtered.forEach(req => {
        const isPending = (req.status === 'Чакаща');
        const cardBorder = isPending ? 'border-left: 5px solid #ea580c;' : 'border-left: 5px solid #16a34a; opacity: 0.88;';
        const cardBg = isPending ? '#ffffff' : '#f8fafc';
        
        let dateStr = '';
        if (req.created_at) {
            try {
                let p = req.created_at;
                if (!p.endsWith('Z') && !p.includes('+')) p += 'Z';
                dateStr = new Date(p).toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            } catch(e) { dateStr = req.created_at; }
        }

        let isDiscrepancy = (targetObj && targetObj.type === 'discrepancy');

        let statusPill = '';
        if (isDiscrepancy) {
            statusPill = isPending 
                ? `<span style="background: #fff7ed; color: #ea580c; border: 1.5px solid #fed7aa; padding: 3px 10px; border-radius: 14px; font-weight: 800; font-size: 0.82em;">⚠️ Чака доотчитане</span>`
                : `<span style="background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; padding: 3px 10px; border-radius: 14px; font-weight: 800; font-size: 0.82em;">🟢 Доотчетено</span>`;
        } else {
            statusPill = isPending 
                ? `<span style="background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; padding: 3px 10px; border-radius: 14px; font-weight: 800; font-size: 0.82em;">🟡 Чакаща заготовка</span>`
                : `<span style="background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; padding: 3px 10px; border-radius: 14px; font-weight: 800; font-size: 0.82em;">🟢 Осигурена</span>`;
        }

        const tMachine = targetObj ? targetObj.target_machine : (req.target_machine || null);
        const tOpName = targetObj ? targetObj.target_op_name : (req.target_op_name || null);
        const tOpNum = targetObj ? targetObj.target_op_num : (req.target_op_num || null);
        const tPart = targetObj ? targetObj.target_part : (req.target_part || null);

        let targetDetailHtml = '';
        if (isDiscrepancy) {
            targetDetailHtml = `
                <div style="background: #fff7ed; border: 1.5px solid #fed7aa; border-radius: 8px; padding: 10px 14px; font-size: 0.88em; color: #9a3412; line-height: 1.5;">
                    👉 <b>Разминаване между операции:</b> На Оп. ${targetObj.reported_by_op_num || ''} (${req.op_name}) са отчетени <b>${targetObj.reported_qty} бр.</b>, но на предходната Оп. ${tOpNum} (${tOpName}) в системата има само <b>${targetObj.prev_qty} бр.</b> (липсват <b>${targetObj.missing_qty} бр.</b>)!<br>
                    Работно място на предходна операция: <b>${tMachine}</b> &bull; Работил: <b>${targetObj.target_operator || 'колега'}</b>
                </div>
            `;
        } else if (tMachine && tMachine !== 'Склад') {
            targetDetailHtml = `
                <div style="background: #eff6ff; border: 1.5px solid #bfdbfe; border-radius: 8px; padding: 8px 12px; font-size: 0.88em; color: #1e40af; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                    <div>
                        👉 <b>Сигналът е насочен към:</b> работно място <span style="font-weight: 900; background: #ffffff; padding: 2px 8px; border-radius: 4px; border: 1px solid #93c5fd; color: #1e3a8a;">${tMachine}</span>
                        ${tOpNum ? `&bull; Оп. <b>${tOpNum} (${tOpName})</b>` : ''}
                    </div>
                    ${tPart ? `<span style="font-weight: 800; color: #1e3a8a;">Детайл: ${tPart}</span>` : ''}
                </div>
            `;
        } else {
            targetDetailHtml = `
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 12px; font-size: 0.85em; color: #475569;">
                    📦 <b>Насочено към:</b> Склад Материали (суровина / заготовка)
                </div>
            `;
        }

        html += `
            <div style="background: ${cardBg}; border: 1px solid #e2e8f0; ${cardBorder} border-radius: 12px; padding: 14px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
                    <div>
                        <div style="font-size: 1.15em; font-weight: 900; color: #0f172a;">${req.part_name} <span style="font-weight: 600; color: #64748b; font-size: 0.85em;">(${req.op_name || 'Операция'})</span></div>
                        <div style="font-size: 0.85em; color: #475569; margin-top: 2px;">
                            Чака на машина: <b style="color: #1e3a8a;">${req.machine || 'Обща'}</b> &bull; Заявил: <b>${req.operator || 'Оператор'}</b> &bull; 🕒 ${dateStr}
                        </div>
                    </div>
                    <div>${statusPill}</div>
                </div>

                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 8px 12px; font-size: 0.88em; color: #991b1b; font-weight: 700;">
                    Липсва: ${req.reasons || 'Наличност: 0'}
                </div>

                ${targetDetailHtml}

                <div style="display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 4px; border-top: 1px solid #f1f5f9; padding-top: 10px;">
                    ${isPending ? `
                        <button type="button" onclick="resolveMaterialRequest(${req.id}, '${encodeURIComponent(req.part_name)}')" style="background: linear-gradient(135deg, #16a34a, #15803d); color: white; border: none; padding: 7px 16px; border-radius: 8px; font-weight: 800; font-size: 0.85em; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(22, 163, 74, 0.25);">
                            ✅ Маркирай като Осигурена
                        </button>
                    ` : `
                        <span style="font-size: 0.82em; color: #64748b; font-weight: 700;">Решена на ${req.resolved_at ? new Date(req.resolved_at).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' }) : ''} ч. (${req.resolved_by || 'Админ'})</span>
                    `}
                    <button type="button" onclick="deleteMaterialRequest(${req.id})" style="background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; padding: 6px 12px; border-radius: 8px; font-weight: 700; font-size: 0.82em; cursor: pointer;" title="Изтрий заявката">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    });
    html += '</div>';

    container.innerHTML = html;
}

async function resolveMaterialRequest(id, encPartName) {
    const partName = decodeURIComponent(encPartName || '');
    try {
        const { error } = await client
            .from('material_requests')
            .update({
                status: 'Осигурена',
                resolved_at: new Date().toISOString(),
                resolved_by: 'Планьор / Админ'
            })
            .eq('id', id);

        if (error) throw error;

        Swal.fire({
            icon: 'success',
            title: 'Заявката е осигурена!',
            text: `Заготовката за ${partName} е маркирана като осигурена.`,
            timer: 2000,
            showConfirmButton: false
        });

        await fetchMaterialRequests();
        renderMaterialRequestsList();
    } catch(err) {
        Swal.fire('Грешка', err.message, 'error');
    }
}

async function deleteMaterialRequest(id) {
    const res = await Swal.fire({
        title: 'Изтриване на заявка?',
        text: 'Сигурни ли сте, че искате да изтриете този запис?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Да, изтрий',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#dc2626'
    });

    if (res.isConfirmed) {
        try {
            const { error } = await client
                .from('material_requests')
                .delete()
                .eq('id', id);

            if (error) throw error;

            await fetchMaterialRequests();
            renderMaterialRequestsList();
        } catch(err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    }
}
