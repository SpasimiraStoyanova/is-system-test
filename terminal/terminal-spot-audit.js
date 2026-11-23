// ==============================================================================
// МОДУЛ ЗА ИЗНЕНАДВАЩИ / ЕКСПРЕСНИ РЕВИЗИИ (SPOT AUDITS) - ТЕРМИНАЛ
// ==============================================================================

let activeSpotAudits = [];
let spotAuditRealtimeChannel = null;
window.pendingBlockingSpotAudit = null;

function normalizeAuditStr(str) {
    if (!str) return '';
    return String(str).replace(/[\u00A0\s]+/g, ' ').trim().toLowerCase();
}

function matchTerminalMachine(targetMachine) {
    if (!targetMachine) return false;
    let tNorm = normalizeAuditStr(targetMachine);
    if (!currentMachine || currentMachine === 'ВСИЧКИ') return true;
    let selected = currentMachine.split(',').map(m => normalizeAuditStr(m)).filter(Boolean);
    return selected.some(m => m === tNorm || tNorm.includes(m) || m.includes(tNorm));
}

/**
 * Проверка дали работникът в момента има текущо поета активна задача
 */
function hasWorkerActiveTask() {
    if (typeof activeTaskId !== 'undefined' && activeTaskId !== null) return true;
    if (typeof globalTasks !== 'undefined' && Array.isArray(globalTasks) && globalTasks.some(t => t.isTaken)) return true;
    return false;
}

/**
 * Проверка дали има висяща ревизия, която блокира поемането на нови задачи
 */
function isSpotAuditPendingBlocking() {
    return (Array.isArray(activeSpotAudits) && activeSpotAudits.length > 0 && !hasWorkerActiveTask());
}

/**
 * Звуков сигнал (звънец) при поява на блокираща изненадваща ревизия
 */
function playSpotAuditChime() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now);         // C5
        osc.frequency.setValueAtTime(659.25, now + 0.12);   // E5
        osc.frequency.setValueAtTime(783.99, now + 0.24);   // G5
        osc.frequency.setValueAtTime(1046.50, now + 0.36);  // C6

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.9);
    } catch (e) {
        console.warn('Spot audit audio skipped:', e);
    }
}

async function checkPendingSpotAudits() {
    const area = document.getElementById('terminalSpotAuditArea');

    try {
        const { data, error } = await client
            .from('spot_audits')
            .select('*')
            .eq('status', 'PENDING')
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('Грешка при проверка за ревизии:', error.message);
            return;
        }

        if (!data || data.length === 0) {
            activeSpotAudits = [];
            if (window.pendingBlockingSpotAudit) {
                window.pendingBlockingSpotAudit = null;
                Swal.close();
            }
            if (area) {
                area.style.display = 'none';
                area.innerHTML = '';
            }
            return;
        }

        // Филтрираме само проверките, отнасящи се за това работно място И за този работник (ако е насочена персонално)
        let myAudits = data.filter(audit => {
            // 1. Проверка на работното място
            if (!matchTerminalMachine(audit.target_machine)) return false;

            // 2. Проверка за конкретен работник (ако ревизията е насочена персонално)
            if (audit.target_worker && audit.target_worker.trim() !== '' && audit.target_worker !== 'ВСИЧКИ') {
                let curOp = normalizeAuditStr(currentOperator);
                let targetW = normalizeAuditStr(audit.target_worker);
                if (curOp !== targetW && !curOp.includes(targetW) && !targetW.includes(curOp)) {
                    // Тази ревизия е насочена персонално към друг колега
                    return false;
                }
            }

            return true;
        });

        if (myAudits.length === 0) {
            activeSpotAudits = [];
            if (window.pendingBlockingSpotAudit) {
                window.pendingBlockingSpotAudit = null;
                Swal.close();
            }
            if (area) {
                area.style.display = 'none';
                area.innerHTML = '';
            }
            return;
        }

        activeSpotAudits = myAudits;

        const isBusyWithTask = hasWorkerActiveTask();

        if (isBusyWithTask) {
            // Служителят работи по поета задача:
            // 1. Не го прекъсваме с блокиращ прозорец!
            // 2. Показваме информационен банер в горната част, че след отчитане ще се изисква ревизия
            if (window.pendingBlockingSpotAudit) {
                window.pendingBlockingSpotAudit = null;
                Swal.close();
            }
            renderSpotAuditBanners(myAudits, true);
        } else {
            // Служителят НЯМА поета задача (свободен е или току-що я отчете):
            // 1. Показваме банера в горната част
            renderSpotAuditBanners(myAudits, false);
            // 2. Блокираме веднага терминала с модален прозорец и звуков сигнал!
            showBlockingSpotAuditModal(myAudits[0]);
        }

    } catch (err) {
        console.error('Грешка в checkPendingSpotAudits:', err);
    }
}

function renderSpotAuditBanners(audits, isBusyWithTask = false) {
    const area = document.getElementById('terminalSpotAuditArea');
    if (!area) return;

    let html = '';
    audits.forEach(audit => {
        let expQty = parseFloat(audit.expected_qty) || 0;
        let createdTime = '';
        try {
            let d = new Date(audit.created_at);
            createdTime = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
        } catch(e) {}

        html += `
            <div class="spot-audit-card" id="spot_card_${audit.id}" style="
                background: linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%);
                border: 2px solid #c084fc;
                border-left: 8px solid #9333ea;
                border-radius: 16px;
                padding: 16px 18px;
                margin-bottom: 14px;
                box-shadow: 0 10px 25px -5px rgba(147, 51, 234, 0.18);
                position: relative;
                animation: pulseBorder 2.5s infinite;
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.5em; line-height: 1;">📋</span>
                        <span style="font-weight: 900; color: #6b21a8; font-size: 1.05em; text-transform: uppercase; letter-spacing: 0.5px;">
                            ЕКСПРЕСНА РЕВИЗИЯ НА НАЛИЧНОСТТА
                        </span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        ${isBusyWithTask ? `
                            <span style="background: #fef3c7; color: #b45309; font-weight: 800; font-size: 0.82em; padding: 3px 10px; border-radius: 12px; border: 1px solid #fde68a;">
                                ⏳ Ще се блокира след отчитане
                            </span>
                        ` : `
                            <span style="background: #fee2e2; color: #b91c1c; font-weight: 800; font-size: 0.82em; padding: 3px 10px; border-radius: 12px; border: 1px solid #fca5a5;">
                                🔒 Терминалът е блокиран
                            </span>
                        `}
                        <span style="background: #f3e8ff; color: #7e22ce; font-weight: 800; font-size: 0.82em; padding: 3px 10px; border-radius: 12px; border: 1px solid #d8b4fe;">
                            ⏰ ${createdTime ? createdTime + ' ч.' : 'Сега'}
                        </span>
                    </div>
                </div>

                <div style="background: white; border-radius: 10px; padding: 12px 14px; border: 1px solid #e9d5ff; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px; flex-wrap: wrap; gap: 6px;">
                        <span style="font-size: 0.9em; color: #64748b; font-weight: 700;">
                            Работно място: <b style="color: #1e293b; font-size: 1.05em;">${escapeAuditHtml(audit.target_machine)}</b>
                        </span>
                        <span style="font-size: 0.9em; color: #64748b; font-weight: 700;">
                            Операция: <b style="color: #4338ca;">${escapeAuditHtml(audit.operation)}</b>
                        </span>
                    </div>
                    ${audit.target_worker ? `
                        <div style="margin-bottom: 6px;">
                            <span style="background: #e0e7ff; color: #3730a3; font-weight: 800; font-size: 0.85em; padding: 2px 8px; border-radius: 6px; border: 1px solid #c7d2fe;">
                                🎯 Персонална проверка за: <b>${escapeAuditHtml(audit.target_worker)}</b>
                            </span>
                        </div>
                    ` : ''}
                    <div style="font-size: 1.15em; font-weight: 900; color: #1e293b;">
                        📦 Детайл: <span style="color: #7e22ce;">${escapeAuditHtml(audit.part_code)}</span>
                    </div>
                </div>

                ${isBusyWithTask ? `
                    <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; color: #92400e; font-size: 0.92em; font-weight: 700;">
                        💡 В момента работите по активна задача. Довършете я спокойно – веднага щом я отчетете, терминалът ще изисква потвърждение на тази наличност. (Можете да отчетете и предварително от бутоните по-долу).
                    </div>
                ` : ''}

                <div style="font-size: 0.95em; font-weight: 700; color: #3b0764; margin-bottom: 8px;">
                    Моля, пребройте физическите бройки пред машината и въведете отчета:
                </div>

                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <input type="number" id="spot_input_${audit.id}" min="0" placeholder="Въведете преброената бройка..." inputmode="numeric" style="
                        flex: 1 1 200px;
                        padding: 12px 14px;
                        font-size: 1.15em;
                        font-weight: 800;
                        border: 2px solid #a855f7;
                        border-radius: 10px;
                        outline: none;
                        box-sizing: border-box;
                        color: #1e293b;
                        background: white;
                    ">
                    <button type="button" onclick="submitSpotAuditCustom(${audit.id}, ${expQty})" style="
                        flex: 0 0 auto;
                        background: #7c3aed;
                        color: white;
                        border: none;
                        border-radius: 10px;
                        padding: 12px 22px;
                        font-size: 1em;
                        font-weight: 900;
                        cursor: pointer;
                        white-space: nowrap;
                        box-shadow: 0 4px 10px rgba(124, 58, 237, 0.3);
                    ">
                        🚀 ИЗПРАТИ РЕВИЗИЯ
                    </button>
                </div>
            </div>
        `;
    });

    area.innerHTML = html;
    area.style.display = 'block';
}

/**
 * Показва НАПЪЛНО БЛОКИРАЩ модален екран за ревизия (при липса на текуща задача)
 */
function showBlockingSpotAuditModal(audit) {
    if (!audit) return;
    if (window.pendingBlockingSpotAudit && window.pendingBlockingSpotAudit.id === audit.id) {
        // Вече е отворен за тази ревизия
        return;
    }
    window.pendingBlockingSpotAudit = audit;

    playSpotAuditChime();
    if (navigator.vibrate) navigator.vibrate([250, 100, 250, 100, 450]);

    const expQty = parseFloat(audit.expected_qty) || 0;
    let createdTime = '';
    try {
        let d = new Date(audit.created_at);
        createdTime = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    } catch(e) {}

    const isZeroExpected = (expQty === 0);

    const modalHtml = `
        <div style="text-align: left; font-size: 1em; color: #1e293b; line-height: 1.5; padding: 2px;">
            <div style="background: linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%); border: 2px solid #c084fc; border-left: 8px solid #9333ea; border-radius: 12px; padding: 14px; margin-bottom: 14px; box-shadow: 0 4px 12px rgba(147,51,234,0.12);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
                    <span style="font-weight: 900; color: #6b21a8; font-size: 1.05em; text-transform: uppercase;">
                        📋 ЕКСПРЕСНА РЕВИЗИЯ НА НАЛИЧНОСТТА
                    </span>
                    <span style="background: #f3e8ff; color: #7e22ce; font-weight: 800; font-size: 0.82em; padding: 2px 8px; border-radius: 10px; border: 1px solid #d8b4fe;">
                        ⏰ ${createdTime ? createdTime + ' ч.' : 'Сега'}
                    </span>
                </div>
                <div style="background: white; border-radius: 8px; padding: 10px 12px; border: 1px solid #e9d5ff;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px; flex-wrap: wrap; gap: 4px; font-size: 0.92em; color: #64748b; font-weight: 700;">
                        <span>Работно място: <b style="color: #1e293b;">${escapeAuditHtml(audit.target_machine)}</b></span>
                        <span>Операция: <b style="color: #4338ca;">${escapeAuditHtml(audit.operation)}</b></span>
                    </div>
                    ${audit.target_worker ? `
                        <div style="margin-bottom: 4px;">
                            <span style="background: #e0e7ff; color: #3730a3; font-weight: 800; font-size: 0.82em; padding: 2px 6px; border-radius: 6px; border: 1px solid #c7d2fe;">
                                🎯 Персонална проверка за: <b>${escapeAuditHtml(audit.target_worker)}</b>
                            </span>
                        </div>
                    ` : ''}
                    <div style="font-size: 1.18em; font-weight: 900; color: #1e293b; margin-top: 4px;">
                        📦 Детайл: <span style="color: #7e22ce;">${escapeAuditHtml(audit.part_code)}</span>
                    </div>
                </div>
            </div>

            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 12px; margin-bottom: 14px; color: #991b1b; font-size: 0.95em; font-weight: 700; line-height: 1.4;">
                🔒 <b>Внимание:</b> Терминалът е блокиран. За да поемете нова задача, първо трябва да преброите и потвърдите физическата наличност пред машината!
            </div>

            <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-bottom: 4px;">
                <label style="display: block; font-size: 1.05em; font-weight: 800; color: #1e293b; margin-bottom: 8px;">
                    🔢 Преброени физически бройки пред машината:
                </label>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <input type="number" id="input_modal_custom_qty" min="0" placeholder="Въведете преброената бройка..." inputmode="numeric" autofocus style="
                        width: 100%;
                        border: 2px solid #a855f7;
                        border-radius: 10px;
                        padding: 12px 14px;
                        font-size: 1.3em;
                        font-weight: 900;
                        color: #581c87;
                        background: white;
                        box-sizing: border-box;
                        outline: none;
                        text-align: center;
                    ">
                    <button type="button" id="btn_modal_submit_custom" style="
                        width: 100%;
                        background: #7c3aed;
                        color: white;
                        border: none;
                        border-radius: 10px;
                        padding: 14px;
                        font-size: 1.1em;
                        font-weight: 900;
                        cursor: pointer;
                        box-shadow: 0 4px 12px rgba(124, 58, 237, 0.35);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                    ">
                        <span>🚀 ИЗПРАТИ РЕВИЗИЯТА</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    Swal.fire({
        title: '📋 РЕВИЗИЯ НА НАЛИЧНОСТ',
        html: modalHtml,
        icon: 'info',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        showCancelButton: false,
        showCloseButton: false,
        allowEnterKey: false,
        backdrop: 'rgba(15, 23, 42, 0.92)',
        didOpen: () => {
            const btnCustom = document.getElementById('btn_modal_submit_custom');
            const inputCustom = document.getElementById('input_modal_custom_qty');

            if (inputCustom) {
                setTimeout(() => inputCustom.focus(), 150);
                inputCustom.addEventListener('keydown', async (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (btnCustom) btnCustom.click();
                    }
                });
            }

            if (btnCustom && inputCustom) {
                btnCustom.onclick = async () => {
                    const val = parseFloat(inputCustom.value);
                    if (isNaN(val) || val < 0) {
                        alert('Моля, въведете валидна бройка (0 или повече)!');
                        inputCustom.focus();
                        return;
                    }
                    await submitSpotAuditResponse(audit.id, expQty, val);
                };
            }
        }
    });
}

function escapeAuditHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function submitSpotAuditCustom(auditId, expectedQty) {
    const input = document.getElementById('spot_input_' + auditId);
    if (!input) return;
    const val = parseFloat(input.value);
    if (isNaN(val) || val < 0) {
        Swal.fire('Въведете бройка', 'Моля, въведете реално преброения брой (0 или повече)!', 'warning');
        return;
    }
    await submitSpotAuditResponse(auditId, expectedQty, val);
}

async function submitSpotAuditResponse(auditId, expectedQty, reportedQty) {
    let diff = reportedQty - expectedQty;
    let isDiscrepancy = (diff !== 0);

    const confirmRes = await Swal.fire({
        title: 'Потвърждение на ревизия',
        html: `Потвърждавате ли, че пред машината са преброени точно <b style="color:#7e22ce; font-size:1.3em;">${reportedQty} бр.</b>?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#7e22ce',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: '✅ ДА, ПОТВЪРЖДАВАМ',
        cancelButtonText: 'Отказ',
        allowOutsideClick: false,
        allowEscapeKey: false
    });

    if (!confirmRes.isConfirmed) {
        // Ако служителят натисне "Отказ" при потвърждението, възстановяваме блокиращия екран!
        window.pendingBlockingSpotAudit = null;
        if (!hasWorkerActiveTask()) {
            const currentAudit = activeSpotAudits.find(a => a.id === auditId);
            if (currentAudit) {
                showBlockingSpotAuditModal(currentAudit);
            }
        }
        return;
    }

    Swal.fire({ title: 'Запис на ревизията...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        let targetAudit = activeSpotAudits.find(a => a.id === auditId);
        if (!targetAudit) {
            try {
                const { data } = await client.from('spot_audits').select('*').eq('id', auditId).single();
                if (data) targetAudit = data;
            } catch(e) {}
        }
        let auditNotes = {};
        try {
            auditNotes = JSON.parse((targetAudit && targetAudit.notes) || '{}');
        } catch(e) {}

        const worker = currentOperator || 'ОПЕРАТОР';
        const nowIso = new Date().toISOString();
        const status = isDiscrepancy ? 'DISCREPANCY' : 'MATCH';

        const { error } = await client
            .from('spot_audits')
            .update({
                reported_qty: reportedQty,
                difference_qty: diff,
                status: status,
                worker_name: worker,
                answered_at: nowIso
            })
            .eq('id', auditId);

        if (error) throw error;

        // Автоматична обработка при ревизия за дефицит
        if (auditNotes && auditNotes.type === 'auto_deficit_check') {
            await handleAutoDeficitAuditResult(targetAudit, auditNotes, reportedQty, worker);
        }

        window.pendingBlockingSpotAudit = null;

        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

        await Swal.fire({
            icon: 'success',
            title: 'Ревизията е записана!',
            html: `Отчетът беше записан успешно на името на:<br><b style="color:#4338ca; font-size:1.15em;">${worker}</b><br><small style="color:#64748b;">Дата и час: ${new Date().toLocaleTimeString('bg-BG')}</small>`,
            timer: 2000,
            showConfirmButton: false
        });

        // Премахваме банера от екрана
        const card = document.getElementById('spot_card_' + auditId);
        if (card) card.remove();
        
        // Презареждаме проверките за следваща висяща ревизия
        await checkPendingSpotAudits();

        if (typeof loadTasks === 'function') {
            loadTasks();
        }

    } catch (err) {
        console.error('Грешка при запис на ревизия:', err);
        Swal.fire('Грешка при запис', err.message, 'error');
    }
}

// Realtime абонамент за мигновен сигнал при пусната проверка
function initSpotAuditsRealtime() {
    try {
        if (!client) return;
        spotAuditRealtimeChannel = client.channel('spot-audits-live-terminal')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'spot_audits' }, (payload) => {
                checkPendingSpotAudits();
            })
            .subscribe();
    } catch (e) {
        console.warn('Realtime subscription error for spot_audits:', e);
    }
}

// Автоматично стартиране при зареждане
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        checkPendingSpotAudits();
        initSpotAuditsRealtime();
    }, 1500);

    // Периодична фонова проверка на всеки 25 секунди
    setInterval(checkPendingSpotAudits, 25000);
});

async function handleAutoDeficitAuditResult(audit, auditNotes, reportedQty, worker) {
    try {
        const partName = auditNotes.reported_part || (audit && audit.part_code);
        const missingQty = parseFloat(auditNotes.missing_qty) || 0;
        const intermediateOps = auditNotes.intermediate_ops || [];
        const upstreamOpNum = auditNotes.upstream_op_num;
        const upstreamOpName = auditNotes.upstream_op_name;
        const upstreamMachine = auditNotes.upstream_machine;
        const reportedOpNum = auditNotes.reported_op_num;
        const reportedOpName = auditNotes.reported_op_name;
        const reportedMachine = auditNotes.reported_machine;

        if (reportedQty === 0) {
            // СЛУЧАЙ А: Работникът на Оп. 10 потвърждава 0 бр. налични (детайлите са преминали транзит!)
            // 1. Нулираме буфера на Оп. 10 в inventory (тъй като физически детайлите са напуснали тази операция)
            try {
                await client
                    .from('inventory')
                    .update({ 'Количество': 0 })
                    .ilike('ID Детайл', partName.trim())
                    .ilike('Операция', upstreamOpName.trim());
            } catch(invErr) {
                console.warn('Inventory adjust error:', invErr);
            }

            // 2. Насочваме каскадата към първата междинна операция (напр. Оп. 20 Пудрене 2)
            if (intermediateOps.length > 0) {
                const nextOp = intermediateOps[0];
                const remainingOps = intermediateOps.slice(1);

                const { data: existingReqs } = await client
                    .from('material_requests')
                    .select('*')
                    .ilike('part_name', partName.trim())
                    .eq('status', 'Чакаща')
                    .order('created_at', { ascending: false })
                    .limit(1);

                const nextNotes = {
                    type: 'discrepancy',
                    phase: 'reconciliation_cascade',
                    reported_by_part: partName,
                    reported_qty: auditNotes.reported_qty,
                    missing_qty: missingQty,
                    current_reconcile_op: nextOp,
                    remaining_cascade_ops: remainingOps,
                    upstream_op_num: upstreamOpNum,
                    upstream_op_name: upstreamOpName,
                    upstream_machine: upstreamMachine,
                    target_part: partName,
                    target_op_num: nextOp.opNum,
                    target_op_name: nextOp.opName,
                    target_machine: nextOp.machine,
                    audit_confirmed_by: worker,
                    audit_result: 'TRANSIT_CONFIRMED'
                };

                const nextReasons = `Разминаване в отчетите: Ревизията на Оп. ${upstreamOpNum} (${upstreamOpName}) на ${upstreamMachine} потвърди 0 бр. налични (детайлите са преминали транзит). Моля, доотчетете ${missingQty} бр. на Оп. ${nextOp.opNum} (${nextOp.opName}) на ${nextOp.machine}!`;

                if (existingReqs && existingReqs.length > 0) {
                    await client
                        .from('material_requests')
                        .update({
                            target_part: partName,
                            target_op_num: String(nextOp.opNum),
                            target_op_name: nextOp.opName,
                            target_machine: nextOp.machine,
                            reasons: nextReasons,
                            notes: JSON.stringify(nextNotes)
                        })
                        .eq('id', existingReqs[0].id);
                } else {
                    await client
                        .from('material_requests')
                        .insert([{
                            task_id: 'reconcile_' + Date.now(),
                            part_name: partName,
                            op_name: nextOp.opName,
                            machine: nextOp.machine,
                            operator: worker,
                            status: 'Чакаща',
                            reasons: nextReasons,
                            target_part: partName,
                            target_op_num: String(nextOp.opNum),
                            target_op_name: nextOp.opName,
                            target_machine: nextOp.machine,
                            notes: JSON.stringify(nextNotes)
                        }]);
                }
            }
        } else {
            // СЛУЧАЙ Б: Работникът на Оп. 10 потвърждава, че детайлите са налични пред него!
            // Грешка при отчитането на Оп. 40 (надписване / грешен кашон)
            const alertNotes = {
                type: 'discrepancy',
                phase: 'over_reporting_detected',
                reported_by_part: partName,
                reported_qty: auditNotes.reported_qty,
                missing_qty: missingQty,
                upstream_op_num: upstreamOpNum,
                upstream_op_name: upstreamOpName,
                upstream_machine: upstreamMachine,
                upstream_confirmed_qty: reportedQty,
                audit_confirmed_by: worker,
                audit_result: 'STOCK_PRESENT'
            };

            const alertReasons = `🚨 Внимание: Оп. ${upstreamOpNum} (${upstreamOpName}) на ${upstreamMachine} потвърди физическа наличност от ${reportedQty} бр.! Грешка при отчет на Оп. ${reportedOpNum} (${reportedOpName}) - надписани ${missingQty} бр. Сигнал към Началник смяна.`;

            const { data: existingReqs } = await client
                .from('material_requests')
                .select('*')
                .ilike('part_name', partName.trim())
                .eq('status', 'Чакаща')
                .order('created_at', { ascending: false })
                .limit(1);

            if (existingReqs && existingReqs.length > 0) {
                await client
                    .from('material_requests')
                    .update({
                        target_machine: reportedMachine || 'Склад',
                        target_op_num: String(reportedOpNum),
                        target_op_name: reportedOpName,
                        reasons: alertReasons,
                        notes: JSON.stringify(alertNotes)
                    })
                    .eq('id', existingReqs[0].id);
            }
        }
    } catch(err) {
        console.error('handleAutoDeficitAuditResult error:', err);
    }
}

