// ========================================================
// IS-SYSTEMS: КАЛЕНДАР, ПЛАНОВА ПОДДРЪЖКА И СЕРВИЗЕН ДНЕВНИК
// ========================================================


// Помощни функции за обекти, категории и видимост
function getEventObjectDisplay(ev) {
    if (ev.machine_name && ev.machine_name.trim() !== '') {
        return ev.machine_name.trim();
    }
    if (ev.category === 'Автопарк') return 'Служебно МПС';
    if (ev.category === 'Администрация') return 'Администрация';
    if (ev.category === 'ЗБУТ / ЧР') return 'ЗБУТ / ЧР';
    if (ev.category === 'Инфраструктура') return 'Сграда / Инфраструктура';
    return 'Цял завод';
}

function getEventCategoryIcon(cat) {
    if (cat === 'Машини') return '🔧';
    if (cat === 'Автопарк') return '🚗';
    if (cat === 'Администрация') return '🔒';
    if (cat === 'ЗБУТ / ЧР') return '🩺';
    if (cat === 'Инфраструктура') return '🏢';
    return '📌';
}

function getEventVisibilityBadge(ev) {
    if (ev.allow_terminal_completion && ev.category === 'Машини') {
        return '<span style="background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; padding: 2px 8px; border-radius: 6px; font-size: 0.85em; font-weight: 700;">🏭 Видимо на терминалите в цеха</span>';
    }
    return '<span style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 2px 8px; border-radius: 6px; font-size: 0.85em; font-weight: 700;">🔒 Само за Административния панел (скрито от цеха)</span>';
}


let calendarState = {
    events: [],
    logs: [],
    machines: [],
    currentDate: new Date(),
    activeSubTab: 'calendar', // 'calendar' | 'log' | 'machines'
    filterCategory: 'all',
    filterMachine: 'all',
    filterLogMachine: 'all',
    filterLogSearch: '',
    editingEventId: null
};

// Отваряне на главния модален прозорец
window.openCalendarModal = async function() {
    let modal = document.getElementById('calendarModalBackdrop');
    if (!modal) {
        initCalendarModalHtml();
        modal = document.getElementById('calendarModalBackdrop');
    }
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    await reloadAllCalendarData();
};

window.closeCalendarModal = function() {
    const modal = document.getElementById('calendarModalBackdrop');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = 'auto';
};

// Зареждане на данни от Supabase
async function reloadAllCalendarData() {
    showCalendarLoading(true);
    try {
        // 1. Зареждане на машини
        const { data: macData, error: macErr } = await client
            .from('factory_machines')
            .select('*')
            .order('name', { ascending: true });
        if (macErr) throw macErr;
        calendarState.machines = macData || [];

        // 2. Зареждане на събития
        const { data: evData, error: evErr } = await client
            .from('factory_events')
            .select('*')
            .order('event_date', { ascending: true });
        if (evErr) throw evErr;
        calendarState.events = evData || [];

        // 3. Зареждане на сервизен дневник
        const { data: logData, error: logErr } = await client
            .from('factory_maintenance_log')
            .select('*')
            .order('completed_date', { ascending: false });
        if (logErr) throw logErr;
        calendarState.logs = logData || [];

        renderCalendarDashboardAlerts();
        renderActiveSubTab();
        updateMachineDropdowns();
    } catch (err) {
        console.error('Грешка при зареждане на календара:', err);
        Swal.fire('Грешка', 'Неуспешно зареждане на данните: ' + (err.message || err), 'error');
    } finally {
        showCalendarLoading(false);
    }
}

function showCalendarLoading(show) {
    const loader = document.getElementById('calendarGlobalLoader');
    if (loader) loader.style.display = show ? 'flex' : 'none';
}

// Превключване между подтабовете (Календар, Сервизен дневник, Машини)
window.switchCalendarSubTab = function(subTab) {
    calendarState.activeSubTab = subTab;
    document.querySelectorAll('.cal-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === subTab);
    });
    document.querySelectorAll('.cal-subtab-view').forEach(view => {
        view.style.display = (view.id === 'calView_' + subTab) ? 'block' : 'none';
    });
    renderActiveSubTab();
};

function renderActiveSubTab() {
    if (calendarState.activeSubTab === 'calendar') {
        renderCalendarMonthView();
    } else if (calendarState.activeSubTab === 'log') {
        renderMaintenanceLogTable();
    } else if (calendarState.activeSubTab === 'machines') {
        renderMachinesDirectory();
    }
}

// ----------------------------------------------------
// ИЗВЕСТИЯ И ПРЕДУПРЕЖДЕНИЯ (ALERT BANNER)
// ----------------------------------------------------
function renderCalendarDashboardAlerts() {
    const banner = document.getElementById('calendarAlertsBanner');
    if (!banner) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let overdueList = [];
    let approachingList = [];

    calendarState.events.forEach(ev => {
        if (ev.status === 'completed') return;
        const evDate = new Date(ev.event_date);
        evDate.setHours(0, 0, 0, 0);
        const diffTime = evDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const notifyDays = ev.notify_days_before !== undefined ? ev.notify_days_before : 30;

        if (diffDays < 0) {
            overdueList.push({ ev, diffDays: Math.abs(diffDays) });
        } else if (diffDays <= notifyDays) {
            approachingList.push({ ev, diffDays });
        }
    });

    if (overdueList.length === 0 && approachingList.length === 0) {
        banner.innerHTML = `
            <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border: 1px solid #6ee7b7; color: #065f46; padding: 12px 18px; border-radius: 10px; display: flex; align-items: center; justify-content: space-between; font-weight: 600;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.4em;">✅</span>
                    <span>Всички машини и събития са в график! Няма просрочени или наближаващи задачи.</span>
                </div>
                <button class="btn-cal-action" onclick="openAddEventModal()" style="background: #059669; color: white; padding: 6px 14px; font-size: 0.85em;">+ Насрочи задача</button>
            </div>
        `;
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';

    if (overdueList.length > 0) {
        html += `
            <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-left: 5px solid #dc2626; border: 1px solid #fca5a5; color: #991b1b; padding: 12px 18px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div>
                    <div style="font-weight: 800; display: flex; align-items: center; gap: 8px; font-size: 1.05em;">
                        <span>🚨</span> <span>ПРОСРОЧЕНИ ЗАДАЧИ (${overdueList.length}):</span>
                    </div>
                    <div style="margin-top: 5px; font-size: 0.9em; display: flex; flex-wrap: wrap; gap: 6px;">
                        ${overdueList.map(item => `
                            <span style="background: white; border: 1px solid #f87171; padding: 4px 10px; border-radius: 6px; cursor: pointer;" onclick="openEventDetailsModal(${item.ev.id})" title="Кликнете за детайли">
                                ${getEventCategoryIcon(item.ev.category)} <strong>${escapeHtml(getEventObjectDisplay(item.ev))}:</strong> ${escapeHtml(item.ev.title)} 
                                <span style="color: #dc2626; font-weight: 700;">(просрочено с ${item.diffDays} д.)</span>
                            </span>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    if (approachingList.length > 0) {
        html += `
            <div style="background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-left: 5px solid #d97706; border: 1px solid #fde68a; color: #92400e; padding: 12px 18px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div>
                    <div style="font-weight: 800; display: flex; align-items: center; gap: 8px; font-size: 1.05em;">
                        <span>⚠️</span> <span>НАБЛИЖАВАЩИ СРОКОВЕ (${approachingList.length}):</span>
                    </div>
                    <div style="margin-top: 5px; font-size: 0.9em; display: flex; flex-wrap: wrap; gap: 6px;">
                        ${approachingList.map(item => `
                            <span style="background: white; border: 1px solid #fcd34d; padding: 4px 10px; border-radius: 6px; cursor: pointer;" onclick="openEventDetailsModal(${item.ev.id})" title="Кликнете за детайли">
                                ${getEventCategoryIcon(item.ev.category)} <strong>${escapeHtml(getEventObjectDisplay(item.ev))}:</strong> ${escapeHtml(item.ev.title)} 
                                <span style="color: #b45309; font-weight: 700;">(след ${item.diffDays === 0 ? 'ДНЕС!' : item.diffDays + ' дни'})</span>
                            </span>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    html += '</div>';
    banner.innerHTML = html;
}

// ----------------------------------------------------
// МЕСЕЧЕН КАЛЕНДАР (GRID VIEW)
// ----------------------------------------------------
window.calendarNavPrev = function() {
    calendarState.currentDate.setMonth(calendarState.currentDate.getMonth() - 1);
    renderCalendarMonthView();
};

window.calendarNavNext = function() {
    calendarState.currentDate.setMonth(calendarState.currentDate.getMonth() + 1);
    renderCalendarMonthView();
};

window.calendarNavToday = function() {
    calendarState.currentDate = new Date();
    renderCalendarMonthView();
};

function renderCalendarMonthView() {
    const gridContainer = document.getElementById('calendarMonthGrid');
    const titleElem = document.getElementById('calendarMonthTitle');
    if (!gridContainer || !titleElem) return;

    const monthNamesBg = [
        'Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни',
        'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'
    ];
    const year = calendarState.currentDate.getFullYear();
    const month = calendarState.currentDate.getMonth();
    titleElem.innerText = `${monthNamesBg[month]} ${year} г.`;

    // Филтриране на събития
    let filteredEvents = calendarState.events.filter(ev => {
        if (calendarState.filterCategory !== 'all' && ev.category !== calendarState.filterCategory) return false;
        if (calendarState.filterMachine !== 'all' && ev.machine_name !== calendarState.filterMachine) return false;
        return true;
    });

    // Изчисляване на дните в решетката
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const totalDaysInMonth = lastDayOfMonth.getDate();
    const prevMonthLastDay = new Date(year, month, 0).getDate();

    let cellsHtml = '';

    // Дни от предходния месец
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
        const d = prevMonthLastDay - i;
        cellsHtml += `<div class="cal-day-cell other-month"><span class="day-num">${d}</span></div>`;
    }

    const today = new Date();
    const isCurrentYearMonth = (today.getFullYear() === year && today.getMonth() === month);

    // Дни от текущия месец
    for (let day = 1; day <= totalDaysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = isCurrentYearMonth && (today.getDate() === day);

        const dayEvents = filteredEvents.filter(ev => ev.event_date === dateStr);

        let eventsHtml = '';
        dayEvents.forEach(ev => {
            let catColor = '#4338ca';
            if (ev.category === 'ЗБУТ / ЧР') { catColor = '#059669'; }
            else if (ev.category === 'Инфраструктура') { catColor = '#ea580c'; }
            else if (ev.category === 'Общи') { catColor = '#7c3aed'; }

            let statusIcon = '⏳';
            let statusClass = 'pending';
            if (ev.status === 'completed') {
                statusIcon = '✅';
                statusClass = 'completed';
                catColor = '#64748b';
            } else {
                const evDate = new Date(ev.event_date);
                evDate.setHours(0, 0, 0, 0);
                const diffTime = evDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays < 0) {
                    statusIcon = '🚨';
                    statusClass = 'overdue';
                    catColor = '#dc2626';
                } else if (diffDays <= (ev.notify_days_before || 30)) {
                    statusIcon = '⚠️';
                    statusClass = 'approaching';
                    catColor = '#d97706';
                }
            }

            eventsHtml += `
                <div class="cal-event-badge ${statusClass}" style="border-left: 3px solid ${catColor};" onclick="event.stopPropagation(); openEventDetailsModal(${ev.id})" title="${escapeHtml(ev.title)} (${escapeHtml(getEventObjectDisplay(ev))})">
                    <span class="ev-badge-icon">${statusIcon}</span>
                    <span class="ev-badge-title"><strong>${escapeHtml(getEventObjectDisplay(ev))}:</strong> ${escapeHtml(ev.title)}</span>
                </div>
            `;
        });

        cellsHtml += `
            <div class="cal-day-cell ${isToday ? 'today' : ''}" onclick="openAddEventModal('${dateStr}')">
                <div class="cal-cell-header">
                    <span class="day-num ${isToday ? 'today-badge' : ''}">${day}</span>
                    <button class="btn-cell-add" onclick="event.stopPropagation(); openAddEventModal('${dateStr}')" title="Добави задача за ${day}">+</button>
                </div>
                <div class="cal-cell-events">
                    ${eventsHtml}
                </div>
            </div>
        `;
    }

    const totalFilled = startDayOfWeek + totalDaysInMonth;
    const remainingCells = (totalFilled > 35 ? 42 : 35) - totalFilled;
    for (let i = 1; i <= remainingCells; i++) {
        cellsHtml += `<div class="cal-day-cell other-month"><span class="day-num">${i}</span></div>`;
    }

    gridContainer.innerHTML = cellsHtml;
}

// ----------------------------------------------------
// ДЕТАЙЛИ НА СЪБИТИЕ И ОТЧИТАНЕ КАТО ИЗПЪЛНЕНО
// ----------------------------------------------------
window.openEventDetailsModal = function(eventId) {
    const ev = calendarState.events.find(e => e.id === eventId);
    if (!ev) return;

    const modal = document.getElementById('eventDetailsModalBackdrop');
    if (!modal) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const evDate = new Date(ev.event_date);
    evDate.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((evDate - today) / (1000 * 60 * 60 * 24));

    let statusBadge = '<span style="background: #e2e8f0; color: #475569; padding: 4px 8px; border-radius: 6px; font-weight: 700;">Чакащо</span>';
    if (ev.status === 'completed') {
        statusBadge = '<span style="background: #ecfdf5; color: #059669; padding: 4px 8px; border-radius: 6px; font-weight: 700;">✅ Изпълнено</span>';
    } else if (diffDays < 0) {
        statusBadge = `<span style="background: #fef2f2; color: #dc2626; padding: 4px 8px; border-radius: 6px; font-weight: 700;">🚨 Просрочено с ${Math.abs(diffDays)} дни</span>`;
    } else if (diffDays <= (ev.notify_days_before || 30)) {
        statusBadge = `<span style="background: #fffbeb; color: #d97706; padding: 4px 8px; border-radius: 6px; font-weight: 700;">⚠️ Наближава (след ${diffDays} дни)</span>`;
    }

    document.getElementById('evDetailTitle').innerText = ev.title;
    document.getElementById('evDetailStatus').innerHTML = statusBadge;
    document.getElementById('evDetailMachine').innerHTML = `${getEventCategoryIcon(ev.category)} ${escapeHtml(getEventObjectDisplay(ev))}`; const visEl = document.getElementById('evDetailVisibility'); if (visEl) visEl.innerHTML = getEventVisibilityBadge(ev);
    document.getElementById('evDetailCategory').innerText = ev.category;
    document.getElementById('evDetailDate').innerText = formatDateDisplay(ev.event_date);
    document.getElementById('evDetailNotify').innerText = `${ev.notify_days_before || 30} дни предварително`;
    document.getElementById('evDetailRecurring').innerText = ev.is_recurring 
        ? `На всеки ${ev.repeat_interval_value} ${formatUnitBg(ev.repeat_interval_unit)}`
        : 'Еднократно (не се повтаря)';
    document.getElementById('evDetailAssigned').innerText = ev.assigned_to || 'Не е посочен';
    document.getElementById('evDetailNotes').innerText = ev.notes || 'Няма въведени забележки.';

    const actionsContainer = document.getElementById('evDetailActions');
    if (ev.status === 'completed') {
        actionsContainer.innerHTML = `
            <button class="btn-cal-sec" onclick="closeEventDetailsModal()">Затвори</button>
            <button class="btn-cal-danger" onclick="deleteEvent(${ev.id})">🗑️ Изтрий</button>
        `;
    } else {
        actionsContainer.innerHTML = `
            <button class="btn-cal-danger" onclick="deleteEvent(${ev.id})">🗑️ Изтрий</button>
            <button class="btn-cal-sec" onclick="openEditEventModal(${ev.id})">✏️ Редакция</button>
            <button class="btn-cal-success" onclick="openCompleteEventModal(${ev.id})" style="background: #059669; color: white;">
                ✅ Отчети като изпълнено
            </button>
        `;
    }

    modal.style.display = 'flex';
};

window.closeEventDetailsModal = function() {
    const modal = document.getElementById('eventDetailsModalBackdrop');
    if (modal) modal.style.display = 'none';
};

window.openCompleteEventModal = function(eventId) {
    closeEventDetailsModal();
    const ev = calendarState.events.find(e => e.id === eventId);
    if (!ev) return;

    const modal = document.getElementById('completeEventModalBackdrop');
    if (!modal) return;

    document.getElementById('compModalEventId').value = ev.id;
    document.getElementById('compModalTitle').innerText = `Отчитане: ${ev.title} (${ev.machine_name || 'Завод'})`;
    document.getElementById('compDateInput').value = new Date().toISOString().split('T')[0];
    document.getElementById('compByInput').value = 'Администратор';
    document.getElementById('compNotesInput').value = '';
    document.getElementById('compPartsInput').value = '';
    document.getElementById('compCostInput').value = '';

    modal.style.display = 'flex';
};

window.closeCompleteEventModal = function() {
    const modal = document.getElementById('completeEventModalBackdrop');
    if (modal) modal.style.display = 'none';
};

window.saveEventCompletion = async function(e) {
    if (e) e.preventDefault();
    const eventId = parseInt(document.getElementById('compModalEventId').value);
    const ev = calendarState.events.find(item => item.id === eventId);
    if (!ev) return;

    const completedDate = document.getElementById('compDateInput').value;
    const completedBy = document.getElementById('compByInput').value.trim() || 'Администратор';
    const notes = document.getElementById('compNotesInput').value.trim();
    const partsReplaced = document.getElementById('compPartsInput').value.trim();
    const cost = parseFloat(document.getElementById('compCostInput').value) || 0;

    showCalendarLoading(true);
    try {
        // 1. Вписване в сервизния дневник (factory_maintenance_log)
        const { error: logErr } = await client.from('factory_maintenance_log').insert([{
            event_id: ev.id,
            machine_name: ev.machine_name || 'Цял завод',
            activity_type: ev.category === 'Машини' ? 'Планова поддръжка' : ev.category,
            title: ev.title,
            completed_date: completedDate,
            completed_by: completedBy,
            source: 'admin',
            notes: notes,
            parts_replaced: partsReplaced,
            cost: cost
        }]);
        if (logErr) throw logErr;

        // 2. Маркиране на текущото събитие като completed
        const { error: updErr } = await client.from('factory_events').update({
            status: 'completed',
            updated_at: new Date().toISOString()
        }).eq('id', ev.id);
        if (updErr) throw updErr;

        // 3. Ако е периодично, автоматично създаваме следващото събитие
        let nextDateStr = null;
        if (ev.is_recurring) {
            const nextDate = new Date(completedDate);
            const val = ev.repeat_interval_value || 1;
            const unit = ev.repeat_interval_unit || 'months';

            if (unit === 'days') {
                nextDate.setDate(nextDate.getDate() + val);
            } else if (unit === 'weeks') {
                nextDate.setDate(nextDate.getDate() + (val * 7));
            } else if (unit === 'months') {
                nextDate.setMonth(nextDate.getMonth() + val);
            } else if (unit === 'years') {
                nextDate.setFullYear(nextDate.getFullYear() + val);
            }

            nextDateStr = nextDate.toISOString().split('T')[0];

            const { error: nextErr } = await client.from('factory_events').insert([{
                title: ev.title,
                category: ev.category,
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
                allow_terminal_completion: ev.allow_terminal_completion
            }]);
            if (nextErr) throw nextErr;
        }

        closeCompleteEventModal();
        await reloadAllCalendarData();

        let successMsg = 'Задачата е отчетена успешно и записана в Сервизния дневник!';
        if (nextDateStr) {
            successMsg += `<br><br>📅 <strong>Следващата дата е насрочена автоматично за:</strong> ${formatDateDisplay(nextDateStr)}`;
        }
        Swal.fire({
            icon: 'success',
            title: 'Готово!',
            html: successMsg,
            confirmButtonColor: '#059669'
        });
    } catch (err) {
        console.error('Грешка при отчитане:', err);
        Swal.fire('Грешка', 'Неуспешно отчитане: ' + (err.message || err), 'error');
    } finally {
        showCalendarLoading(false);
    }
};

// ----------------------------------------------------
// СЪЗДАВАНЕ И РЕДАКЦИЯ НА СЪБИТИЕ (MODAL)
// ----------------------------------------------------

window.onEvMachineChange = function() {
    const sel = document.getElementById('evMachineSelect');
    const customBox = document.getElementById('evCustomObjectBox');
    const catSel = document.getElementById('evCategorySelect');
    const termCb = document.getElementById('evTerminalCb');
    const termWrap = document.getElementById('evTerminalCbWrap');
    const adminNotice = document.getElementById('evAdminOnlyNotice');

    if (!sel) return;
    const val = sel.value;

    if (val === '__custom__') {
        if (customBox) customBox.style.display = 'block';
        if (termWrap) termWrap.style.display = 'none';
        if (adminNotice) adminNotice.style.display = 'block';
        if (termCb) termCb.checked = false;
        return;
    } else {
        if (customBox) customBox.style.display = 'none';
    }

    if (val === 'Админ' || val === 'Офис' || val === 'Счетоводство') {
        if (catSel) catSel.value = 'Администрация';
        if (termWrap) termWrap.style.display = 'none';
        if (adminNotice) {
            adminNotice.style.display = 'block';
            adminNotice.innerHTML = `🔒 Обектът е <strong>${val}</strong> — това събитие се вижда САМО в Админ панела и никога на терминалите в цеха.`;
        }
        if (termCb) termCb.checked = false;
    } else if (val === 'Автопарк') {
        if (catSel) catSel.value = 'Автопарк';
        if (termWrap) termWrap.style.display = 'none';
        if (adminNotice) {
            adminNotice.style.display = 'block';
            adminNotice.innerHTML = `🔒 Обектът е <strong>Автопарк</strong> — това събитие се вижда САМО в Админ панела и никога на терминалите в цеха.`;
        }
        if (termCb) termCb.checked = false;
    } else if (val) {
        if (catSel) catSel.value = 'Машини';
        if (termWrap) termWrap.style.display = 'block';
        if (adminNotice) adminNotice.style.display = 'none';
        if (termCb) termCb.checked = true;
    }
};


window.onEvCategoryChange = function() {
    const cat = document.getElementById('evCategorySelect').value;
    const machineBox = document.getElementById('evMachineSelectBox');
    const customBox = document.getElementById('evCustomObjectBox');
    const objLabel = document.getElementById('evObjectLabel');
    const customInp = document.getElementById('evCustomObjectInput');
    const termWrap = document.getElementById('evTerminalCbWrap');
    const adminNotice = document.getElementById('evAdminOnlyNotice');
    const termCb = document.getElementById('evTerminalCb');

    if (!objLabel || !machineBox || !customBox) return;

    if (cat === 'Машини') {
        objLabel.innerText = 'Машина от цеха: *';
        machineBox.style.display = 'block';
        customBox.style.display = 'none';
        if (termWrap) termWrap.style.display = 'block';
        if (adminNotice) adminNotice.style.display = 'none';
        if (termCb) termCb.checked = true;
    } else if (cat === 'Автопарк') {
        objLabel.innerText = 'Автомобил / МПС (рег. № или модел):';
        machineBox.style.display = 'none';
        customBox.style.display = 'block';
        if (customInp) customInp.placeholder = 'напр. Служебен бус СА1234ВТ, Шкода Октавия...';
        if (termWrap) termWrap.style.display = 'none';
        if (adminNotice) adminNotice.style.display = 'block';
        if (termCb) termCb.checked = false;
    } else if (cat === 'Администрация') {
        objLabel.innerText = 'Звено / Направление:';
        machineBox.style.display = 'none';
        customBox.style.display = 'block';
        if (customInp) customInp.placeholder = 'напр. Счетоводство, Договори, Офис...';
        if (termWrap) termWrap.style.display = 'none';
        if (adminNotice) adminNotice.style.display = 'block';
        if (termCb) termCb.checked = false;
    } else if (cat === 'Инфраструктура') {
        objLabel.innerText = 'Обект / Инсталация:';
        machineBox.style.display = 'none';
        customBox.style.display = 'block';
        if (customInp) customInp.placeholder = 'напр. Компресорно, Пожарогасители цех 1, Климатизация...';
        if (termWrap) termWrap.style.display = 'none';
        if (adminNotice) adminNotice.style.display = 'block';
        if (termCb) termCb.checked = false;
    } else { // ЗБУТ / ЧР or Общи
        objLabel.innerText = 'Обхват / Локация:';
        machineBox.style.display = 'none';
        customBox.style.display = 'block';
        if (customInp) customInp.placeholder = 'напр. Цял завод, Механичен цех, Всички служители...';
        if (termWrap) termWrap.style.display = 'none';
        if (adminNotice) adminNotice.style.display = 'block';
        if (termCb) termCb.checked = false;
    }
};



window.openAddEventModal = function(defaultDate) {
    calendarState.editingEventId = null;
    const modal = document.getElementById('addEventModalBackdrop');
    if (!modal) return;

    document.getElementById('evFormTitle').innerText = '➕ Насрочване на нова задача / събитие';
    document.getElementById('evTitleInput').value = '';
    document.getElementById('evCategorySelect').value = 'Машини';
    document.getElementById('evMachineSelect').value = '';
    document.getElementById('evDeptInput').value = '';
    document.getElementById('evDateInput').value = defaultDate || new Date().toISOString().split('T')[0];
    document.getElementById('evNotifyDaysInput').value = '30';
    document.getElementById('evRecurringCb').checked = true;
    document.getElementById('evIntervalValInput').value = '6';
    document.getElementById('evIntervalUnitSelect').value = 'months';
    document.getElementById('evAssignedInput').value = '';
    document.getElementById('evNotesInput').value = '';
    document.getElementById('evTerminalCb').checked = true;

    toggleRecurringFields();
    modal.style.display = 'flex';
};

window.openEditEventModal = function(eventId) {
    closeEventDetailsModal();
    const ev = calendarState.events.find(e => e.id === eventId);
    if (!ev) return;

    calendarState.editingEventId = ev.id;
    const modal = document.getElementById('addEventModalBackdrop');
    if (!modal) return;

    document.getElementById('evFormTitle').innerText = '✏️ Редакция на задача';
    document.getElementById('evTitleInput').value = ev.title;
    document.getElementById('evCategorySelect').value = ev.category || 'Машини';
    document.getElementById('evMachineSelect').value = ev.machine_name || '';
    document.getElementById('evDeptInput').value = ev.department || '';
    document.getElementById('evDateInput').value = ev.event_date;
    document.getElementById('evNotifyDaysInput').value = ev.notify_days_before !== undefined ? ev.notify_days_before : 30;
    document.getElementById('evRecurringCb').checked = !!ev.is_recurring;
    document.getElementById('evIntervalValInput').value = ev.repeat_interval_value || 1;
    document.getElementById('evIntervalUnitSelect').value = ev.repeat_interval_unit || 'months';
    document.getElementById('evAssignedInput').value = ev.assigned_to || '';
    document.getElementById('evNotesInput').value = ev.notes || '';
    document.getElementById('evTerminalCb').checked = (ev.allow_terminal_completion !== false);

    toggleRecurringFields();
    modal.style.display = 'flex';
};

window.closeAddEventModal = function() {
    const modal = document.getElementById('addEventModalBackdrop');
    if (modal) modal.style.display = 'none';
};

window.toggleRecurringFields = function() {
    const isRec = document.getElementById('evRecurringCb').checked;
    const box = document.getElementById('evRecurringOptionsBox');
    if (box) box.style.display = isRec ? 'flex' : 'none';
};

window.setNotifyDaysQuick = function(days) {
    document.getElementById('evNotifyDaysInput').value = days;
};

window.saveEventForm = async function(e) {
    if (e) e.preventDefault();

    const title = document.getElementById('evTitleInput').value.trim();
    if (!title) {
        Swal.fire('Внимание', 'Моля, въведете име на събитието / задачата!', 'warning');
        return;
    }

    const payload = {
        title: title,
        category: document.getElementById('evCategorySelect').value,
        machine_name: document.getElementById('evMachineSelect').value || null,
        department: document.getElementById('evDeptInput').value.trim() || null,
        event_date: document.getElementById('evDateInput').value,
        notify_days_before: parseInt(document.getElementById('evNotifyDaysInput').value) || 0,
        is_recurring: document.getElementById('evRecurringCb').checked,
        repeat_interval_value: parseInt(document.getElementById('evIntervalValInput').value) || 1,
        repeat_interval_unit: document.getElementById('evIntervalUnitSelect').value,
        assigned_to: document.getElementById('evAssignedInput').value.trim() || null,
        notes: document.getElementById('evNotesInput').value.trim() || null,
        allow_terminal_completion: document.getElementById('evTerminalCb').checked,
        updated_at: new Date().toISOString()
    };

    showCalendarLoading(true);
    try {
        if (calendarState.editingEventId) {
            const { error } = await client.from('factory_events').update(payload).eq('id', calendarState.editingEventId);
            if (error) throw error;
        } else {
            payload.status = 'pending';
            const { error } = await client.from('factory_events').insert([payload]);
            if (error) throw error;
        }

        closeAddEventModal();
        await reloadAllCalendarData();
        Swal.fire({
            icon: 'success',
            title: calendarState.editingEventId ? 'Промените са запазени!' : 'Задачата е насрочена!',
            timer: 1500,
            showConfirmButton: false
        });
    } catch (err) {
        console.error('Грешка при запис:', err);
        Swal.fire('Грешка', 'Неуспешен запис: ' + (err.message || err), 'error');
    } finally {
        showCalendarLoading(false);
    }
};

window.deleteEvent = async function(eventId) {
    const res = await Swal.fire({
        title: 'Изтриване на събитие?',
        text: 'Сигурни ли сте, че искате да премахнете тази задача от календара?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Да, изтрий',
        cancelButtonText: 'Отказ'
    });

    if (res.isConfirmed) {
        showCalendarLoading(true);
        try {
            const { error } = await client.from('factory_events').delete().eq('id', eventId);
            if (error) throw error;
            closeEventDetailsModal();
            await reloadAllCalendarData();
            Swal.fire({ icon: 'success', title: 'Изтрито!', timer: 1200, showConfirmButton: false });
        } catch (err) {
            Swal.fire('Грешка', 'Неуспешно изтриване: ' + err.message, 'error');
        } finally {
            showCalendarLoading(false);
        }
    }
};

// ----------------------------------------------------
// СЕРВИЗЕН ДНЕВНИК (ИСТОРИЯ НА РЕМОНТИТЕ)
// ----------------------------------------------------
function renderMaintenanceLogTable() {
    const tbody = document.getElementById('calLogTableBody');
    if (!tbody) return;

    let filtered = calendarState.logs;

    if (calendarState.filterLogMachine !== 'all') {
        filtered = filtered.filter(l => l.machine_name === calendarState.filterLogMachine);
    }

    if (calendarState.filterLogSearch) {
        const q = calendarState.filterLogSearch.toLowerCase();
        filtered = filtered.filter(l => 
            (l.title && l.title.toLowerCase().includes(q)) ||
            (l.machine_name && l.machine_name.toLowerCase().includes(q)) ||
            (l.completed_by && l.completed_by.toLowerCase().includes(q)) ||
            (l.notes && l.notes.toLowerCase().includes(q)) ||
            (l.parts_replaced && l.parts_replaced.toLowerCase().includes(q))
        );
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #64748b;">Няма намерени записи в Сервизния дневник.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(log => `
        <tr>
            <td style="font-weight: 700; color: #1e293b; white-space: nowrap;">${formatDateDisplay(log.completed_date)}</td>
            <td>
                <span class="machine-tag" onclick="filterLogBySpecificMachine('${escapeHtml(log.machine_name)}')" title="Филтрирай само за тази машина">
                    🔧 ${escapeHtml(log.machine_name)}
                </span>
            </td>
            <td><span class="activity-type-badge">${escapeHtml(log.activity_type || 'Поддръжка')}</span></td>
            <td>
                <div style="font-weight: 700; color: #0f172a;">${escapeHtml(log.title)}</div>
                ${log.notes ? `<div style="font-size: 0.85em; color: #64748b; margin-top: 3px;">${escapeHtml(log.notes)}</div>` : ''}
                ${log.parts_replaced ? `<div style="font-size: 0.8em; color: #4338ca; margin-top: 3px;">📦 Вложени части: ${escapeHtml(log.parts_replaced)}</div>` : ''}
            </td>
            <td>${escapeHtml(log.completed_by || '-')}</td>
            <td>
                <span style="font-size: 0.85em; padding: 3px 8px; border-radius: 4px; ${log.source === 'terminal' ? 'background: #fdf2f8; color: #be185d; border: 1px solid #fbcfe8;' : 'background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;'}">
                    ${log.source === 'terminal' ? '📱 Терминал' : '💻 Админ'}
                </span>
            </td>
            <td style="text-align: right; white-space: nowrap;">
                <button class="action-btn btn-delete" onclick="deleteLogEntry(${log.id})" title="Изтрий запис">🗑️</button>
            </td>
        </tr>
    `).join('');
}

window.filterLogBySpecificMachine = function(macName) {
    calendarState.filterLogMachine = macName;
    const sel = document.getElementById('logMachineFilterSelect');
    if (sel) sel.value = macName;
    renderMaintenanceLogTable();
};

window.onLogFilterChange = function() {
    const sel = document.getElementById('logMachineFilterSelect');
    const search = document.getElementById('logSearchInput');
    if (sel) calendarState.filterLogMachine = sel.value;
    if (search) calendarState.filterLogSearch = search.value.trim();
    renderMaintenanceLogTable();
};

window.openAddManualLogModal = function() {
    const modal = document.getElementById('addManualLogModalBackdrop');
    if (!modal) return;

    document.getElementById('manualLogDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('manualLogMachineSelect').value = '';
    document.getElementById('manualLogActivityType').value = 'Извънреден ремонт';
    document.getElementById('manualLogTitle').value = '';
    document.getElementById('manualLogBy').value = 'Администратор';
    document.getElementById('manualLogNotes').value = '';
    document.getElementById('manualLogParts').value = '';
    document.getElementById('manualLogCost').value = '';

    modal.style.display = 'flex';
};

window.closeAddManualLogModal = function() {
    const modal = document.getElementById('addManualLogModalBackdrop');
    if (modal) modal.style.display = 'none';
};

window.saveManualLogEntry = async function(e) {
    if (e) e.preventDefault();

    const machine = document.getElementById('manualLogMachineSelect').value;
    const title = document.getElementById('manualLogTitle').value.trim();

    if (!machine) {
        Swal.fire('Внимание', 'Моля, изберете машина!', 'warning');
        return;
    }
    if (!title) {
        Swal.fire('Внимание', 'Моля, въведете описание на извършената дейност!', 'warning');
        return;
    }

    const payload = {
        machine_name: machine,
        activity_type: document.getElementById('manualLogActivityType').value,
        title: title,
        completed_date: document.getElementById('manualLogDate').value,
        completed_by: document.getElementById('manualLogBy').value.trim() || 'Администратор',
        source: 'admin',
        notes: document.getElementById('manualLogNotes').value.trim() || null,
        parts_replaced: document.getElementById('manualLogParts').value.trim() || null,
        cost: parseFloat(document.getElementById('manualLogCost').value) || 0
    };

    showCalendarLoading(true);
    try {
        const { error } = await client.from('factory_maintenance_log').insert([payload]);
        if (error) throw error;

        closeAddManualLogModal();
        await reloadAllCalendarData();
        Swal.fire({ icon: 'success', title: 'Записът е добавен в Сервизния дневник!', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire('Грешка', 'Неуспешен запис: ' + err.message, 'error');
    } finally {
        showCalendarLoading(false);
    }
};

window.deleteLogEntry = async function(logId) {
    const res = await Swal.fire({
        title: 'Изтриване от Сервизния дневник?',
        text: 'Това действие ще премахне записа от историята на машината.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Да, изтрий',
        cancelButtonText: 'Отказ'
    });

    if (res.isConfirmed) {
        showCalendarLoading(true);
        try {
            const { error } = await client.from('factory_maintenance_log').delete().eq('id', logId);
            if (error) throw error;
            await reloadAllCalendarData();
            Swal.fire({ icon: 'success', title: 'Изтрито!', timer: 1200, showConfirmButton: false });
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        } finally {
            showCalendarLoading(false);
        }
    }
};

// ----------------------------------------------------
// СПРАВОЧНИК МАШИНИ И БЪДЕЩ ПАСПОРТ
// ----------------------------------------------------
function renderMachinesDirectory() {
    const container = document.getElementById('calMachinesGrid');
    if (!container) return;

    if (calendarState.machines.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #64748b;">Няма въведени машини.</div>`;
        return;
    }

    container.innerHTML = calendarState.machines.map(mac => {
        const logCount = calendarState.logs.filter(l => l.machine_name === mac.name).length;
        const pendingCount = calendarState.events.filter(e => e.machine_name === mac.name && e.status === 'pending').length;

        return `
            <div class="machine-card">
                <div class="machine-card-header">
                    <div>
                        <div class="machine-card-name">⚙️ ${escapeHtml(mac.name)}</div>
                        <div class="machine-card-dept">${escapeHtml(mac.department || 'Производствен цех')} ${mac.code ? `• Инв. №: ${escapeHtml(mac.code)}` : ''}</div>
                    </div>
                    <span class="machine-status-badge ${mac.status || 'active'}">${mac.status === 'maintenance' ? 'В ремонт' : 'Активна'}</span>
                </div>
                <div class="machine-card-body">
                    <div class="machine-stat">
                        <span class="stat-label">Предстоящи задачи:</span>
                        <span class="stat-val ${pendingCount > 0 ? 'highlight-amber' : ''}">${pendingCount} бр.</span>
                    </div>
                    <div class="machine-stat">
                        <span class="stat-label">Сервизни записи:</span>
                        <span class="stat-val highlight-blue">${logCount} записа</span>
                    </div>
                    ${mac.model ? `<div style="font-size: 0.85em; color: #64748b; margin-top: 5px;">Модел: <strong>${escapeHtml(mac.model)}</strong></div>` : ''}
                </div>
                <div class="machine-card-actions">
                    <button class="btn-mac-action btn-mac-log" onclick="viewMachineHistory('${escapeHtml(mac.name)}')">
                        📋 Сервизен дневник (${logCount})
                    </button>
                    <button class="btn-mac-action btn-mac-add" onclick="scheduleTaskForMachine('${escapeHtml(mac.name)}')">
                        + Насрочи
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

window.viewMachineHistory = function(macName) {
    switchCalendarSubTab('log');
    filterLogBySpecificMachine(macName);
};

window.scheduleTaskForMachine = function(macName) {
    openAddEventModal();
    document.getElementById('evMachineSelect').value = macName;
};

window.openAddMachineModal = function() {
    Swal.fire({
        title: '➕ Добавяне на нова машина',
        html: `
            <div style="display: flex; flex-direction: column; gap: 12px; text-align: left; font-size: 0.9em;">
                <div>
                    <label style="font-weight: 700; color: #475569;">Име на машината: *</label>
                    <input id="swalMacName" class="swal2-input" placeholder="напр. Шлайф №3, HAAS ST 20..." style="margin: 4px 0 0; width: 100%; box-sizing: border-box;">
                </div>
                <div>
                    <label style="font-weight: 700; color: #475569;">Инвентарен / Фабричен номер:</label>
                    <input id="swalMacCode" class="swal2-input" placeholder="напр. INV-042" style="margin: 4px 0 0; width: 100%; box-sizing: border-box;">
                </div>
                <div>
                    <label style="font-weight: 700; color: #475569;">Цех / Местоположение:</label>
                    <input id="swalMacDept" class="swal2-input" placeholder="напр. Механичен цех, Монтаж 1..." style="margin: 4px 0 0; width: 100%; box-sizing: border-box;">
                </div>
                <div>
                    <label style="font-weight: 700; color: #475569;">Модел / Производител:</label>
                    <input id="swalMacModel" class="swal2-input" placeholder="напр. Haas Automation..." style="margin: 4px 0 0; width: 100%; box-sizing: border-box;">
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Запази машина',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#4338ca',
        preConfirm: () => {
            const name = document.getElementById('swalMacName').value.trim();
            if (!name) {
                Swal.showValidationMessage('Моля, въведете име на машината!');
                return false;
            }
            return {
                name: name,
                code: document.getElementById('swalMacCode').value.trim() || null,
                department: document.getElementById('swalMacDept').value.trim() || null,
                model: document.getElementById('swalMacModel').value.trim() || null
            };
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            showCalendarLoading(true);
            try {
                const { error } = await client.from('factory_machines').insert([result.value]);
                if (error) throw error;
                await reloadAllCalendarData();
                Swal.fire({ icon: 'success', title: 'Машината е добавена успешно!', timer: 1500, showConfirmButton: false });
            } catch (err) {
                Swal.fire('Грешка', err.message, 'error');
            } finally {
                showCalendarLoading(false);
            }
        }
    });
};

function updateMachineDropdowns() {
    const evSel = document.getElementById('evMachineSelect');
    const logSel = document.getElementById('logMachineFilterSelect');
    const manualLogSel = document.getElementById('manualLogMachineSelect');
    const calFilterSel = document.getElementById('calMachineFilterSelect');

    const optionsHtml = '<option value="">(Няма / Общо за завода)</option>' +
        calendarState.machines.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');

    const filterOptionsHtml = '<option value="all">Всички машини</option>' +
        calendarState.machines.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');

    if (evSel) evSel.innerHTML = optionsHtml;
    if (manualLogSel) manualLogSel.innerHTML = '<option value="">-- Изберете машина --</option>' + calendarState.machines.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');
    if (logSel) logSel.innerHTML = filterOptionsHtml;
    if (calFilterSel) calFilterSel.innerHTML = filterOptionsHtml;
}

window.onCalendarFilterChange = function() {
    const catSel = document.getElementById('calCategoryFilterSelect');
    const macSel = document.getElementById('calMachineFilterSelect');
    if (catSel) calendarState.filterCategory = catSel.value;
    if (macSel) calendarState.filterMachine = macSel.value;
    renderCalendarMonthView();
};

function formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}.${parts[1]}.${parts[0]} г.`;
    }
    return dateStr;
}

function formatUnitBg(unit) {
    if (unit === 'days') return 'дни';
    if (unit === 'weeks') return 'седмици';
    if (unit === 'months') return 'месеца';
    if (unit === 'years') return 'години';
    return unit;
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

function initCalendarModalHtml() {
    if (document.getElementById('calendarModalBackdrop')) return;

    const modalHtml = `
    <!-- ГЛАВЕН МОДАЛ ЗА КАЛЕНДАР И СЕРВИЗЕН ДНЕВНИК -->
    <div class="modal-backdrop" id="calendarModalBackdrop" style="display: none; align-items: center; justify-content: center; z-index: 1050;">
      <div class="modal cal-main-modal" style="width: 95vw; max-width: 1450px; height: 92vh; max-height: 92vh; display: flex; flex-direction: column; padding: 0; border-radius: 16px; overflow: hidden; background: #f8fafc; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);">
        
        <!-- МОДАЛ ХЕДЪР -->
        <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: white; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
            <div style="display: flex; align-items: center; gap: 14px;">
                <div style="background: #0891b2; width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.4em;">📅</div>
                <div>
                    <div style="font-size: 1.25em; font-weight: 800; letter-spacing: 0.3px;">Календар на завода & Сервизен дневник</div>
                    <div style="font-size: 0.85em; color: #94a3b8;">Планова поддръжка, ремонти на машини, ЗБУТ, медицински прегледи и предупреждения</div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <button class="btn-cal-action" onclick="reloadAllCalendarData()" style="background: #334155; color: white;" title="Презареди данни">🔄 Обнови</button>
                <button onclick="closeCalendarModal()" style="border:none; background: #334155; color: #cbd5e1; width: 36px; height: 36px; border-radius: 8px; font-size: 1.2em; cursor: pointer; display: flex; align-items: center; justify-content: center;">✖</button>
            </div>
        </div>

        <!-- ЛЕНТА С ПОДТАБОВЕ -->
        <div style="background: white; border-bottom: 1px solid #e2e8f0; padding: 0 24px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
            <div style="display: flex; gap: 8px;">
                <button class="cal-nav-btn active" data-tab="calendar" onclick="switchCalendarSubTab('calendar')">
                    📅 Календар & График
                </button>
                <button class="cal-nav-btn" data-tab="log" onclick="switchCalendarSubTab('log')">
                    📋 Сервизен дневник (История)
                </button>
                <button class="cal-nav-btn" data-tab="machines" onclick="switchCalendarSubTab('machines')">
                    ⚙️ Справочник Машини
                </button>
            </div>
            <div style="display: flex; gap: 8px; padding: 8px 0;">
                <button class="btn-cal-action" onclick="openAddEventModal()" style="background: #4338ca; color: white;">
                    ➕ Насрочи задача
                </button>
                <button class="btn-cal-action" onclick="openAddManualLogModal()" style="background: #0d9488; color: white;">
                    ✍️ Впиши ремонт
                </button>
            </div>
        </div>

        <!-- СЪДЪРЖАНИЕ НА МОДАЛА СЪС СКРОЛ -->
        <div style="flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px;">
            
            <!-- ALERT BANNER ЗА НАБЛИЖАВАЩИ И ПРОСРОЧЕНИ ЗАДАЧИ -->
            <div id="calendarAlertsBanner"></div>

            <!-- ПОДТАБ 1: КАЛЕНДАР & ГРАФИК -->
            <div id="calView_calendar" class="cal-subtab-view">
                
                <div style="background: white; padding: 14px 20px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <button class="cal-btn-nav" onclick="calendarNavPrev()">◀</button>
                        <button class="cal-btn-today" onclick="calendarNavToday()">Днес</button>
                        <button class="cal-btn-nav" onclick="calendarNavNext()">▶</button>
                        <div id="calendarMonthTitle" style="font-size: 1.3em; font-weight: 800; color: #1e293b; margin-left: 10px; min-width: 220px;"></div>
                    </div>

                    <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <label style="font-size: 0.85em; font-weight: 700; color: #64748b;">Категория:</label>
                            <select id="calCategoryFilterSelect" onchange="onCalendarFilterChange()" class="cal-filter-select">
                                <option value="all">Всички категории</option>
                                <option value="Машини">🔧 Машини и оборудване</option>
                                <option value="ЗБУТ / ЧР">🩺 ЗБУТ / ЧР (Медицински)</option>
                                <option value="Инфраструктура">🏢 Инфраструктура & Сграда</option>
                                <option value="Автопарк">🚗 Автопарк / МПС (Винетки, ГТП)</option>
                                <option value="Администрация">🔒 Администрация & Финанси</option>
                                <option value="Общи">📌 Общи фирмени събития</option>
                            </select>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <label style="font-size: 0.85em; font-weight: 700; color: #64748b;">Машина:</label>
                            <select id="calMachineFilterSelect" onchange="onCalendarFilterChange()" class="cal-filter-select">
                                <option value="all">Всички машини</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="cal-weekdays-header">
                    <div>Понеделник</div>
                    <div>Вторник</div>
                    <div>Сряда</div>
                    <div>Четвъртък</div>
                    <div>Петък</div>
                    <div style="color: #ea580c;">Събота</div>
                    <div style="color: #dc2626;">Неделя</div>
                </div>

                <div id="calendarMonthGrid" class="cal-month-grid"></div>
            </div>

            <!-- ПОДТАБ 2: СЕРВИЗЕН ДНЕВНИК (ИСТОРИЯ) -->
            <div id="calView_log" class="cal-subtab-view" style="display: none;">
                <div style="background: white; padding: 16px 20px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                    <div style="display: flex; gap: 12px; align-items: center; flex: 1; flex-wrap: wrap;">
                        <input type="text" id="logSearchInput" placeholder="🔍 Търси в сервизен дневник (машина, дейност, майстор)..." oninput="onLogFilterChange()" style="flex: 1; min-width: 250px; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.9em; outline: none;">
                        <select id="logMachineFilterSelect" onchange="onLogFilterChange()" class="cal-filter-select" style="min-width: 200px;">
                            <option value="all">Всички машини</option>
                        </select>
                    </div>
                    <button class="btn-cal-action" onclick="openAddManualLogModal()" style="background: #0d9488; color: white;">
                        ✍️ Впиши извънреден ремонт
                    </button>
                </div>

                <div class="table-container" style="background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                        <thead>
                            <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left;">
                                <th style="padding: 12px 16px; width: 120px;">Дата</th>
                                <th style="padding: 12px 16px; width: 180px;">Машина</th>
                                <th style="padding: 12px 16px; width: 150px;">Вид дейност</th>
                                <th style="padding: 12px 16px;">Какво е извършено / Забележки</th>
                                <th style="padding: 12px 16px; width: 150px;">Извършил</th>
                                <th style="padding: 12px 16px; width: 110px;">Източник</th>
                                <th style="padding: 12px 16px; width: 60px; text-align: right;">Действия</th>
                            </tr>
                        </thead>
                        <tbody id="calLogTableBody"></tbody>
                    </table>
                </div>
            </div>

            <!-- ПОДТАБ 3: СПРАВОЧНИК МАШИНИ -->
            <div id="calView_machines" class="cal-subtab-view" style="display: none;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <span style="font-size: 1.1em; font-weight: 800; color: #1e293b;">Списък на заводския парк и машини</span>
                        <div style="font-size: 0.85em; color: #64748b;">Основа за техническия паспорт и бърз преглед на сервизната история</div>
                    </div>
                    <button class="btn-cal-action" onclick="openAddMachineModal()" style="background: #4338ca; color: white;">
                        ➕ Добави нова машина
                    </button>
                </div>
                <div id="calMachinesGrid" class="machines-cards-grid"></div>
            </div>

        </div>

        <!-- ГЛОБАЛЕН ЛОУДЪР -->
        <div id="calendarGlobalLoader" style="position: absolute; top:0; left:0; width:100%; height:100%; background: rgba(255,255,255,0.7); backdrop-filter: blur(2px); display: none; align-items: center; justify-content: center; z-index: 100;">
            <div style="background: white; padding: 20px 30px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); font-weight: 700; color: #4338ca; display: flex; align-items: center; gap: 12px;">
                <span>⏳</span> Зареждане на данни...
            </div>
        </div>

      </div>
    </div>

    <!-- МОДАЛ ЗА ДЕТАЙЛИ НА СЪБИТИЕ -->
    <div class="modal-backdrop" id="eventDetailsModalBackdrop" style="display: none; z-index: 1060;">
        <div class="modal" style="max-width: 600px; padding: 24px; border-radius: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px;">
                <div>
                    <div id="evDetailTitle" style="font-size: 1.3em; font-weight: 800; color: #0f172a;"></div>
                    <div id="evDetailStatus" style="margin-top: 6px;"></div>
                </div>
                <button onclick="closeEventDetailsModal()" style="border:none;background:transparent;cursor:pointer;font-size:1.3em;color:#94a3b8;">✖</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.9em; margin-bottom: 20px;">
                <div style="background: #f8fafc; padding: 10px 14px; border-radius: 8px;">
                    <div style="color: #64748b; font-size: 0.8em; text-transform: uppercase; font-weight: 700;">Машина / Обект:</div>
                    <div id="evDetailMachine" style="font-weight: 700; color: #1e293b; margin-top: 2px;"></div>
                </div>
                <div style="background: #f8fafc; padding: 10px 14px; border-radius: 8px;">
                    <div style="color: #64748b; font-size: 0.8em; text-transform: uppercase; font-weight: 700;">Категория:</div>
                    <div id="evDetailCategory" style="font-weight: 700; color: #1e293b; margin-top: 2px;"></div>
                </div>
                <div style="background: #f8fafc; padding: 10px 14px; border-radius: 8px;">
                    <div style="color: #64748b; font-size: 0.8em; text-transform: uppercase; font-weight: 700;">Дата за изпълнение:</div>
                    <div id="evDetailDate" style="font-weight: 700; color: #1e293b; margin-top: 2px;"></div>
                </div>
                <div style="background: #f8fafc; padding: 10px 14px; border-radius: 8px;">
                    <div style="color: #64748b; font-size: 0.8em; text-transform: uppercase; font-weight: 700;">Срок за предупреждение:</div>
                    <div id="evDetailNotify" style="font-weight: 700; color: #1e293b; margin-top: 2px;"></div>
                </div>
                <div style="background: #f8fafc; padding: 10px 14px; border-radius: 8px; grid-column: span 2;">
                    <div style="color: #64748b; font-size: 0.8em; text-transform: uppercase; font-weight: 700;">Повторяемост:</div>
                    <div id="evDetailRecurring" style="font-weight: 700; color: #1e293b; margin-top: 2px;"></div>
                </div>
                <div style="background: #f8fafc; padding: 10px 14px; border-radius: 8px; grid-column: span 2;">
                    <div style="color: #64748b; font-size: 0.8em; text-transform: uppercase; font-weight: 700;">Отговорник:</div>
                    <div id="evDetailAssigned" style="font-weight: 700; color: #1e293b; margin-top: 2px;"></div>
                </div>
                <div style="background: #f8fafc; padding: 10px 14px; border-radius: 8px; grid-column: span 2;">
                    <div style="color: #64748b; font-size: 0.8em; text-transform: uppercase; font-weight: 700;">Инструкции и бележки:</div>
                    <div id="evDetailNotes" style="color: #334155; margin-top: 4px; white-space: pre-wrap;"></div>
                </div>
            </div>
            <div id="evDetailActions" style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #e2e8f0; padding-top: 16px;"></div>
        </div>
    </div>

    <!-- МОДАЛ ЗА ОТЧИТАНЕ КАТО ИЗПЪЛНЕНО -->
    <div class="modal-backdrop" id="completeEventModalBackdrop" style="display: none; z-index: 1070;">
        <div class="modal" style="max-width: 580px; padding: 24px; border-radius: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px;">
                <div id="compModalTitle" style="font-size: 1.2em; font-weight: 800; color: #065f46;"></div>
                <button onclick="closeCompleteEventModal()" style="border:none;background:transparent;cursor:pointer;font-size:1.3em;color:#94a3b8;">✖</button>
            </div>
            <form onsubmit="saveEventCompletion(event)">
                <input type="hidden" id="compModalEventId">
                <div style="display: flex; flex-direction: column; gap: 14px; font-size: 0.9em;">
                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Реална дата на извършване: *</label>
                        <input type="date" id="compDateInput" required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Кой извърши дейността: *</label>
                        <input type="text" id="compByInput" placeholder="напр. Иван Иванов (оператор), сервизен техник..." required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Вложени резервни части / консумативи:</label>
                        <input type="text" id="compPartsInput" placeholder="напр. Масло Shell Tellus 46 (15л), Филтър F-12..." style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Стойност / Разход в лв. (по желание):</label>
                        <input type="number" step="0.01" id="compCostInput" placeholder="0.00" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Бележки и констатации за Сервизния дневник:</label>
                        <textarea id="compNotesInput" rows="3" placeholder="Опишете какво точно беше извършено, има ли препоръки..." style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box; font-family: inherit;"></textarea>
                    </div>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                    <button type="button" class="btn-cal-sec" onclick="closeCompleteEventModal()">Отказ</button>
                    <button type="submit" class="btn-cal-success" style="background: #059669; color: white;">Запази в Сервизния дневник</button>
                </div>
            </form>
        </div>
    </div>

    <!-- МОДАЛ ЗА ДОБАВЯНЕ / РЕДАКЦИЯ НА ПЛАНОВО СЪБИТИЕ -->
    <div class="modal-backdrop" id="addEventModalBackdrop" style="display: none; z-index: 1060;">
        <div class="modal" style="max-width: 620px; padding: 24px; border-radius: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px;">
                <div id="evFormTitle" style="font-size: 1.2em; font-weight: 800; color: #1e293b;">➕ Насрочване на задача</div>
                <button onclick="closeAddEventModal()" style="border:none;background:transparent;cursor:pointer;font-size:1.3em;color:#94a3b8;">✖</button>
            </div>
            <form onsubmit="saveEventForm(event)">
                <div style="display: flex; flex-direction: column; gap: 14px; font-size: 0.9em;">
                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Заглавие на задачата: *</label>
                        <input type="text" id="evTitleInput" placeholder="напр. Смяна на масло, Годишни медицински прегледи..." required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Категория: *</label>
                            <select id="evCategorySelect" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                                <option value="Машини">🔧 Машини и оборудване</option>
                                <option value="ЗБУТ / ЧР">🩺 ЗБУТ / ЧР (Медицински)</option>
                                <option value="Инфраструктура">🏢 Инфраструктура & Сграда</option>
                                <option value="Общи">📌 Общи събития</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Машина / Обект:</label>
                            <select id="evMachineSelect" onchange="onEvMachineChange()" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                                <option value="">(Цял завод / Общо)</option>
                            </select>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Дата за изпълнение: *</label>
                            <input type="date" id="evDateInput" required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Предупреждение преди датата:</label>
                            <div style="display: flex; gap: 6px; align-items: center;">
                                <input type="number" id="evNotifyDaysInput" min="0" value="30" style="width: 90px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                                <span style="font-size: 0.9em; color: #64748b;">дни</span>
                                <div style="display: flex; gap: 4px; margin-left: auto;">
                                    <button type="button" class="btn-cal-pill" onclick="setNotifyDaysQuick(5)">5д</button>
                                    <button type="button" class="btn-cal-pill" onclick="setNotifyDaysQuick(15)">15д</button>
                                    <button type="button" class="btn-cal-pill" onclick="setNotifyDaysQuick(30)">30д</button>
                                    <button type="button" class="btn-cal-pill" onclick="setNotifyDaysQuick(60)">60д</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 10px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 700; color: #1e293b;">
                            <input type="checkbox" id="evRecurringCb" onchange="toggleRecurringFields()" style="transform: scale(1.2); accent-color: #4338ca;">
                            <span>Периодично събитие (повтаря се автоматично)</span>
                        </label>
                        <div id="evRecurringOptionsBox" style="margin-top: 10px; display: flex; align-items: center; gap: 10px; padding-left: 24px;">
                            <span>На всеки:</span>
                            <input type="number" id="evIntervalValInput" min="1" value="6" style="width: 80px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
                            <select id="evIntervalUnitSelect" style="padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
                                <option value="months">месеца</option>
                                <option value="years">години</option>
                                <option value="weeks">седмици</option>
                                <option value="days">дни</option>
                            </select>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Цех / Отдел (по желание):</label>
                            <input type="text" id="evDeptInput" placeholder="напр. Цех Механичен" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Отговорник (по желание):</label>
                            <input type="text" id="evAssignedInput" placeholder="напр. инж. Петров, външна фирма..." style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                        </div>
                    </div>

                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Инструкции и забележки:</label>
                        <textarea id="evNotesInput" rows="2" placeholder="напр. Необходими са 20л масло Shell Tellus 46, проверка на филтри..." style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box; font-family: inherit;"></textarea>
                    </div>

                    <div>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #475569;">
                            <input type="checkbox" id="evTerminalCb" checked style="accent-color: #4338ca;">
                            <span>Позволи отчитане директно от Терминала на машината от оператора</span>
                        </label>
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                    <button type="button" class="btn-cal-sec" onclick="closeAddEventModal()">Отказ</button>
                    <button type="submit" class="btn-cal-primary" style="background: #4338ca; color: white;">Запази в календара</button>
                </div>
            </form>
        </div>
    </div>

    <!-- МОДАЛ ЗА ВПИСВАНЕ НА ИЗВЪНРЕДЕН РЕМОНТ В ДНЕВНИКА -->
    <div class="modal-backdrop" id="addManualLogModalBackdrop" style="display: none; z-index: 1060;">
        <div class="modal" style="max-width: 580px; padding: 24px; border-radius: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px;">
                <div style="font-size: 1.2em; font-weight: 800; color: #0f172a;">✍️ Вписване в Сервизния дневник</div>
                <button onclick="closeAddManualLogModal()" style="border:none;background:transparent;cursor:pointer;font-size:1.3em;color:#94a3b8;">✖</button>
            </div>
            <form onsubmit="saveManualLogEntry(event)">
                <div style="display: flex; flex-direction: column; gap: 14px; font-size: 0.9em;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Машина: *</label>
                            <select id="manualLogMachineSelect" required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;"></select>
                        </div>
                        <div>
                            <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Дата: *</label>
                            <input type="date" id="manualLogDate" required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Вид дейност:</label>
                            <select id="manualLogActivityType" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                                <option value="Извънреден ремонт">🚨 Извънреден ремонт / Авария</option>
                                <option value="Планова поддръжка">🔧 Планова поддръжка</option>
                                <option value="Смяна на консуматив">🛢️ Смяна на масло / консуматив</option>
                                <option value="Калибрация / Преглед">📐 Калибрация / Преглед</option>
                                <option value="Друго">📌 Друго</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Извършил: *</label>
                            <input type="text" id="manualLogBy" placeholder="Име на техник / фирма..." required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                        </div>
                    </div>

                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Какво беше извършено: *</label>
                        <input type="text" id="manualLogTitle" placeholder="напр. Подмяна на лагер на вретено, ремонт на помпа..." required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                    </div>

                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Вложени резервни части:</label>
                        <input type="text" id="manualLogParts" placeholder="напр. Лагер 6000 ZZ (2 бр.), О-пръстен..." style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                    </div>

                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Стойност / Разход в лв. (по желание):</label>
                        <input type="number" step="0.01" id="manualLogCost" placeholder="0.00" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                    </div>

                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Подробни бележки:</label>
                        <textarea id="manualLogNotes" rows="2" placeholder="Опишете детайли по ремонта..." style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box; font-family: inherit;"></textarea>
                    </div>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                    <button type="button" class="btn-cal-sec" onclick="closeAddManualLogModal()">Отказ</button>
                    <button type="submit" class="btn-cal-primary" style="background: #0d9488; color: white;">Запази в Сервизния дневник</button>
                </div>
            </form>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}


// ========================================================
// АВТОМАТИЧНИ ИЗВЕСТИЯ ЗА АДМИН ПАНЕЛА (ДНЕС, УТРЕ, ПРОСРОЧЕНИ)
// ========================================================
window.checkAdminCalendarAlertsOnLoad = async function(isSilent = false) {
    if (typeof client === 'undefined') return;

    try {
        const { data: events, error } = await client
            .from('factory_events')
            .select('*')
            .eq('status', 'pending')
            .order('event_date', { ascending: true });

        if (error) throw error;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let overdue = [];
        let todayEvents = [];
        let tomorrowEvents = [];
        let upcomingEvents = [];

        (events || []).forEach(ev => {
            const evDate = new Date(ev.event_date);
            evDate.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((evDate - today) / (1000 * 60 * 60 * 24));
            const notifyDays = ev.notify_days_before !== undefined ? ev.notify_days_before : 30;

            if (diffDays < 0) {
                overdue.push({ ev, diffDays: Math.abs(diffDays) });
            } else if (diffDays === 0) {
                todayEvents.push({ ev, diffDays });
            } else if (diffDays === 1) {
                tomorrowEvents.push({ ev, diffDays });
            } else if (diffDays <= notifyDays) {
                upcomingEvents.push({ ev, diffDays });
            }
        });

        // 1. Обновяване на баджа на бутона "📅 Календар & Поддръжка"
        const badge = document.getElementById('adminCalBadge');
        const navBtn = document.getElementById('btnAdminCalendarNav');
        const urgentCount = overdue.length + todayEvents.length + tomorrowEvents.length;
        const totalAlerts = urgentCount + upcomingEvents.length;

        if (badge) {
            if (totalAlerts > 0) {
                badge.innerText = totalAlerts;
                badge.style.display = 'inline-block';
                if (urgentCount > 0) {
                    badge.style.background = '#ef4444';
                } else {
                    badge.style.background = '#f59e0b';
                }
            } else {
                badge.style.display = 'none';
            }
        }

        // 2. Глобален известителен банер над контролите в Админ панела
        const globalBanner = document.getElementById('adminGlobalAlertBanner');
        if (globalBanner) {
            if (urgentCount > 0) {
                let bannerHtml = '';
                if (overdue.length > 0) {
                    bannerHtml += `
                        <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-left: 5px solid #dc2626; border: 1px solid #fca5a5; color: #991b1b; padding: 12px 18px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 10px; box-shadow: 0 2px 6px rgba(220,38,38,0.15);">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="font-size: 1.5em;">🚨</span>
                                <div>
                                    <div style="font-weight: 800;">СПЕШНО: Имате ${overdue.length} просрочени събития в Календара!</div>
                                    <div style="font-size: 0.9em; margin-top: 2px;">${overdue.map(i => `<strong>${escapeHtml(getEventObjectDisplay(i.ev))}:</strong> ${escapeHtml(i.ev.title)} (просрочено с ${i.diffDays} дни)`).join(', ')}</div>
                                </div>
                            </div>
                            <button onclick="openCalendarModal()" style="background: #dc2626; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 800; cursor: pointer;">📅 Отвори Календара</button>
                        </div>
                    `;
                }

                if (todayEvents.length > 0) {
                    bannerHtml += `
                        <div style="background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%); border-left: 5px solid #ea580c; border: 1px solid #fdba74; color: #9a3412; padding: 12px 18px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 10px; box-shadow: 0 2px 6px rgba(234,88,12,0.15);">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="font-size: 1.5em;">⚠️</span>
                                <div>
                                    <div style="font-weight: 800;">ВНИМАНИЕ: ДНЕС изтича срок за ${todayEvents.length} събитие!</div>
                                    <div style="font-size: 0.9em; margin-top: 2px;">${todayEvents.map(i => `<strong>${escapeHtml(getEventObjectDisplay(i.ev))}:</strong> ${escapeHtml(i.ev.title)}`).join(', ')}</div>
                                </div>
                            </div>
                            <button onclick="openCalendarModal()" style="background: #ea580c; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 800; cursor: pointer;">📅 Прегледай</button>
                        </div>
                    `;
                }

                if (tomorrowEvents.length > 0) {
                    bannerHtml += `
                        <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-left: 5px solid #2563eb; border: 1px solid #93c5fd; color: #1e40af; padding: 12px 18px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 10px; box-shadow: 0 2px 6px rgba(37,99,235,0.15);">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="font-size: 1.5em;">🔔</span>
                                <div>
                                    <div style="font-weight: 800;">НАПОМНЯНЕ: След 1 ден (утре) наближава краен срок:</div>
                                    <div style="font-size: 0.9em; margin-top: 2px;">${tomorrowEvents.map(i => `<strong>${getEventCategoryIcon(i.ev.category)} ${escapeHtml(getEventObjectDisplay(i.ev))}:</strong> ${escapeHtml(i.ev.title)} (Срок: ${formatDateDisplay(i.ev.event_date)})`).join(', ')}</div>
                                </div>
                            </div>
                            <button onclick="openCalendarModal()" style="background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 800; cursor: pointer;">📅 Отвори Календара</button>
                        </div>
                    `;
                }

                globalBanner.innerHTML = bannerHtml;
                globalBanner.style.display = 'block';
            } else {
                globalBanner.innerHTML = '';
                globalBanner.style.display = 'none';
            }
        }

        // 3. Изскачащо Toast известие при първоначално влизане в админ панела
        if (!isSilent && (tomorrowEvents.length > 0 || todayEvents.length > 0 || overdue.length > 0)) {
            const hasShownToast = sessionStorage.getItem('mes_cal_toast_shown');
            if (!hasShownToast) {
                sessionStorage.setItem('mes_cal_toast_shown', '1');
                let toastTitle = '';
                let toastText = '';
                let toastIcon = 'warning';

                if (overdue.length > 0) {
                    toastTitle = `🚨 ${overdue.length} просрочени задачи!`;
                    toastText = overdue.map(i => `${escapeHtml(getEventObjectDisplay(i.ev))}: ${escapeHtml(i.ev.title)}`).join(', ');
                    toastIcon = 'error';
                } else if (todayEvents.length > 0) {
                    toastTitle = `⚠️ Днес изтича срок!`;
                    toastText = todayEvents.map(i => `${escapeHtml(getEventObjectDisplay(i.ev))}: ${escapeHtml(i.ev.title)}`).join(', ');
                } else if (tomorrowEvents.length > 0) {
                    toastTitle = `🔔 Напомняне: Събитие утре (след 1 ден)!`;
                    toastText = tomorrowEvents.map(i => `${escapeHtml(getEventObjectDisplay(i.ev))}: ${escapeHtml(i.ev.title)}`).join(', ');
                    toastIcon = 'info';
                }

                const Toast = Swal.mixin({
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: true,
                    confirmButtonText: '📅 Виж в календара',
                    confirmButtonColor: '#4338ca',
                    timer: 8000,
                    timerProgressBar: true
                });

                Toast.fire({
                    icon: toastIcon,
                    title: toastTitle,
                    text: toastText
                }).then((res) => {
                    if (res.isConfirmed) {
                        openCalendarModal();
                    }
                });
            }
        }

    } catch (err) {
        if (!isSilent) console.error('Грешка при проверка за известия в админ панела:', err);
    }
};

// Автоматичен старт при зареждане на админ панела
function bootAdminCalendarAlerts() {
    setTimeout(() => {
        checkAdminCalendarAlertsOnLoad();
    }, 1200);

    setInterval(() => {
        checkAdminCalendarAlertsOnLoad(true);
    }, 60000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootAdminCalendarAlerts);
} else {
    bootAdminCalendarAlerts();
}

