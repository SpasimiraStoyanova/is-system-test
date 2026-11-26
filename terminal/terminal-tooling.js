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

function toolMatchesMachine(toolMachineName, currentMach) {
    const raw = String(toolMachineName || '').trim();
    if (!raw) return true;
    const machNorm = String(currentMach || '').trim().toLowerCase();
    const parts = raw.split(/[,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    if (parts.length === 0) return true;
    return parts.some(p => p === 'общо' || p === 'всички' || p === machNorm);
}

window.openTerminalToolingRequestModal = async function() {
    let rawMach = (typeof currentMachine !== 'undefined' && currentMachine) ? currentMachine : (localStorage.getItem('mes_machine') || 'ВСИЧКИ');
    let assignedMachines = String(rawMach || '')
        .split(',')
        .map(m => m.trim())
        .filter(m => m && m.toUpperCase() !== 'ВСИЧКИ');

    let machineOptions = [...assignedMachines];
    if (machineOptions.length === 0) {
        try {
            const { data: routesData } = await client.from('marshruti').select('Машина').limit(100000);
            const set = new Set();
            (routesData || []).forEach(r => {
                const m = String(r['Машина'] || '').trim();
                if (m) set.add(m);
            });
            machineOptions = Array.from(set).sort((a, b) => a.localeCompare(b, 'bg'));
        } catch(e) {}
    }

    if (machineOptions.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Няма налични машини',
            text: 'Моля, изберете работно място от горната лента.'
        });
        return;
    }

    let defaultMach = machineOptions.length === 1 ? machineOptions[0] : '';
    if (!defaultMach && typeof activeTaskId !== 'undefined' && activeTaskId && typeof globalTasks !== 'undefined' && Array.isArray(globalTasks)) {
        const activeTask = globalTasks.find(t => String(t.id) === String(activeTaskId) || String(t.otchetId) === String(activeTaskId));
        const activeMach = activeTask ? String(activeTask.machine || activeTask['Машина'] || '').trim() : '';
        if (activeMach) {
            const matchedOpt = machineOptions.find(m => m.toLowerCase() === activeMach.toLowerCase());
            if (matchedOpt) defaultMach = matchedOpt;
        }
    }

    // Зареждаме всички пластини/инструменти от tooling_inventory веднъж
    let allInvTools = [];
    try {
        const { data: invTools } = await client.from('tooling_inventory')
            .select('item_code, name, machine_name, pack_size, quantity, unit')
            .order('item_code');
        allInvTools = invTools || [];
    } catch(e) {}

    function buildToolsForMachine(targetMach) {
        const toolPackSizeMap = {};
        const machList = targetMach
            ? [targetMach]
            : (assignedMachines.length > 0 ? assignedMachines : []);

        const filteredTools = allInvTools
            .filter(t => {
                if (machList.length === 0) return true;
                return machList.some(m => toolMatchesMachine(t.machine_name, m));
            })
            .map(t => {
                const code = String(t.item_code || '').trim();
                const name = String(t.name || '').trim();
                const value = (name && name.toLowerCase() !== code.toLowerCase()) ? `${code} - ${name}` : code;
                const packSize = parseFloat(t.pack_size) || 10;
                const qty = parseFloat(t.quantity) || 0;
                const unit = String(t.unit || 'бр.').trim() || 'бр.';
                const machineRaw = String(t.machine_name || '').trim();
                const machineLabel = (!machineRaw || machineRaw.toLowerCase() === 'общо' || machineRaw.toLowerCase() === 'всички')
                    ? '🌐 Общо'
                    : machineRaw;

                toolPackSizeMap[code.toLowerCase()] = packSize;
                toolPackSizeMap[value.toLowerCase()] = packSize;
                if (name) toolPackSizeMap[`${code} - ${name}`.toLowerCase()] = packSize;

                return { code, name, value, packSize, qty, unit, machineLabel };
            });

        return { machTools: filteredTools, toolPackSizeMap };
    }

    let initialToolData = buildToolsForMachine(defaultMach);
    let machTools = initialToolData.machTools;
    window._tempToolPackSizeMap = initialToolData.toolPackSizeMap;

    const machineFieldHtml = (machineOptions.length === 1)
        ? `<input type="text" id="swalToolMachineReadonly" value="${escapeHtml(machineOptions[0])}" readonly style="width: 100%; padding: 8px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; background: #f8fafc; font-weight: 800; color: #1e293b; box-sizing: border-box;">`
        : `<select id="swalToolMachineSelect" style="width: 100%; padding: 9px 12px; border: 1.5px solid #3b82f6; border-radius: 8px; background: #ffffff; font-weight: 800; color: #1e293b; box-sizing: border-box; font-size: 0.98em;">
                <option value="">-- Изберете за коя машина е заявката (${machineOptions.length}) --</option>
                ${machineOptions.map(m => `<option value="${escapeHtml(m)}" ${m === defaultMach ? 'selected' : ''}>🏭 ${escapeHtml(m)}</option>`).join('')}
           </select>`;

    const { value: formValues } = await Swal.fire({
        title: '🛠️ Заявка за Пластини / Инструмент',
        html: `
            <div style="text-align: left; font-size: 0.9em; display: flex; flex-direction: column; gap: 10px;">
                <div>
                    <label style="font-weight: 700; color: #475569;">🏭 Работно Място (Машина): *</label>
                    ${machineFieldHtml}
                </div>
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 8px;">
                        <label style="font-weight: 700; color: #475569;">📦 Изискван инструмент / пластина: *</label>
                        <span id="swalToolListCountBadge" style="font-size: 0.78em; font-weight: 700; color: ${machTools.length > 0 ? '#0369a1' : '#64748b'}; background: ${machTools.length > 0 ? '#e0f2fe' : '#f1f5f9'}; padding: 2px 8px; border-radius: 999px; white-space: nowrap;">
                            ${machTools.length > 0 ? `📋 ${machTools.length} поз. ${defaultMach ? 'за машината' : 'общо'}` : '✍️ Свободен текст'}
                        </span>
                    </div>
                    <div id="swalToolPickerWrap" style="position: relative;">
                        <div style="position: relative; display: flex; align-items: center;">
                            <input type="text" id="swalToolItem" autocomplete="off"
                                placeholder="${machTools.length > 0 ? 'Изберете от списъка или напишете за търсене...' : 'напр. Пластина WNMG 080408, Фреза ф10...'}"
                                style="width: 100%; padding: 10px 38px 10px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-weight: 700; box-sizing: border-box;">
                            <button type="button" id="swalToolToggleBtn" tabindex="-1" aria-label="Покажи списъка"
                                style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); width: 28px; height: 28px; border: none; background: #f1f5f9; color: #475569; border-radius: 6px; cursor: pointer; font-size: 0.85em; display: flex; align-items: center; justify-content: center;">▼</button>
                        </div>
                        <div id="swalToolDropdown" style="display: none; position: absolute; top: calc(100% + 4px); left: 0; right: 0; max-height: 220px; overflow-y: auto; background: #ffffff; border: 1.5px solid #94a3b8; border-radius: 10px; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.18); z-index: 10000;"></div>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                        <label style="font-weight: 700; color: #475569;">⚠️ Спешност:</label>
                        <select id="swalToolUrgency" style="width: 100%; padding: 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-weight: 700; box-sizing: border-box;">
                            <option value="Нормална">🟢 Нормална</option>
                            <option value="Спешна" selected>🟡 Спешна</option>
                            <option value="Машината спира!">🔴 КРИТИЧНО</option>
                        </select>
                    </div>
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                            <label style="font-weight: 700; color: #475569;">🔢 Количество:</label>
                            <span id="swalToolPackSizeBadge" style="font-size: 0.78em; color: #0369a1; background: #e0f2fe; padding: 1px 6px; border-radius: 6px; font-weight: 700;">📦 Опаковка: 10 бр.</span>
                        </div>
                        <input type="number" id="swalToolQty" value="10" min="1" step="any" placeholder="напр. 10 или 20" style="width: 100%; padding: 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-weight: 800; color: #1e293b; box-sizing: border-box;">
                    </div>
                </div>
                <div>
                    <label style="font-weight: 700; color: #475569;">📝 Забележка (по избор):</label>
                    <input type="text" id="swalToolNotes" placeholder="напр. износена пластина, спешна поръчка" style="width: 100%; padding: 8px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;">
                </div>
            </div>
        `,
        didOpen: (popup) => {
            const htmlCont = popup.querySelector('.swal2-html-container');
            if (htmlCont) htmlCont.style.overflow = 'visible';

            const wrap = document.getElementById('swalToolPickerWrap');
            const input = document.getElementById('swalToolItem');
            const toggleBtn = document.getElementById('swalToolToggleBtn');
            const dropdown = document.getElementById('swalToolDropdown');
            const badge = document.getElementById('swalToolPackSizeBadge');
            const qtyInp = document.getElementById('swalToolQty');
            const machineSelect = document.getElementById('swalToolMachineSelect');
            const listCountBadge = document.getElementById('swalToolListCountBadge');
            if (!wrap || !input || !toggleBtn || !dropdown) return;

            let activeTargetMachine = machineSelect ? machineSelect.value.trim() : defaultMach;
            let lastAutoQty = 10;

            const applyPackSize = (ps) => {
                const pack = parseFloat(ps) || 10;
                if (badge) badge.innerText = `📦 Опаковка: ${pack} бр.`;
                if (qtyInp && (!qtyInp.value || parseFloat(qtyInp.value) === lastAutoQty || qtyInp.value === '1')) {
                    qtyInp.value = pack;
                    lastAutoQty = pack;
                }
            };

            const closeDropdown = () => {
                dropdown.style.display = 'none';
                toggleBtn.innerText = '▼';
            };

            const renderDropdown = (filterText, showAll) => {
                const rawQuery = String(filterText || '').trim();
                const q = rawQuery.toLowerCase();
                const filtered = (showAll || !q)
                    ? machTools
                    : machTools.filter(t =>
                        t.code.toLowerCase().includes(q) ||
                        t.name.toLowerCase().includes(q) ||
                        t.value.toLowerCase().includes(q)
                    );

                let rowsHtml = '';
                filtered.forEach(t => {
                    const origIdx = machTools.indexOf(t);
                    const stockBg = t.qty > 0 ? '#dcfce7' : '#fee2e2';
                    const stockClr = t.qty > 0 ? '#15803d' : '#b91c1c';
                    const nameExtra = (t.name && t.name.toLowerCase() !== t.code.toLowerCase())
                        ? ` <span style="font-weight: 500; color: #475569;">— ${escapeHtml(t.name)}</span>`
                        : '';
                    rowsHtml += `
                        <div class="swal-tool-option" data-tool-idx="${origIdx}"
                            style="padding: 9px 12px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.12s;">
                            <div style="font-weight: 800; color: #0f172a; font-size: 0.95em;">${escapeHtml(t.code)}${nameExtra}</div>
                            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; font-size: 0.78em;">
                                <span style="background: #e0f2fe; color: #0369a1; padding: 1px 6px; border-radius: 5px; font-weight: 700;">📦 ${t.packSize} бр./кут.</span>
                                <span style="background: ${stockBg}; color: ${stockClr}; padding: 1px 6px; border-radius: 5px; font-weight: 700;">Склад: ${t.qty} ${escapeHtml(t.unit)}</span>
                                <span style="background: #f1f5f9; color: #475569; padding: 1px 6px; border-radius: 5px; font-weight: 600;">🏭 ${escapeHtml(t.machineLabel)}</span>
                            </div>
                        </div>
                    `;
                });

                const hasExact = q && machTools.some(t => t.value.toLowerCase() === q || t.code.toLowerCase() === q);
                if (q && !hasExact) {
                    rowsHtml += `
                        <div class="swal-tool-free" style="padding: 9px 12px; cursor: pointer; background: #fffbeb; color: #92400e; font-weight: 700; font-size: 0.88em;">
                            ✍️ Използвай въведения текст: „${escapeHtml(rawQuery)}“
                        </div>
                    `;
                } else if (machTools.length === 0 && !q) {
                    const targetLabel = activeTargetMachine || 'избраните машини';
                    rowsHtml = `
                        <div style="padding: 12px; color: #64748b; font-size: 0.86em; text-align: center;">
                            Няма въведени инструменти за „${escapeHtml(targetLabel)}“ в Склад Инструментална Екипировка.<br>Можете да въведете текста ръчно по-горе.
                        </div>
                    `;
                }

                dropdown.innerHTML = rowsHtml;

                dropdown.querySelectorAll('.swal-tool-option').forEach(el => {
                    el.addEventListener('mouseenter', () => { el.style.background = '#f8fafc'; });
                    el.addEventListener('mouseleave', () => { el.style.background = '#ffffff'; });
                    el.addEventListener('mousedown', (e) => e.preventDefault());
                    el.addEventListener('click', () => {
                        const idx = parseInt(el.getAttribute('data-tool-idx'), 10);
                        const chosen = machTools[idx];
                        if (chosen) {
                            input.value = chosen.value;
                            applyPackSize(chosen.packSize);
                        }
                        closeDropdown();
                    });
                });

                const freeEl = dropdown.querySelector('.swal-tool-free');
                if (freeEl) {
                    freeEl.addEventListener('mousedown', (e) => e.preventDefault());
                    freeEl.addEventListener('click', () => closeDropdown());
                }
            };

            const openDropdown = (showAll) => {
                renderDropdown(input.value, showAll);
                dropdown.style.display = 'block';
                toggleBtn.innerText = '▲';
            };

            if (machineSelect) {
                machineSelect.addEventListener('change', () => {
                    activeTargetMachine = machineSelect.value.trim();
                    const rebuilt = buildToolsForMachine(activeTargetMachine);
                    machTools = rebuilt.machTools;
                    window._tempToolPackSizeMap = rebuilt.toolPackSizeMap;

                    if (listCountBadge) {
                        if (machTools.length > 0) {
                            listCountBadge.style.color = '#0369a1';
                            listCountBadge.style.background = '#e0f2fe';
                            listCountBadge.innerText = `📋 ${machTools.length} поз. ${activeTargetMachine ? 'за машината' : 'общо'}`;
                        } else {
                            listCountBadge.style.color = '#64748b';
                            listCountBadge.style.background = '#f1f5f9';
                            listCountBadge.innerText = '✍️ Свободен текст';
                        }
                    }

                    if (dropdown.style.display !== 'none') {
                        renderDropdown(input.value, true);
                    }
                });
            }

            input.addEventListener('focus', () => openDropdown(true));
            input.addEventListener('click', () => openDropdown(true));
            input.addEventListener('input', () => {
                const val = input.value.trim().toLowerCase();
                const map = window._tempToolPackSizeMap || {};
                const ps = map[val] || (val.split(' - ')[0] && map[val.split(' - ')[0].trim()]) || 10;
                applyPackSize(ps);
                openDropdown(false);
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && dropdown.style.display !== 'none') {
                    e.stopPropagation();
                    closeDropdown();
                }
            });

            toggleBtn.addEventListener('mousedown', (e) => e.preventDefault());
            toggleBtn.addEventListener('click', () => {
                if (dropdown.style.display === 'none') {
                    openDropdown(true);
                    input.focus();
                } else {
                    closeDropdown();
                }
            });

            if (window._toolPickerOutsideClick) {
                document.removeEventListener('mousedown', window._toolPickerOutsideClick);
            }
            window._toolPickerOutsideClick = (e) => {
                if (!wrap.contains(e.target)) closeDropdown();
            };
            document.addEventListener('mousedown', window._toolPickerOutsideClick);
        },
        didDestroy: () => {
            if (window._toolPickerOutsideClick) {
                document.removeEventListener('mousedown', window._toolPickerOutsideClick);
                window._toolPickerOutsideClick = null;
            }
        },
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: '🚀 Изпрати към Админ',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#d97706',
        preConfirm: () => {
            const machSelect = document.getElementById('swalToolMachineSelect');
            const chosenMachine = machSelect ? machSelect.value.trim() : defaultMach;
            const item = document.getElementById('swalToolItem').value.trim();
            const qty = parseFloat(document.getElementById('swalToolQty').value) || 10;
            const notes = document.getElementById('swalToolNotes').value.trim();
            if (!chosenMachine) {
                Swal.showValidationMessage('Моля, изберете за коя машина е заявката!');
                return false;
            }
            if (!item) {
                Swal.showValidationMessage('Моля, въведете име или код на инструмента/пластината!');
                return false;
            }
            return {
                machine: chosenMachine,
                tool_item: item,
                urgency: document.getElementById('swalToolUrgency').value,
                notes: notes ? `[Изискани: ${qty} бр.] ${notes}` : `[Изискани: ${qty} бр.]`
            };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Изпращане...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const opName = (typeof currentOperator !== 'undefined' && currentOperator) ? currentOperator : (localStorage.getItem('mes_operator') || 'Оператор');
            const { error } = await client.from('tooling_requests').insert([{
                workstation_name: formValues.machine,
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
    Swal.fire({ title: 'Зареждане на регистъра по стаи и уреди...', didOpen: () => Swal.showLoading() });
    
    try {
        const [roomsRes, machinesRes, toolsRes] = await Promise.all([
            client.from('factory_rooms').select('*').order('room_number'),
            client.from('factory_machines').select('*').order('name'),
            client.from('factory_tools').select('*').order('tool_code')
        ]);

        const allRooms = roomsRes.data || [];
        const allMachines = machinesRes.data || [];
        const allTools = toolsRes.data || [];

        // Определяме машината/машините на оператора
        let rawMach = (typeof currentMachine !== 'undefined' && currentMachine) ? currentMachine : (localStorage.getItem('mes_machine') || '');
        let selectedMachineList = rawMach.split(',')
            .map(m => m.trim())
            .filter(m => m && m.toUpperCase() !== 'ВСИЧКИ');

        // Намираме стаите, свързани с избраните машини
        let matchedRoomNums = new Set();
        let matchedMachineNames = [];

        selectedMachineList.forEach(sName => {
            let matchingMacs = allMachines.filter(m => m.name && m.name.toLowerCase() === sName.toLowerCase());
            matchingMacs.forEach(foundMac => {
                matchedMachineNames.push(foundMac.name);
                if (foundMac.room_number) {
                    matchedRoomNums.add(String(foundMac.room_number).trim());
                }
            });
        });

        // По подразбиране избираме стаята на първата избрана машина, или първата налична стая
        let defaultRoomNum = matchedRoomNums.size > 0 ? Array.from(matchedRoomNums)[0] : (allRooms.length > 0 ? allRooms[0].room_number : '');

        // Функция за рендериране на модала за конкретна стая
        function renderRoomToolsModal(currentRoomNum) {
            let curRoom = allRooms.find(r => String(r.room_number).trim() === String(currentRoomNum).trim());
            let roomTitle = curRoom ? `Стая ${curRoom.room_number} - ${escapeHtml(curRoom.room_name)}` : `Стая ${currentRoomNum}`;
            let roomFloor = curRoom ? curRoom.floor : '';

            // Машини в тази стая
            let roomMachines = allMachines.filter(m => String(m.room_number).trim() === String(currentRoomNum).trim());
            let macBadges = roomMachines.map(m => `<span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:6px; font-size:0.82em; font-weight:700;">🏭 ${escapeHtml(m.name)}${m.code ? ' (№' + escapeHtml(m.code) + ')' : ''}</span>`).join(' ');

            // Уреди в тази стая (от factory_tools с room_number, или workstation_name matching room machines)
            let roomTools = allTools.filter(t => {
                if (String(t.room_number).trim() === String(currentRoomNum).trim()) return true;
                if (t.workstation_name) {
                    let wsNorm = t.workstation_name.toLowerCase();
                    return roomMachines.some(m => wsNorm.includes(m.name.toLowerCase()));
                }
                return false;
            });

            // Опции за падащото меню на стаите
            let roomOptions = allRooms.map(r => `
                <option value="${r.room_number}" ${String(r.room_number).trim() === String(currentRoomNum).trim() ? 'selected' : ''}>
                    🏢 Стая ${r.room_number} - ${escapeHtml(r.room_name)} (${r.floor})
                </option>
            `).join('');

            let toolsHtml = '';
            if (roomTools.length === 0) {
                toolsHtml = `
                    <div style="padding: 25px 15px; text-align: center; color: #64748b; background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 8px; margin-top: 10px;">
                        <div style="font-size: 1.8em; margin-bottom: 4px;">📏</div>
                        <b>В ${roomTitle} все още няма заведени инструменти в регистъра.</b>
                        <small style="color: #94a3b8; display: block; margin-top: 6px;">(Инструментите се зачисляват от Административния панел в таб „🏢 Опис по стаи / Инвентаризация“)</small>
                    </div>
                `;
            } else {
                toolsHtml = `
                    <div style="text-align: left; max-height: 340px; overflow-y: auto; margin-top: 10px; border: 1px solid #e2e8f0; border-radius: 8px;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.88em;">
                            <thead>
                                <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; color: #475569; position: sticky; top: 0;">
                                    <th style="padding: 8px 10px; text-align: left;">Код</th>
                                    <th style="padding: 8px 10px; text-align: left;">Уред / Инструмент</th>
                                    <th style="padding: 8px 10px; text-align: left;">Място</th>
                                    <th style="padding: 8px 10px; text-align: left;">Проверка / Калибрация</th>
                                </tr>
                            </thead>
                            <tbody>
                `;

                roomTools.forEach(t => {
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
                        calStatusHtml += `<div style="font-size:0.75em; color:#64748b; margin-top:3px;">Последна: <b>${t.calibration_date}</b></div>`;
                    }

                    let locText = t.location_detail || t.workstation_name || 'В стаята';

                    toolsHtml += `
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 8px 10px; font-weight: 800; color: #2563eb; font-family: monospace;">${escapeHtml(t.tool_code)}</td>
                            <td style="padding: 8px 10px;">
                                <div style="font-weight: 700; color: #1e293b;">${escapeHtml(t.tool_name)}</div>
                                <div style="font-size: 0.78em; color: #64748b;">${escapeHtml(t.category || 'Уред')}</div>
                            </td>
                            <td style="padding: 8px 10px; color: #475569; font-size: 0.85em;">${escapeHtml(locText)}</td>
                            <td style="padding: 8px 10px;">${calStatusHtml}</td>
                        </tr>
                    `;
                });

                toolsHtml += `</tbody></table></div>`;
            }

            Swal.fire({
                title: `🧰 Налични уреди & инструменти`,
                html: `
                    <div style="text-align: left; font-size: 0.9em;">
                        <div style="margin-bottom: 8px;">
                            <label style="font-weight: 800; color: #334155; font-size: 0.88em; display: block; margin-bottom: 4px;">
                                📍 Изберете стая / цехова локация:
                            </label>
                            <select id="swalTermRoomFilter" class="swal2-select" style="width: 100%; margin: 0; padding: 8px 12px; font-weight: 700;" onchange="window._switchTermRoomTools(this.value)">
                                ${roomOptions}
                            </select>
                        </div>
                        ${macBadges ? `<div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; align-items: center;"><span style="color:#64748b; font-size:0.8em; font-weight:bold;">Машини:</span> ${macBadges}</div>` : ''}
                        ${toolsHtml}
                    </div>
                `,
                width: 650,
                confirmButtonText: 'Затвори',
                confirmButtonColor: '#2563eb'
            });
        }

        window._switchTermRoomTools = function(newRoomNum) {
            renderRoomToolsModal(newRoomNum);
        };

        renderRoomToolsModal(defaultRoomNum);

    } catch (err) {
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


