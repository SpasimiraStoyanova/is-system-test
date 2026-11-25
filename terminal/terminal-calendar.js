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
        calBtn.title = 'Поддръжка и профилактика';
        calBtn.style.cssText = 'background-color: #0891b2; display: inline-flex; align-items: center; justify-content: center; gap: 4px; position: relative; font-size: 0.82em; flex-shrink: 0;';
        calBtn.onclick = () => openTerminalCalendarModal();
        calBtn.innerHTML = `
            <span style="font-size: 1.15em; line-height: 1;">🔧</span>
            <span class="btn-text">ПОДДРЪЖКА</span>
            <span id="terminalCalBadge" style="display: none; background: #ef4444; color: white; border-radius: 10px; padding: 1px 5px; font-size: 0.8em; font-weight: 900; box-shadow: 0 1px 3px rgba(0,0,0,0.3); margin-left: 2px;">0</span>
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
                    <span>✅ ОТЧЕТИ ИЗВЪРШЕНОТО (Части, Бележка, Снимка)</span>
                </button>
            </div>
        `;
    }).join('');
}

function extractMaintPhotoAndNotes(log) {
    let rawNotes = (log && log.notes) ? String(log.notes) : '';
    let photoUrl = (log && log.photo_url) ? String(log.photo_url).trim() : '';
    const match = rawNotes.match(/\[📷\s*Снимка:\s*(https?:\/\/[^\]]+)\]/i);
    if (match) {
        if (!photoUrl) photoUrl = match[1].trim();
        rawNotes = rawNotes.replace(match[0], '').trim();
    }
    return { photoUrl, cleanNotes: rawNotes };
}

function compressMaintImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.8) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                let w = img.width;
                let h = img.height;
                if (w > maxWidth || h > maxHeight) {
                    if (w > h) {
                        h = Math.round((h * maxWidth) / w);
                        w = maxWidth;
                    } else {
                        w = Math.round((w * maxHeight) / h);
                        h = maxHeight;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', quality);
            };
            img.onerror = () => resolve(file);
            img.src = ev.target.result;
        };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });
}

async function uploadMaintPhotoToStorage(photoBlob) {
    if (!photoBlob) return null;
    const cleanFileName = `maint_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`;
    const filePath = `maintenance/${cleanFileName}`;
    const { error: uploadError } = await client.storage
        .from('dosieta')
        .upload(filePath, photoBlob, { contentType: 'image/jpeg' });
    if (uploadError) {
        throw new Error('Грешка при качване на снимката: ' + uploadError.message);
    }
    const { data: pubData } = client.storage.from('dosieta').getPublicUrl(filePath);
    return pubData ? pubData.publicUrl : null;
}

async function insertMaintenanceLogSafe(payload) {
    const cleanPayload = { ...payload };
    const photoUrl = cleanPayload.photo_url || null;
    if (!photoUrl) delete cleanPayload.photo_url;

    const { error } = await client.from('factory_maintenance_log').insert([cleanPayload]);
    if (!error) return;

    if (photoUrl && String(error.message || '').toLowerCase().includes('photo_url')) {
        const fallbackPayload = { ...cleanPayload };
        delete fallbackPayload.photo_url;
        const noteText = (fallbackPayload.notes || '').trim();
        fallbackPayload.notes = noteText
            ? `${noteText}\n[📷 Снимка: ${photoUrl}]`
            : `[📷 Снимка: ${photoUrl}]`;
        const { error: retryErr } = await client.from('factory_maintenance_log').insert([fallbackPayload]);
        if (retryErr) throw retryErr;
        return;
    }
    throw error;
}

window.previewTerminalMaintPhoto = function(url) {
    if (!url) return;
    Swal.fire({
        imageUrl: url,
        imageAlt: 'Снимка от обслужване',
        width: 650,
        showCloseButton: true,
        confirmButtonText: 'Затвори',
        confirmButtonColor: '#0f766e'
    });
};

function bindMaintPhotoInputHandlers(stateRef) {
    const fileInp = document.getElementById('swalMaintPhotoInput');
    const pickBtn = document.getElementById('swalMaintPickPhotoBtn');
    const removeBtn = document.getElementById('swalMaintRemovePhotoBtn');
    const previewImg = document.getElementById('swalMaintPhotoPreview');
    const statusText = document.getElementById('swalMaintPhotoStatus');
    if (!fileInp || !pickBtn) return;

    pickBtn.onclick = () => fileInp.click();

    fileInp.onchange = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (statusText) statusText.innerText = '⏳ Обработка на снимката...';
        try {
            const compressed = await compressMaintImage(file, 1200, 1200, 0.8);
            stateRef.photoBlob = compressed;
            const sizeKb = Math.round((compressed.size || file.size) / 1024);
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (previewImg) {
                    previewImg.src = ev.target.result;
                    previewImg.style.display = 'block';
                }
                if (removeBtn) removeBtn.style.display = 'inline-block';
                if (statusText) statusText.innerText = `✅ Готова за качване (${sizeKb} KB)`;
                pickBtn.innerText = '🔄 Смени снимката';
            };
            reader.readAsDataURL(compressed);
        } catch (err) {
            stateRef.photoBlob = file;
            if (statusText) statusText.innerText = '✅ Снимката е избрана';
        }
    };

    if (removeBtn) {
        removeBtn.onclick = () => {
            stateRef.photoBlob = null;
            fileInp.value = '';
            if (previewImg) {
                previewImg.src = '';
                previewImg.style.display = 'none';
            }
            removeBtn.style.display = 'none';
            if (statusText) statusText.innerText = '';
            pickBtn.innerText = '📷 Направи / Прикачи снимка';
        };
    }
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

    const photoState = { photoBlob: null };

    const { value: formValues } = await Swal.fire({
        title: '✅ Отчитане на поддръжка',
        width: '560px',
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
                    <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Сменени / вложени части и консумативи (по избор):</label>
                    <input id="swalMaintParts" class="swal2-input" placeholder="напр. Клинов ремък, лагер 6204, масло 2 л..." style="margin: 0; width: 100%; box-sizing: border-box; font-size: 0.95em;">
                </div>
                <div>
                    <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Какво точно е извършено / Забележки (по избор):</label>
                    <textarea id="swalMaintNotes" class="swal2-textarea" placeholder="Опишете какво е направено, дали е сменено и нещо допълнително..." style="margin: 0; width: 100%; box-sizing: border-box; font-size: 0.95em; height: 82px; font-family: inherit;"></textarea>
                </div>
                <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 10px 12px;">
                    <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 6px;">📷 Снимка (по избор):</label>
                    <input type="file" id="swalMaintPhotoInput" accept="image/*" style="display: none;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <button type="button" id="swalMaintPickPhotoBtn" style="background: #0284c7; color: white; border: none; padding: 8px 14px; border-radius: 8px; font-weight: 700; font-size: 0.9em; cursor: pointer;">
                            📷 Направи / Прикачи снимка
                        </button>
                        <button type="button" id="swalMaintRemovePhotoBtn" style="display: none; background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; padding: 8px 12px; border-radius: 8px; font-weight: 700; font-size: 0.85em; cursor: pointer;">
                            ❌ Премахни
                        </button>
                        <span id="swalMaintPhotoStatus" style="font-size: 0.82em; color: #059669; font-weight: 700;"></span>
                    </div>
                    <img id="swalMaintPhotoPreview" style="display: none; margin-top: 10px; max-width: 100%; max-height: 180px; border-radius: 8px; border: 1px solid #cbd5e1; object-fit: contain;" alt="Преглед на снимка">
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Потвърди и завърши',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#059669',
        didOpen: () => bindMaintPhotoInputHandlers(photoState),
        preConfirm: () => {
            const by = document.getElementById('swalMaintBy').value.trim();
            if (!by) {
                Swal.showValidationMessage('Моля, посочете кой е извършил дейността!');
                return false;
            }
            return {
                completedBy: by,
                parts: document.getElementById('swalMaintParts').value.trim(),
                notes: document.getElementById('swalMaintNotes').value.trim(),
                photoBlob: photoState.photoBlob
            };
        }
    });

    if (!formValues) return;

    Swal.fire({ title: 'Записване...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const todayStr = new Date().toISOString().split('T')[0];
        let uploadedPhotoUrl = null;
        if (formValues.photoBlob) {
            uploadedPhotoUrl = await uploadMaintPhotoToStorage(formValues.photoBlob);
        }

        // 1. Вписване в сервизния дневник (бъдещ паспорт на машината)
        await insertMaintenanceLogSafe({
            event_id: ev.id,
            machine_name: ev.machine_name || 'Машина',
            activity_type: 'Планова поддръжка',
            title: ev.title,
            completed_date: todayStr,
            completed_by: formValues.completedBy,
            source: 'terminal',
            parts_replaced: formValues.parts || null,
            notes: formValues.notes || 'Отчетено през таблет на машината',
            photo_url: uploadedPhotoUrl,
            cost: 0
        });

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
            logsHtml = recentLogs.map(l => {
                const { photoUrl, cleanNotes } = extractMaintPhotoAndNotes(l);
                return `
                    <div style="border-bottom: 1px dashed #e2e8f0; padding: 8px 0; font-size: 0.9em;">
                        <div style="display: flex; justify-content: space-between; color: #64748b; font-size: 0.85em;">
                            <span>📅 ${formatDateDisplay(l.completed_date)}</span>
                            <span>👤 ${escapeHtml(l.completed_by || '-')} (${l.source === 'terminal' ? 'Таблет' : 'Админ'})</span>
                        </div>
                        <div style="font-weight: 700; color: #1e293b; margin-top: 2px;">
                            ${escapeHtml(l.machine_name ? l.machine_name + ': ' : '')}${escapeHtml(l.title)}
                        </div>
                        ${l.parts_replaced ? `<div style="font-size: 0.85em; color: #4338ca; font-weight: 700; margin-top: 2px;">📦 Сменени части: ${escapeHtml(l.parts_replaced)}</div>` : ''}
                        ${cleanNotes ? `<div style="font-size: 0.85em; color: #475569; margin-top: 2px;">${escapeHtml(cleanNotes)}</div>` : ''}
                        ${photoUrl ? `<div style="margin-top: 4px;"><button type="button" onclick="previewTerminalMaintPhoto('${escapeHtml(photoUrl)}')" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 3px 9px; border-radius: 6px; font-weight: 700; font-size: 0.82em; cursor: pointer;">📷 Виж снимката</button></div>` : ''}
                    </div>
                `;
            }).join('');
        }

        Swal.fire({
            title: `📅 Сервизен дневник: ${escapeHtml(machineTitle)}`,
            html: `
                <div style="text-align: left; max-height: 65vh; overflow-y: auto;">
                    <div style="margin-bottom: 14px;">
                        <button type="button" onclick="Swal.close(); openTerminalManualMaintModal();" style="width: 100%; background: #0d9488; color: white; border: none; padding: 10px 14px; border-radius: 10px; font-weight: 800; font-size: 0.95em; cursor: pointer; box-shadow: 0 2px 6px rgba(13,148,136,0.25);">
                            ✍️ Впиши извънреден ремонт / смяна на част
                        </button>
                    </div>

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

window.openTerminalManualMaintModal = async function() {
    const rawMachine = (typeof currentMachine !== 'undefined' && currentMachine)
        ? currentMachine
        : (localStorage.getItem('mes_machine') || '');
    const selectedList = (rawMachine && rawMachine !== 'ВСИЧКИ')
        ? rawMachine.split(',').map(m => m.trim()).filter(Boolean)
        : [];

    let machineOptions = [];
    try {
        const { data: macs } = await client.from('factory_machines').select('name').order('name');
        machineOptions = (macs || []).map(m => m.name).filter(Boolean);
    } catch (e) {}

    selectedList.forEach(m => {
        if (m && !machineOptions.includes(m)) machineOptions.unshift(m);
    });

    const defaultMachine = selectedList.length === 1 ? selectedList[0] : '';
    const defaultOperator = (typeof currentOperator !== 'undefined' && currentOperator)
        ? currentOperator
        : (localStorage.getItem('mes_operator') || 'Оператор');
    const photoState = { photoBlob: null };

    const { value: formValues } = await Swal.fire({
        title: '✍️ Впиши ремонт / смяна на част',
        width: '560px',
        html: `
            <div style="text-align: left; font-size: 0.95em; display: flex; flex-direction: column; gap: 11px;">
                <div>
                    <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Машина: *</label>
                    <select id="swalManualMaintMachine" class="swal2-input" style="margin: 0; width: 100%; box-sizing: border-box; font-size: 0.95em; height: 42px;">
                        <option value="">-- Изберете машина --</option>
                        ${machineOptions.map(m => `<option value="${escapeHtml(m)}" ${m === defaultMachine ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
                    </select>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Вид дейност:</label>
                        <select id="swalManualMaintType" class="swal2-input" style="margin: 0; width: 100%; box-sizing: border-box; font-size: 0.9em; height: 42px;">
                            <option value="Смяна на част / консуматив">🔧 Смяна на част</option>
                            <option value="Извънреден ремонт">🚨 Извънреден ремонт</option>
                            <option value="Планова поддръжка">🛠️ Профилактика</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Извършил: *</label>
                        <input id="swalManualMaintBy" class="swal2-input" value="${escapeHtml(defaultOperator)}" style="margin: 0; width: 100%; box-sizing: border-box; font-size: 0.95em;">
                    </div>
                </div>
                <div>
                    <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Какво е извършено (Заглавие): *</label>
                    <input id="swalManualMaintTitle" class="swal2-input" placeholder="напр. Смяна на ремък и обтяжна ролка..." style="margin: 0; width: 100%; box-sizing: border-box; font-size: 0.95em;">
                </div>
                <div>
                    <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Сменени / вложени части и консумативи (по избор):</label>
                    <input id="swalManualMaintParts" class="swal2-input" placeholder="напр. Ремък 10x750, лагер 6204..." style="margin: 0; width: 100%; box-sizing: border-box; font-size: 0.95em;">
                </div>
                <div>
                    <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Подробни бележки (по избор):</label>
                    <textarea id="swalManualMaintNotes" class="swal2-textarea" placeholder="Опишете причината, състоянието или други забележки..." style="margin: 0; width: 100%; box-sizing: border-box; font-size: 0.95em; height: 75px; font-family: inherit;"></textarea>
                </div>
                <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 10px 12px;">
                    <label style="font-weight: 700; color: #475569; display: block; margin-bottom: 6px;">📷 Снимка (по избор):</label>
                    <input type="file" id="swalMaintPhotoInput" accept="image/*" style="display: none;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <button type="button" id="swalMaintPickPhotoBtn" style="background: #0284c7; color: white; border: none; padding: 8px 14px; border-radius: 8px; font-weight: 700; font-size: 0.9em; cursor: pointer;">
                            📷 Направи / Прикачи снимка
                        </button>
                        <button type="button" id="swalMaintRemovePhotoBtn" style="display: none; background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; padding: 8px 12px; border-radius: 8px; font-weight: 700; font-size: 0.85em; cursor: pointer;">
                            ❌ Премахни
                        </button>
                        <span id="swalMaintPhotoStatus" style="font-size: 0.82em; color: #059669; font-weight: 700;"></span>
                    </div>
                    <img id="swalMaintPhotoPreview" style="display: none; margin-top: 10px; max-width: 100%; max-height: 180px; border-radius: 8px; border: 1px solid #cbd5e1; object-fit: contain;" alt="Преглед на снимка">
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: '💾 Запиши в дневника',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#0d9488',
        didOpen: () => bindMaintPhotoInputHandlers(photoState),
        preConfirm: () => {
            const machine = document.getElementById('swalManualMaintMachine').value.trim();
            const by = document.getElementById('swalManualMaintBy').value.trim();
            const title = document.getElementById('swalManualMaintTitle').value.trim();
            if (!machine) {
                Swal.showValidationMessage('Моля, изберете машина!');
                return false;
            }
            if (!by) {
                Swal.showValidationMessage('Моля, посочете кой е извършил дейността!');
                return false;
            }
            if (!title) {
                Swal.showValidationMessage('Моля, опишете какво е извършено!');
                return false;
            }
            return {
                machine,
                activityType: document.getElementById('swalManualMaintType').value,
                completedBy: by,
                title,
                parts: document.getElementById('swalManualMaintParts').value.trim(),
                notes: document.getElementById('swalManualMaintNotes').value.trim(),
                photoBlob: photoState.photoBlob
            };
        }
    });

    if (!formValues) return;

    Swal.fire({ title: 'Записване...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const todayStr = new Date().toISOString().split('T')[0];
        let uploadedPhotoUrl = null;
        if (formValues.photoBlob) {
            uploadedPhotoUrl = await uploadMaintPhotoToStorage(formValues.photoBlob);
        }

        await insertMaintenanceLogSafe({
            machine_name: formValues.machine,
            activity_type: formValues.activityType,
            title: formValues.title,
            completed_date: todayStr,
            completed_by: formValues.completedBy,
            source: 'terminal',
            parts_replaced: formValues.parts || null,
            notes: formValues.notes || 'Отчетено през таблет на машината',
            photo_url: uploadedPhotoUrl,
            cost: 0
        });

        Swal.fire({
            icon: 'success',
            title: 'Записано!',
            text: 'Дейността беше добавена в Сервизния дневник.',
            confirmButtonColor: '#0d9488',
            timer: 2500
        });
    } catch (err) {
        console.error('Грешка при запис на ремонт от терминал:', err);
        Swal.fire('Грешка', 'Неуспешен запис: ' + err.message, 'error');
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
