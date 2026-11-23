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
        let badgeTitle = '⚠️ РАЗМИНАВАНЕ В ОТЧЕТИТЕ';
        let detailHtml = '';

        if (parsedObj.phase === 'spot_audit_pending') {
            badgeTitle = '🔍 ЕКСПРЕСНА РЕВИЗИЯ (ДЕФИЦИТ)';
            detailHtml = `
                <div style="font-size:0.88em; color:#1e293b; font-weight:700;">
                    <b>${req.operator || 'Оператор'}</b> отчете <b>${parsedObj.reported_qty} бр.</b> за <span style="color:#0284c7;">${req.part_name}</span> (Оп. ${parsedObj.reported_by_op_num || ''})!
                </div>
                <div style="font-size:0.82em; color:#854d0e; background:#fefce8; padding:4px 8px; border-radius:6px; border:1px solid #fef08a;">
                    🔍 Стартирана експресна ревизия на <b>Оп. ${parsedObj.upstream_op_num || ''} (${parsedObj.upstream_machine || ''})</b> за <b>${parsedObj.missing_qty} бр.</b> Очаква се потвърждение на наличността.
                </div>
            `;
        } else if (parsedObj.phase === 'reconciliation_cascade') {
            badgeTitle = '🔄 ДООТЧИТАНЕ ПО КАСКАДА';
            detailHtml = `
                <div style="font-size:0.88em; color:#1e293b; font-weight:700;">
                    Детайл: <span style="color:#0284c7;">${req.part_name}</span> (липсват <b>${parsedObj.missing_qty} бр.</b>)
                </div>
                <div style="font-size:0.82em; color:#166534; background:#f0fdf4; padding:4px 8px; border-radius:6px; border:1px solid #bbf7d0;">
                    👉 Оп. ${parsedObj.upstream_op_num || ''} потвърди 0 бр. налични (транзит). Сигнал за доотчитане към <b>${parsedObj.target_machine}</b> (Оп. ${parsedObj.target_op_num || ''} ${parsedObj.target_op_name || ''}).
                </div>
            `;
        } else if (parsedObj.phase === 'over_reporting_detected') {
            badgeTitle = '🚨 ГРЕШКА: НАДПИСАНИ БРОЙКИ';
            detailHtml = `
                <div style="font-size:0.88em; color:#991b1b; font-weight:800;">
                    Оп. ${parsedObj.upstream_op_num || ''} потвърди наличност от ${parsedObj.upstream_confirmed_qty || ''} бр.!
                </div>
                <div style="font-size:0.82em; color:#991b1b; background:#fef2f2; padding:4px 8px; border-radius:6px; border:1px solid #fecaca;">
                    🚨 Грешка при отчет на Оп. ${parsedObj.reported_by_op_num || ''} за ${req.part_name} - надписани ${parsedObj.missing_qty} бр. Сигнал към Началник смяна!
                </div>
            `;
        } else {
            detailHtml = `
                <div style="font-size:0.88em; color:#1e293b; font-weight:700;">
                    <b>${req.operator || 'Оператор'}</b> отчете <b>${parsedObj.reported_qty} бр.</b> за <span style="color:#0284c7;">${req.part_name}</span> (Оп. ${parsedObj.reported_by_op_num || ''})!
                </div>
                <div style="font-size:0.82em; color:#854d0e; background:#fefce8; padding:4px 8px; border-radius:6px; border:1px solid #fef08a;">
                    👉 Липсват <b>${parsedObj.missing_qty} бр.</b> от първоизточник <b>${parsedObj.target_part || 'детайл'}</b> (${parsedObj.target_machine || ''})${parsedObj.intermediate_machine ? ' (транзит през ' + parsedObj.intermediate_machine + ')' : ''}. Чака се доотчитане.
                </div>
            `;
        }

        toast.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="font-weight:900; color:#ea580c; font-size:0.92em; display:flex; align-items:center; gap:6px;">
                    <span>⚠️</span> ${badgeTitle}
                </div>
                <span style="font-size:0.75em; color:#94a3b8;">току-що</span>
            </div>
            ${detailHtml}
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
            let tObj = null;
            try {
                if (first.notes && first.notes.startsWith('{')) tObj = JSON.parse(first.notes);
                if (tObj && tObj.target_machine) targetMachineTxt = ` ➔ насочена към <b>${tObj.target_machine}</b>`;
            } catch(e) {}
            if (!targetMachineTxt && first.target_machine) {
                targetMachineTxt = ` ➔ насочена към <b>${first.target_machine}</b>`;
            }

            let summaryText = '';
            if (tObj && tObj.type === 'discrepancy') {
                if (tObj.phase === 'spot_audit_pending') {
                    summaryText = `В ${dateStr} ч. <b>${first.operator || 'Оператор'}</b> отчете <b>${tObj.reported_qty} бр.</b> за <span style="color:#0284c7; font-weight:800;">${first.part_name}</span> (Оп. ${tObj.reported_by_op_num || ''}) ➔ <b style="color:#c2410c;">дефицит -${tObj.missing_qty} бр.</b>! Стартирана експресна ревизия на Оп. ${tObj.upstream_op_num || ''} (${tObj.upstream_machine || ''})`;
                } else if (tObj.phase === 'reconciliation_cascade') {
                    summaryText = `В ${dateStr} ч. ревизията на Оп. ${tObj.upstream_op_num || ''} потвърди 0 бр. (транзит) ➔ <b style="color:#15803d;">Чака се доотчитане на ${tObj.missing_qty} бр.</b> от <b style="color:#0369a1;">${tObj.target_machine}</b> (Оп. ${tObj.target_op_num || ''} ${tObj.target_op_name || ''})`;
                } else if (tObj.phase === 'over_reporting_detected') {
                    summaryText = `🚨 В ${dateStr} ч. Оп. ${tObj.upstream_op_num || ''} потвърди наличност ➔ <b style="color:#dc2626;">Грешка в отчет на Оп. ${tObj.reported_by_op_num || ''} за ${first.part_name}</b> (надписани ${tObj.missing_qty} бр. / чужд кашон)`;
                } else {
                    const missingTargetName = tObj.target_part ? `детайл <b style="color:#0369a1;">${tObj.target_part}</b> ` : (tObj.target_op_num ? `Оп. ${tObj.target_op_num} ` : '');
                    const intermInfo = (tObj.intermediate_machine && tObj.intermediate_machine !== tObj.target_machine) ? ` (транзит през ${tObj.intermediate_machine})` : '';
                    summaryText = `В ${dateStr} ч. <b>${first.operator || 'Оператор'}</b> отчете <b>${tObj.reported_qty} бр.</b> за <span style="color:#0284c7; font-weight:800;">${first.part_name}</span> ➔ <b style="color:#c2410c;">разминаване: липсват ${tObj.missing_qty} бр.</b> от ${missingTargetName}(${tObj.target_machine})${intermInfo}`;
                }
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

        let targetObj = null;
        try {
            if (req.notes && req.notes.startsWith('{')) targetObj = JSON.parse(req.notes);
        } catch(e) {}

        let isDiscrepancy = (targetObj && targetObj.type === 'discrepancy');

        let statusPill = '';
        if (isDiscrepancy) {
            let pillText = '⚠️ Чака доотчитане';
            if (targetObj && targetObj.phase === 'spot_audit_pending') pillText = '🔍 Експресна ревизия в ход';
            else if (targetObj && targetObj.phase === 'over_reporting_detected') pillText = '🚨 Надписани бройки';
            statusPill = isPending 
                ? `<span style="background: #fff7ed; color: #ea580c; border: 1.5px solid #fed7aa; padding: 3px 10px; border-radius: 14px; font-weight: 800; font-size: 0.82em;">${pillText}</span>`
                : `<span style="background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; padding: 3px 10px; border-radius: 14px; font-weight: 800; font-size: 0.82em;">🟢 Доотчетено / Занулено</span>`;
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
            const missingTargetDesc = tPart ? `от детайл <b>${tPart}</b> (${tOpName || tMachine})` : `на предходната Оп. ${tOpNum} (${tOpName})`;
            targetDetailHtml = `
                <div style="background: #fff7ed; border: 1.5px solid #fed7aa; border-radius: 8px; padding: 10px 14px; font-size: 0.88em; color: #9a3412; line-height: 1.5;">
                    👉 <b>Разминаване в наличността:</b> За детайл <b>${req.part_name}</b> (Оп. ${targetObj.reported_by_op_num || ''} - ${req.op_name}) са отчетени <b>${targetObj.reported_qty} бр.</b>, но в системата ${missingTargetDesc} има само <b>${targetObj.prev_qty} бр.</b> (липсват <b>${targetObj.missing_qty} бр.</b>)!<br>
                    Работно място / Направление: <b>${tMachine}</b> &bull; Засегнат: <b>${targetObj.target_operator || 'колега / склад'}</b>
                    ${(targetObj.intermediate_machine && targetObj.intermediate_machine !== tMachine) ? `<div style="margin-top:4px; font-size:0.82em; color:#64748b;">ℹ️ Транзитно работно място: <b>${targetObj.intermediate_machine}</b> (${targetObj.intermediate_part || ''}${targetObj.intermediate_op_num ? ' / Оп. ' + targetObj.intermediate_op_num : ''})</div>` : ''}
                    ${(targetObj.chain && targetObj.chain.length > 0) ? `<div style="margin-top:6px; font-size:0.82em; color:#0369a1; background:#f0f9ff; border:1px solid #bae6fd; padding:4px 8px; border-radius:6px;">🔗 <b>Верига назад:</b> ${targetObj.chain.join(' ⬅️ ')}</div>` : ''}
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


// ========================================================
// ИЗВЕСТИЯ ЗА ЕКСПРЕСНИ РЕВИЗИИ (SPOT AUDITS) В ГЛАВЕН АДМИН
// ========================================================

function markAuditAsReadInAdmin(auditId) {
    try {
        localStorage.setItem('last_read_spot_audit_time', new Date().toISOString());
        let readIds = [];
        try { readIds = JSON.parse(localStorage.getItem('read_spot_audit_ids') || '[]'); } catch(e) {}
        if (auditId && !readIds.includes(auditId)) {
            readIds.push(auditId);
            localStorage.setItem('read_spot_audit_ids', JSON.stringify(readIds));
        }
        window.dispatchEvent(new Event('storage'));
    } catch(e) {}
    checkAdminSpotAudits();
}

async function checkAdminSpotAudits() {
    try {
        const subBadge = document.getElementById('adminSpotAuditSubBadge');
        if (!subBadge) return;

        let today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data, error } = await client
            .from('spot_audits')
            .select('id, status, created_at, answered_at')
            .in('status', ['DISCREPANCY', 'MATCH'])
            .gte('created_at', today.toISOString());

        if (error) return;

        let lastTime = 0;
        let readIds = new Set();
        try {
            let lastStr = localStorage.getItem('last_read_spot_audit_time');
            if (lastStr) lastTime = new Date(lastStr).getTime();
            let parsedIds = JSON.parse(localStorage.getItem('read_spot_audit_ids') || '[]');
            readIds = new Set(parsedIds);
        } catch(e) {}

        let unread = (data || []).filter(a => {
            if (readIds.has(a.id)) return false;
            let t = new Date(a.answered_at || a.created_at).getTime();
            return t > lastTime;
        });

        let count = unread.length;
        if (count > 0) {
            let hasDiscrepancy = unread.some(a => a.status === 'DISCREPANCY');
            subBadge.innerText = count;
            subBadge.style.display = 'inline-block';
            subBadge.style.background = hasDiscrepancy ? '#ef4444' : '#16a34a';
        } else {
            subBadge.style.display = 'none';
        }
    } catch(e) {}
}

let adminSpotAuditRealtime = null;
function initAdminSpotAuditRealtime() {
    try {
        if (!client) return;

        // Синхронизация при отбелязване на ревизия като прегледана
        window.addEventListener('storage', (e) => {
            if (e.key === 'last_read_spot_audit_time' || e.key === 'read_spot_audit_ids') {
                checkAdminSpotAudits();
            }
        });

        checkAdminSpotAudits();

        adminSpotAuditRealtime = client.channel('admin-spot-audits-live')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'spot_audits' }, (payload) => {
                const newRow = payload.new || {};
                if (!newRow) return;

                if (newRow.status === 'DISCREPANCY') {
                    if (typeof playNotificationChime === 'function') playNotificationChime();
                    let diffVal = parseFloat(newRow.difference_qty) || 0;
                    let diffSign = diffVal > 0 ? '+' : '';

                    Swal.fire({
                        title: '🔴 Разминаване в Ревизия!',
                        html: `
                            <div style="font-size:1.02em; line-height:1.5; color:#1e293b; text-align:left; background:#fff1f2; border:1.5px solid #fecdd3; border-radius:10px; padding:14px; margin-top:8px;">
                                <div>👷 <b>Работник:</b> <span style="color:#b91c1c; font-weight:800; font-size:1.1em;">${newRow.worker_name || 'ОПЕРАТОР'}</span></div>
                                <div>🏭 <b>Работно място:</b> <b>${newRow.target_machine}</b></div>
                                <div>📦 <b>Детайл:</b> <b>${newRow.part_code}</b> (${newRow.operation})</div>
                                <hr style="border:none; border-top:1px dashed #f43f5e; margin:10px 0;">
                                <div style="display:flex; justify-content:space-between; font-size:1.05em;">
                                    <span>Очаквани: <b>${newRow.expected_qty} бр.</b></span>
                                    <span>Преброени: <b style="color:#dc2626; font-size:1.15em;">${newRow.reported_qty} бр.</b></span>
                                </div>
                                <div style="margin-top:6px; font-size:1.1em; color:#b91c1c; font-weight:900;">
                                    ⚠️ Разлика: ${diffSign}${diffVal} бр.
                                </div>
                            </div>
                        `,
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonColor: '#7c3aed',
                        cancelButtonColor: '#94a3b8',
                        confirmButtonText: '📋 Отвори прозореца с ревизията',
                        cancelButtonText: 'Затвори'
                    }).then((res) => {
                        markAuditAsReadInAdmin(newRow.id);
                        if (res.isConfirmed) {
                            openAdminSpotAuditModal();
                        }
                    });
                } else if (newRow.status === 'MATCH') {
                    if (typeof playNotificationChime === 'function') playNotificationChime();
                    Swal.fire({
                        title: '🟢 Точна ревизия!',
                        html: `
                            <div style="font-size:1.02em; line-height:1.5; color:#1e293b; text-align:left; background:#f0fdf4; border:1.5px solid #bbf7d0; border-radius:10px; padding:14px; margin-top:8px;">
                                <div>👷 <b>Работник:</b> <span style="color:#15803d; font-weight:800; font-size:1.1em;">${newRow.worker_name || 'ОПЕРАТОР'}</span></div>
                                <div>🏭 <b>Работно място:</b> <b>${newRow.target_machine}</b></div>
                                <div>📦 <b>Детайл:</b> <b>${newRow.part_code}</b> (${newRow.operation})</div>
                                <hr style="border:none; border-top:1px dashed #86efac; margin:10px 0;">
                                <div style="font-size:1.08em; color:#166534; font-weight:800;">
                                    ✅ Потвърдени точно: ${newRow.reported_qty} бр. (Всичко е наред)
                                </div>
                            </div>
                        `,
                        icon: 'success',
                        showCancelButton: true,
                        confirmButtonColor: '#16a34a',
                        cancelButtonColor: '#94a3b8',
                        confirmButtonText: '📋 Отвори прозореца с ревизията',
                        cancelButtonText: 'Супер, разбрах'
                    }).then((res) => {
                        markAuditAsReadInAdmin(newRow.id);
                        if (res.isConfirmed) {
                            openAdminSpotAuditModal();
                        }
                    });
                }
                checkAdminSpotAudits();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'spot_audits' }, () => {
                checkAdminSpotAudits();
            })
            .subscribe();
    } catch(e) {
        console.warn('Realtime error in admin spot audits:', e);
    }
}

// ==============================================================================
// МОДАЛЕН ПРОЗОРЕЦ ЗА РЕВИЗИИ (SPOT AUDITS) В АДМИНИСТРАТИВНИЯ ПАНЕЛ
// ==============================================================================

let adminSpotAuditsCache = [];
let currentAdminAuditFilter = 'all';

function escapeAuditHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.openAdminSpotAuditModal = async function() {
    let modal = document.getElementById('adminSpotAuditModalBackdrop');
    if (!modal) {
        initAdminSpotAuditModalHtml();
        modal = document.getElementById('adminSpotAuditModalBackdrop');
    }
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    await loadAdminSpotAuditHistory();
};

window.closeAdminSpotAuditModal = function() {
    const modal = document.getElementById('adminSpotAuditModalBackdrop');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
};

function initAdminSpotAuditModalHtml() {
    if (document.getElementById('adminSpotAuditModalBackdrop')) return;
    const div = document.createElement('div');
    div.id = 'adminSpotAuditModalBackdrop';
    div.style.cssText = 'display: none; position: fixed; inset: 0; background: rgba(15, 23, 42, 0.65); z-index: 99999; justify-content: center; align-items: center; padding: 12px; box-sizing: border-box; backdrop-filter: blur(4px);';
    div.innerHTML = `
      <div style="background: white; border-radius: 16px; width: 100%; max-width: 950px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.35);">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid #e2e8f0; background: #fdf4ff;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.6em;">🎯</span>
            <div>
              <div style="font-weight: 800; color: #581c87; font-size: 1.15em;">Експресни Ревизии на Наличност (Spot Audits) — Дневник</div>
              <div style="font-size: 0.82em; color: #7e22ce;">Контрол на отчетените проверки от терминалите на работниците</div>
            </div>
          </div>
          <button onclick="closeAdminSpotAuditModal()" style="border: none; background: #e9d5ff; border-radius: 50%; width: 32px; height: 32px; font-size: 14px; cursor: pointer; color: #6b21a8; font-weight: bold;">✖</button>
        </div>

        <!-- Filter Bar -->
        <div style="padding: 12px 20px; background: #faf5ff; border-bottom: 1px solid #edf2f7; display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="chip active" id="chip_admin_audit_all" onclick="filterAdminAuditHistory('all')">Всички (<span id="countAdminAuditAll">0</span>)</button>
            <button class="chip" id="chip_admin_audit_pending" onclick="filterAdminAuditHistory('pending')">⏳ Чакащи (<span id="countAdminAuditPending">0</span>)</button>
            <button class="chip" id="chip_admin_audit_diff" onclick="filterAdminAuditHistory('diff')" style="color: #dc2626; font-weight: 800;">🔴 Разминавания (<span id="countAdminAuditDiff">0</span>)</button>
            <button class="chip" id="chip_admin_audit_match" onclick="filterAdminAuditHistory('match')">🟢 Точни (<span id="countAdminAuditMatch">0</span>)</button>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button type="button" class="btn-secondary" onclick="markAllAdminSpotAuditsAsRead()" style="font-size: 0.85em; padding: 6px 12px; background: #f8fafc; border: 1px solid #cbd5e1; color: #475569; border-radius: 8px; cursor: pointer; font-weight: 700;">
              ✓ Маркирай като прегледани
            </button>
            <button class="btn-secondary" onclick="loadAdminSpotAuditHistory()" style="font-size: 0.85em; padding: 6px 12px; cursor: pointer;">
              🔄 Опресни
            </button>
            <button class="btn-primary" onclick="window.open('workplace-tasks.html?openSpotAudit=1', '_blank')" style="font-size: 0.85em; padding: 6px 12px; background: #0284c7; color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer;">
              🎯 Отвори в Табло Машини
            </button>
          </div>
        </div>

        <!-- Table Container -->
        <div style="padding: 16px; overflow-y: auto; flex: 1; background: #f8fafc;" id="adminSpotAuditsTableWrap">
          <div style="text-align: center; color: #94a3b8; padding: 40px 10px;">Зареждане на дневника...</div>
        </div>

        <!-- Footer -->
        <div style="padding: 10px 20px; border-top: 1px solid #e2e8f0; background: #fff; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.8em; color: #94a3b8;">🎯 Записите пазят персонална отговорност (име на работника + дата/час)</span>
          <button onclick="closeAdminSpotAuditModal()" style="padding: 8px 18px; background: #64748b; color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 0.85em; cursor: pointer;">Затвори</button>
        </div>
      </div>
    `;
    document.body.appendChild(div);
}

async function loadAdminSpotAuditHistory() {
    const wrap = document.getElementById('adminSpotAuditsTableWrap');
    if (wrap) wrap.innerHTML = '<div style="text-align:center; color:#94a3b8; padding:30px;">Зареждане на данни...</div>';
    try {
        const { data, error } = await client
            .from('spot_audits')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);
        if (error) throw error;
        adminSpotAuditsCache = data || [];
        updateAdminAuditBadges();
        renderAdminSpotAuditTable();
    } catch(err) {
        if (wrap) wrap.innerHTML = `<div style="text-align:center; color:#dc2626; padding:30px;">Грешка: ${escapeAuditHtml(err.message)}</div>`;
    }
}

function updateAdminAuditBadges() {
    let pending = adminSpotAuditsCache.filter(a => a.status === 'PENDING').length;
    let diff = adminSpotAuditsCache.filter(a => a.status === 'DISCREPANCY').length;
    let match = adminSpotAuditsCache.filter(a => a.status === 'MATCH').length;
    let total = adminSpotAuditsCache.length;

    const elTotal = document.getElementById('countAdminAuditAll');
    const elPending = document.getElementById('countAdminAuditPending');
    const elDiff = document.getElementById('countAdminAuditDiff');
    const elMatch = document.getElementById('countAdminAuditMatch');

    if (elTotal) elTotal.innerText = total;
    if (elPending) elPending.innerText = pending;
    if (elDiff) elDiff.innerText = diff;
    if (elMatch) elMatch.innerText = match;
}

window.filterAdminAuditHistory = function(filter) {
    currentAdminAuditFilter = filter;
    ['all', 'pending', 'diff', 'match'].forEach(f => {
        const chip = document.getElementById('chip_admin_audit_' + f);
        if (chip) {
            if (f === filter) chip.classList.add('active');
            else chip.classList.remove('active');
        }
    });
    renderAdminSpotAuditTable();
};

function renderAdminSpotAuditTable() {
    const wrap = document.getElementById('adminSpotAuditsTableWrap');
    if (!wrap) return;

    let list = adminSpotAuditsCache;
    if (currentAdminAuditFilter === 'pending') list = list.filter(a => a.status === 'PENDING');
    else if (currentAdminAuditFilter === 'diff') list = list.filter(a => a.status === 'DISCREPANCY');
    else if (currentAdminAuditFilter === 'match') list = list.filter(a => a.status === 'MATCH');

    if (list.length === 0) {
        wrap.innerHTML = `<div style="text-align:center; color:#94a3b8; padding:40px; font-weight:700;">Няма намерени записи в дневника.</div>`;
        return;
    }

    let rowsHtml = '';
    list.forEach(a => {
        let createdD = new Date(a.created_at);
        let timeStr = createdD.toLocaleDateString('bg-BG') + ' ' + createdD.getHours().toString().padStart(2, '0') + ':' + createdD.getMinutes().toString().padStart(2, '0');

        let statusHtml = '';
        let diffText = '-';
        let reportedText = '-';
        let workerText = a.worker_name ? `<b>${escapeAuditHtml(a.worker_name)}</b>` : '<span style="color:#94a3b8;">Очаква отговор...</span>';

        if (a.status === 'PENDING') {
            statusHtml = `<span style="background:#fffbeb; color:#b45309; border:1px solid #fde68a; padding:3px 8px; border-radius:6px; font-size:0.82em; font-weight:800;">⏳ Очаква отговор</span>`;
        } else if (a.status === 'MATCH') {
            statusHtml = `<span style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; padding:3px 8px; border-radius:6px; font-size:0.82em; font-weight:800;">🟢 Точно съвпадение</span>`;
            reportedText = `<b>${a.reported_qty} бр.</b>`;
            diffText = `<span style="color:#16a34a; font-weight:800;">0 бр.</span>`;
        } else if (a.status === 'DISCREPANCY') {
            let diffVal = parseFloat(a.difference_qty) || 0;
            let diffSign = diffVal > 0 ? '+' : '';
            statusHtml = `<span style="background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; padding:3px 8px; border-radius:6px; font-size:0.82em; font-weight:800;">🔴 Разминаване (${diffSign}${diffVal})</span>`;
            reportedText = `<b style="color:#dc2626;">${a.reported_qty} бр.</b>`;
            diffText = `<b style="color:#dc2626;">${diffSign}${diffVal} бр.</b>`;
        } else if (a.status === 'CANCELLED') {
            statusHtml = `<span style="background:#f1f5f9; color:#64748b; padding:3px 8px; border-radius:6px; font-size:0.82em; font-weight:800;">⚪ Анулирана</span>`;
        }

        rowsHtml += `
            <tr style="border-bottom: 1px solid #e2e8f0; background: white;">
                <td style="padding: 10px 12px; font-size: 0.85em; color: #64748b; white-space: nowrap;">${timeStr}</td>
                <td style="padding: 10px 12px;">
                    <b style="color: #1e293b;">${escapeAuditHtml(a.target_machine)}</b>
                    ${a.target_worker ? `<div style="font-size:0.8em; color:#6b21a8; font-weight:800; margin-top:2px;">🎯 ${escapeAuditHtml(a.target_worker)}</div>` : ''}
                </td>
                <td style="padding: 10px 12px;">${workerText}</td>
                <td style="padding: 10px 12px;">
                    <div style="font-weight: 800; color: #2563eb;">${escapeAuditHtml(a.part_code)}</div>
                    <div style="font-size: 0.82em; color: #64748b;">${escapeAuditHtml(a.operation)}</div>
                </td>
                <td style="padding: 10px 12px; text-align: center; font-weight: 700; color: #475569;">${a.expected_qty} бр.</td>
                <td style="padding: 10px 12px; text-align: center;">${reportedText}</td>
                <td style="padding: 10px 12px; text-align: center;">${diffText}</td>
                <td style="padding: 10px 12px;">${statusHtml}</td>
            </tr>
        `;
    });

    wrap.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.88em; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <thead>
                <tr style="background: #f1f5f9; color: #475569; text-align: left; border-bottom: 2px solid #cbd5e1;">
                    <th style="padding: 10px 12px;">Дата / Час</th>
                    <th style="padding: 10px 12px;">Работно място</th>
                    <th style="padding: 10px 12px;">Работник</th>
                    <th style="padding: 10px 12px;">Детайл &amp; Операция</th>
                    <th style="padding: 10px 12px; text-align: center;">Очаквани (склад)</th>
                    <th style="padding: 10px 12px; text-align: center;">Отчетени (работник)</th>
                    <th style="padding: 10px 12px; text-align: center;">Разлика</th>
                    <th style="padding: 10px 12px;">Статус</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
        </table>
    `;
}

window.markAllAdminSpotAuditsAsRead = function() {
    try {
        localStorage.setItem('last_read_spot_audit_time', new Date().toISOString());
        let allIds = (adminSpotAuditsCache || []).map(a => a.id).filter(Boolean);
        let currentRead = [];
        try { currentRead = JSON.parse(localStorage.getItem('read_spot_audit_ids') || '[]'); } catch(e) {}
        let merged = Array.from(new Set([...currentRead, ...allIds]));
        localStorage.setItem('read_spot_audit_ids', JSON.stringify(merged));
        window.dispatchEvent(new Event('storage'));
    } catch(e) {}
    checkAdminSpotAudits();
    renderAdminSpotAuditTable();
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Всички ревизии са маркирани като прегледани',
        showConfirmButton: false,
        timer: 1800
    });
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initAdminSpotAuditRealtime, 1500);
});
