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

                ${expQty === 0 ? `
                    <div style="font-size: 1.02em; font-weight: 700; color: #3b0764; margin-bottom: 14px; line-height: 1.4;">
                        💬 В склада за тази операция се водят: <b style="font-size: 1.15em; color: #b45309; background: #fffbeb; padding: 2px 8px; border-radius: 6px; border: 1px solid #fde68a;">0 бр. (Няма налични)</b>
                        <br><span style="font-size: 0.92em; color: #581c87; font-weight: 600;">Моля, проверете и потвърдете колко бройки физически има пред машината:</span>
                    </div>

                    <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: stretch;">
                        <button type="button" onclick="submitSpotAuditResponse(${audit.id}, 0, 0)" style="
                            flex: 1 1 200px;
                            background: #16a34a;
                            color: white;
                            border: none;
                            border-radius: 10px;
                            padding: 13px 16px;
                            font-size: 1.02em;
                            font-weight: 900;
                            cursor: pointer;
                            box-shadow: 0 4px 10px rgba(22, 163, 74, 0.25);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                            transition: transform 0.1s;
                        ">
                            <span>👍 ПОТВЪРЖДАВАМ: 0 БР. (Няма налични)</span>
                        </button>

                        <div style="
                            flex: 1 1 240px;
                            display: flex;
                            gap: 6px;
                            background: white;
                            border: 2px solid #d8b4fe;
                            border-radius: 10px;
                            padding: 4px;
                        ">
                            <input type="number" id="spot_input_${audit.id}" min="0" placeholder="Ако има бройки, въведете тук..." inputmode="numeric" style="
                                flex: 1;
                                min-width: 0;
                                border: none;
                                outline: none;
                                font-size: 1.05em;
                                font-weight: 800;
                                padding: 8px 10px;
                                color: #1e293b;
                            ">
                            <button type="button" onclick="submitSpotAuditCustom(${audit.id}, 0)" style="
                                background: #ea580c;
                                color: white;
                                border: none;
                                border-radius: 8px;
                                padding: 8px 14px;
                                font-size: 0.92em;
                                font-weight: 800;
                                cursor: pointer;
                                white-space: nowrap;
                            ">
                                ✏️ ОТЧЕТИ
                            </button>
                        </div>
                    </div>
                ` : `
                    <div style="font-size: 1.02em; font-weight: 700; color: #3b0764; margin-bottom: 14px; line-height: 1.4;">
                        💬 По склад за тази операция се водят: <b style="font-size: 1.25em; color: #7e22ce; background: white; padding: 2px 8px; border-radius: 6px; border: 1px solid #d8b4fe;">${expQty} бр.</b>
                        <br><span style="font-size: 0.92em; color: #581c87; font-weight: 600;">Моля, проверете бройките пред вас и потвърдете:</span>
                    </div>

                    <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: stretch;">
                        <button type="button" onclick="submitSpotAuditResponse(${audit.id}, ${expQty}, ${expQty})" style="
                            flex: 1 1 200px;
                            background: #16a34a;
                            color: white;
                            border: none;
                            border-radius: 10px;
                            padding: 13px 16px;
                            font-size: 1.02em;
                            font-weight: 900;
                            cursor: pointer;
                            box-shadow: 0 4px 10px rgba(22, 163, 74, 0.25);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                            transition: transform 0.1s;
                        ">
                            <span>👍 ДА, ТОЧНО ${expQty} БР.</span>
                        </button>

                        <div style="
                            flex: 1 1 240px;
                            display: flex;
                            gap: 6px;
                            background: white;
                            border: 2px solid #d8b4fe;
                            border-radius: 10px;
                            padding: 4px;
                        ">
                            <input type="number" id="spot_input_${audit.id}" min="0" placeholder="Друг брой..." inputmode="numeric" style="
                                flex: 1;
                                min-width: 0;
                                border: none;
                                outline: none;
                                font-size: 1.05em;
                                font-weight: 800;
                                padding: 8px 10px;
                                color: #1e293b;
                            ">
                            <button type="button" onclick="submitSpotAuditCustom(${audit.id}, ${expQty})" style="
                                background: #ea580c;
                                color: white;
                                border: none;
                                border-radius: 8px;
                                padding: 8px 14px;
                                font-size: 0.92em;
                                font-weight: 800;
                                cursor: pointer;
                                white-space: nowrap;
                            ">
                                ✏️ ПОТВЪРДИ
                            </button>
                        </div>
                    </div>
                `}
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

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; margin-bottom: 4px;">
                <div style="font-size: 1.05em; font-weight: 700; color: #1e293b; margin-bottom: 12px; line-height: 1.4;">
                    ${isZeroExpected 
                        ? `💬 В склада се водят: <b style="color: #b45309; background: #fffbeb; padding: 2px 8px; border-radius: 6px; border: 1px solid #fde68a;">0 бр. (Няма налични)</b><br><span style="font-size: 0.9em; color: #475569; font-weight: 600;">Колко бройки физически има пред машината?</span>` 
                        : `💬 В склада за тази операция се водят: <b style="color: #7e22ce; background: white; padding: 2px 8px; border-radius: 6px; border: 1px solid #d8b4fe;">${expQty} бр.</b><br><span style="font-size: 0.9em; color: #475569; font-weight: 600;">Моля, проверете бройките пред вас и изберете:</span>`
                    }
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button type="button" id="btn_modal_confirm_exact" style="
                        width: 100%;
                        background: #16a34a;
                        color: white;
                        border: none;
                        border-radius: 10px;
                        padding: 14px;
                        font-size: 1.05em;
                        font-weight: 900;
                        cursor: pointer;
                        box-shadow: 0 4px 10px rgba(22, 163, 74, 0.25);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                    ">
                        <span>👍 ${isZeroExpected ? 'ПОТВЪРЖДАВАМ: 0 БР. (Няма налични)' : `ДА, ТОЧНО ${expQty} БР.`}</span>
                    </button>

                    <div style="display: flex; gap: 8px; align-items: center; background: white; border: 2px solid #d8b4fe; border-radius: 10px; padding: 4px;">
                        <input type="number" id="input_modal_custom_qty" min="0" placeholder="${isZeroExpected ? 'Ако има бройки, въведете...' : 'Ако има разлика, въведете...'}" inputmode="numeric" style="
                            flex: 1;
                            min-width: 0;
                            border: none;
                            outline: none;
                            font-size: 1.05em;
                            font-weight: 800;
                            padding: 8px 10px;
                            color: #1e293b;
                        ">
                        <button type="button" id="btn_modal_submit_custom" style="
                            background: #ea580c;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            padding: 10px 16px;
                            font-size: 0.95em;
                            font-weight: 800;
                            cursor: pointer;
                            white-space: nowrap;
                        ">
                            ✏️ ${isZeroExpected ? 'ОТЧЕТИ' : 'ПОТВЪРДИ РАЗЛИКА'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    Swal.fire({
        title: '⚠️ ИЗНЕНАДВАЩА РЕВИЗИЯ!',
        html: modalHtml,
        icon: 'warning',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        showCancelButton: false,
        showCloseButton: false,
        allowEnterKey: false,
        backdrop: 'rgba(15, 23, 42, 0.92)',
        didOpen: () => {
            const btnExact = document.getElementById('btn_modal_confirm_exact');
            const btnCustom = document.getElementById('btn_modal_submit_custom');
            const inputCustom = document.getElementById('input_modal_custom_qty');

            if (btnExact) {
                btnExact.onclick = async () => {
                    await submitSpotAuditResponse(audit.id, expQty, expQty);
                };
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

    let confirmMsg = '';
    if (isDiscrepancy) {
        if (expectedQty === 0) {
            confirmMsg = `В склада се водят <b>0 бр.</b>, а отчитате намерени пред машината <b style="color:#dc2626; font-size:1.2em;">${reportedQty} бр.</b><br><br>Потвърждавате ли, че физически има толкова бройки?`;
        } else {
            confirmMsg = `Ще отчетете разлика: преброени <b style="color:#dc2626; font-size:1.2em;">${reportedQty} бр.</b> (в склада се водят: ${expectedQty} бр. | разлика: ${diff > 0 ? '+' : ''}${diff} бр.).<br><br>Потвърждавате ли, че физически сте преброили точно толкова?`;
        }
    } else {
        confirmMsg = (expectedQty === 0)
            ? `Потвърждавате, че пред машината <b>няма налични бройки (0 бр.)</b>, както се води и по склад.`
            : `Потвърждавате, че пред машината има точно <b style="color:#16a34a; font-size:1.2em;">${reportedQty} бр.</b>, както се води по склад.`;
    }

    const confirmRes = await Swal.fire({
        title: isDiscrepancy ? '⚠️ Разминаване в бройките' : 'Потвърждение на ревизия',
        html: confirmMsg,
        icon: isDiscrepancy ? 'warning' : 'question',
        showCancelButton: true,
        confirmButtonColor: isDiscrepancy ? '#ea580c' : '#16a34a',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: '✅ ДА, ЗАПИШИ ОТЧЕТА',
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

        window.pendingBlockingSpotAudit = null;

        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

        await Swal.fire({
            icon: isDiscrepancy ? 'info' : 'success',
            title: isDiscrepancy ? 'Разминаването е записано' : 'Ревизията е точна!',
            html: `Отчетът за ревизията беше записан успешно на името на:<br><b style="color:#4338ca; font-size:1.15em;">${worker}</b><br><small style="color:#64748b;">Дата и час: ${new Date().toLocaleTimeString('bg-BG')}</small>`,
            timer: 2500,
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

