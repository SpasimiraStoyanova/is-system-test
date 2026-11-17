// packing-actions.js - Действия за Опаковане (Отчитане на опаковани детайли & Разпределяне в кашони)

// -------------------------------------------------------------
// 1. Помощни функции за интерфейса в Таб 1 (Опаковане)
// -------------------------------------------------------------

function updateTaskBtn(taskId) {
    let qtyInp = document.getElementById('qty_' + taskId);
    let boxInp = document.getElementById('box_' + taskId);
    let btn = document.getElementById('btn_' + taskId);
    let span = document.getElementById('btnQtySpan_' + taskId);
    let hint = document.getElementById('btnHint_' + taskId);

    let qty = parseFloat(qtyInp ? qtyInp.value : 0) || 0;
    let box = boxInp ? boxInp.value.trim() : '';

    if (span) span.innerText = qty;

    if (btn) {
        if (box) {
            btn.style.backgroundColor = '#2563eb';
            btn.style.boxShadow = '0 4px 8px rgba(37, 99, 235, 0.3)';
            btn.innerHTML = `📦 ЗАПИШИ В КАШОН № ${escapeHtml(box)} (${qty} бр.)`;
            if (hint) hint.innerHTML = `ℹ️ Детайлите ще се запишат директно в <b>Кашон № ${escapeHtml(box)}</b>`;
        } else {
            btn.style.backgroundColor = '#16a34a';
            btn.style.boxShadow = '0 4px 8px rgba(22, 163, 74, 0.3)';
            btn.innerHTML = `✅ ОТЧЕТИ КАТО ОПАКОВАНИ (${qty} бр.)`;
            if (hint) hint.innerHTML = `ℹ️ Кашонът е празен — детайлите ще отидат в таб <b>„За кашони“</b>`;
        }
    }
}

function setTaskQtyMax(taskId, maxVal) {
    let inp = document.getElementById('qty_' + taskId);
    if (inp) {
        inp.value = maxVal;
        updateTaskBtn(taskId);
    }
}

// -------------------------------------------------------------
// 2. Помощни функции за интерфейса в Таб 2 (За кашони)
// -------------------------------------------------------------

function setAssignMaxQty(safeId, maxVal) {
    let inp = document.getElementById('assign_qty_' + safeId);
    if (inp) {
        inp.value = maxVal;
        updateBoxAssignmentSummary();
    }
}

function setAssignZeroQty(safeId) {
    let inp = document.getElementById('assign_qty_' + safeId);
    if (inp) {
        inp.value = 0;
        updateBoxAssignmentSummary();
    }
}

function updateBoxAssignmentSummary() {
    let masterBoxInput = document.getElementById('masterBoxNumber');
    let boxNum = masterBoxInput ? masterBoxInput.value.trim() : '';

    let totalQty = 0;
    let inputs = document.querySelectorAll('.assign-qty-input');
    inputs.forEach(inp => {
        let v = parseFloat(inp.value) || 0;
        let maxV = parseFloat(inp.dataset.max) || 0;
        if (v < 0) { v = 0; inp.value = 0; }
        if (v > maxV) { v = maxV; inp.value = maxV; }
        totalQty += v;
    });

    let totalSpan = document.getElementById('boxSummaryTotalQty');
    if (totalSpan) totalSpan.innerText = totalQty + ' бр.';

    let btn = document.getElementById('btnAssignBox');
    if (btn) {
        if (boxNum !== '' && totalQty > 0) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.innerHTML = `📦 ПРИБЕРИ ${totalQty} бр. В КАШОН № ${escapeHtml(boxNum)}`;
        } else {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            btn.innerHTML = `📦 ПРИБЕРИ В КАШОНА`;
        }
    }
}

// -------------------------------------------------------------
// 3. Единен бутон в Таб 1: Отчитане на опаковане
// (Ако кашонът е празен -> отива в За кашони; ако е попълнен -> директно в кашона)
// -------------------------------------------------------------

async function handlePackingSubmit(taskId, btn) {
    let taskData = globalTasks.find(t => t.id === taskId);
    if (!taskData) {
        Swal.fire('Грешка', 'Задачата не е намерена в паметта! (ID: ' + taskId + ')', 'error');
        return;
    }

    let qtyInput = document.getElementById('qty_' + taskId);
    let boxInput = document.getElementById('box_' + taskId);

    if (!qtyInput) {
        Swal.fire('Грешка', 'Полето за количество не е намерено!', 'error');
        return;
    }

    let val = parseFloat(qtyInput.value);
    let boxNum = boxInput ? boxInput.value.trim() : '';

    if (isNaN(val) || val <= 0) { 
        Swal.fire('Грешка', 'Въведете валидна бройка за опаковане!', 'error'); 
        return; 
    }
    if (val > taskData.available) { 
        Swal.fire('Невъзможно', `Разполагате само с ${taskData.available} бр. готови за опаковане от цеха!`, 'error'); 
        return; 
    }

    if (boxNum === '') {
        // Кашонът е ПРАЗЕН -> Опаковане без кашон (отиват в таб "За кашони")
        Swal.fire({ 
            title: 'Потвърждаване на опаковане', 
            html: `Ще отчетете <b style="color:#16a34a; font-size:1.3em;">${val} бр.</b> опаковани от:<br><b style="font-size:1.15em; color:#0f172a;">${escapeHtml(taskData.name)}</b><br><span style="color:#64748b; font-size:0.9em;">(План: ${escapeHtml(taskData.plan_name)})</span><br><br><div style="background:#e0f2fe; color:#0369a1; padding:10px 14px; border-radius:10px; font-size:0.9em; text-align:left; line-height:1.4;">ℹ️ Полето за кашон е празно. Детайлите ще се отчетат като <b>опаковани</b> и ще отидат в таб <b>„За кашони“</b>, откъдето колегата може да ги разпредели в кашон по-късно.</div>`, 
            icon: 'question', 
            showCancelButton: true, 
            confirmButtonColor: '#16a34a', 
            confirmButtonText: '✅ ДА, ОТЧЕТИ ОПАКОВАНИ', 
            cancelButtonText: 'Отказ'
        }).then(async (result) => {
            if (result.isConfirmed) {
                btn.disabled = true; 
                btn.innerHTML = "ЗАПИС..."; 
                Swal.fire({ title: 'Запис на отчета...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
                
                try {
                    let inserts = [{ 
                        "ID План": taskData.plan_id, 
                        "ID Детайл": taskData.name, 
                        "Оператор": currentOperator, 
                        "Количество": val, 
                        "Операция": "Опаковане", 
                        "Статус": "Отчетено", 
                        "Дата": new Date().toISOString(), 
                        "Време Старт": new Date().toISOString() 
                    }];

                    const { error } = await client.from('otcheti').insert(inserts);
                    if (error) throw error;
                    
                    if (val >= taskData.target) {
                        await client.from('plan').update({ 'Статус': '📦 Опакован' }).eq('id', taskData.plan_id);
                    }
                    
                    addLogToHistory('ОПАКОВАНИ (без кашон)', val, taskData.name); 
                    
                    Swal.fire({
                        icon: 'success',
                        title: 'Успешно отчетени!',
                        html: `Опаковани: <b>${val} бр.</b> от ${escapeHtml(taskData.name)}.<br><br>Детайлите преминаха в таб <b>„За кашони“</b>.`,
                        showCancelButton: true,
                        confirmButtonText: '📦 КЪМ ТАБ ЗА КАШОНИ',
                        cancelButtonText: 'Остани тук',
                        confirmButtonColor: '#2563eb'
                    }).then((navRes) => {
                        if (navRes.isConfirmed) {
                            switchPackingTab('boxes');
                        }
                        loadTasks(false);
                    });
                } catch(err) { 
                    Swal.fire('❌ Грешка при запис', err.message, 'error'); 
                    btn.disabled = false; 
                    updateTaskBtn(taskId);
                }
            }
        });
    } else {
        // Кашонът е ПОПЪЛНЕН -> Директен запис в съответния кашон
        Swal.fire({ 
            title: `Запис в Кашон № ${boxNum}`, 
            html: `Ще отчетете <b style="color:#2563eb; font-size:1.3em;">${val} бр.</b> от:<br><b style="font-size:1.15em; color:#0f172a;">${escapeHtml(taskData.name)}</b><br><span style="color:#64748b; font-size:0.9em;">(План: ${escapeHtml(taskData.plan_name)})</span><br><br>директно в <b style="color:#0369a1; font-size:1.25em;">Кашон № ${escapeHtml(boxNum)}</b>.`, 
            icon: 'question', 
            showCancelButton: true, 
            confirmButtonColor: '#2563eb', 
            confirmButtonText: '📦 ДА, ЗАПИШИ В ТОЗИ КАШОН', 
            cancelButtonText: 'Отказ'
        }).then(async (result) => {
            if (result.isConfirmed) {
                btn.disabled = true; 
                btn.innerHTML = "ЗАПИС..."; 
                Swal.fire({ title: 'Запис на отчета...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
                
                try {
                    let inserts = [{ 
                        "ID План": taskData.plan_id, 
                        "ID Детайл": taskData.name, 
                        "Оператор": currentOperator, 
                        "Количество": val, 
                        "Операция": "Опаковане - Кашон № " + boxNum, 
                        "Статус": "Отчетено", 
                        "Дата": new Date().toISOString(), 
                        "Време Старт": new Date().toISOString() 
                    }];

                    const { error } = await client.from('otcheti').insert(inserts);
                    if (error) throw error;
                    
                    if (val >= taskData.target) {
                        await client.from('plan').update({ 'Статус': '📦 Опакован' }).eq('id', taskData.plan_id);
                    }
                    
                    addLogToHistory('КАШОН ' + boxNum, val, taskData.name); 
                    
                    Swal.fire({
                        icon: 'success',
                        title: 'Успешно!',
                        html: `Записани: <b>${val} бр.</b> в <b>Кашон № ${escapeHtml(boxNum)}</b>.`,
                        timer: 2000,
                        showConfirmButton: false
                    }).then(() => {
                        loadTasks(false);
                    });
                } catch(err) { 
                    Swal.fire('❌ Грешка при запис', err.message, 'error'); 
                    btn.disabled = false; 
                    updateTaskBtn(taskId);
                }
            }
        });
    }
}

// -------------------------------------------------------------
// 4. Разпределяне на детайли от Таб 2 (За кашони)
// -------------------------------------------------------------

async function executeBoxAssignment(btn) {
    let masterBoxInput = document.getElementById('masterBoxNumber');
    let boxNum = masterBoxInput ? masterBoxInput.value.trim() : '';

    if (!boxNum) {
        Swal.fire('Липсва номер', 'Моля, въведете номер на кашон!', 'warning');
        return;
    }

    let assignments = [];
    let totalQty = 0;

    let inputs = document.querySelectorAll('.assign-qty-input');
    inputs.forEach(inp => {
        let v = parseFloat(inp.value) || 0;
        if (v > 0) {
            let idx = parseInt(inp.dataset.index);
            let item = globalUnboxedItems[idx];
            if (item) {
                assignments.push({ item, qty: v });
                totalQty += v;
            }
        }
    });

    if (assignments.length === 0 || totalQty <= 0) {
        Swal.fire('Няма избрани детайли', 'Моля, посочете количество поне за един детайл за този кашон!', 'info');
        return;
    }

    let itemsSummaryHtml = assignments.map(a => `• <b>${escapeHtml(a.item.name)}</b>: <b style="color:#0284c7;">${a.qty} бр.</b> <span style="color:#64748b; font-size:0.85em;">(${escapeHtml(a.item.plan_name)})</span>`).join('<br>');

    Swal.fire({
        title: `Кашон № ${boxNum}`,
        html: `Сигурни ли сте, че поставяте в <b style="color:#0369a1; font-size:1.2em;">Кашон № ${escapeHtml(boxNum)}</b>:<br><br><div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px; text-align:left; font-size:0.95em;">${itemsSummaryHtml}<br><hr style="border:none; border-top:1px dashed #cbd5e1; margin:8px 0;"><div style="font-weight:900; color:#0f172a; text-align:right;">Общо за кашона: ${totalQty} бр.</div></div>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        confirmButtonText: '📦 ДА, ЗАПИШИ В КАШОНА',
        cancelButtonText: 'Отказ'
    }).then(async (res) => {
        if (res.isConfirmed) {
            btn.disabled = true;
            btn.innerHTML = "ОБРАБОТВАНЕ...";
            Swal.fire({ title: 'Разпределяне в кашона...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            try {
                for (let a of assignments) {
                    let remainingToAssign = a.qty;
                    let item = a.item;

                    let reports = [...item.reports].sort((r1, r2) => {
                        let t1 = new Date(r1['Време Старт'] || r1['Дата']).getTime();
                        let t2 = new Date(r2['Време Старт'] || r2['Дата']).getTime();
                        return t1 - t2;
                    });

                    for (let r of reports) {
                        if (remainingToAssign <= 0) break;
                        let rQty = parseFloat(r['Количество']) || 0;

                        if (rQty <= remainingToAssign) {
                            const { error: updErr } = await client
                                .from('otcheti')
                                .update({ "Операция": "Опаковане - Кашон № " + boxNum })
                                .eq('id', r.id);
                            if (updErr) throw updErr;

                            remainingToAssign -= rQty;
                        } else {
                            let keepInUnboxed = rQty - remainingToAssign;
                            let assignToBox = remainingToAssign;

                            const { error: updErr } = await client
                                .from('otcheti')
                                .update({ "Количество": keepInUnboxed })
                                .eq('id', r.id);
                            if (updErr) throw updErr;

                            const { error: insErr } = await client
                                .from('otcheti')
                                .insert([{
                                    "ID План": r['ID План'],
                                    "ID Детайл": r['ID Детайл'],
                                    "Оператор": currentOperator || r['Оператор'],
                                    "Количество": assignToBox,
                                    "Операция": "Опаковане - Кашон № " + boxNum,
                                    "Статус": "Отчетено",
                                    "Дата": new Date().toISOString(),
                                    "Време Старт": r['Време Старт'] || new Date().toISOString()
                                }]);
                            if (insErr) throw insErr;

                            remainingToAssign = 0;
                        }
                    }

                    addLogToHistory('КАШОН ' + boxNum, a.qty, item.name);
                }

                // Изчистваме полетата в UI преди презареждане
                let masterBoxInput = document.getElementById('masterBoxNumber');
                if (masterBoxInput) masterBoxInput.value = '';
                document.querySelectorAll('.assign-qty-input').forEach(i => i.value = 0);

                // Връщаме бутона в нормално начално състояние
                btn.disabled = true;
                btn.innerHTML = `📦 ПРИБЕРИ В КАШОНА`;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';

                Swal.fire({
                    icon: 'success',
                    title: 'Кашонът е записан!',
                    html: `Кашон <b>№ ${escapeHtml(boxNum)}</b> беше оформен успешно с общо <b>${totalQty} бр.</b>!`,
                    showCancelButton: true,
                    confirmButtonText: '📋 ВИЖ КАШОНИТЕ',
                    cancelButtonText: 'Остани тук',
                    confirmButtonColor: '#2563eb',
                    cancelButtonColor: '#64748b'
                }).then(async (navRes) => {
                    await loadTasks(false);
                    if (navRes.isConfirmed) {
                        switchPackingTab('doneBoxes');
                    }
                });

            } catch (err) {
                console.error("Box assignment error:", err);
                Swal.fire('❌ Грешка при запис', err.message, 'error');
                btn.disabled = false;
                updateBoxAssignmentSummary();
            }
        }
    });
}

// -------------------------------------------------------------
// 5. Управление на готови кашони (по индекс от window.__boxedCartonList)
// -------------------------------------------------------------

async function renameBoxByIndex(idx) {
    let oldBoxNum = window.__boxedCartonList && window.__boxedCartonList[idx];
    if (!oldBoxNum) return;

    const { value: newBoxNum } = await Swal.fire({
        title: 'Промяна на номер на кашон',
        input: 'text',
        inputValue: oldBoxNum,
        inputLabel: 'Нов номер на кашон:',
        inputPlaceholder: 'Въведете новия номер...',
        showCancelButton: true,
        confirmButtonText: 'Запази промяната',
        cancelButtonText: 'Отказ',
        confirmButtonColor: '#2563eb',
        inputValidator: (value) => {
            if (!value || !value.trim()) {
                return 'Номерът на кашон не може да бъде празен!';
            }
        }
    });

    if (newBoxNum && newBoxNum.trim() !== oldBoxNum) {
        let cleanNewBox = newBoxNum.trim();
        Swal.fire({ title: 'Преименуване...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            const { error: updErr } = await client
                .from('otcheti')
                .update({ "Операция": "Опаковане - Кашон № " + cleanNewBox })
                .eq('Операция', 'Опаковане - Кашон № ' + oldBoxNum);
            
            if (updErr) throw updErr;

            Swal.fire('Успешно!', `Кашон № ${escapeHtml(oldBoxNum)} беше преименуван на № ${escapeHtml(cleanNewBox)}.`, 'success').then(() => {
                loadTasks(false);
            });
        } catch (err) {
            Swal.fire('Грешка при преименуване', err.message, 'error');
        }
    }
}

async function unpackBoxByIndex(idx) {
    let boxNum = window.__boxedCartonList && window.__boxedCartonList[idx];
    if (!boxNum) return;

    let box = globalBoxedCartons[boxNum];
    let countInfo = box ? `с общо <b>${box.totalQty} бр.</b>` : '';

    Swal.fire({
        title: 'Разопаковане на кашон?',
        html: `Сигурни ли сте, че искате да разопаковате <b style="color:#dc2626;">Кашон № ${escapeHtml(boxNum)}</b> ${countInfo}?<br><br><span style="font-size:0.9em; color:#475569;">Детайлите от този кашон ще се върнат в таб <b>„За кашони“</b> и ще можете да ги разпределите наново.</span>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: '↩️ ДА, РАЗОПАКОВАЙ',
        cancelButtonText: 'Отказ'
    }).then(async (res) => {
        if (res.isConfirmed) {
            Swal.fire({ title: 'Разопаковане...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            try {
                const { error: updErr } = await client
                    .from('otcheti')
                    .update({ "Операция": "Опаковане" })
                    .eq('Операция', 'Опаковане - Кашон № ' + boxNum);
                
                if (updErr) throw updErr;

                Swal.fire('Разопакован!', `Детайлите от Кашон № ${escapeHtml(boxNum)} бяха върнати в чакащи за кашон.`, 'success').then(() => {
                    loadTasks(false);
                });
            } catch (err) {
                Swal.fire('Грешка при разопаковане', err.message, 'error');
            }
        }
    });
}

// -------------------------------------------------------------
// 6. История на действията на устройството
// -------------------------------------------------------------

function updateHistoryUI() {
    var list = document.getElementById('historyList');
    if (!list) return;
    if (localHistoryData.length === 0) { 
        list.innerHTML = '<li class="history-item" style="color:#94a3b8; text-align:center;">Няма скорошни действия</li>'; 
        return; 
    }
    var html = '';
    localHistoryData.forEach(function(h) {
        let color = '#15803d'; let bg = '#dcfce7'; 
        if (h.type.includes('БРАК')) { color = '#b91c1c'; bg = '#fee2e2'; }
        else if (h.type.includes('ОФЛАЙН')) { color = '#b45309'; bg = '#fef3c7'; }
        else if (h.type.includes('ОПАКОВАНИ')) { color = '#15803d'; bg = '#dcfce7'; }
        else if (h.type.includes('КАШОН')) { color = '#0369a1'; bg = '#e0f2fe'; }

        html += `<li class="history-item">
            <span class="h-time">${h.time}</span>
            <span class="h-type" style="background:${bg}; color:${color};">${escapeHtml(h.type)}</span>
            <span class="h-name">${escapeHtml(h.name)}</span>
            <span class="h-qty">${h.qty} бр.</span>
        </li>`;
    });
    list.innerHTML = html;
}

function addLogToHistory(type, qty, name) {
    var now = new Date(); 
    var timeStr = now.getDate().toString().padStart(2, '0') + '.' + 
                  (now.getMonth() + 1).toString().padStart(2, '0') + ' ' + 
                  now.getHours().toString().padStart(2, '0') + ':' + 
                  now.getMinutes().toString().padStart(2, '0');
    
    localHistoryData.unshift({ time: timeStr, type: type, qty: qty, name: name || 'Детайл' }); 
    if (localHistoryData.length > 15) localHistoryData.pop(); 
    updateHistoryUI();
}
