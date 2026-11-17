// packing-actions.js - Действия за Опаковане (Отчитане на опаковани детайли & Разпределяне в кашони)

// -------------------------------------------------------------
// 1. Помощни функции за интерфейса
// -------------------------------------------------------------

function updateTaskBtnQty(taskId) {
    let inp = document.getElementById('qty_' + taskId);
    let span = document.getElementById('btnQtySpan_' + taskId);
    if (inp && span) {
        let v = parseFloat(inp.value) || 0;
        span.innerText = v;
    }
}

function setTaskQtyMax(taskId, maxVal) {
    let inp = document.getElementById('qty_' + taskId);
    if (inp) {
        inp.value = maxVal;
        updateTaskBtnQty(taskId);
    }
}

function toggleQuickBoxInput(taskId) {
    let area = document.getElementById('quickBoxArea_' + taskId);
    if (area) {
        area.style.display = (area.style.display === 'none' || area.style.display === '') ? 'block' : 'none';
    }
}

function setAssignMaxQty(key, maxVal) {
    let inp = document.getElementById('assign_qty_' + key);
    if (inp) {
        inp.value = maxVal;
        updateBoxAssignmentSummary();
    }
}

function setAssignZeroQty(key) {
    let inp = document.getElementById('assign_qty_' + key);
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
            btn.innerHTML = `📦 ПРИБЕРИ ${totalQty} бр. В КАШОН № ${boxNum}`;
        } else {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            btn.innerHTML = `📦 ПРИБЕРИ В КАШОНА`;
        }
    }
}

// -------------------------------------------------------------
// 2. СТЪПКА 1: Отчитане на опаковани детайли (без кашон)
// -------------------------------------------------------------

async function reportPackedWithoutBox(taskId, btn) {
    let taskData = globalTasks.find(t => t.id === taskId);
    if (!taskData) {
        Swal.fire('Грешка', 'Задачата не е намерена в паметта! (ID: ' + taskId + ')', 'error');
        return;
    }

    let qtyInput = document.getElementById('qty_' + taskId);
    if (!qtyInput) {
        Swal.fire('Грешка', 'Полето за количество не е намерено!', 'error');
        return;
    }

    let val = parseFloat(qtyInput.value);
    if (isNaN(val) || val <= 0) { 
        Swal.fire('Грешка', 'Въведете валидна бройка за опаковане!', 'error'); 
        return; 
    }
    if (val > taskData.available) { 
        Swal.fire('Невъзможно', `Разполагате само с ${taskData.available} бр. готови за опаковане от цеха!`, 'error'); 
        return; 
    }

    Swal.fire({ 
        title: 'Потвърждаване на опаковане', 
        html: `Ще отчетете <b style="color:#16a34a; font-size:1.3em;">${val} бр.</b> опаковани от:<br><b style="font-size:1.1em; color:#1e293b;">${taskData.name}</b><br><span style="color:#64748b; font-size:0.9em;">(План: ${taskData.plan_name})</span><br><br><div style="background:#e0f2fe; color:#0369a1; padding:8px 12px; border-radius:8px; font-size:0.88em; text-align:left; line-height:1.4;">ℹ️ Детайлите ще се запишат като <b>опаковани</b> и ще се наредят в таб <b>„За кашони“</b>, откъдето можете да ги сложите в кашон когато решите.</div>`, 
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
                    title: 'Успешно!',
                    html: `Опаковани: <b>${val} бр.</b> от ${taskData.name}.<br><br>Искате ли да преминете към разпределяне по кашони или да продължите с опаковане?`,
                    showCancelButton: true,
                    confirmButtonText: '📦 КЪМ КАШОНИТЕ',
                    cancelButtonText: 'Остани тук',
                    confirmButtonColor: '#2563eb'
                }).then((navRes) => {
                    if (navRes.isConfirmed) {
                        switchPackingTab('boxes');
                    }
                    loadTasks(true);
                });
            } catch(err) { 
                Swal.fire('❌ Грешка при запис', err.message, 'error'); 
                btn.disabled = false; 
                btn.innerHTML = "✅ ОТЧЕТИ КАТО ОПАКОВАНИ"; 
            }
        }
    });
}

// -------------------------------------------------------------
// 3. Бързо опаковане с директно избран кашон (по избор от таб 1)
// -------------------------------------------------------------

async function finishPackingTaskWithBox(taskId, btn) {
    let taskData = globalTasks.find(t => t.id === taskId);
    if (!taskData) {
        Swal.fire('Грешка', 'Задачата не е намерена!', 'error');
        return;
    }

    let qtyInput = document.getElementById('qty_' + taskId);
    let boxInput = document.getElementById('quick_box_' + taskId);

    if (!qtyInput || !boxInput) {
        Swal.fire('Грешка', 'Полетата за въвеждане липсват!', 'error');
        return;
    }

    let val = parseFloat(qtyInput.value);
    let boxNum = boxInput.value.trim();

    if (isNaN(val) || val <= 0) { 
        Swal.fire('Грешка', 'Въведете валидна бройка!', 'error'); 
        return; 
    }
    if (val > taskData.available) { 
        Swal.fire('Невъзможно', `Разполагате само с ${taskData.available} бр. готови за опаковане!`, 'error'); 
        return; 
    }
    if (boxNum === '') {
        Swal.fire('Грешка', 'Въведете номер на кашон!', 'error'); 
        return; 
    }

    Swal.fire({ 
        title: 'Запис в кашон', 
        html: `Ще отчетете <b style="color:#16a34a; font-size:1.25em;">${val} бр.</b> от <b>${taskData.name}</b><br>в кашон: <b style="color:#0369a1; font-size:1.25em;">${boxNum}</b>.`, 
        icon: 'question', 
        showCancelButton: true, 
        confirmButtonColor: '#0284c7', 
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
                Swal.fire({ icon: 'success', title: 'Успешно!', text: 'Опаковани: ' + val + ' бр. в Кашон № ' + boxNum, timer: 2000, showConfirmButton: false }).then(() => { loadTasks(true); });
            } catch(err) { 
                Swal.fire('❌ Грешка при запис', err.message, 'error'); 
                btn.disabled = false; 
                btn.innerHTML = "📦 Запиши директно в този кашон"; 
            }
        }
    });
}

// -------------------------------------------------------------
// 4. СТЪПКА 2: Разпределяне на вече опаковани детайли по кашони
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

    globalUnboxedItems.forEach(item => {
        let inp = document.getElementById('assign_qty_' + item.key);
        if (inp) {
            let v = parseFloat(inp.value) || 0;
            if (v > 0) {
                assignments.push({
                    item: item,
                    qty: v
                });
                totalQty += v;
            }
        }
    });

    if (assignments.length === 0 || totalQty <= 0) {
        Swal.fire('Няма избрани детайли', 'Моля, посочете количество поне за един детайл за този кашон!', 'info');
        return;
    }

    let itemsSummaryHtml = assignments.map(a => `• <b>${a.item.name}</b>: <b style="color:#0284c7;">${a.qty} бр.</b> <span style="color:#64748b; font-size:0.85em;">(${a.item.plan_name})</span>`).join('<br>');

    Swal.fire({
        title: `Кашон № ${boxNum}`,
        html: `Сигурни ли сте, че поставяте в <b style="color:#0369a1; font-size:1.2em;">Кашон № ${boxNum}</b>:<br><br><div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px; text-align:left; font-size:0.95em;">${itemsSummaryHtml}<br><hr style="border:none; border-top:1px dashed #cbd5e1; margin:8px 0;"><div style="font-weight:900; color:#0f172a; text-align:right;">Общо за кашона: ${totalQty} бр.</div></div>`,
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
                // Изпълняваме преразпределението за всеки избран детайл
                for (let a of assignments) {
                    let remainingToAssign = a.qty;
                    let item = a.item;

                    // Сортираме отчетите за този детайл по дата (най-старите първо)
                    let reports = [...item.reports].sort((r1, r2) => {
                        let t1 = new Date(r1['Време Старт'] || r1['Дата']).getTime();
                        let t2 = new Date(r2['Време Старт'] || r2['Дата']).getTime();
                        return t1 - t2;
                    });

                    for (let r of reports) {
                        if (remainingToAssign <= 0) break;
                        let rQty = parseFloat(r['Количество']) || 0;

                        if (rQty <= remainingToAssign) {
                            // Целият ред отива в този кашон
                            const { error: updErr } = await client
                                .from('otcheti')
                                .update({ "Операция": "Опаковане - Кашон № " + boxNum })
                                .eq('id', r.id);
                            if (updErr) throw updErr;

                            remainingToAssign -= rQty;
                        } else {
                            // Част от реда отива в този кашон, остатъкът остава чакащ
                            let keepInUnboxed = rQty - remainingToAssign;
                            let assignToBox = remainingToAssign;

                            // 1. Намаляваме съществуващия ред (остава без кашон)
                            const { error: updErr } = await client
                                .from('otcheti')
                                .update({ "Количество": keepInUnboxed })
                                .eq('id', r.id);
                            if (updErr) throw updErr;

                            // 2. Вмъкваме нов ред с номера на кашона
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

                Swal.fire({
                    icon: 'success',
                    title: 'Готово!',
                    html: `Кашон <b>№ ${boxNum}</b> беше оформен успешно с общо <b>${totalQty} бр.</b>!`,
                    confirmButtonText: 'ОК',
                    confirmButtonColor: '#2563eb'
                }).then(() => {
                    loadTasks(true);
                });

            } catch (err) {
                console.error("Box assignment error:", err);
                Swal.fire('❌ Грешка при запис', err.message, 'error');
                btn.disabled = false;
                btn.innerHTML = `📦 ПРИБЕРИ ${totalQty} бр. В КАШОН № ${boxNum}`;
            }
        }
    });
}

// -------------------------------------------------------------
// 5. Управление на готови кашони (Преименуване & Разопаковане)
// -------------------------------------------------------------

async function renameBoxNumber(oldBoxNum) {
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
            // Търсим всички отчети с този кашон
            const { data: rowsToUpdate, error: fetchErr } = await client
                .from('otcheti')
                .select('id, Операция')
                .eq('Операция', 'Опаковане - Кашон № ' + oldBoxNum);
            
            if (fetchErr) throw fetchErr;

            if (rowsToUpdate && rowsToUpdate.length > 0) {
                const { error: updErr } = await client
                    .from('otcheti')
                    .update({ "Операция": "Опаковане - Кашон № " + cleanNewBox })
                    .eq('Операция', 'Опаковане - Кашон № ' + oldBoxNum);
                
                if (updErr) throw updErr;
            }

            Swal.fire('Успешно!', `Кашон № ${oldBoxNum} беше преименуван на № ${cleanNewBox}.`, 'success').then(() => {
                loadTasks(true);
            });
        } catch (err) {
            Swal.fire('Грешка при преименуване', err.message, 'error');
        }
    }
}

async function unpackBox(boxNum) {
    let box = globalBoxedCartons[boxNum];
    let countInfo = box ? `с общо <b>${box.totalQty} бр.</b>` : '';

    Swal.fire({
        title: 'Разопаковане на кашон?',
        html: `Сигурни ли сте, че искате да разопаковате <b style="color:#dc2626;">Кашон № ${boxNum}</b> ${countInfo}?<br><br><span style="font-size:0.9em; color:#475569;">Детайлите от този кашон ще се върнат в таб <b>„За кашони“</b> и ще можете да ги разпределите наново.</span>`,
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

                Swal.fire('Разопакован!', `Детайлите от Кашон № ${boxNum} бяха върнати в чакащи за кашон.`, 'success').then(() => {
                    loadTasks(true);
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
            <span class="h-type" style="background:${bg}; color:${color};">${h.type}</span>
            <span class="h-name">${h.name}</span>
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
