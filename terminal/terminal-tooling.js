// ==============================================================================
// MES ТЕРМИНАЛ: ЗАЯВКИ ЗА ИНСТРУМЕНТАЛНА ЕКИПИРОВКА & ЗАЧИСЛЕНИ УРЕДИ
// ==============================================================================

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

window.openTerminalToolingRequestModal = async function() {
    let mach = (typeof currentMachine !== 'undefined' && currentMachine) ? currentMachine : (localStorage.getItem('mes_machine') || 'ВСИЧКИ');
    if (!mach || mach === 'ВСИЧКИ' || mach === 'Всички') {
        Swal.fire('Изберете работно място', 'Моля, първо изберете конкретно работно място (машина), за да заявите екипировка.', 'info');
        return;
    }

    // Зареждаме типичните пластини/консумативи за това работно място от tooling_inventory
    let toolOptionsHtml = '';
    try {
        const { data: invTools } = await client.from('tooling_inventory')
            .select('item_code, name, machine_name')
            .order('item_code');
        
        let machTools = (invTools || []).filter(t => !t.machine_name || t.machine_name.includes(mach) || mach.includes(t.machine_name) || t.machine_name.toLowerCase() === 'общо');
        if (machTools.length > 0) {
            toolOptionsHtml = machTools.map(t => `<option value="${escapeHtml(t.item_code)} - ${escapeHtml(t.name)}">`).join('');
        }
    } catch(e) {}

    const { value: formValues } = await Swal.fire({
        title: '🛠️ Заявка за Пластини / Инструмент',
        html: `
            <div style="text-align: left; font-size: 0.9em; display: flex; flex-direction: column; gap: 10px;">
                <div>
                    <label style="font-weight: 700; color: #475569;">🏭 Работно Място:</label>
                    <input type="text" value="${escapeHtml(mach)}" readonly style="width: 100%; padding: 8px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; background: #f8fafc; font-weight: 800; color: #1e293b; box-sizing: border-box;">
                </div>
                <div>
                    <label style="font-weight: 700; color: #475569;">📦 Изискван инструмент / пластина: *</label>
                    <input type="text" id="swalToolItem" list="dl_tool_items" placeholder="напр. Пластина WNMG 080408, Фреза ф10..." style="width: 100%; padding: 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-weight: 700; box-sizing: border-box;">
                    <datalist id="dl_tool_items">${toolOptionsHtml}</datalist>
                </div>
                <div>
                    <label style="font-weight: 700; color: #475569;">⚠️ Спешност:</label>
                    <select id="swalToolUrgency" style="width: 100%; padding: 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-weight: 700; box-sizing: border-box;">
                        <option value="Нормална">🟢 Нормална (има още бройки)</option>
                        <option value="Спешна" selected>🟡 Спешна (свършва скоро)</option>
                        <option value="Машината спира!">🔴 КРИТИЧНО: Машината спира / счупен инструмент</option>
                    </select>
                </div>
                <div>
                    <label style="font-weight: 700; color: #475569;">📝 Допълнителна бележка / бройки (по избор):</label>
                    <input type="text" id="swalToolNotes" placeholder="напр. остана 1 кутийка, износена пластина" style="width: 100%; padding: 8px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: '🚀 Изпрати към Админ',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#d97706',
        preConfirm: () => {
            const item = document.getElementById('swalToolItem').value.trim();
            if (!item) {
                Swal.showValidationMessage('Моля, въведете име или код на инструмента/пластината!');
                return false;
            }
            return {
                tool_item: item,
                urgency: document.getElementById('swalToolUrgency').value,
                notes: document.getElementById('swalToolNotes').value.trim()
            };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Изпращане...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const opName = (typeof currentOperator !== 'undefined' && currentOperator) ? currentOperator : (localStorage.getItem('mes_operator') || 'Оператор');
            const { error } = await client.from('tooling_requests').insert([{
                workstation_name: mach,
                operator_name: opName,
                tool_item: formValues.tool_item,
                urgency: formValues.urgency,
                notes: formValues.notes || null,
                status: 'Чакаща'
            }]);
            if (error) throw error;
            Swal.fire({
                icon: 'success',
                title: 'Заявката е изпратена!',
                text: 'Администраторът получи известие и ще реагира.',
                timer: 2200,
                showConfirmButton: false
            });
        } catch(err) {
            Swal.fire('Грешка', 'Неуспешно изпращане: ' + err.message, 'error');
        }
    }
};

window.openTerminalAssignedToolsModal = async function() {
    let mach = (typeof currentMachine !== 'undefined' && currentMachine) ? currentMachine : (localStorage.getItem('mes_machine') || '');
    if (!mach || mach === 'ВСИЧКИ' || mach === 'Всички') {
        Swal.fire('Работно място', 'Моля, изберете конкретна машина/пост, за да видите зачислените ѝ инструменти.', 'info');
        return;
    }

    Swal.fire({ title: 'Зареждане на оборудването...', didOpen: () => Swal.showLoading() });
    try {
        const { data, error } = await client.from('factory_tools')
            .select('*')
            .ilike('workstation_name', `%${mach}%`);
        
        if (error && !error.message.includes('relation')) throw error;
        const tools = data || [];

        if (tools.length === 0) {
            Swal.fire({
                title: `🧰 Оборудване: ${escapeHtml(mach)}`,
                html: `
                    <div style="padding: 15px; color: #64748b; font-size: 0.95em;">
                        Към това работно място все още няма зачислени малки инструменти в регистъра.<br>
                        <small style="color: #94a3b8; display: block; margin-top: 8px;">(Могат да се зачислят от Административния панел в таб „Малки Инструменти & Уреди“)</small>
                    </div>
                `,
                icon: 'info',
                confirmButtonColor: '#2563eb'
            });
            return;
        }

        let listHtml = `
            <div style="text-align: left; max-height: 350px; overflow-y: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.88em;">
                    <thead>
                        <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; color: #475569;">
                            <th style="padding: 8px;">№</th>
                            <th style="padding: 8px;">Уред / Инструмент</th>
                            <th style="padding: 8px;">Калибрация / Статус</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        tools.forEach(t => {
            let calStatusHtml = '<span style="color:#64748b; font-size:0.85em;">Без срок</span>';
            if (t.calibration_due) {
                let today = new Date(); today.setHours(0,0,0,0);
                let due = new Date(t.calibration_due); due.setHours(0,0,0,0);
                let diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
                if (diffDays < 0) {
                    calStatusHtml = `<span style="color:#dc2626; font-weight:800; background:#fef2f2; border:1px solid #fecaca; padding:2px 6px; border-radius:4px; font-size:0.82em;">🚨 ИЗТЕКЛА (${t.calibration_due})</span>`;
                } else if (diffDays <= 30) {
                    calStatusHtml = `<span style="color:#d97706; font-weight:700; background:#fffbeb; border:1px solid #fde68a; padding:2px 6px; border-radius:4px; font-size:0.82em;">⚠️ До ${t.calibration_due} (${diffDays} дни)</span>`;
                } else {
                    calStatusHtml = `<span style="color:#15803d; font-weight:700; background:#f0fdf4; border:1px solid #bbf7d0; padding:2px 6px; border-radius:4px; font-size:0.82em;">🟢 До ${t.calibration_due}</span>`;
                }
            }
            if (t.calibration_date) {
                calStatusHtml += `<div style="font-size:0.75em; color:#64748b; margin-top:3px;">Последна проверка: <b>${t.calibration_date}</b></div>`;
            }

            listHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px; font-weight: 800; color: #2563eb;">${escapeHtml(t.tool_code)}</td>
                    <td style="padding: 8px;">
                        <div style="font-weight: 700; color: #1e293b;">${escapeHtml(t.tool_name)}</div>
                        <div style="font-size: 0.8em; color: #64748b;">${escapeHtml(t.category)}</div>
                    </td>
                    <td style="padding: 8px;">${calStatusHtml}</td>
                </tr>
            `;
        });

        listHtml += `</tbody></table></div>`;

        Swal.fire({
            title: `🧰 Зачислени уреди: ${escapeHtml(mach)}`,
            html: listHtml,
            confirmButtonText: 'Разбрах',
            confirmButtonColor: '#2563eb'
        });
    } catch(err) {
        Swal.fire('Грешка', err.message, 'error');
    }
};

// ==============================================================================
// ПРИЕМО-ПРЕДАВАТЕЛНИ ПРОТОКОЛИ ЗА ЛПС И ОБОРУДВАНЕ (ПОДПИС С ПИН КОД)
// ==============================================================================

let termProtocolPollInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    initTerminalEquipmentProtocols();
});

function initTerminalEquipmentProtocols() {
    checkPendingEquipmentProtocols();
    if (termProtocolPollInterval) clearInterval(termProtocolPollInterval);
    termProtocolPollInterval = setInterval(checkPendingEquipmentProtocols, 20000);
}

// Проверка за чакащи приемо-предавателни протоколи за текущия работник
window.checkPendingEquipmentProtocols = async function() {
    try {
        if (typeof client === 'undefined' || !client) return;
        const email = (typeof currentEmail !== 'undefined' && currentEmail) ? currentEmail : localStorage.getItem('mes_email');
        const alertArea = document.getElementById('terminalProtocolAlertArea');
        if (!email) {
            if (alertArea) alertArea.style.display = 'none';
            return;
        }

        const { data, error } = await client
            .from('equipment_protocols')
            .select('*')
            .eq('worker_email', email)
            .eq('status', 'Чака подпис')
            .order('created_at', { ascending: false });

        if (error) {
            if (error.code === '42P01' || (error.message && error.message.includes('relation'))) return;
            console.warn('checkPendingEquipmentProtocols error:', error.message);
            return;
        }

        if (!alertArea) return;

        if (!data || data.length === 0) {
            alertArea.style.display = 'none';
            alertArea.innerHTML = '';
            return;
        }

        // Показваме най-новия чакащ протокол с банер за подпис с ПИН
        const proto = data[0];
        const pendingCount = data.length;
        const countBadge = pendingCount > 1 ? `<span style="background:#ea580c; color:white; padding:2px 8px; border-radius:10px; font-size:0.75em; margin-left:6px;">Общо ${pendingCount} протокола</span>` : '';
        const itemsSummary = Array.isArray(proto.items) 
            ? proto.items.map(i => `${escapeHtml(i.name)} (${i.qty || 1} бр)`).join(', ')
            : 'зачислено оборудване';

        alertArea.innerHTML = `
            <div style="background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%); border: 2px solid #f97316; border-radius: 14px; padding: 14px 18px; box-shadow: 0 4px 14px rgba(249, 115, 22, 0.22); display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 14px; min-width: 250px; flex: 1;">
                    <div style="font-size: 2.2em; line-height: 1; flex-shrink: 0;">🦺</div>
                    <div>
                        <div style="font-weight: 900; color: #9a3412; font-size: 1.05em; display: flex; align-items: center; flex-wrap: wrap; gap: 6px;">
                            <span>НОВ ПРИЕМО-ПРЕДАВАТЕЛЕН ПРОТОКОЛ</span>
                            <span style="background: #ea580c; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.75em;">Чака подпис</span>
                            ${countBadge}
                        </div>
                        <div style="font-size: 0.88em; color: #7c2d12; margin-top: 4px; line-height: 1.35;">
                            Протокол № <b>${escapeHtml(proto.protocol_number)}</b> от <b>${escapeHtml(proto.handed_by || 'Администрация')}</b>:<br>
                            <span style="color:#431407; font-weight:700;">${itemsSummary}</span>
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <button type="button" onclick="openTerminalSignProtocolModal(${proto.id})" style="background: #ea580c; color: white; border: none; padding: 11px 20px; border-radius: 10px; font-weight: 900; font-size: 0.95em; cursor: pointer; white-space: nowrap; box-shadow: 0 3px 8px rgba(234, 88, 12, 0.35); display: flex; align-items: center; gap: 6px;">
                        <span>✍️</span> <span>Подпиши с ПИН код</span>
                    </button>
                    <button type="button" onclick="openTerminalDossier(); setTimeout(() => switchTermDossierTab('protocols'), 300);" style="background: white; color: #ea580c; border: 1.5px solid #ea580c; padding: 10px 16px; border-radius: 10px; font-weight: 800; font-size: 0.9em; cursor: pointer; white-space: nowrap;">
                        <span>📁</span> <span>Всички зачислени</span>
                    </button>
                </div>
            </div>
        `;
        alertArea.style.display = 'block';

    } catch (err) {
        console.warn('Error checking pending protocols:', err);
    }
};

// Отваряне на модала за преглед и подпис с личния ПИН код на работника
window.openTerminalSignProtocolModal = async function(protocolId) {
    Swal.fire({ title: 'Зареждане на протокола...', didOpen: () => Swal.showLoading() });
    try {
        const { data: proto, error } = await client
            .from('equipment_protocols')
            .select('*')
            .eq('id', protocolId)
            .single();

        if (error) throw error;
        if (!proto) return;

        let itemsRows = '';
        if (Array.isArray(proto.items)) {
            itemsRows = proto.items.map((it, idx) => `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px 10px; font-weight: bold; color: #64748b;">${idx + 1}</td>
                    <td style="padding: 8px 10px; font-weight: 800; color: #1e293b;">${escapeHtml(it.name)}</td>
                    <td style="padding: 8px 10px;"><span style="background: #f1f5f9; padding: 2px 7px; border-radius: 4px; font-size: 0.85em; font-weight: 600;">${escapeHtml(it.category || 'ЛПС')}</span></td>
                    <td style="padding: 8px 10px; font-weight: 900; color: #0284c7;">${it.qty || 1} бр.</td>
                    <td style="padding: 8px 10px; color: #64748b; font-size: 0.85em;">${escapeHtml(it.code || '-')}</td>
                </tr>
            `).join('');
        }

        const createdDateStr = proto.created_at ? new Date(proto.created_at).toLocaleDateString('bg-BG') : '';

        const { value: verified } = await Swal.fire({
            title: `🦺 Протокол ${escapeHtml(proto.protocol_number)}`,
            width: 650,
            html: `
                <div style="text-align: left; font-size: 0.9em; display: flex; flex-direction: column; gap: 12px;">
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; font-size: 0.88em; line-height: 1.4;">
                        <div>Служител: <b>${escapeHtml(proto.worker_name)}</b></div>
                        <div>Предал: <b>${escapeHtml(proto.handed_by || 'Администрация')}</b></div>
                        <div>Дата: <b>${createdDateStr}</b></div>
                    </div>

                    ${proto.notes ? `
                        <div style="background: #f0f9ff; border: 1.5px solid #bae6fd; border-radius: 8px; padding: 10px 14px; font-size: 0.88em; color: #0369a1; line-height: 1.4;">
                            <div style="font-weight: 800; color: #0284c7; margin-bottom: 3px; display: flex; align-items: center; gap: 5px;">
                                <span>📝</span> <span>Забележка / Указания от Администрацията:</span>
                            </div>
                            <div style="color: #0f172a; font-weight: 600;">${escapeHtml(proto.notes)}</div>
                        </div>
                    ` : ''}

                    <div style="font-weight: 800; color: #1e293b; font-size: 0.95em;">
                        📦 Списък на зачисляваните вещи, ЛПС и инструменти:
                    </div>

                    <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; max-height: 220px; overflow-y: auto;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.88em;">
                            <thead>
                                <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; text-align: left; color: #475569;">
                                    <th style="padding: 8px 10px;">#</th>
                                    <th style="padding: 8px 10px;">Наименование</th>
                                    <th style="padding: 8px 10px;">Вид</th>
                                    <th style="padding: 8px 10px;">Количество</th>
                                    <th style="padding: 8px 10px;">Код / Сериен №</th>
                                </tr>
                            </thead>
                            <tbody>${itemsRows}</tbody>
                        </table>
                    </div>

                    <div style="background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 8px; padding: 10px 12px; font-size: 0.84em; color: #92400e; line-height: 1.4;">
                        📜 <b>Декларация:</b> С въвеждане на личния си ПИН код удостоверявам, че получих описаните по-горе вещи и оборудване в изправно състояние и се задължавам да ги съхранявам и използвам по предназначение.
                    </div>

                    <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; text-align: center;">
                        <label style="font-weight: 800; color: #1e293b; display: block; margin-bottom: 6px; font-size: 0.95em;">
                            🔒 Въведете вашия ПИН код (паролата за досие/заплата):
                        </label>
                        <input type="password" id="swalProtoWorkerPin" class="swal2-input" placeholder="••••" maxlength="12" style="margin: 0 auto; width: 180px; text-align: center; font-size: 1.3em; letter-spacing: 5px; height: 42px;" autocomplete="off" autofocus>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: '✍️ Потвърди и Подпиши',
            cancelButtonText: 'Отказ',
            confirmButtonColor: '#ea580c',
            focusConfirm: false,
            preConfirm: async () => {
                const pinInput = document.getElementById('swalProtoWorkerPin');
                const enteredPin = pinInput ? pinInput.value.trim() : '';
                if (!enteredPin) {
                    Swal.showValidationMessage('Моля, въведете вашия ПИН код!');
                    return false;
                }

                // Проверка на ПИН кода спрямо таблицата personal
                try {
                    const { data: pData, error: pErr } = await client
                        .from('personal')
                        .select('password, Име')
                        .eq('Имейл', proto.worker_email)
                        .limit(1);

                    if (pErr) throw pErr;
                    if (!pData || pData.length === 0) {
                        Swal.showValidationMessage('Грешка: Не е намерен профил за този имейл.');
                        return false;
                    }

                    const expectedPassword = pData[0].password;
                    if (!expectedPassword || enteredPin !== String(expectedPassword).trim()) {
                        Swal.showValidationMessage('❌ Грешен ПИН код! Моля, опитайте отново.');
                        return false;
                    }

                    return true;
                } catch(err) {
                    Swal.showValidationMessage('Грешка при проверка: ' + err.message);
                    return false;
                }
            }
        });

        if (verified) {
            Swal.fire({ title: 'Записване на подписа...', didOpen: () => Swal.showLoading() });
            const { error: updErr } = await client
                .from('equipment_protocols')
                .update({
                    status: 'Приет',
                    signed_at: new Date().toISOString(),
                    signed_by_pin: true
                })
                .eq('id', protocolId);

            if (updErr) throw updErr;

            Swal.fire({
                icon: 'success',
                title: 'Протоколът е подписан успешно!',
                html: `
                    Протокол № <b>${escapeHtml(proto.protocol_number)}</b> е удостоверен с вашия ПИН код.<br>
                    Вещите са зачислени към вашето лично досие.
                `,
                timer: 3000,
                showConfirmButton: false
            });

            checkPendingEquipmentProtocols();
            if (typeof loadTermEquipmentProtocols === 'function' && currentDossierEmail) {
                loadTermEquipmentProtocols(currentDossierEmail);
            }
        }
    } catch(err) {
        Swal.fire('Грешка', err.message, 'error');
    }
};

// Зареждане на зачисленото оборудване и протоколите в Личното Досие
window.loadTermEquipmentProtocols = async function(email) {
    const listDiv = document.getElementById('termProtocolsList');
    const badge = document.getElementById('termProtocolsCountBadge');
    if (!listDiv) return;

    listDiv.innerHTML = '<div style="text-align: center; padding: 25px; color: #64748b;">⏳ Зареждане на протоколи и зачислени вещи...</div>';

    try {
        const { data, error } = await client
            .from('equipment_protocols')
            .select('*')
            .eq('worker_email', email)
            .order('created_at', { ascending: false });

        if (error) throw error;
        const protocols = data || [];

        if (badge) {
            badge.innerText = `${protocols.length} протокола`;
        }

        if (protocols.length === 0) {
            listDiv.innerHTML = `
                <div style="text-align: center; padding: 40px 15px; color: #64748b;">
                    <div style="font-size: 2.2em; margin-bottom: 8px;">🦺</div>
                    <div style="font-weight: 700;">Все още нямате издадени приемо-предавателни протоколи.</div>
                    <div style="font-size: 0.85em; color: #94a3b8; margin-top: 4px;">Когато администрацията ви зачисли работно облекло, ЛПС или уреди, те ще се появят тук.</div>
                </div>
            `;
            return;
        }

        let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
        protocols.forEach(proto => {
            let statusBadge = '<span style="background:#fff7ed; color:#c2410c; border:1px solid #fed7aa; padding:3px 8px; border-radius:8px; font-weight:800; font-size:0.82em;">⏳ Чака подпис</span>';
            let signActionBtn = `<button type="button" onclick="openTerminalSignProtocolModal(${proto.id})" style="background:#ea580c; color:white; border:none; padding:6px 12px; border-radius:6px; font-weight:800; font-size:0.82em; cursor:pointer;">✍️ Подпиши с ПИН</button>`;

            if (proto.status === 'Приет') {
                statusBadge = '<span style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; padding:3px 8px; border-radius:8px; font-weight:800; font-size:0.82em;">🟢 Приет (Подписан)</span>';
                signActionBtn = '';
            } else if (proto.status === 'Върнат') {
                statusBadge = '<span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:3px 8px; border-radius:8px; font-weight:800; font-size:0.82em;">🔄 Върнат в склад</span>';
                signActionBtn = '';
            }

            let itemsTable = '';
            if (Array.isArray(proto.items)) {
                itemsTable = proto.items.map(it => `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 4px 0; border-bottom: 1px dashed #e2e8f0; font-size:0.88em;">
                        <span style="font-weight:700; color:#1e293b;">• ${escapeHtml(it.name)} ${it.code ? `<small style="color:#64748b;">(${escapeHtml(it.code)})</small>` : ''}</span>
                        <span style="font-weight:800; color:#0284c7;">${it.qty || 1} бр.</span>
                    </div>
                `).join('');
            }

            const dateStr = proto.created_at ? new Date(proto.created_at).toLocaleDateString('bg-BG') : '';
            const signedStr = proto.signed_at ? `🔒 Подписан на ${new Date(proto.signed_at).toLocaleString('bg-BG')}` : '';

            html += `
                <div style="background: white; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 12px 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <div>
                            <div style="font-weight:900; color:#1e293b; font-size:0.95em;">Протокол № ${escapeHtml(proto.protocol_number)}</div>
                            <div style="font-size:0.8em; color:#64748b;">Дата: ${dateStr} | Предал: ${escapeHtml(proto.handed_by || 'Администрация')}</div>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            ${statusBadge}
                            ${signActionBtn}
                        </div>
                    </div>
                    <div style="background:#f8fafc; border-radius:8px; padding:8px 12px; margin-top:6px;">
                        ${itemsTable}
                    </div>
                    ${proto.notes ? `<div style="font-size:0.82em; color:#475569; margin-top:6px; background:#f8fafc; border:1px solid #e2e8f0; padding:6px 10px; border-radius:6px;">📝 <b>Забележка:</b> ${escapeHtml(proto.notes)}</div>` : ''}
                    ${signedStr ? `<div style="font-size:0.78em; color:#166534; font-weight:700; margin-top:6px;">${signedStr}</div>` : ''}
                </div>
            `;
        });
        html += '</div>';

        listDiv.innerHTML = html;
    } catch(err) {
        listDiv.innerHTML = `<div style="color:#dc2626; padding:20px; text-align:center;">Грешка при зареждане: ${err.message}</div>`;
    }
};


