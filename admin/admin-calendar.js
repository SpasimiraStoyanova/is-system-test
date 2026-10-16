// ========================================================
// IS-SYSTEMS: РљРђР›Р•РќР”РђР , РџР›РђРќРћР’Рђ РџРћР”Р”Р РЄР–РљРђ Р РЎР•Р Р’РР—Р•Рќ Р”РќР•Р’РќРРљ
// ========================================================

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

// РћС‚РІР°СЂСЏРЅРµ РЅР° РіР»Р°РІРЅРёСЏ РјРѕРґР°Р»РµРЅ РїСЂРѕР·РѕСЂРµС†
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

// Р—Р°СЂРµР¶РґР°РЅРµ РЅР° РґР°РЅРЅРё РѕС‚ Supabase
async function reloadAllCalendarData() {
    showCalendarLoading(true);
    try {
        // 1. Р—Р°СЂРµР¶РґР°РЅРµ РЅР° РјР°С€РёРЅРё
        const { data: macData, error: macErr } = await client
            .from('factory_machines')
            .select('*')
            .order('name', { ascending: true });
        if (macErr) throw macErr;
        calendarState.machines = macData || [];

        // 2. Р—Р°СЂРµР¶РґР°РЅРµ РЅР° СЃСЉР±РёС‚РёСЏ
        const { data: evData, error: evErr } = await client
            .from('factory_events')
            .select('*')
            .order('event_date', { ascending: true });
        if (evErr) throw evErr;
        calendarState.events = evData || [];

        // 3. Р—Р°СЂРµР¶РґР°РЅРµ РЅР° СЃРµСЂРІРёР·РµРЅ РґРЅРµРІРЅРёРє
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
        console.error('Р“СЂРµС€РєР° РїСЂРё Р·Р°СЂРµР¶РґР°РЅРµ РЅР° РєР°Р»РµРЅРґР°СЂР°:', err);
        Swal.fire('Р“СЂРµС€РєР°', 'РќРµСѓСЃРїРµС€РЅРѕ Р·Р°СЂРµР¶РґР°РЅРµ РЅР° РґР°РЅРЅРёС‚Рµ: ' + (err.message || err), 'error');
    } finally {
        showCalendarLoading(false);
    }
}

function showCalendarLoading(show) {
    const loader = document.getElementById('calendarGlobalLoader');
    if (loader) loader.style.display = show ? 'flex' : 'none';
}

// РџСЂРµРІРєР»СЋС‡РІР°РЅРµ РјРµР¶РґСѓ РїРѕРґС‚Р°Р±РѕРІРµС‚Рµ (РљР°Р»РµРЅРґР°СЂ, РЎРµСЂРІРёР·РµРЅ РґРЅРµРІРЅРёРє, РњР°С€РёРЅРё)
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
// РР—Р’Р•РЎРўРРЇ Р РџР Р•Р”РЈРџР Р•Р–Р”Р•РќРРЇ (ALERT BANNER)
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
                    <span style="font-size: 1.4em;">вњ…</span>
                    <span>Р’СЃРёС‡РєРё РјР°С€РёРЅРё Рё СЃСЉР±РёС‚РёСЏ СЃР° РІ РіСЂР°С„РёРє! РќСЏРјР° РїСЂРѕСЃСЂРѕС‡РµРЅРё РёР»Рё РЅР°Р±Р»РёР¶Р°РІР°С‰Рё Р·Р°РґР°С‡Рё.</span>
                </div>
                <button class="btn-cal-action" onclick="openAddEventModal()" style="background: #059669; color: white; padding: 6px 14px; font-size: 0.85em;">+ РќР°СЃСЂРѕС‡Рё Р·Р°РґР°С‡Р°</button>
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
                        <span>рџљЁ</span> <span>РџР РћРЎР РћР§Р•РќР Р—РђР”РђР§Р (${overdueList.length}):</span>
                    </div>
                    <div style="margin-top: 5px; font-size: 0.9em; display: flex; flex-wrap: wrap; gap: 6px;">
                        ${overdueList.map(item => `
                            <span style="background: white; border: 1px solid #f87171; padding: 4px 10px; border-radius: 6px; cursor: pointer;" onclick="openEventDetailsModal(${item.ev.id})" title="РљР»РёРєРЅРµС‚Рµ Р·Р° РґРµС‚Р°Р№Р»Рё">
                                <strong>${escapeHtml(item.ev.machine_name || 'Р—Р°РІРѕРґ')}:</strong> ${escapeHtml(item.ev.title)} 
                                <span style="color: #dc2626; font-weight: 700;">(РїСЂРѕСЃСЂРѕС‡РµРЅРѕ СЃ ${item.diffDays} Рґ.)</span>
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
                        <span>вљ пёЏ</span> <span>РќРђР‘Р›РР–РђР’РђР©Р РЎР РћРљРћР’Р• (${approachingList.length}):</span>
                    </div>
                    <div style="margin-top: 5px; font-size: 0.9em; display: flex; flex-wrap: wrap; gap: 6px;">
                        ${approachingList.map(item => `
                            <span style="background: white; border: 1px solid #fcd34d; padding: 4px 10px; border-radius: 6px; cursor: pointer;" onclick="openEventDetailsModal(${item.ev.id})" title="РљР»РёРєРЅРµС‚Рµ Р·Р° РґРµС‚Р°Р№Р»Рё">
                                <strong>${escapeHtml(item.ev.machine_name || 'Р—Р°РІРѕРґ')}:</strong> ${escapeHtml(item.ev.title)} 
                                <span style="color: #b45309; font-weight: 700;">(СЃР»РµРґ ${item.diffDays === 0 ? 'Р”РќР•РЎ!' : item.diffDays + ' РґРЅРё'})</span>
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
// РњР•РЎР•Р§Р•Рќ РљРђР›Р•РќР”РђР  (GRID VIEW)
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
        'РЇРЅСѓР°СЂРё', 'Р¤РµРІСЂСѓР°СЂРё', 'РњР°СЂС‚', 'РђРїСЂРёР»', 'РњР°Р№', 'Р®РЅРё',
        'Р®Р»Рё', 'РђРІРіСѓСЃС‚', 'РЎРµРїС‚РµРјРІСЂРё', 'РћРєС‚РѕРјРІСЂРё', 'РќРѕРµРјРІСЂРё', 'Р”РµРєРµРјРІСЂРё'
    ];
    const year = calendarState.currentDate.getFullYear();
    const month = calendarState.currentDate.getMonth();
    titleElem.innerText = `${monthNamesBg[month]} ${year} Рі.`;

    // Р¤РёР»С‚СЂРёСЂР°РЅРµ РЅР° СЃСЉР±РёС‚РёСЏ
    let filteredEvents = calendarState.events.filter(ev => {
        if (calendarState.filterCategory !== 'all' && ev.category !== calendarState.filterCategory) return false;
        if (calendarState.filterMachine !== 'all' && ev.machine_name !== calendarState.filterMachine) return false;
        return true;
    });

    // РР·С‡РёСЃР»СЏРІР°РЅРµ РЅР° РґРЅРёС‚Рµ РІ СЂРµС€РµС‚РєР°С‚Р°
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const totalDaysInMonth = lastDayOfMonth.getDate();
    const prevMonthLastDay = new Date(year, month, 0).getDate();

    let cellsHtml = '';

    // Р”РЅРё РѕС‚ РїСЂРµРґС…РѕРґРЅРёСЏ РјРµСЃРµС†
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
        const d = prevMonthLastDay - i;
        cellsHtml += `<div class="cal-day-cell other-month"><span class="day-num">${d}</span></div>`;
    }

    const today = new Date();
    const isCurrentYearMonth = (today.getFullYear() === year && today.getMonth() === month);

    // Р”РЅРё РѕС‚ С‚РµРєСѓС‰РёСЏ РјРµСЃРµС†
    for (let day = 1; day <= totalDaysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = isCurrentYearMonth && (today.getDate() === day);

        const dayEvents = filteredEvents.filter(ev => ev.event_date === dateStr);

        let eventsHtml = '';
        dayEvents.forEach(ev => {
            let catColor = '#4338ca';
            if (ev.category === 'Р—Р‘РЈРў / Р§Р ') { catColor = '#059669'; }
            else if (ev.category === 'РРЅС„СЂР°СЃС‚СЂСѓРєС‚СѓСЂР°') { catColor = '#ea580c'; }
            else if (ev.category === 'РћР±С‰Рё') { catColor = '#7c3aed'; }

            let statusIcon = 'вЏі';
            let statusClass = 'pending';
            if (ev.status === 'completed') {
                statusIcon = 'вњ…';
                statusClass = 'completed';
                catColor = '#64748b';
            } else {
                const evDate = new Date(ev.event_date);
                evDate.setHours(0, 0, 0, 0);
                const diffTime = evDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays < 0) {
                    statusIcon = 'рџљЁ';
                    statusClass = 'overdue';
                    catColor = '#dc2626';
                } else if (diffDays <= (ev.notify_days_before || 30)) {
                    statusIcon = 'вљ пёЏ';
                    statusClass = 'approaching';
                    catColor = '#d97706';
                }
            }

            eventsHtml += `
                <div class="cal-event-badge ${statusClass}" style="border-left: 3px solid ${catColor};" onclick="event.stopPropagation(); openEventDetailsModal(${ev.id})" title="${escapeHtml(ev.title)} (${escapeHtml(ev.machine_name || 'Р—Р°РІРѕРґ')})">
                    <span class="ev-badge-icon">${statusIcon}</span>
                    <span class="ev-badge-title"><strong>${escapeHtml(ev.machine_name ? ev.machine_name + ': ' : '')}</strong>${escapeHtml(ev.title)}</span>
                </div>
            `;
        });

        cellsHtml += `
            <div class="cal-day-cell ${isToday ? 'today' : ''}" onclick="openAddEventModal('${dateStr}')">
                <div class="cal-cell-header">
                    <span class="day-num ${isToday ? 'today-badge' : ''}">${day}</span>
                    <button class="btn-cell-add" onclick="event.stopPropagation(); openAddEventModal('${dateStr}')" title="Р”РѕР±Р°РІРё Р·Р°РґР°С‡Р° Р·Р° ${day}">+</button>
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
// Р”Р•РўРђР™Р›Р РќРђ РЎРЄР‘РРўРР• Р РћРўР§РРўРђРќР• РљРђРўРћ РР—РџРЄР›РќР•РќРћ
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

    let statusBadge = '<span style="background: #e2e8f0; color: #475569; padding: 4px 8px; border-radius: 6px; font-weight: 700;">Р§Р°РєР°С‰Рѕ</span>';
    if (ev.status === 'completed') {
        statusBadge = '<span style="background: #ecfdf5; color: #059669; padding: 4px 8px; border-radius: 6px; font-weight: 700;">вњ… РР·РїСЉР»РЅРµРЅРѕ</span>';
    } else if (diffDays < 0) {
        statusBadge = `<span style="background: #fef2f2; color: #dc2626; padding: 4px 8px; border-radius: 6px; font-weight: 700;">рџљЁ РџСЂРѕСЃСЂРѕС‡РµРЅРѕ СЃ ${Math.abs(diffDays)} РґРЅРё</span>`;
    } else if (diffDays <= (ev.notify_days_before || 30)) {
        statusBadge = `<span style="background: #fffbeb; color: #d97706; padding: 4px 8px; border-radius: 6px; font-weight: 700;">вљ пёЏ РќР°Р±Р»РёР¶Р°РІР° (СЃР»РµРґ ${diffDays} РґРЅРё)</span>`;
    }

    document.getElementById('evDetailTitle').innerText = ev.title;
    document.getElementById('evDetailStatus').innerHTML = statusBadge;
    document.getElementById('evDetailMachine').innerText = ev.machine_name || 'Р¦СЏР» Р·Р°РІРѕРґ / РћР±С‰Рѕ';
    document.getElementById('evDetailCategory').innerText = ev.category;
    document.getElementById('evDetailDate').innerText = formatDateDisplay(ev.event_date);
    document.getElementById('evDetailNotify').innerText = `${ev.notify_days_before || 30} РґРЅРё РїСЂРµРґРІР°СЂРёС‚РµР»РЅРѕ`;
    document.getElementById('evDetailRecurring').innerText = ev.is_recurring 
        ? `РќР° РІСЃРµРєРё ${ev.repeat_interval_value} ${formatUnitBg(ev.repeat_interval_unit)}`
        : 'Р•РґРЅРѕРєСЂР°С‚РЅРѕ (РЅРµ СЃРµ РїРѕРІС‚Р°СЂСЏ)';
    document.getElementById('evDetailAssigned').innerText = ev.assigned_to || 'РќРµ Рµ РїРѕСЃРѕС‡РµРЅ';
    document.getElementById('evDetailNotes').innerText = ev.notes || 'РќСЏРјР° РІСЉРІРµРґРµРЅРё Р·Р°Р±РµР»РµР¶РєРё.';

    const actionsContainer = document.getElementById('evDetailActions');
    if (ev.status === 'completed') {
        actionsContainer.innerHTML = `
            <button class="btn-cal-sec" onclick="closeEventDetailsModal()">Р—Р°С‚РІРѕСЂРё</button>
            <button class="btn-cal-danger" onclick="deleteEvent(${ev.id})">рџ—‘пёЏ РР·С‚СЂРёР№</button>
        `;
    } else {
        actionsContainer.innerHTML = `
            <button class="btn-cal-danger" onclick="deleteEvent(${ev.id})">рџ—‘пёЏ РР·С‚СЂРёР№</button>
            <button class="btn-cal-sec" onclick="openEditEventModal(${ev.id})">вњЏпёЏ Р РµРґР°РєС†РёСЏ</button>
            <button class="btn-cal-success" onclick="openCompleteEventModal(${ev.id})" style="background: #059669; color: white;">
                вњ… РћС‚С‡РµС‚Рё РєР°С‚Рѕ РёР·РїСЉР»РЅРµРЅРѕ
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
    document.getElementById('compModalTitle').innerText = `РћС‚С‡РёС‚Р°РЅРµ: ${ev.title} (${ev.machine_name || 'Р—Р°РІРѕРґ'})`;
    document.getElementById('compDateInput').value = new Date().toISOString().split('T')[0];
    document.getElementById('compByInput').value = 'РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ';
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
    const completedBy = document.getElementById('compByInput').value.trim() || 'РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ';
    const notes = document.getElementById('compNotesInput').value.trim();
    const partsReplaced = document.getElementById('compPartsInput').value.trim();
    const cost = parseFloat(document.getElementById('compCostInput').value) || 0;

    showCalendarLoading(true);
    try {
        // 1. Р’РїРёСЃРІР°РЅРµ РІ СЃРµСЂРІРёР·РЅРёСЏ РґРЅРµРІРЅРёРє (factory_maintenance_log)
        const { error: logErr } = await client.from('factory_maintenance_log').insert([{
            event_id: ev.id,
            machine_name: ev.machine_name || 'Р¦СЏР» Р·Р°РІРѕРґ',
            activity_type: ev.category === 'РњР°С€РёРЅРё' ? 'РџР»Р°РЅРѕРІР° РїРѕРґРґСЂСЉР¶РєР°' : ev.category,
            title: ev.title,
            completed_date: completedDate,
            completed_by: completedBy,
            source: 'admin',
            notes: notes,
            parts_replaced: partsReplaced,
            cost: cost
        }]);
        if (logErr) throw logErr;

        // 2. РњР°СЂРєРёСЂР°РЅРµ РЅР° С‚РµРєСѓС‰РѕС‚Рѕ СЃСЉР±РёС‚РёРµ РєР°С‚Рѕ completed
        const { error: updErr } = await client.from('factory_events').update({
            status: 'completed',
            updated_at: new Date().toISOString()
        }).eq('id', ev.id);
        if (updErr) throw updErr;

        // 3. РђРєРѕ Рµ РїРµСЂРёРѕРґРёС‡РЅРѕ, Р°РІС‚РѕРјР°С‚РёС‡РЅРѕ СЃСЉР·РґР°РІР°РјРµ СЃР»РµРґРІР°С‰РѕС‚Рѕ СЃСЉР±РёС‚РёРµ
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

        let successMsg = 'Р—Р°РґР°С‡Р°С‚Р° Рµ РѕС‚С‡РµС‚РµРЅР° СѓСЃРїРµС€РЅРѕ Рё Р·Р°РїРёСЃР°РЅР° РІ РЎРµСЂРІРёР·РЅРёСЏ РґРЅРµРІРЅРёРє!';
        if (nextDateStr) {
            successMsg += `<br><br>рџ“… <strong>РЎР»РµРґРІР°С‰Р°С‚Р° РґР°С‚Р° Рµ РЅР°СЃСЂРѕС‡РµРЅР° Р°РІС‚РѕРјР°С‚РёС‡РЅРѕ Р·Р°:</strong> ${formatDateDisplay(nextDateStr)}`;
        }
        Swal.fire({
            icon: 'success',
            title: 'Р“РѕС‚РѕРІРѕ!',
            html: successMsg,
            confirmButtonColor: '#059669'
        });
    } catch (err) {
        console.error('Р“СЂРµС€РєР° РїСЂРё РѕС‚С‡РёС‚Р°РЅРµ:', err);
        Swal.fire('Р“СЂРµС€РєР°', 'РќРµСѓСЃРїРµС€РЅРѕ РѕС‚С‡РёС‚Р°РЅРµ: ' + (err.message || err), 'error');
    } finally {
        showCalendarLoading(false);
    }
};

// ----------------------------------------------------
// РЎРЄР—Р”РђР’РђРќР• Р Р Р•Р”РђРљР¦РРЇ РќРђ РЎРЄР‘РРўРР• (MODAL)
// ----------------------------------------------------
window.openAddEventModal = function(defaultDate) {
    calendarState.editingEventId = null;
    const modal = document.getElementById('addEventModalBackdrop');
    if (!modal) return;

    document.getElementById('evFormTitle').innerText = 'вћ• РќР°СЃСЂРѕС‡РІР°РЅРµ РЅР° РЅРѕРІР° Р·Р°РґР°С‡Р° / СЃСЉР±РёС‚РёРµ';
    document.getElementById('evTitleInput').value = '';
    document.getElementById('evCategorySelect').value = 'РњР°С€РёРЅРё';
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

    document.getElementById('evFormTitle').innerText = 'вњЏпёЏ Р РµРґР°РєС†РёСЏ РЅР° Р·Р°РґР°С‡Р°';
    document.getElementById('evTitleInput').value = ev.title;
    document.getElementById('evCategorySelect').value = ev.category || 'РњР°С€РёРЅРё';
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
        Swal.fire('Р’РЅРёРјР°РЅРёРµ', 'РњРѕР»СЏ, РІСЉРІРµРґРµС‚Рµ РёРјРµ РЅР° СЃСЉР±РёС‚РёРµС‚Рѕ / Р·Р°РґР°С‡Р°С‚Р°!', 'warning');
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
            title: calendarState.editingEventId ? 'РџСЂРѕРјРµРЅРёС‚Рµ СЃР° Р·Р°РїР°Р·РµРЅРё!' : 'Р—Р°РґР°С‡Р°С‚Р° Рµ РЅР°СЃСЂРѕС‡РµРЅР°!',
            timer: 1500,
            showConfirmButton: false
        });
    } catch (err) {
        console.error('Р“СЂРµС€РєР° РїСЂРё Р·Р°РїРёСЃ:', err);
        Swal.fire('Р“СЂРµС€РєР°', 'РќРµСѓСЃРїРµС€РµРЅ Р·Р°РїРёСЃ: ' + (err.message || err), 'error');
    } finally {
        showCalendarLoading(false);
    }
};

window.deleteEvent = async function(eventId) {
    const res = await Swal.fire({
        title: 'РР·С‚СЂРёРІР°РЅРµ РЅР° СЃСЉР±РёС‚РёРµ?',
        text: 'РЎРёРіСѓСЂРЅРё Р»Рё СЃС‚Рµ, С‡Рµ РёСЃРєР°С‚Рµ РґР° РїСЂРµРјР°С…РЅРµС‚Рµ С‚Р°Р·Рё Р·Р°РґР°С‡Р° РѕС‚ РєР°Р»РµРЅРґР°СЂР°?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Р”Р°, РёР·С‚СЂРёР№',
        cancelButtonText: 'РћС‚РєР°Р·'
    });

    if (res.isConfirmed) {
        showCalendarLoading(true);
        try {
            const { error } = await client.from('factory_events').delete().eq('id', eventId);
            if (error) throw error;
            closeEventDetailsModal();
            await reloadAllCalendarData();
            Swal.fire({ icon: 'success', title: 'РР·С‚СЂРёС‚Рѕ!', timer: 1200, showConfirmButton: false });
        } catch (err) {
            Swal.fire('Р“СЂРµС€РєР°', 'РќРµСѓСЃРїРµС€РЅРѕ РёР·С‚СЂРёРІР°РЅРµ: ' + err.message, 'error');
        } finally {
            showCalendarLoading(false);
        }
    }
};

// ----------------------------------------------------
// РЎР•Р Р’РР—Р•Рќ Р”РќР•Р’РќРРљ (РРЎРўРћР РРЇ РќРђ Р Р•РњРћРќРўРРўР•)
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
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #64748b;">РќСЏРјР° РЅР°РјРµСЂРµРЅРё Р·Р°РїРёСЃРё РІ РЎРµСЂРІРёР·РЅРёСЏ РґРЅРµРІРЅРёРє.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(log => `
        <tr>
            <td style="font-weight: 700; color: #1e293b; white-space: nowrap;">${formatDateDisplay(log.completed_date)}</td>
            <td>
                <span class="machine-tag" onclick="filterLogBySpecificMachine('${escapeHtml(log.machine_name)}')" title="Р¤РёР»С‚СЂРёСЂР°Р№ СЃР°РјРѕ Р·Р° С‚Р°Р·Рё РјР°С€РёРЅР°">
                    рџ”§ ${escapeHtml(log.machine_name)}
                </span>
            </td>
            <td><span class="activity-type-badge">${escapeHtml(log.activity_type || 'РџРѕРґРґСЂСЉР¶РєР°')}</span></td>
            <td>
                <div style="font-weight: 700; color: #0f172a;">${escapeHtml(log.title)}</div>
                ${log.notes ? `<div style="font-size: 0.85em; color: #64748b; margin-top: 3px;">${escapeHtml(log.notes)}</div>` : ''}
                ${log.parts_replaced ? `<div style="font-size: 0.8em; color: #4338ca; margin-top: 3px;">рџ“¦ Р’Р»РѕР¶РµРЅРё С‡Р°СЃС‚Рё: ${escapeHtml(log.parts_replaced)}</div>` : ''}
            </td>
            <td>${escapeHtml(log.completed_by || '-')}</td>
            <td>
                <span style="font-size: 0.85em; padding: 3px 8px; border-radius: 4px; ${log.source === 'terminal' ? 'background: #fdf2f8; color: #be185d; border: 1px solid #fbcfe8;' : 'background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;'}">
                    ${log.source === 'terminal' ? 'рџ“± РўРµСЂРјРёРЅР°Р»' : 'рџ’» РђРґРјРёРЅ'}
                </span>
            </td>
            <td style="text-align: right; white-space: nowrap;">
                <button class="action-btn btn-delete" onclick="deleteLogEntry(${log.id})" title="РР·С‚СЂРёР№ Р·Р°РїРёСЃ">рџ—‘пёЏ</button>
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
    document.getElementById('manualLogActivityType').value = 'РР·РІСЉРЅСЂРµРґРµРЅ СЂРµРјРѕРЅС‚';
    document.getElementById('manualLogTitle').value = '';
    document.getElementById('manualLogBy').value = 'РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ';
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
        Swal.fire('Р’РЅРёРјР°РЅРёРµ', 'РњРѕР»СЏ, РёР·Р±РµСЂРµС‚Рµ РјР°С€РёРЅР°!', 'warning');
        return;
    }
    if (!title) {
        Swal.fire('Р’РЅРёРјР°РЅРёРµ', 'РњРѕР»СЏ, РІСЉРІРµРґРµС‚Рµ РѕРїРёСЃР°РЅРёРµ РЅР° РёР·РІСЉСЂС€РµРЅР°С‚Р° РґРµР№РЅРѕСЃС‚!', 'warning');
        return;
    }

    const payload = {
        machine_name: machine,
        activity_type: document.getElementById('manualLogActivityType').value,
        title: title,
        completed_date: document.getElementById('manualLogDate').value,
        completed_by: document.getElementById('manualLogBy').value.trim() || 'РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ',
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
        Swal.fire({ icon: 'success', title: 'Р—Р°РїРёСЃСЉС‚ Рµ РґРѕР±Р°РІРµРЅ РІ РЎРµСЂРІРёР·РЅРёСЏ РґРЅРµРІРЅРёРє!', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire('Р“СЂРµС€РєР°', 'РќРµСѓСЃРїРµС€РµРЅ Р·Р°РїРёСЃ: ' + err.message, 'error');
    } finally {
        showCalendarLoading(false);
    }
};

window.deleteLogEntry = async function(logId) {
    const res = await Swal.fire({
        title: 'РР·С‚СЂРёРІР°РЅРµ РѕС‚ РЎРµСЂРІРёР·РЅРёСЏ РґРЅРµРІРЅРёРє?',
        text: 'РўРѕРІР° РґРµР№СЃС‚РІРёРµ С‰Рµ РїСЂРµРјР°С…РЅРµ Р·Р°РїРёСЃР° РѕС‚ РёСЃС‚РѕСЂРёСЏС‚Р° РЅР° РјР°С€РёРЅР°С‚Р°.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Р”Р°, РёР·С‚СЂРёР№',
        cancelButtonText: 'РћС‚РєР°Р·'
    });

    if (res.isConfirmed) {
        showCalendarLoading(true);
        try {
            const { error } = await client.from('factory_maintenance_log').delete().eq('id', logId);
            if (error) throw error;
            await reloadAllCalendarData();
            Swal.fire({ icon: 'success', title: 'РР·С‚СЂРёС‚Рѕ!', timer: 1200, showConfirmButton: false });
        } catch (err) {
            Swal.fire('Р“СЂРµС€РєР°', err.message, 'error');
        } finally {
            showCalendarLoading(false);
        }
    }
};

// ----------------------------------------------------
// РЎРџР РђР’РћР§РќРРљ РњРђРЁРРќР Р Р‘РЄР”Р•Р© РџРђРЎРџРћР Рў
// ----------------------------------------------------
function renderMachinesDirectory() {
    const container = document.getElementById('calMachinesGrid');
    if (!container) return;

    if (calendarState.machines.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #64748b;">РќСЏРјР° РІСЉРІРµРґРµРЅРё РјР°С€РёРЅРё.</div>`;
        return;
    }

    container.innerHTML = calendarState.machines.map(mac => {
        const logCount = calendarState.logs.filter(l => l.machine_name === mac.name).length;
        const pendingCount = calendarState.events.filter(e => e.machine_name === mac.name && e.status === 'pending').length;

        return `
            <div class="machine-card">
                <div class="machine-card-header">
                    <div>
                        <div class="machine-card-name">вљ™пёЏ ${escapeHtml(mac.name)}</div>
                        <div class="machine-card-dept">${escapeHtml(mac.department || 'РџСЂРѕРёР·РІРѕРґСЃС‚РІРµРЅ С†РµС…')} ${mac.code ? `вЂў РРЅРІ. в„–: ${escapeHtml(mac.code)}` : ''}</div>
                    </div>
                    <span class="machine-status-badge ${mac.status || 'active'}">${mac.status === 'maintenance' ? 'Р’ СЂРµРјРѕРЅС‚' : 'РђРєС‚РёРІРЅР°'}</span>
                </div>
                <div class="machine-card-body">
                    <div class="machine-stat">
                        <span class="stat-label">РџСЂРµРґСЃС‚РѕСЏС‰Рё Р·Р°РґР°С‡Рё:</span>
                        <span class="stat-val ${pendingCount > 0 ? 'highlight-amber' : ''}">${pendingCount} Р±СЂ.</span>
                    </div>
                    <div class="machine-stat">
                        <span class="stat-label">РЎРµСЂРІРёР·РЅРё Р·Р°РїРёСЃРё:</span>
                        <span class="stat-val highlight-blue">${logCount} Р·Р°РїРёСЃР°</span>
                    </div>
                    ${mac.model ? `<div style="font-size: 0.85em; color: #64748b; margin-top: 5px;">РњРѕРґРµР»: <strong>${escapeHtml(mac.model)}</strong></div>` : ''}
                </div>
                <div class="machine-card-actions">
                    <button class="btn-mac-action btn-mac-log" onclick="viewMachineHistory('${escapeHtml(mac.name)}')">
                        рџ“‹ РЎРµСЂРІРёР·РµРЅ РґРЅРµРІРЅРёРє (${logCount})
                    </button>
                    <button class="btn-mac-action btn-mac-add" onclick="scheduleTaskForMachine('${escapeHtml(mac.name)}')">
                        + РќР°СЃСЂРѕС‡Рё
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
        title: 'вћ• Р”РѕР±Р°РІСЏРЅРµ РЅР° РЅРѕРІР° РјР°С€РёРЅР°',
        html: `
            <div style="display: flex; flex-direction: column; gap: 12px; text-align: left; font-size: 0.9em;">
                <div>
                    <label style="font-weight: 700; color: #475569;">РРјРµ РЅР° РјР°С€РёРЅР°С‚Р°: *</label>
                    <input id="swalMacName" class="swal2-input" placeholder="РЅР°РїСЂ. РЁР»Р°Р№С„ в„–3, HAAS ST 20..." style="margin: 4px 0 0; width: 100%; box-sizing: border-box;">
                </div>
                <div>
                    <label style="font-weight: 700; color: #475569;">РРЅРІРµРЅС‚Р°СЂРµРЅ / Р¤Р°Р±СЂРёС‡РµРЅ РЅРѕРјРµСЂ:</label>
                    <input id="swalMacCode" class="swal2-input" placeholder="РЅР°РїСЂ. INV-042" style="margin: 4px 0 0; width: 100%; box-sizing: border-box;">
                </div>
                <div>
                    <label style="font-weight: 700; color: #475569;">Р¦РµС… / РњРµСЃС‚РѕРїРѕР»РѕР¶РµРЅРёРµ:</label>
                    <input id="swalMacDept" class="swal2-input" placeholder="РЅР°РїСЂ. РњРµС…Р°РЅРёС‡РµРЅ С†РµС…, РњРѕРЅС‚Р°Р¶ 1..." style="margin: 4px 0 0; width: 100%; box-sizing: border-box;">
                </div>
                <div>
                    <label style="font-weight: 700; color: #475569;">РњРѕРґРµР» / РџСЂРѕРёР·РІРѕРґРёС‚РµР»:</label>
                    <input id="swalMacModel" class="swal2-input" placeholder="РЅР°РїСЂ. Haas Automation..." style="margin: 4px 0 0; width: 100%; box-sizing: border-box;">
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Р—Р°РїР°Р·Рё РјР°С€РёРЅР°',
        cancelButtonText: 'РћС‚РєР°Р·',
        confirmButtonColor: '#4338ca',
        preConfirm: () => {
            const name = document.getElementById('swalMacName').value.trim();
            if (!name) {
                Swal.showValidationMessage('РњРѕР»СЏ, РІСЉРІРµРґРµС‚Рµ РёРјРµ РЅР° РјР°С€РёРЅР°С‚Р°!');
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
                Swal.fire({ icon: 'success', title: 'РњР°С€РёРЅР°С‚Р° Рµ РґРѕР±Р°РІРµРЅР° СѓСЃРїРµС€РЅРѕ!', timer: 1500, showConfirmButton: false });
            } catch (err) {
                Swal.fire('Р“СЂРµС€РєР°', err.message, 'error');
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

    const optionsHtml = '<option value="">(РќСЏРјР° / РћР±С‰Рѕ Р·Р° Р·Р°РІРѕРґР°)</option>' +
        calendarState.machines.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');

    const filterOptionsHtml = '<option value="all">Р’СЃРёС‡РєРё РјР°С€РёРЅРё</option>' +
        calendarState.machines.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');

    if (evSel) evSel.innerHTML = optionsHtml;
    if (manualLogSel) manualLogSel.innerHTML = '<option value="">-- РР·Р±РµСЂРµС‚Рµ РјР°С€РёРЅР° --</option>' + calendarState.machines.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');
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
        return `${parts[2]}.${parts[1]}.${parts[0]} Рі.`;
    }
    return dateStr;
}

function formatUnitBg(unit) {
    if (unit === 'days') return 'РґРЅРё';
    if (unit === 'weeks') return 'СЃРµРґРјРёС†Рё';
    if (unit === 'months') return 'РјРµСЃРµС†Р°';
    if (unit === 'years') return 'РіРѕРґРёРЅРё';
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
    <!-- Р“Р›РђР’Р•Рќ РњРћР”РђР› Р—Рђ РљРђР›Р•РќР”РђР  Р РЎР•Р Р’РР—Р•Рќ Р”РќР•Р’РќРРљ -->
    <div class="modal-backdrop" id="calendarModalBackdrop" style="display: none; align-items: center; justify-content: center; z-index: 1050;">
      <div class="modal cal-main-modal" style="width: 95vw; max-width: 1450px; height: 92vh; max-height: 92vh; display: flex; flex-direction: column; padding: 0; border-radius: 16px; overflow: hidden; background: #f8fafc; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);">
        
        <!-- РњРћР”РђР› РҐР•Р”РЄР  -->
        <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: white; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
            <div style="display: flex; align-items: center; gap: 14px;">
                <div style="background: #0891b2; width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.4em;">рџ“…</div>
                <div>
                    <div style="font-size: 1.25em; font-weight: 800; letter-spacing: 0.3px;">РљР°Р»РµРЅРґР°СЂ РЅР° Р·Р°РІРѕРґР° & РЎРµСЂРІРёР·РµРЅ РґРЅРµРІРЅРёРє</div>
                    <div style="font-size: 0.85em; color: #94a3b8;">РџР»Р°РЅРѕРІР° РїРѕРґРґСЂСЉР¶РєР°, СЂРµРјРѕРЅС‚Рё РЅР° РјР°С€РёРЅРё, Р—Р‘РЈРў, РјРµРґРёС†РёРЅСЃРєРё РїСЂРµРіР»РµРґРё Рё РїСЂРµРґСѓРїСЂРµР¶РґРµРЅРёСЏ</div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <button class="btn-cal-action" onclick="reloadAllCalendarData()" style="background: #334155; color: white;" title="РџСЂРµР·Р°СЂРµРґРё РґР°РЅРЅРё">рџ”„ РћР±РЅРѕРІРё</button>
                <button onclick="closeCalendarModal()" style="border:none; background: #334155; color: #cbd5e1; width: 36px; height: 36px; border-radius: 8px; font-size: 1.2em; cursor: pointer; display: flex; align-items: center; justify-content: center;">вњ–</button>
            </div>
        </div>

        <!-- Р›Р•РќРўРђ РЎ РџРћР”РўРђР‘РћР’Р• -->
        <div style="background: white; border-bottom: 1px solid #e2e8f0; padding: 0 24px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
            <div style="display: flex; gap: 8px;">
                <button class="cal-nav-btn active" data-tab="calendar" onclick="switchCalendarSubTab('calendar')">
                    рџ“… РљР°Р»РµРЅРґР°СЂ & Р“СЂР°С„РёРє
                </button>
                <button class="cal-nav-btn" data-tab="log" onclick="switchCalendarSubTab('log')">
                    рџ“‹ РЎРµСЂРІРёР·РµРЅ РґРЅРµРІРЅРёРє (РСЃС‚РѕСЂРёСЏ)
                </button>
                <button class="cal-nav-btn" data-tab="machines" onclick="switchCalendarSubTab('machines')">
                    вљ™пёЏ РЎРїСЂР°РІРѕС‡РЅРёРє РњР°С€РёРЅРё
                </button>
            </div>
            <div style="display: flex; gap: 8px; padding: 8px 0;">
                <button class="btn-cal-action" onclick="openAddEventModal()" style="background: #4338ca; color: white;">
                    вћ• РќР°СЃСЂРѕС‡Рё Р·Р°РґР°С‡Р°
                </button>
                <button class="btn-cal-action" onclick="openAddManualLogModal()" style="background: #0d9488; color: white;">
                    вњЌпёЏ Р’РїРёС€Рё СЂРµРјРѕРЅС‚
                </button>
            </div>
        </div>

        <!-- РЎРЄР”РЄР Р–РђРќРР• РќРђ РњРћР”РђР›Рђ РЎРЄРЎ РЎРљР РћР› -->
        <div style="flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px;">
            
            <!-- ALERT BANNER Р—Рђ РќРђР‘Р›РР–РђР’РђР©Р Р РџР РћРЎР РћР§Р•РќР Р—РђР”РђР§Р -->
            <div id="calendarAlertsBanner"></div>

            <!-- РџРћР”РўРђР‘ 1: РљРђР›Р•РќР”РђР  & Р“Р РђР¤РРљ -->
            <div id="calView_calendar" class="cal-subtab-view">
                
                <div style="background: white; padding: 14px 20px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <button class="cal-btn-nav" onclick="calendarNavPrev()">в—Ђ</button>
                        <button class="cal-btn-today" onclick="calendarNavToday()">Р”РЅРµСЃ</button>
                        <button class="cal-btn-nav" onclick="calendarNavNext()">в–¶</button>
                        <div id="calendarMonthTitle" style="font-size: 1.3em; font-weight: 800; color: #1e293b; margin-left: 10px; min-width: 220px;"></div>
                    </div>

                    <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <label style="font-size: 0.85em; font-weight: 700; color: #64748b;">РљР°С‚РµРіРѕСЂРёСЏ:</label>
                            <select id="calCategoryFilterSelect" onchange="onCalendarFilterChange()" class="cal-filter-select">
                                <option value="all">Р’СЃРёС‡РєРё РєР°С‚РµРіРѕСЂРёРё</option>
                                <option value="РњР°С€РёРЅРё">рџ”§ РњР°С€РёРЅРё Рё РѕР±РѕСЂСѓРґРІР°РЅРµ</option>
                                <option value="Р—Р‘РЈРў / Р§Р ">рџ©є Р—Р‘РЈРў / Р§Р  (РњРµРґРёС†РёРЅСЃРєРё)</option>
                                <option value="РРЅС„СЂР°СЃС‚СЂСѓРєС‚СѓСЂР°">рџЏў РРЅС„СЂР°СЃС‚СЂСѓРєС‚СѓСЂР° & РЎРіСЂР°РґР°</option>
                                <option value="РћР±С‰Рё">рџ“Њ РћР±С‰Рё СЃСЉР±РёС‚РёСЏ</option>
                            </select>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <label style="font-size: 0.85em; font-weight: 700; color: #64748b;">РњР°С€РёРЅР°:</label>
                            <select id="calMachineFilterSelect" onchange="onCalendarFilterChange()" class="cal-filter-select">
                                <option value="all">Р’СЃРёС‡РєРё РјР°С€РёРЅРё</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="cal-weekdays-header">
                    <div>РџРѕРЅРµРґРµР»РЅРёРє</div>
                    <div>Р’С‚РѕСЂРЅРёРє</div>
                    <div>РЎСЂСЏРґР°</div>
                    <div>Р§РµС‚РІСЉСЂС‚СЉРє</div>
                    <div>РџРµС‚СЉРє</div>
                    <div style="color: #ea580c;">РЎСЉР±РѕС‚Р°</div>
                    <div style="color: #dc2626;">РќРµРґРµР»СЏ</div>
                </div>

                <div id="calendarMonthGrid" class="cal-month-grid"></div>
            </div>

            <!-- РџРћР”РўРђР‘ 2: РЎР•Р Р’РР—Р•Рќ Р”РќР•Р’РќРРљ (РРЎРўРћР РРЇ) -->
            <div id="calView_log" class="cal-subtab-view" style="display: none;">
                <div style="background: white; padding: 16px 20px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                    <div style="display: flex; gap: 12px; align-items: center; flex: 1; flex-wrap: wrap;">
                        <input type="text" id="logSearchInput" placeholder="рџ”Ќ РўСЉСЂСЃРё РІ СЃРµСЂРІРёР·РµРЅ РґРЅРµРІРЅРёРє (РјР°С€РёРЅР°, РґРµР№РЅРѕСЃС‚, РјР°Р№СЃС‚РѕСЂ)..." oninput="onLogFilterChange()" style="flex: 1; min-width: 250px; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.9em; outline: none;">
                        <select id="logMachineFilterSelect" onchange="onLogFilterChange()" class="cal-filter-select" style="min-width: 200px;">
                            <option value="all">Р’СЃРёС‡РєРё РјР°С€РёРЅРё</option>
                        </select>
                    </div>
                    <button class="btn-cal-action" onclick="openAddManualLogModal()" style="background: #0d9488; color: white;">
                        вњЌпёЏ Р’РїРёС€Рё РёР·РІСЉРЅСЂРµРґРµРЅ СЂРµРјРѕРЅС‚
                    </button>
                </div>

                <div class="table-container" style="background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                        <thead>
                            <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left;">
                                <th style="padding: 12px 16px; width: 120px;">Р”Р°С‚Р°</th>
                                <th style="padding: 12px 16px; width: 180px;">РњР°С€РёРЅР°</th>
                                <th style="padding: 12px 16px; width: 150px;">Р’РёРґ РґРµР№РЅРѕСЃС‚</th>
                                <th style="padding: 12px 16px;">РљР°РєРІРѕ Рµ РёР·РІСЉСЂС€РµРЅРѕ / Р—Р°Р±РµР»РµР¶РєРё</th>
                                <th style="padding: 12px 16px; width: 150px;">РР·РІСЉСЂС€РёР»</th>
                                <th style="padding: 12px 16px; width: 110px;">РР·С‚РѕС‡РЅРёРє</th>
                                <th style="padding: 12px 16px; width: 60px; text-align: right;">Р”РµР№СЃС‚РІРёСЏ</th>
                            </tr>
                        </thead>
                        <tbody id="calLogTableBody"></tbody>
                    </table>
                </div>
            </div>

            <!-- РџРћР”РўРђР‘ 3: РЎРџР РђР’РћР§РќРРљ РњРђРЁРРќР -->
            <div id="calView_machines" class="cal-subtab-view" style="display: none;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <span style="font-size: 1.1em; font-weight: 800; color: #1e293b;">РЎРїРёСЃСЉРє РЅР° Р·Р°РІРѕРґСЃРєРёСЏ РїР°СЂРє Рё РјР°С€РёРЅРё</span>
                        <div style="font-size: 0.85em; color: #64748b;">РћСЃРЅРѕРІР° Р·Р° С‚РµС…РЅРёС‡РµСЃРєРёСЏ РїР°СЃРїРѕСЂС‚ Рё Р±СЉСЂР· РїСЂРµРіР»РµРґ РЅР° СЃРµСЂРІРёР·РЅР°С‚Р° РёСЃС‚РѕСЂРёСЏ</div>
                    </div>
                    <button class="btn-cal-action" onclick="openAddMachineModal()" style="background: #4338ca; color: white;">
                        вћ• Р”РѕР±Р°РІРё РЅРѕРІР° РјР°С€РёРЅР°
                    </button>
                </div>
                <div id="calMachinesGrid" class="machines-cards-grid"></div>
            </div>

        </div>

        <!-- Р“Р›РћР‘РђР›Р•Рќ Р›РћРЈР”РЄР  -->
        <div id="calendarGlobalLoader" style="position: absolute; top:0; left:0; width:100%; height:100%; background: rgba(255,255,255,0.7); backdrop-filter: blur(2px); display: none; align-items: center; justify-content: center; z-index: 100;">
            <div style="background: white; padding: 20px 30px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); font-weight: 700; color: #4338ca; display: flex; align-items: center; gap: 12px;">
                <span>вЏі</span> Р—Р°СЂРµР¶РґР°РЅРµ РЅР° РґР°РЅРЅРё...
            </div>
        </div>

      </div>
    </div>

    <!-- РњРћР”РђР› Р—Рђ Р”Р•РўРђР™Р›Р РќРђ РЎРЄР‘РРўРР• -->
    <div class="modal-backdrop" id="eventDetailsModalBackdrop" style="display: none; z-index: 1060;">
        <div class="modal" style="max-width: 600px; padding: 24px; border-radius: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px;">
                <div>
                    <div id="evDetailTitle" style="font-size: 1.3em; font-weight: 800; color: #0f172a;"></div>
                    <div id="evDetailStatus" style="margin-top: 6px;"></div>
                </div>
                <button onclick="closeEventDetailsModal()" style="border:none;background:transparent;cursor:pointer;font-size:1.3em;color:#94a3b8;">вњ–</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.9em; margin-bottom: 20px;">
                <div style="background: #f8fafc; padding: 10px 14px; border-radius: 8px;">
                    <div style="color: #64748b; font-size: 0.8em; text-transform: uppercase; font-weight: 700;">РњР°С€РёРЅР° / РћР±РµРєС‚:</div>
                    <div id="evDetailMachine" style="font-weight: 700; color: #1e293b; margin-top: 2px;"></div>
                </div>
                <div style="background: #f8fafc; padding: 10px 14px; border-radius: 8px;">
                    <div style="color: #64748b; font-size: 0.8em; text-transform: uppercase; font-weight: 700;">РљР°С‚РµРіРѕСЂРёСЏ:</div>
                    <div id="evDetailCategory" style="font-weight: 700; color: #1e293b; margin-top: 2px;"></div>
                </div>
                <div style="background: #f8fafc; padding: 10px 14px; border-radius: 8px;">
                    <div style="color: #64748b; font-size: 0.8em; text-transform: uppercase; font-weight: 700;">Р”Р°С‚Р° Р·Р° РёР·РїСЉР»РЅРµРЅРёРµ:</div>
                    <div id="evDetailDate" style="font-weight: 700; color: #1e293b; margin-top: 2px;"></div>
                </div>
                <div style="background: #f8fafc; padding: 10px 14px; border-radius: 8px;">
                    <div style="color: #64748b; font-size: 0.8em; text-transform: uppercase; font-weight: 700;">РЎСЂРѕРє Р·Р° РїСЂРµРґСѓРїСЂРµР¶РґРµРЅРёРµ:</div>
                    <div id="evDetailNotify" style="font-weight: 700; color: #1e293b; margin-top: 2px;"></div>
                </div>
                <div style="background: #f8fafc; padding: 10px 14px; border-radius: 8px; grid-column: span 2;">
                    <div style="color: #64748b; font-size: 0.8em; text-transform: uppercase; font-weight: 700;">РџРѕРІС‚РѕСЂСЏРµРјРѕСЃС‚:</div>
                    <div id="evDetailRecurring" style="font-weight: 700; color: #1e293b; margin-top: 2px;"></div>
                </div>
                <div style="background: #f8fafc; padding: 10px 14px; border-radius: 8px; grid-column: span 2;">
                    <div style="color: #64748b; font-size: 0.8em; text-transform: uppercase; font-weight: 700;">РћС‚РіРѕРІРѕСЂРЅРёРє:</div>
                    <div id="evDetailAssigned" style="font-weight: 700; color: #1e293b; margin-top: 2px;"></div>
                </div>
                <div style="background: #f8fafc; padding: 10px 14px; border-radius: 8px; grid-column: span 2;">
                    <div style="color: #64748b; font-size: 0.8em; text-transform: uppercase; font-weight: 700;">РРЅСЃС‚СЂСѓРєС†РёРё Рё Р±РµР»РµР¶РєРё:</div>
                    <div id="evDetailNotes" style="color: #334155; margin-top: 4px; white-space: pre-wrap;"></div>
                </div>
            </div>
            <div id="evDetailActions" style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #e2e8f0; padding-top: 16px;"></div>
        </div>
    </div>

    <!-- РњРћР”РђР› Р—Рђ РћРўР§РРўРђРќР• РљРђРўРћ РР—РџРЄР›РќР•РќРћ -->
    <div class="modal-backdrop" id="completeEventModalBackdrop" style="display: none; z-index: 1070;">
        <div class="modal" style="max-width: 580px; padding: 24px; border-radius: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px;">
                <div id="compModalTitle" style="font-size: 1.2em; font-weight: 800; color: #065f46;"></div>
                <button onclick="closeCompleteEventModal()" style="border:none;background:transparent;cursor:pointer;font-size:1.3em;color:#94a3b8;">вњ–</button>
            </div>
            <form onsubmit="saveEventCompletion(event)">
                <input type="hidden" id="compModalEventId">
                <div style="display: flex; flex-direction: column; gap: 14px; font-size: 0.9em;">
                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Р РµР°Р»РЅР° РґР°С‚Р° РЅР° РёР·РІСЉСЂС€РІР°РЅРµ: *</label>
                        <input type="date" id="compDateInput" required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">РљРѕР№ РёР·РІСЉСЂС€Рё РґРµР№РЅРѕСЃС‚С‚Р°: *</label>
                        <input type="text" id="compByInput" placeholder="РЅР°РїСЂ. РРІР°РЅ РРІР°РЅРѕРІ (РѕРїРµСЂР°С‚РѕСЂ), СЃРµСЂРІРёР·РµРЅ С‚РµС…РЅРёРє..." required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Р’Р»РѕР¶РµРЅРё СЂРµР·РµСЂРІРЅРё С‡Р°СЃС‚Рё / РєРѕРЅСЃСѓРјР°С‚РёРІРё:</label>
                        <input type="text" id="compPartsInput" placeholder="РЅР°РїСЂ. РњР°СЃР»Рѕ Shell Tellus 46 (15Р»), Р¤РёР»С‚СЉСЂ F-12..." style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">РЎС‚РѕР№РЅРѕСЃС‚ / Р Р°Р·С…РѕРґ РІ Р»РІ. (РїРѕ Р¶РµР»Р°РЅРёРµ):</label>
                        <input type="number" step="0.01" id="compCostInput" placeholder="0.00" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Р‘РµР»РµР¶РєРё Рё РєРѕРЅСЃС‚Р°С‚Р°С†РёРё Р·Р° РЎРµСЂРІРёР·РЅРёСЏ РґРЅРµРІРЅРёРє:</label>
                        <textarea id="compNotesInput" rows="3" placeholder="РћРїРёС€РµС‚Рµ РєР°РєРІРѕ С‚РѕС‡РЅРѕ Р±РµС€Рµ РёР·РІСЉСЂС€РµРЅРѕ, РёРјР° Р»Рё РїСЂРµРїРѕСЂСЉРєРё..." style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box; font-family: inherit;"></textarea>
                    </div>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                    <button type="button" class="btn-cal-sec" onclick="closeCompleteEventModal()">РћС‚РєР°Р·</button>
                    <button type="submit" class="btn-cal-success" style="background: #059669; color: white;">Р—Р°РїР°Р·Рё РІ РЎРµСЂРІРёР·РЅРёСЏ РґРЅРµРІРЅРёРє</button>
                </div>
            </form>
        </div>
    </div>

    <!-- РњРћР”РђР› Р—Рђ Р”РћР‘РђР’РЇРќР• / Р Р•Р”РђРљР¦РРЇ РќРђ РџР›РђРќРћР’Рћ РЎРЄР‘РРўРР• -->
    <div class="modal-backdrop" id="addEventModalBackdrop" style="display: none; z-index: 1060;">
        <div class="modal" style="max-width: 620px; padding: 24px; border-radius: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px;">
                <div id="evFormTitle" style="font-size: 1.2em; font-weight: 800; color: #1e293b;">вћ• РќР°СЃСЂРѕС‡РІР°РЅРµ РЅР° Р·Р°РґР°С‡Р°</div>
                <button onclick="closeAddEventModal()" style="border:none;background:transparent;cursor:pointer;font-size:1.3em;color:#94a3b8;">вњ–</button>
            </div>
            <form onsubmit="saveEventForm(event)">
                <div style="display: flex; flex-direction: column; gap: 14px; font-size: 0.9em;">
                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Р—Р°РіР»Р°РІРёРµ РЅР° Р·Р°РґР°С‡Р°С‚Р°: *</label>
                        <input type="text" id="evTitleInput" placeholder="РЅР°РїСЂ. РЎРјСЏРЅР° РЅР° РјР°СЃР»Рѕ, Р“РѕРґРёС€РЅРё РјРµРґРёС†РёРЅСЃРєРё РїСЂРµРіР»РµРґРё..." required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">РљР°С‚РµРіРѕСЂРёСЏ: *</label>
                            <select id="evCategorySelect" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                                <option value="РњР°С€РёРЅРё">рџ”§ РњР°С€РёРЅРё Рё РѕР±РѕСЂСѓРґРІР°РЅРµ</option>
                                <option value="Р—Р‘РЈРў / Р§Р ">рџ©є Р—Р‘РЈРў / Р§Р  (РњРµРґРёС†РёРЅСЃРєРё)</option>
                                <option value="РРЅС„СЂР°СЃС‚СЂСѓРєС‚СѓСЂР°">рџЏў РРЅС„СЂР°СЃС‚СЂСѓРєС‚СѓСЂР° & РЎРіСЂР°РґР°</option>
                                <option value="РћР±С‰Рё">рџ“Њ РћР±С‰Рё СЃСЉР±РёС‚РёСЏ</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">РњР°С€РёРЅР° / РћР±РµРєС‚:</label>
                            <select id="evMachineSelect" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                                <option value="">(Р¦СЏР» Р·Р°РІРѕРґ / РћР±С‰Рѕ)</option>
                            </select>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Р”Р°С‚Р° Р·Р° РёР·РїСЉР»РЅРµРЅРёРµ: *</label>
                            <input type="date" id="evDateInput" required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">РџСЂРµРґСѓРїСЂРµР¶РґРµРЅРёРµ РїСЂРµРґРё РґР°С‚Р°С‚Р°:</label>
                            <div style="display: flex; gap: 6px; align-items: center;">
                                <input type="number" id="evNotifyDaysInput" min="0" value="30" style="width: 90px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                                <span style="font-size: 0.9em; color: #64748b;">РґРЅРё</span>
                                <div style="display: flex; gap: 4px; margin-left: auto;">
                                    <button type="button" class="btn-cal-pill" onclick="setNotifyDaysQuick(5)">5Рґ</button>
                                    <button type="button" class="btn-cal-pill" onclick="setNotifyDaysQuick(15)">15Рґ</button>
                                    <button type="button" class="btn-cal-pill" onclick="setNotifyDaysQuick(30)">30Рґ</button>
                                    <button type="button" class="btn-cal-pill" onclick="setNotifyDaysQuick(60)">60Рґ</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 10px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 700; color: #1e293b;">
                            <input type="checkbox" id="evRecurringCb" onchange="toggleRecurringFields()" style="transform: scale(1.2); accent-color: #4338ca;">
                            <span>РџРµСЂРёРѕРґРёС‡РЅРѕ СЃСЉР±РёС‚РёРµ (РїРѕРІС‚Р°СЂСЏ СЃРµ Р°РІС‚РѕРјР°С‚РёС‡РЅРѕ)</span>
                        </label>
                        <div id="evRecurringOptionsBox" style="margin-top: 10px; display: flex; align-items: center; gap: 10px; padding-left: 24px;">
                            <span>РќР° РІСЃРµРєРё:</span>
                            <input type="number" id="evIntervalValInput" min="1" value="6" style="width: 80px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
                            <select id="evIntervalUnitSelect" style="padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
                                <option value="months">РјРµСЃРµС†Р°</option>
                                <option value="years">РіРѕРґРёРЅРё</option>
                                <option value="weeks">СЃРµРґРјРёС†Рё</option>
                                <option value="days">РґРЅРё</option>
                            </select>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Р¦РµС… / РћС‚РґРµР» (РїРѕ Р¶РµР»Р°РЅРёРµ):</label>
                            <input type="text" id="evDeptInput" placeholder="РЅР°РїСЂ. Р¦РµС… РњРµС…Р°РЅРёС‡РµРЅ" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">РћС‚РіРѕРІРѕСЂРЅРёРє (РїРѕ Р¶РµР»Р°РЅРёРµ):</label>
                            <input type="text" id="evAssignedInput" placeholder="РЅР°РїСЂ. РёРЅР¶. РџРµС‚СЂРѕРІ, РІСЉРЅС€РЅР° С„РёСЂРјР°..." style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                        </div>
                    </div>

                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">РРЅСЃС‚СЂСѓРєС†РёРё Рё Р·Р°Р±РµР»РµР¶РєРё:</label>
                        <textarea id="evNotesInput" rows="2" placeholder="РЅР°РїСЂ. РќРµРѕР±С…РѕРґРёРјРё СЃР° 20Р» РјР°СЃР»Рѕ Shell Tellus 46, РїСЂРѕРІРµСЂРєР° РЅР° С„РёР»С‚СЂРё..." style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box; font-family: inherit;"></textarea>
                    </div>

                    <div>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #475569;">
                            <input type="checkbox" id="evTerminalCb" checked style="accent-color: #4338ca;">
                            <span>РџРѕР·РІРѕР»Рё РѕС‚С‡РёС‚Р°РЅРµ РґРёСЂРµРєС‚РЅРѕ РѕС‚ РўРµСЂРјРёРЅР°Р»Р° РЅР° РјР°С€РёРЅР°С‚Р° РѕС‚ РѕРїРµСЂР°С‚РѕСЂР°</span>
                        </label>
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                    <button type="button" class="btn-cal-sec" onclick="closeAddEventModal()">РћС‚РєР°Р·</button>
                    <button type="submit" class="btn-cal-primary" style="background: #4338ca; color: white;">Р—Р°РїР°Р·Рё РІ РєР°Р»РµРЅРґР°СЂР°</button>
                </div>
            </form>
        </div>
    </div>

    <!-- РњРћР”РђР› Р—Рђ Р’РџРРЎР’РђРќР• РќРђ РР—Р’РЄРќР Р•Р”Р•Рќ Р Р•РњРћРќРў Р’ Р”РќР•Р’РќРРљРђ -->
    <div class="modal-backdrop" id="addManualLogModalBackdrop" style="display: none; z-index: 1060;">
        <div class="modal" style="max-width: 580px; padding: 24px; border-radius: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px;">
                <div style="font-size: 1.2em; font-weight: 800; color: #0f172a;">вњЌпёЏ Р’РїРёСЃРІР°РЅРµ РІ РЎРµСЂРІРёР·РЅРёСЏ РґРЅРµРІРЅРёРє</div>
                <button onclick="closeAddManualLogModal()" style="border:none;background:transparent;cursor:pointer;font-size:1.3em;color:#94a3b8;">вњ–</button>
            </div>
            <form onsubmit="saveManualLogEntry(event)">
                <div style="display: flex; flex-direction: column; gap: 14px; font-size: 0.9em;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">РњР°С€РёРЅР°: *</label>
                            <select id="manualLogMachineSelect" required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;"></select>
                        </div>
                        <div>
                            <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Р”Р°С‚Р°: *</label>
                            <input type="date" id="manualLogDate" required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Р’РёРґ РґРµР№РЅРѕСЃС‚:</label>
                            <select id="manualLogActivityType" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                                <option value="РР·РІСЉРЅСЂРµРґРµРЅ СЂРµРјРѕРЅС‚">рџљЁ РР·РІСЉРЅСЂРµРґРµРЅ СЂРµРјРѕРЅС‚ / РђРІР°СЂРёСЏ</option>
                                <option value="РџР»Р°РЅРѕРІР° РїРѕРґРґСЂСЉР¶РєР°">рџ”§ РџР»Р°РЅРѕРІР° РїРѕРґРґСЂСЉР¶РєР°</option>
                                <option value="РЎРјСЏРЅР° РЅР° РєРѕРЅСЃСѓРјР°С‚РёРІ">рџ›ўпёЏ РЎРјСЏРЅР° РЅР° РјР°СЃР»Рѕ / РєРѕРЅСЃСѓРјР°С‚РёРІ</option>
                                <option value="РљР°Р»РёР±СЂР°С†РёСЏ / РџСЂРµРіР»РµРґ">рџ“ђ РљР°Р»РёР±СЂР°С†РёСЏ / РџСЂРµРіР»РµРґ</option>
                                <option value="Р”СЂСѓРіРѕ">рџ“Њ Р”СЂСѓРіРѕ</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">РР·РІСЉСЂС€РёР»: *</label>
                            <input type="text" id="manualLogBy" placeholder="РРјРµ РЅР° С‚РµС…РЅРёРє / С„РёСЂРјР°..." required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                        </div>
                    </div>

                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">РљР°РєРІРѕ Р±РµС€Рµ РёР·РІСЉСЂС€РµРЅРѕ: *</label>
                        <input type="text" id="manualLogTitle" placeholder="РЅР°РїСЂ. РџРѕРґРјСЏРЅР° РЅР° Р»Р°РіРµСЂ РЅР° РІСЂРµС‚РµРЅРѕ, СЂРµРјРѕРЅС‚ РЅР° РїРѕРјРїР°..." required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                    </div>

                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Р’Р»РѕР¶РµРЅРё СЂРµР·РµСЂРІРЅРё С‡Р°СЃС‚Рё:</label>
                        <input type="text" id="manualLogParts" placeholder="РЅР°РїСЂ. Р›Р°РіРµСЂ 6000 ZZ (2 Р±СЂ.), Рћ-РїСЂСЉСЃС‚РµРЅ..." style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                    </div>

                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">РЎС‚РѕР№РЅРѕСЃС‚ / Р Р°Р·С…РѕРґ РІ Р»РІ. (РїРѕ Р¶РµР»Р°РЅРёРµ):</label>
                        <input type="number" step="0.01" id="manualLogCost" placeholder="0.00" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                    </div>

                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">РџРѕРґСЂРѕР±РЅРё Р±РµР»РµР¶РєРё:</label>
                        <textarea id="manualLogNotes" rows="2" placeholder="РћРїРёС€РµС‚Рµ РґРµС‚Р°Р№Р»Рё РїРѕ СЂРµРјРѕРЅС‚Р°..." style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box; font-family: inherit;"></textarea>
                    </div>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                    <button type="button" class="btn-cal-sec" onclick="closeAddManualLogModal()">РћС‚РєР°Р·</button>
                    <button type="submit" class="btn-cal-primary" style="background: #0d9488; color: white;">Р—Р°РїР°Р·Рё РІ РЎРµСЂРІРёР·РЅРёСЏ РґРЅРµРІРЅРёРє</button>
                </div>
            </form>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}