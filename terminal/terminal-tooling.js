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

