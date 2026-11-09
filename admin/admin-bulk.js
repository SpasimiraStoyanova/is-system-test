// ==============================================================================
// ⚡ IS-SYSTEMS МАСОВИ ДЕЙСТВИЯ (BULK ACTIONS)
// ==============================================================================

(function() {
    // 1. Отмаркиране на всички избрани редове
    window.massDeselectAll = function() {
        if (typeof selectedIndices !== 'undefined') {
            selectedIndices.clear();
        }
        document.querySelectorAll('.row-cb').forEach(cb => cb.checked = false);
        const selectAllCb = document.getElementById('selectAllCb');
        if (selectAllCb) selectAllCb.checked = false;
        if (typeof updateMassActionBar === 'function') updateMassActionBar();
    };

    // 2. Експорт на маркираните редове в Excel
    window.exportSelectedToExcel = function() {
        if (typeof tableConfigs === 'undefined' || typeof currentTab === 'undefined' || !selectedIndices || selectedIndices.size === 0) {
            Swal.fire('Информация', 'Няма маркирани редове за експорт.', 'info');
            return;
        }

        const config = tableConfigs[currentTab];
        const rowsToExport = Array.from(selectedIndices).map(idx => globalRows[idx]).filter(Boolean);
        if (rowsToExport.length === 0) return;

        if (typeof XLSX === 'undefined') {
            Swal.fire('Грешка', 'Библиотеката SheetJS (XLSX) не е заредена.', 'error');
            return;
        }

        const exportData = rowsToExport.map(row => {
            const item = {};
            config.fields.forEach(f => {
                if (f.hideOnAdd && f.name === 'id') return;
                let header = f.label || f.name;
                let val = row[f.name];
                if ((f.name === 'Време' || f.name === 'Дата' || f.name === 'Време Старт') && val) {
                    try {
                        let pVal = val;
                        if (!pVal.endsWith('Z') && !pVal.includes('+')) pVal += 'Z';
                        val = new Date(pVal).toLocaleString('bg-BG');
                    } catch(e) {}
                }
                item[header] = (val !== undefined && val !== null) ? val : '';
            });
            return item;
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        const sheetName = config.label.replace(/[^а-яА-Яa-zA-Z0-9 ]/g, '').trim().substring(0, 31) || 'Selected';
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        const today = new Date().toISOString().split('T')[0];
        const fileName = `IS_SYSTEM_${currentTab}_selected_${today}.xlsx`;
        XLSX.writeFile(wb, fileName);

        const toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 2500,
            timerProgressBar: true
        });
        toast.fire({
            icon: 'success',
            title: `Изтеглени ${exportData.length} маркирани записа в Excel`
        });
    };

    // 3. Масово приемане на поръчки (заприходяване в Склад Материали)
    window.massAcceptPorachki = async function() {
        if (currentTab !== 'porachki' || !selectedIndices || selectedIndices.size === 0) return;
        const selectedRows = Array.from(selectedIndices).map(idx => globalRows[idx]).filter(Boolean);
        const toAccept = selectedRows.filter(r => r['Статус'] !== 'Прието');

        if (toAccept.length === 0) {
            Swal.fire('Информация', 'Всички избрани поръчки вече са със статус "Прието".', 'info');
            return;
        }

        const res = await Swal.fire({
            title: `Приемане на ${toAccept.length} поръчки?`,
            html: `Маркираните <b>${toAccept.length} поръчки</b> ще станат със статус <b>"Прието"</b> и доставените бройки ще бъдат автоматично добавени към наличността в <b>Склад Материали</b>.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '✅ Да, приеми ги!',
            cancelButtonText: 'Отказ',
            confirmButtonColor: '#16a34a'
        });
        if (!res.isConfirmed) return;

        Swal.fire({ title: 'Заприходяване в склад...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            const todayStr = new Date().toISOString().split('T')[0];

            for (const order of toAccept) {
                const orderId = order.id;
                const itemCode = order['Материал'];
                const qty = parseFloat(order['Количество']) || 0;

                // 1. Обновяваме статуса на поръчката
                const { error: updOrderErr } = await client.from('porachki_materiali')
                    .update({ 'Статус': 'Прието', 'Дата на приемане': todayStr })
                    .eq('id', orderId);
                if (updOrderErr) throw updOrderErr;

                // 2. Обновяваме наличността в склад материали
                if (itemCode && qty > 0) {
                    const { data: skData, error: skErr } = await client.from('sklad')
                        .select('Доставено, Остатък')
                        .eq('ID Детайл', itemCode);

                    if (!skErr && skData && skData.length > 0) {
                        let currentDostaveno = parseFloat(skData[0]['Доставено']) || 0;
                        let currentOstatuk = parseFloat(skData[0]['Остатък']) || 0;
                        await client.from('sklad').update({
                            'Доставено': currentDostaveno + qty,
                            'Остатък': currentOstatuk + qty
                        }).eq('ID Детайл', itemCode);
                    }
                }
            }

            if (window.invalidateAdminCache) window.invalidateAdminCache();
            selectedIndices.clear();
            if (typeof updateMassActionBar === 'function') updateMassActionBar();
            Swal.fire({ icon: 'success', title: `Успешно заприходени ${toAccept.length} поръчки!`, timer: 1500, showConfirmButton: false });
            if (typeof loadCurrentTableData === 'function') loadCurrentTableData(true);
        } catch (err) {
            Swal.fire('Грешка при заприходяване', err.message, 'error');
        }
    };

    // 4. Масова смяна на статус в Месечен План
    window.massChangePlanStatus = async function() {
        if (currentTab !== 'plan' || !selectedIndices || selectedIndices.size === 0) return;
        const selectedRows = Array.from(selectedIndices).map(idx => globalRows[idx]).filter(Boolean);
        const count = selectedRows.length;

        const { value: newStatus } = await Swal.fire({
            title: `Смяна на статус на ${count} плана`,
            input: 'select',
            inputOptions: {
                'Активен': '🟢 Активен',
                'Завършен': '✅ Завършен',
                '📦 Опакован': '📦 Опакован'
            },
            inputPlaceholder: '-- Изберете нов статус --',
            showCancelButton: true,
            confirmButtonText: 'Приложи',
            cancelButtonText: 'Отказ',
            confirmButtonColor: '#2563eb',
            inputValidator: (value) => {
                if (!value) return 'Моля, изберете статус!';
            }
        });

        if (!newStatus) return;

        Swal.fire({ title: 'Обновяване на плановете...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            const ids = selectedRows.map(r => r.id);
            const { error } = await client.from('plan').update({ 'Статус': newStatus }).in('id', ids);
            if (error) throw error;

            if (window.invalidateAdminCache) window.invalidateAdminCache();
            selectedIndices.clear();
            if (typeof updateMassActionBar === 'function') updateMassActionBar();
            Swal.fire({ icon: 'success', title: `Обновени ${count} плана на "${newStatus}"!`, timer: 1500, showConfirmButton: false });
            if (typeof loadCurrentTableData === 'function') loadCurrentTableData(true);
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    };

    // 5. Масова смяна на месец / година на планове
    window.massChangePlanPeriod = async function() {
        if (currentTab !== 'plan' || !selectedIndices || selectedIndices.size === 0) return;
        const selectedRows = Array.from(selectedIndices).map(idx => globalRows[idx]).filter(Boolean);
        const count = selectedRows.length;

        const months = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни', 'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'];
        const currentYear = new Date().getFullYear();
        const years = [currentYear - 1, currentYear, currentYear + 1];

        let monthOpts = months.map(m => `<option value="${m}">${m}</option>`).join('');
        let yearOpts = years.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('');

        const { value: formValues } = await Swal.fire({
            title: `Прехвърляне на ${count} плана`,
            html: `
                <div style="text-align:left; font-size:0.92em; color:#475569; margin-bottom:12px;">Изберете нов целеви период за избраните планове:</div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <div>
                        <label style="font-weight:700; font-size:0.85em; display:block; margin-bottom:4px; text-align:left;">Месец:</label>
                        <select id="swalMassMonth" class="swal2-select" style="width:100%; margin:0;">${monthOpts}</select>
                    </div>
                    <div>
                        <label style="font-weight:700; font-size:0.85em; display:block; margin-bottom:4px; text-align:left;">Година:</label>
                        <select id="swalMassYear" class="swal2-select" style="width:100%; margin:0;">${yearOpts}</select>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Прехвърли плановете',
            cancelButtonText: 'Отказ',
            confirmButtonColor: '#0284c7',
            preConfirm: () => {
                return {
                    month: document.getElementById('swalMassMonth').value,
                    year: parseInt(document.getElementById('swalMassYear').value)
                };
            }
        });

        if (!formValues) return;

        Swal.fire({ title: 'Прехвърляне...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            const ids = selectedRows.map(r => r.id);
            const { error } = await client.from('plan')
                .update({ 'Месец': formValues.month, 'Година': formValues.year })
                .in('id', ids);
            if (error) throw error;

            if (window.invalidateAdminCache) window.invalidateAdminCache();
            selectedIndices.clear();
            if (typeof updateMassActionBar === 'function') updateMassActionBar();
            Swal.fire({ icon: 'success', title: `Плановете са прехвърлени за ${formValues.month} ${formValues.year}!`, timer: 1500, showConfirmButton: false });
            if (typeof loadCurrentTableData === 'function') loadCurrentTableData(true);
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    };

    // 6. Масова смяна на машина в Маршрутни карти
    window.massChangeRouteMachine = async function() {
        if (currentTab !== 'marshruti' || !selectedIndices || selectedIndices.size === 0) return;
        const selectedRows = Array.from(selectedIndices).map(idx => globalRows[idx]).filter(Boolean);
        const count = selectedRows.length;

        let machines = ['HAAS ST 10', 'EMCO', 'EMCO (стар)', 'Монтаж 1', 'Монтаж 2', 'Бобини', 'Обща'];
        const dl = document.getElementById('dl_machines');
        if (dl && dl.options.length > 0) {
            let loaded = Array.from(dl.options).map(o => o.value).filter(Boolean);
            machines = Array.from(new Set([...machines, ...loaded])).sort();
        }

        let options = {};
        machines.forEach(m => options[m] = m);

        const { value: chosenMachine } = await Swal.fire({
            title: `Смяна на машина за ${count} операции`,
            input: 'select',
            inputOptions: options,
            inputPlaceholder: '-- Изберете нова машина --',
            showCancelButton: true,
            confirmButtonText: 'Смени машина',
            cancelButtonText: 'Отказ',
            confirmButtonColor: '#7c3aed',
            inputValidator: (value) => {
                if (!value) return 'Моля, изберете машина!';
            }
        });

        if (!chosenMachine) return;

        Swal.fire({ title: 'Обновяване на операциите...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            const ids = selectedRows.map(r => r.id);
            const { error } = await client.from('marshruti').update({ 'Машина': chosenMachine }).in('id', ids);
            if (error) throw error;

            if (window.invalidateAdminCache) window.invalidateAdminCache();
            selectedIndices.clear();
            if (typeof updateMassActionBar === 'function') updateMassActionBar();
            Swal.fire({ icon: 'success', title: `Операциите са насочени към ${chosenMachine}!`, timer: 1500, showConfirmButton: false });
            if (typeof loadCurrentTableData === 'function') loadCurrentTableData(true);
        } catch (err) {
            Swal.fire('Грешка', err.message, 'error');
        }
    };

    // 7. Hook към updateMassActionBar за показване на контекстните бутони
    function syncContextualMassButtons() {
        const bar = document.getElementById('massActionBar');
        if (!bar) return;

        const hasSelection = (typeof selectedIndices !== 'undefined') && selectedIndices.size > 0;
        const isReadOnly = (typeof tableConfigs !== 'undefined') && tableConfigs[currentTab] && tableConfigs[currentTab].readOnlyTab;

        if (hasSelection && !isReadOnly) {
            const btnAccept = document.getElementById('massBtnAcceptPorachki');
            const btnPlanStatus = document.getElementById('massBtnPlanStatus');
            const btnPlanPeriod = document.getElementById('massBtnPlanPeriod');
            const btnRouteMachine = document.getElementById('massBtnRouteMachine');

            if (btnAccept) btnAccept.style.display = (currentTab === 'porachki') ? 'inline-flex' : 'none';
            if (btnPlanStatus) btnPlanStatus.style.display = (currentTab === 'plan') ? 'inline-flex' : 'none';
            if (btnPlanPeriod) btnPlanPeriod.style.display = (currentTab === 'plan') ? 'inline-flex' : 'none';
            if (btnRouteMachine) btnRouteMachine.style.display = (currentTab === 'marshruti') ? 'inline-flex' : 'none';
        }
    }

    // Слушател: Приключване на рендериране или клик върху чекбокс
    document.addEventListener('change', function(e) {
        if (e.target && e.target.classList && (e.target.classList.contains('row-cb') || e.target.id === 'selectAllCb')) {
            setTimeout(syncContextualMassButtons, 10);
        }
    });

    // Периодично свързване при зареждане
    window.addEventListener('DOMContentLoaded', () => {
        const origUpdate = window.updateMassActionBar;
        window.updateMassActionBar = function() {
            if (typeof origUpdate === 'function') origUpdate();
            syncContextualMassButtons();
        };
    });

})();

