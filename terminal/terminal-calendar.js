// ========================================================
// IS-SYSTEMS: ТЕРМИНАЛ - МОДУЛ ПОДДРЪЖКА И СЕРВИЗНИ ИЗВЕСТИЯ
// Комбинация от:
// 1. Известителна карта непосредствено над работните задачи
// 2. Бутон "📅 ПОДДРЪЖКА (N)" в горната лента с модал и история
// ПРАВИЛО ЗА СИГУРНОСТ:
// На терминала се показват ЕДИНСТВЕНО задачи за МАШИНИ с изрично
// разрешено отчитане (allow_terminal_completion = true)!
// Служебни, административни, винетки и автопарк записи са САМО за админ панела.
// ========================================================

let terminalMaintenanceState = {
    activeEvents: [],
    machineLogs: [],
    selectedMachines: []
};

// Функция за стартиране
function bootTerminalCalendar() {
    initTerminalCalendarUi();

    // Закачаме се към loadTasks, за да опресняваме поддръжката при смяна на машина или обновяване на задачи
    if (typeof window.loadTasks === 'function' && !window.loadTasks.__maintHooked) {
        const origLoadTasks = window.loadTasks;
        window.loadTasks = async function(...args) {
            const res = await origLoadTasks.apply(this, args);
            try { checkTerminalMaintenance(true); } catch(e){}
            return res;
        };
        window.loadTasks.__maintHooked = true;
    }

    // Първоначална проверка след кратко изчакване
    setTimeout(() => {
        checkTerminalMaintenance();
    }, 1000);

    // Периодична проверка на всеки 30 секунди
    setInterval(() => {
        checkTerminalMaintenance(true);
    }, 30000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootTerminalCalendar);
} else {
    bootTerminalCalendar();
}

// Добавяне на HTML елементи в терминала, ако липсват
function initTerminalCalendarUi() {
    // 1. Добавяне на бутон "📅 ПОДДРЪЖКА" в горната лента
    const actionButtons = document.querySelector('.action-buttons');
    if (actionButtons && !document.getElementById('btnTerminalCalendar')) {
        const calBtn = document.createElement('button');
        calBtn.id = 'btnTerminalCalendar';
        calBtn.className = 'btn-check btn-terminal-calendar';
        calBtn.style.cssText = 'background-color: #0891b2; display: flex; align-items: center; gap: 5px; position: relative; padding: 7px 10px; font-size: 0.82em;';
        calBtn.onclick = () => openTerminalCalendarModal();
        calBtn.innerHTML = `
            <span>📅 ПОДДРЪЖКА</span>
            <span id="terminalCalBadge" style="display: none; background: #ef4444; color: white; border-radius: 10px; padding: 1px 6px; font-size: 0.85em; font-weight: 900; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">0</span>
        `;
        actionButtons.insertBefore(calBtn, actionButtons.firstChild);
    }

    // 2. Добавяне на контейнер за сервизните карти точно над задачите
    const tasksContainer = document.getElementById('tasksContainer');
    if (tasksContainer && !document.getElementById('maintenanceAlertsContainer')) {
        const container = document.createElement('div');
        container.id = 'maintenanceAlertsContainer';
        container.style.cssText = 'width: 100%; max-width: 550px; margin: 0 auto 12px auto; display: flex; flex-direction: column; gap: 10px;';
        tasksContainer.parentNode.insertBefore(container, tasksContainer);
    }

    // 3. Инжектиране на стилове за картите и бутоните
    if (!document.getElementById('terminalCalendarStyles')) {
        const style = document.createElement('style');
        style.id = 'terminalCalendarStyles';
        style.textContent = `
            .btn-terminal-calendar:active { background-color: #0e7490 !important; transform: scale(0.95); }
            .maint-card {
                background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
                border: 2px solid #f59e0b;
                border-radius: 14px;
                padding: 14px 16px;
                box-shadow: 0 4px 14px rgba(245, 158, 11, 0.25);
                display: flex;
                flex-direction: column;
                gap: 10px;
                animation: maintPulse 3s infinite alternate ease-in-out;
            }
            .maint-card.overdue {
                background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
                border-color: #ef4444;
                box-shadow: 0 4px 14px rgba(239, 68, 68, 0.28);
            }
            @keyframes maintPulse {
                0% { box-shadow: 0 3px 10px rgba(245, 158, 11, 0.2); }
                100% { box-shadow: 0 6px 20px rgba(245, 158, 11, 0.38); }
            }
            .maint-badge {
                font-size: 0.75em;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                padding: 3px 8px;
                border-radius: 6px;
                display: inline-block;
            }
            .maint-badge.warn { background: #d97706; color: white; }
            .maint-badge.danger { background: #dc2626; color: white; }
            .maint-btn-done {
                background: #059669;
                color: white;
                border: none;
                padding: 12px 16px;
                border-radius: 10px;
                font-size: 0.95em;
                font-weight: 900;
                cursor: pointer;
                box-shadow: 0 3px 8px rgba(5, 150, 105, 0.3);
                transition: transform 0.1s, background 0.15s;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                width: 100%;
                box-sizing: border-box;
            }
            .maint-btn-done:active {
                background: #047857;
                transform: scale(0.98);
            }
        `;
        document.head.appendChild(style);
    }
}

// Проверка за задачи по поддръжка
window.checkTerminalMaintenance = async function(isSilent = false) {
    if (typeof client === 'undefined') return;

    try {
        // Определяне на избраните машини на терминала
        const rawMachine = (typeof currentMachine !== 'undefined' && currentMachine) 
            ? currentMachine 
            : (localStorage.getItem('mes_machine') || '');

        let myMachines = [];
        if (rawMachine && rawMachine.trim() !== '' && rawMachine !== 'ВСИЧКИ') {
            myMachines = rawMachine.split(',').map(m => m.trim().toLowerCase());
        }
        terminalMaintenanceState.selectedMachines = myMachines;

        // Извличане на активни задачи от Supabase - САМО категория "Машини" с позволено отчитане на терминал
        const { data: events, error } = await client
            .from('factory_events')
            .select('*')
            .eq('status', 'pending')
            .eq('category', 'Машини')
            .eq('allow_terminal_completion', true)
            .order('event_date', { ascending: true });

        if (error) throw error;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let activeForMe = [];

        (events || []).forEach(ev => {
            // Филтър по конкретна машина за цеховия под
            const evMachine = (ev.machine_name || '').trim().toLowerCase();
            let matchesMachine = false;

            if (myMachines.length === 0) {
                // Избрано е ВСИЧКИ -> вижда само задачи по машините в цеха
                matchesMachine = true;
            } else {
                // Избрана е конкретна машина -> показваме задачите точно за тази машина
                if (evMachine && myMachines.includes(evMachine)) {
                    matchesMachine = true;
                }
            }

            if (!matchesMachine) return;

            // Проверка за срок за известяване
            const evDate = new Date(ev.event_date);
            evDate.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((evDate - today) / (1000 * 60 * 60 * 24));
            const notifyDays = ev.notify_days_before !== undefined ? ev.notify_days_before : 30;

            if (diffDays <= notifyDays) {
                activeForMe.push({
                    ev,
                    diffDays,
                    isOverdue: diffDays < 0
                });
            }
        });

        terminalMaintenanceState.activeEvents = activeForMe;

        // Обновяване на баджа в горния бутон (Вариант 2)
        updateTerminalCalBadge(activeForMe.length);

        // Обновяване на сервизните карти над работните задачи (Вариант 1)
        renderTerminalMaintenanceCards(activeForMe);

    } catch (err) {
        if (!isSilent) console.error('Грешка при проверка на поддръжка за терминала:', err);
    }
};

// Обновяване на цифрата в бутона "📅 ПОДДРЪЖКА"
function updateTerminalCalBadge(count) {
    const badge = document.getElementById('terminalCalBadge');
    const btn = document.getElementById('btnTerminalCalendar');
    if (!badge || !btn) return;

    if (count > 0) {
        badge.innerText = count;
        badge.style.display = 'inline-block';
        btn.style.backgroundColor = '#d97706'; // Оранжев бутон за внимание
    } else {
        badge.style.display = 'none';
        btn.style.backgroundColor = '#0891b2'; // Нормален син бутон
    }
}

// Визуализация на сервизните карти над работните карти (Вариант 1)
function renderTerminalMaintenanceCards(activeItems) {
    const container = document.getElementById('maintenanceAlertsContainer');
    if (!container) return;

    if (activeItems.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = activeItems.map(item => {
        const ev = item.ev;
        const isOverdue = item.isOverdue;
        const diffDays = item.diffDays;
        const icon = '🔧';

        let deadlineText = '';
        if (isOverdue) {
            deadlineText = `<span style="color: #dc2626; font-weight: 800;">ПРОСРОЧЕНО с ${Math.abs(diffDays)} дни! (Срок: ${formatDateDisplay(ev.event_date)})</span>`;
        } else if (diffDays === 0) {
            deadlineText = `<span style="color: #ea580c; font-weight: 800;">СРОКЪТ Е ДНЕС! (${formatDateDisplay(ev.event_date)})</span>`;
        } else {
            deadlineText = `<span style="color: #b45309; font-weight: 700;">Наближава след ${diffDays} дни (Срок: ${formatDateDisplay(ev.event_date)})</span>`;
        }

        return `
            <div class="maint-card ${isOverdue ? 'overdue' : ''}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.6em;">${icon}</span>
                        <div>
                            <span class="maint-badge ${isOverdue ? 'danger' : 'warn'}">
                                ${isOverdue ? '🚨 СПЕШНА ПОДДРЪЖКА' : '⚠️ ПЛАНИРАНА ПОДДРЪЖКА'}
                            </span>
                            <div style="font-size: 1.15em; font-weight: 900; color: #1e293b; margin-top: 4px;">
                                ${escapeHtml(ev.machine_name ? ev.machine_name + ' — ' : '')}${escapeHtml(ev.title)}
                            </div>
                        </div>
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.7); border: 1px solid rgba(0,0,0,0.06); padding: 8px 12px; border-radius: 8px; font-size: 0.9em;">
                    <div>📅 ${deadlineText}</div>
                    ${ev.notes ? `<div style="color: #475569; margin-top: 4px; font-size: 0.95em;">📝 <strong>Инструкция:</strong> ${escapeHtml(ev.notes)}</div>` : ''}
                    ${ev.assigned_to ? `<div style="color: #64748b; font-size: 0.85em; margin-top: 2px;">👤 Отговорник: ${escapeHtml(ev.assigned_to)}</div>` : ''}
                </div>

                <button class="maint-btn-done" onclick="completeTerminalMaintenance(${ev.id})">
                    <span>✅ ОТЧЕТИ КАТО ИЗПЪЛНЕНО</span>
                </button>
            </div>
        `;
    }).join('');
}

// Отчитане на задача за поддръжка от оператора директно на терминала
window.completeTerminalMaintenance = async function(eventId) {
    const item = terminalMaintenanceState.activeEvents.find(i => i.ev.id === eventId);
    let ev = item ? item.ev : null;

    if (!ev) {
        try {
            const { data } = await client.from('factory_events').select('*').eq('id', eventId).single();
            ev = data;
        } catch(e) {}
    }
    if (!ev) return;

    const defaultOperator = (typeof currentOperator !== 'undefined' && currentOperator) 
        ? currentOperator 
        : (localStorage.getItem('mes_operator') || 'Оператор');

    const { value: formValues } = await Swal.fire({
        title: '✅ Отчитане на поддръжка',
        html: `
            <div style="text-align: left; font-size: 0.95em; display: flex; flex-direction: column; gap: 12px;">
                <div style="background: #f1f5f9; padding: 10px 14px; border-radius: 8px;">
                    <div><strong>Машина:</strong> ${escapeHtml(ev.machine_name || 'Машина')}</div>
                    <div><strong>Задача:</strong> ${escapeHtml(ev.title)}</div>
                </div>
                <div>
                    <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Извършил: *</label>
                    <input id="swalMaintBy" class="swal2-input" value="${escapeHtml(defaultOperator)}" style="margin: 0; width: 100%; box-sizing: border-box; font-size: 1em;">
                </div>
                <div>
                    <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Бележка / сменено масло / части (по избор):</label>
                    <textarea id="swalMaintNotes" class="swal2-textarea" placeholder="напр. Сменено масло Shell Tellus 46, почистен филтър..." style="margin: 0; width: 100%; box-sizing: border-box; font-size: 0.95em; height: 75px; font-family: inherit;"></textarea>
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Потвърди и завърши',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#059669',
        preConfirm: () => {
            const by = document.getElementById('swalMaintBy').value.trim();
            if (!by) {
                Swal.showValidationMessage('Моля, посочете кой е извършил дейността!');
                return false;
            }
            return {
                completedBy: by,
                notes: document.getElementById('swalMaintNotes').value.trim()
            };
        }
    });

    if (!formValues) return;

    Swal.fire({ title: 'Записване...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const todayStr = new Date().toISOString().split('T')[0];

        // 1. Вписване в сервизния дневник (бъдещ паспорт на машината)
        const { error: logErr } = await client.from('factory_maintenance_log').insert([{
            event_id: ev.id,
            machine_name: ev.machine_name || 'Машина',
            activity_type: 'Планова поддръжка',
            title: ev.title,
            completed_date: todayStr,
            completed_by: formValues.completedBy,
            source: 'terminal',
            notes: formValues.notes || 'Отчетено през таблет на машината',
            cost: 0
        }]);
        if (logErr) throw logErr;

        // 2. Маркиране на събитието като completed
        const { error: updErr } = await client.from('factory_events').update({
            status: 'completed',
            updated_at: new Date().toISOString()
        }).eq('id', ev.id);
        if (updErr) throw updErr;

        // 3. Автоматично създаване на следващ период при периодични задачи
        let nextDateStr = null;
        if (ev.is_recurring) {
            const nextDate = new Date();
            const val = ev.repeat_interval_value || 1;
            const unit = ev.repeat_interval_unit || 'months';

            if (unit === 'days') nextDate.setDate(nextDate.getDate() + val);
            else if (unit === 'weeks') nextDate.setDate(nextDate.getDate() + (val * 7));
            else if (unit === 'months') nextDate.setMonth(nextDate.getMonth() + val);
            else if (unit === 'years') nextDate.setFullYear(nextDate.getFullYear() + val);

            nextDateStr = nextDate.toISOString().split('T')[0];

            await client.from('factory_events').insert([{
                title: ev.title,
                category: 'Машини',
                machine_name: ev.machine_name,
                department: ev.department,
                event_date: nextDateStr,
                notify_days_before: ev.notify_days_before,
                is_recurring: true,
                repeat_interval_value: ev.repeat_interval_value,
                repeat_interval_unit: ev.repeat_interval_unit,
                status: 'pending',
                assigned_to: ev.assigned_to,
                notes: ev.notes,
                allow_terminal_completion: true
            }]);
        }

        // Обновяване на състоянието на терминала веднага
        await checkTerminalMaintenance();

        let successHtml = `Задачата <strong>${escapeHtml(ev.title)}</strong> е записана успешно в сервизния дневник!`;
        if (nextDateStr) {
            successHtml += `<br><br>📅 Следващото обслужване е насрочено автоматично за <strong>${formatDateDisplay(nextDateStr)}</strong>.`;
        }

        Swal.fire({
            icon: 'success',
            title: 'Благодарим!',
            html: successHtml,
            confirmButtonColor: '#059669',
            timer: 3500
        });

    } catch (err) {
        console.error('Грешка при отчитане от терминал:', err);
        Swal.fire('Грешка', 'Неуспешно отчитане: ' + err.message, 'error');
    }
};

// Отваряне на модала от бутона "📅 ПОДДРЪЖКА" в горната лента (Вариант 2)
window.openTerminalCalendarModal = async function() {
    Swal.fire({ title: 'Зареждане на график...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const rawMachine = (typeof currentMachine !== 'undefined' && currentMachine) 
            ? currentMachine 
            : (localStorage.getItem('mes_machine') || '');

        let myMachines = [];
        if (rawMachine && rawMachine.trim() !== '' && rawMachine !== 'ВСИЧКИ') {
            myMachines = rawMachine.split(',').map(m => m.trim());
        }

        // 1. Предстоящи задачи за обслужване - САМО Машини с позволено отчитане
        let eventsQuery = client
            .from('factory_events')
            .select('*')
            .eq('status', 'pending')
            .eq('category', 'Машини')
            .eq('allow_terminal_completion', true)
            .order('event_date', { ascending: true })
            .limit(20);

        if (myMachines.length > 0) {
            eventsQuery = eventsQuery.in('machine_name', myMachines);
        }
        const { data: upcomingEvents } = await eventsQuery;

        // 2. Последно извършени дейности (сервизна история на машината)
        let logQuery = client
            .from('factory_maintenance_log')
            .select('*')
            .order('completed_date', { ascending: false })
            .limit(10);

        if (myMachines.length > 0) {
            logQuery = logQuery.in('machine_name', myMachines);
        }
        const { data: recentLogs } = await logQuery;

        Swal.close();

        const machineTitle = myMachines.length > 0 ? myMachines.join(', ') : 'Всички машини в цеха';

        let upcomingHtml = '';
        if (!upcomingEvents || upcomingEvents.length === 0) {
            upcomingHtml = '<div style="color: #64748b; padding: 15px; text-align: center; font-weight: 600;">Няма предстоящи задачи по график за тази машина.</div>';
        } else {
            upcomingHtml = upcomingEvents.map(e => `
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 12px; border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                    <div>
                        <div style="font-weight: 700; color: #1e293b;">${escapeHtml(e.machine_name ? e.machine_name + ': ' : '')}${escapeHtml(e.title)}</div>
                        <div style="font-size: 0.85em; color: #64748b;">📅 Срок: ${formatDateDisplay(e.event_date)}</div>
                    </div>
                    <button onclick="Swal.close(); completeTerminalMaintenance(${e.id});" style="background: #059669; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 0.85em; white-space: nowrap;">
                        ✅ Отчети
                    </button>
                </div>
            `).join('');
        }

        let logsHtml = '';
        if (!recentLogs || recentLogs.length === 0) {
            logsHtml = '<div style="color: #64748b; padding: 15px; text-align: center; font-weight: 600;">Няма скорошни сервизни записи за тази машина.</div>';
        } else {
            logsHtml = recentLogs.map(l => `
                <div style="border-bottom: 1px dashed #e2e8f0; padding: 8px 0; font-size: 0.9em;">
                    <div style="display: flex; justify-content: space-between; color: #64748b; font-size: 0.85em;">
                        <span>📅 ${formatDateDisplay(l.completed_date)}</span>
                        <span>👤 ${escapeHtml(l.completed_by || '-')} (${l.source === 'terminal' ? 'Таблет' : 'Админ'})</span>
                    </div>
                    <div style="font-weight: 700; color: #1e293b; margin-top: 2px;">
                        ${escapeHtml(l.machine_name ? l.machine_name + ': ' : '')}${escapeHtml(l.title)}
                    </div>
                    ${l.notes ? `<div style="font-size: 0.85em; color: #475569; margin-top: 2px;">${escapeHtml(l.notes)}</div>` : ''}
                </div>
            `).join('');
        }

        Swal.fire({
            title: `📅 Сервизен дневник: ${escapeHtml(machineTitle)}`,
            html: `
                <div style="text-align: left; max-height: 65vh; overflow-y: auto;">
                    <h4 style="margin: 0 0 10px 0; color: #1e3a8a; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; font-size: 1.05em;">
                        ⏳ Предстоящи задачи за обслужване:
                    </h4>
                    ${upcomingHtml}

                    <h4 style="margin: 20px 0 10px 0; color: #0f766e; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; font-size: 1.05em;">
                        📋 История на извършените дейности (Паспорт):
                    </h4>
                    <div style="display: flex; flex-direction: column;">
                        ${logsHtml}
                    </div>
                </div>
            `,
            showCloseButton: true,
            showConfirmButton: false,
            width: '600px'
        });

    } catch (err) {
        Swal.fire('Грешка', err.message, 'error');
    }
};

function formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]} г.`;
    return dateStr;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
