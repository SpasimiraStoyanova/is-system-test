// admin/admin-archives.js - Месечни Архиви: Йерархия (BOM) на екрана и в Ексел

// 1. Автоматично или ръчно генериране на месечен архив
async function checkAndGenerateArchive(targetMonth, targetYear, isManual = false) {
    try {
        if (!isManual) {
            const checkRes = await client.from('plan')
                .select('id')
                .eq('Месец', targetMonth)
                .eq('Година', targetYear)
                .neq('Статус', '🚚 Изпратен')
                .limit(1);

            if (checkRes.error) throw checkRes.error;
            if (checkRes.data && checkRes.data.length > 0) return; // Има неизпратени детайли

            const existingRes = await client.from('plan_archives')
                .select('id')
                .eq('plan_name', targetMonth)
                .eq('plan_year', targetYear);
            if (existingRes.data && existingRes.data.length > 0) return; // Вече е архивиран
        }

        console.log(`Генериране на архив за ${targetMonth} ${targetYear}...`);

        // 1. Текущо състояние на склада (краен snapshot)
        let endSkladRes = null;
        if (typeof window.computeSkladData === 'function') {
            endSkladRes = await window.computeSkladData();
        }
        if (!endSkladRes) throw new Error("Не може да се изчисли състоянието на склада.");

        // 2. Начален snapshot на склада за този месец (ако има)
        const startSnapRes = await client.from('plan_snapshots')
            .select('inventory_data')
            .eq('plan_name', targetMonth)
            .eq('plan_year', targetYear)
            .eq('snapshot_type', 'start')
            .order('created_at', { ascending: false })
            .limit(1);
        
        let startData = [];
        if (startSnapRes.data && startSnapRes.data.length > 0) {
            startData = startSnapRes.data[0].inventory_data;
        }

        // 3. Позиции от месечния план
        const allPlansRes = await client.from('plan')
            .select('*')
            .eq('Месец', targetMonth)
            .eq('Година', targetYear);
        let planRows = allPlansRes.data || [];
        let planIds = planRows.map(p => p.id);

        // 4. БОМ структура и Номенклатура
        const [bomRes, nomRes] = await Promise.all([
            client.from('bom').select('*'),
            client.from('Номенклатура').select('*')
        ]);
        let bomData = bomRes.data || [];
        let nomData = nomRes.data || [];

        // 5. Отчети за брака и изпълнението
        let otchetiData = [];
        if (planIds.length > 0) {
            const otchetiRes = await client.from('otcheti')
                .select('*')
                .in('ID План', planIds)
                .limit(100000);
            otchetiData = otchetiRes.data || [];
        }
            
        let itemDiffs = {}; 
        startData.forEach(row => {
            let code = String(row['ID Детайл'] || '').trim();
            if (!code) return;
            let normKey = code.toLowerCase();
            if (!itemDiffs[normKey]) itemDiffs[normKey] = { start: 0, end: 0, brak: 0, rawCode: code };
            itemDiffs[normKey].start += (parseFloat(row['Общо']) || 0);
        });

        endSkladRes.forEach(row => {
            let code = String(row['ID Детайл'] || '').trim();
            if (!code) return;
            let normKey = code.toLowerCase();
            if (!itemDiffs[normKey]) itemDiffs[normKey] = { start: 0, end: 0, brak: 0, rawCode: code };
            itemDiffs[normKey].end += (parseFloat(row['Общо']) || 0);
        });

        otchetiData.forEach(rep => {
            let code = String(rep['ID Детайл'] || '').trim();
            if (!code) return;
            let normKey = code.toLowerCase();
            if (!itemDiffs[normKey]) itemDiffs[normKey] = { start: 0, end: 0, brak: 0, rawCode: code };
            if (rep['Статус'] === 'Брак') {
                itemDiffs[normKey].brak += (parseFloat(rep['Количество']) || 0);
            }
        });

        let finalArchiveData = {
            details: itemDiffs,
            month: targetMonth,
            year: targetYear,
            plans: planRows,
            bom: bomData,
            nomenclature: nomData,
            generated_at: new Date().toISOString()
        };

        // Записваме краен snapshot и архива
        await client.from('plan_snapshots').insert([{
            plan_name: targetMonth,
            plan_year: targetYear,
            snapshot_type: 'end',
            inventory_data: endSkladRes
        }]);

        await client.from('plan_archives').insert([{
            plan_name: targetMonth,
            plan_year: targetYear,
            archive_data: finalArchiveData
        }]);
        
        console.log(`Архивът за ${targetMonth} ${targetYear} е генериран успешно!`);
        return true;
    } catch (e) {
        console.error("Грешка при генериране на архив:", e);
        throw e;
    }
}

// 2. Ръчно снемане на архив през бутон в таба
async function promptCreateManualArchive() {
    try {
        Swal.fire({ title: 'Зареждане на планове...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const { data: plans, error } = await client.from('plan').select('Месец, Година').order('Година', { ascending: false });
        if (error) throw error;

        let periodSet = new Set();
        (plans || []).forEach(p => {
            if (p['Месец'] && p['Година']) {
                periodSet.add(`${p['Месец']} ${p['Година']}`);
            }
        });

        if (periodSet.size === 0) {
            Swal.fire('Информация', 'Няма намерени месечни планове в базата данни.', 'info');
            return;
        }

        let optionsHtml = '';
        Array.from(periodSet).forEach(period => {
            optionsHtml += `<option value="${period}">${period}</option>`;
        });

        const { value: selectedPeriod, isConfirmed } = await Swal.fire({
            title: 'Снемане на Месечен Архив',
            html: `
                <div style="text-align:left; font-size:0.95em; color:#334155;">
                    <p>Изберете месечен план, за който да запечатате архив с пълната <b>BOM йерархия на влагане</b> и <b>складовото салдо</b>:</p>
                    <select id="swalArchivePeriod" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; font-weight:bold; font-size:1.05em; margin-top:10px;">
                        ${optionsHtml}
                    </select>
                    <p style="margin-top:12px; font-size:0.85em; color:#64748b;">
                        ℹ️ Можете да генерирате архив дори ако част от детайлите все още не са изпратени.
                    </p>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: '⚡ Архивирай сега',
            cancelButtonText: 'Отказ',
            confirmButtonColor: '#2563eb',
            preConfirm: () => {
                return document.getElementById('swalArchivePeriod').value;
            }
        });

        if (isConfirmed && selectedPeriod) {
            let parts = selectedPeriod.split(' ');
            let targetMonth = parts[0];
            let targetYear = parseInt(parts[1]);

            Swal.fire({
                title: 'Генериране на архив...',
                html: `Запечатване на BOM йерархия и склад за <b>${selectedPeriod}</b>...`,
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            await checkAndGenerateArchive(targetMonth, targetYear, true);

            Swal.fire({
                icon: 'success',
                title: 'Архивът е създаден!',
                html: `Архивът за <b>${selectedPeriod}</b> беше генериран успешно.<br><small class="text-muted">Вече можете да прегледате йерархията със стрелки или да свалите Excel.</small>`,
                confirmButtonColor: '#2563eb',
                timer: 2500
            });

            renderArchivesTab();
        }
    } catch (err) {
        console.error(err);
        Swal.fire('Грешка', 'Неуспешно създаване на архив: ' + err.message, 'error');
    }
}

// 3. Изтриване на архив
async function deleteArchive(archiveId, planName, planYear) {
    const { isConfirmed } = await Swal.fire({
        title: 'Изтриване на архив?',
        html: `Сигурни ли сте, че искате да изтриете архива за <b>${planName} ${planYear}</b>?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Да, изтрий',
        cancelButtonText: 'Отказ'
    });

    if (isConfirmed) {
        try {
            await client.from('plan_archives').delete().eq('id', archiveId);
            Swal.fire({ icon: 'success', title: 'Архивът е изтрит!', timer: 1500, showConfirmButton: false });
            renderArchivesTab();
        } catch (e) {
            Swal.fire('Грешка', e.message, 'error');
        }
    }
}

// 4. Рендериране на таб "Месечни Архиви"
async function renderArchivesTab() {
    const tableHead = document.querySelector('#tableHead');
    const tableBody = document.querySelector('#tableBody');

    tableHead.innerHTML = `
        <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0;">
            <th style="padding:14px; text-align:left; font-size:0.9em; font-weight:800; color:#475569;">МЕСЕЦ И ГОДИНА</th>
            <th style="padding:14px; text-align:left; font-size:0.9em; font-weight:800; color:#475569;">СЪЗДАДЕН НА</th>
            <th style="padding:14px; text-align:center; font-size:0.9em; font-weight:800; color:#475569;">ПОЗИЦИИ В ПЛАНА</th>
            <th style="padding:14px; text-align:right; font-size:0.9em; font-weight:800; color:#475569;">ДЕЙСТВИЯ</th>
        </tr>
    `;

    tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px; font-weight:bold; color:#64748b;">Зареждане на архиви... 🔄</td></tr>';

    // Горна лента с бутон за ръчно създаване на архив
    let toolbarEl = document.getElementById('archiveToolbar');
    if (!toolbarEl) {
        toolbarEl = document.createElement('div');
        toolbarEl.id = 'archiveToolbar';
        toolbarEl.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; padding:12px 18px; background:linear-gradient(135deg, #f8fafc, #f1f5f9); border:1px solid #e2e8f0; border-radius:10px;';
        const tableContainer = document.querySelector('.table-container') || document.querySelector('.table-wrapper');
        if (tableContainer && tableContainer.parentNode) {
            tableContainer.parentNode.insertBefore(toolbarEl, tableContainer);
        }
    }
    toolbarEl.style.display = 'flex';
    toolbarEl.innerHTML = `
        <div style="font-weight:700; color:#334155; font-size:0.95em;">
            <i class="fas fa-archive" style="color:#2563eb; margin-right:6px;"></i> Запечатани месечни отчети и BOM структури
        </div>
        <div>
            <button onclick="promptCreateManualArchive()" style="background:#2563eb; color:white; border:none; border-radius:8px; padding:8px 16px; font-weight:800; font-size:0.9em; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 2px 4px rgba(37,99,235,0.2);">
                <i class="fas fa-plus-circle"></i> <span>Снеми Архив за Месец</span>
            </button>
        </div>
    `;

    const { data, error } = await client.from('plan_archives').select('*').order('created_at', { ascending: false });
    if (error) {
        tableBody.innerHTML = `<tr><td colspan="4" style="color:#ef4444; padding:20px;">Грешка: ${error.message}</td></tr>`;
        return;
    }

    if (!data || data.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center; padding:50px 20px;">
                    <div style="font-size:2.5em; margin-bottom:10px;">📁</div>
                    <div style="font-weight:800; font-size:1.15em; color:#334155; margin-bottom:6px;">Няма генерирани архиви</div>
                    <p style="color:#64748b; font-size:0.9em; max-width:500px; margin:0 auto 20px auto;">
                        Месечните архиви се създават автоматично, когато всички детайли от месечния план преминат в статус <b>„🚚 Изпратен“</b>, или ръчно от бутона горе.
                    </p>
                    <button onclick="promptCreateManualArchive()" style="background:#2563eb; color:white; border:none; border-radius:8px; padding:10px 20px; font-weight:800; font-size:0.95em; cursor:pointer;">
                        ⚡ Архивирай месечен план сега
                    </button>
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    data.forEach(arch => {
        let dateObj = new Date(arch.created_at);
        let dateStr = dateObj.toLocaleDateString('bg-BG') + ' ' + dateObj.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' });
        
        let planCount = 0;
        if (arch.archive_data && arch.archive_data.plans) {
            planCount = arch.archive_data.plans.length;
        } else if (arch.archive_data && arch.archive_data.details) {
            planCount = Object.keys(arch.archive_data.details).length;
        }

        html += `
            <tr style="background:#fff; border-bottom:1px solid #f1f5f9; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">
                <td style="padding:15px; font-weight:800; color:#1e293b; font-size:1em;">
                    <span style="display:inline-flex; align-items:center; gap:8px;">
                        <span style="background:#dbeafe; color:#1d4ed8; padding:4px 10px; border-radius:6px; font-size:0.85em; font-weight:800;">
                            📅 ${arch.plan_name} ${arch.plan_year}
                        </span>
                    </span>
                </td>
                <td style="padding:15px; color:#64748b; font-size:0.9em;">${dateStr}</td>
                <td style="padding:15px; text-align:center;">
                    <span style="background:#f1f5f9; color:#475569; padding:4px 10px; border-radius:6px; font-size:0.85em; font-weight:700;">
                        ${planCount} бр. изделия
                    </span>
                </td>
                <td style="padding:15px; text-align:right;">
                    <div style="display:inline-flex; gap:8px;">
                        <button class="action-btn" onclick="openArchiveTreeModal(${arch.id})" style="background:#2563eb; color:#fff; padding:7px 14px; border-radius:6px; cursor:pointer; border:none; font-weight:800; font-size:0.85em; display:inline-flex; align-items:center; gap:5px;" title="Интерактивно дърво на влагане със стрелки">
                            <i class="fas fa-sitemap"></i> 👁️ Преглед (BOM)
                        </button>
                        <button class="action-btn" onclick="downloadArchive(${arch.id})" style="background:#10b981; color:#fff; padding:7px 14px; border-radius:6px; cursor:pointer; border:none; font-weight:800; font-size:0.85em; display:inline-flex; align-items:center; gap:5px;" title="Сваляне на Excel с 2 листа: BOM йерархия и склад">
                            <i class="fas fa-file-excel"></i> 📥 Ексел
                        </button>
                        <button onclick="deleteArchive(${arch.id}, '${arch.plan_name}', ${arch.plan_year})" style="background:#fee2e2; color:#b91c1c; border:none; border-radius:6px; padding:7px 10px; cursor:pointer; font-size:0.85em;" title="Изтрий този архив">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    tableBody.innerHTML = html;
}

// 5. ИНТЕРАКТИВНО ДЪРВО НА ЕКРАНА (Преглед на архива)
async function openArchiveTreeModal(archiveId) {
    Swal.fire({ title: 'Зареждане на структурата...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { data: arch, error } = await client.from('plan_archives').select('*').eq('id', archiveId).single();
        if (error) throw error;

        let archiveData = arch.archive_data || {};
        let targetMonth = arch.plan_name;
        let targetYear = arch.plan_year;

        let planRows = archiveData.plans || [];
        let bomData = archiveData.bom || [];
        let nomData = archiveData.nomenclature || [];
        let itemDiffs = archiveData.details || {};

        // Fallback: Ако в архива не са били запечатани plans/bom/nom, ги прочитаме от базата
        if (planRows.length === 0 || bomData.length === 0 || nomData.length === 0) {
            const [pRes, bRes, nRes] = await Promise.all([
                client.from('plan').select('*').eq('Месец', targetMonth).eq('Година', targetYear),
                client.from('bom').select('*'),
                client.from('Номенклатура').select('*')
            ]);
            if (planRows.length === 0) planRows = pRes.data || [];
            if (bomData.length === 0) bomData = bRes.data || [];
            if (nomData.length === 0) nomData = nRes.data || [];
        }

        let nomMap = {};
        let codeByName = {};
        nomData.forEach(n => {
            let c = String(n['ID Детайл'] || '').trim();
            let nm = String(n['Вътрешно име'] || '').trim();
            if (c) nomMap[c.toLowerCase()] = n;
            if (nm && c) codeByName[nm.toLowerCase()] = c;
        });

        // Case-insensitive lookup map за складовите движения
        let normalizedDiffs = {};
        Object.keys(itemDiffs).forEach(k => {
            let normK = String(k).trim().toLowerCase();
            normalizedDiffs[normK] = itemDiffs[k];
        });

        let getItemDiff = (code) => {
            if (!code) return { start: 0, end: 0, brak: 0 };
            let norm = String(code).trim().toLowerCase();
            if (normalizedDiffs[norm]) return normalizedDiffs[norm];

            let nom = nomMap[norm];
            if (nom) {
                let altCode = String(nom['ID Детайл'] || '').trim().toLowerCase();
                let altName = String(nom['Вътрешно име'] || '').trim().toLowerCase();
                if (normalizedDiffs[altCode]) return normalizedDiffs[altCode];
                if (normalizedDiffs[altName]) return normalizedDiffs[altName];
            }
            return { start: 0, end: 0, brak: 0 };
        };

        let totalUnits = 0;
        let uniquePartsSet = new Set();
        let totalBrak = 0;

        Object.keys(normalizedDiffs).forEach(k => {
            totalBrak += (normalizedDiffs[k].brak || 0);
        });

        let buildNodeHtml = (parentCode, multiplier, rootTargetQty, level = 1, visited = new Set()) => {
            let normParent = parentCode.toLowerCase();
            if (visited.has(normParent) || level > 8) return '';
            visited.add(normParent);

            let children = bomData.filter(b => String(b['ID Родител'] || '').trim().toLowerCase() === normParent);
            if (children.length === 0) return '';

            let childrenHtml = '';
            children.forEach(c => {
                let childCode = String(c['ID Компонент'] || '').trim();
                let childMult = parseFloat(c['Количество']) || 1;
                let effectiveMult = multiplier * childMult;
                let totalNeeded = rootTargetQty * effectiveMult;

                uniquePartsSet.add(childCode);

                let nom = nomMap[childCode.toLowerCase()] || {};
                let childName = nom['Вътрешно име'] || childCode;
                let childType = nom['Тип'] || 'детайл';

                let diffInfo = getItemDiff(childCode);
                let diff = diffInfo.end - diffInfo.start;

                let hasSubChildren = bomData.some(b => String(b['ID Родител'] || '').trim().toLowerCase() === childCode.toLowerCase());

                let subHtml = buildNodeHtml(childCode, effectiveMult, rootTargetQty, level + 1, new Set(visited));

                let icon = childType.toLowerCase().includes('материал') ? '📦' : (hasSubChildren ? '⚙️' : '🧩');

                let stockBadgeHtml = '';
                if (diffInfo.end > 0 || diff !== 0) {
                    stockBadgeHtml = `
                        <span style="font-size:0.85em; background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; padding:3px 9px; border-radius:6px; font-weight:700;" title="Начален склад: ${diffInfo.start} бр. | Краен склад: ${diffInfo.end} бр. | Разлика: ${diff >= 0 ? '+' : ''}${diff} бр.">
                            Склад: <b>${diffInfo.end} бр.</b> (${diff >= 0 ? '+' : ''}${diff})
                        </span>
                    `;
                } else {
                    stockBadgeHtml = `
                        <span style="font-size:0.82em; background:#f1f5f9; color:#64748b; padding:3px 8px; border-radius:5px; font-weight:600;" title="Начален склад: ${diffInfo.start} бр. | Краен склад: ${diffInfo.end} бр.">
                            Склад: 0 бр.
                        </span>
                    `;
                }

                childrenHtml += `
                    <div class="tree-node-item" data-code="${childCode.toLowerCase()}" data-name="${childName.toLowerCase()}" style="margin-top:8px;">
                        <div class="tree-card" style="display:flex; align-items:center; justify-content:space-between; background:white; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; box-shadow:0 1px 2px rgba(0,0,0,0.03);">
                            <div style="display:flex; align-items:center; gap:8px;">
                                ${hasSubChildren ? `<button class="tree-toggle-btn" onclick="toggleTreeNode(this)" style="background:none; border:none; cursor:pointer; color:#64748b; font-size:0.9em; padding:2px 5px;"><i class="fas fa-chevron-down"></i></button>` : `<span style="display:inline-block; width:18px;"></span>`}
                                <span style="font-size:1.15em;">${icon}</span>
                                <div>
                                    <div style="font-weight:700; color:#1e293b; font-size:0.95em;">
                                        ${childName}
                                        <span style="font-size:0.85em; font-weight:600; color:#64748b; margin-left:4px;">(${childCode})</span>
                                    </div>
                                    <div style="font-size:0.8em; color:#475569; margin-top:2px;">
                                        <span style="background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px; font-weight:700;">
                                            ➔ Влагане: ${childMult} бр./изд.
                                        </span>
                                        <span style="margin-left:6px; font-weight:700; color:#0f172a;">
                                            (Общо нужно: ${totalNeeded} бр.)
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div style="display:flex; align-items:center; gap:8px;">
                                ${stockBadgeHtml}
                                ${diffInfo.brak > 0 ? `<span style="font-size:0.82em; background:#fee2e2; color:#b91c1c; padding:3px 8px; border-radius:5px; font-weight:700;">🗑️ ${diffInfo.brak} бр. брак</span>` : ''}
                            </div>
                        </div>

                        ${subHtml ? `<div class="tree-children-container" style="border-left:2px dashed #cbd5e1; margin-left:18px; padding-left:14px;">${subHtml}</div>` : ''}
                    </div>
                `;
            });

            return childrenHtml;
        };

        let treeRootsHtml = '';
        planRows.forEach(plan => {
            let rootName = String(plan['Вътрешно име'] || '').trim();
            let targetQty = parseFloat(plan['Целево количество']) || 0;
            let status = plan['Статус'] || 'Изпратен';
            totalUnits += targetQty;

            let rootCode = codeByName[rootName.toLowerCase()] || rootName;
            uniquePartsSet.add(rootCode);

            let nom = nomMap[rootCode.toLowerCase()] || {};
            let displayTitle = nom['Вътрешно име'] || rootName;

            let diffInfo = getItemDiff(rootCode);
            let diff = diffInfo.end - diffInfo.start;

            let subTreeHtml = buildNodeHtml(rootCode, 1, targetQty, 1, new Set());

            let rootStockBadgeHtml = '';
            if (diffInfo.end > 0 || diff !== 0) {
                rootStockBadgeHtml = `
                    <span style="background:#dbeafe; color:#1e40af; border:1px solid #bfdbfe; padding:4px 10px; border-radius:6px; font-weight:700; font-size:0.85em;" title="Начален склад: ${diffInfo.start} бр. | Краен склад: ${diffInfo.end} бр. | Разлика: ${diff >= 0 ? '+' : ''}${diff} бр.">
                        Склад: <b>${diffInfo.end} бр.</b> (${diff >= 0 ? '+' : ''}${diff})
                    </span>
                `;
            } else {
                rootStockBadgeHtml = `
                    <span style="background:#e2e8f0; color:#475569; padding:4px 10px; border-radius:6px; font-weight:700; font-size:0.85em;" title="Начален склад: ${diffInfo.start} бр. | Краен склад: ${diffInfo.end} бр.">
                        Склад: 0 бр.
                    </span>
                `;
            }

            treeRootsHtml += `
                <div class="tree-root-item" data-code="${rootCode.toLowerCase()}" data-name="${displayTitle.toLowerCase()}" style="margin-bottom:16px;">
                    <div class="tree-root-header" style="background:#f8fafc; border:2px solid #bae6fd; border-radius:10px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 4px rgba(0,0,0,0.04);">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <button class="tree-toggle-btn" onclick="toggleTreeNode(this)" style="background:#e0f2fe; color:#0369a1; border:none; border-radius:6px; padding:6px 10px; font-size:1em; cursor:pointer; font-weight:bold;">
                                <i class="fas fa-chevron-down"></i>
                            </button>
                            <span style="font-size:1.4em;">📦</span>
                            <div>
                                <div style="font-size:1.1em; font-weight:800; color:#0f172a;">
                                    ${displayTitle}
                                    <span style="font-size:0.85em; font-weight:600; color:#64748b; margin-left:6px;">(${rootCode})</span>
                                </div>
                                <div style="font-size:0.85em; color:#0369a1; font-weight:700; margin-top:3px;">
                                    🎯 План: ${targetQty} бр. | Статус: ${status}
                                </div>
                            </div>
                        </div>

                        <div style="display:flex; align-items:center; gap:10px;">
                            ${rootStockBadgeHtml}
                            ${diffInfo.brak > 0 ? `<span style="background:#fee2e2; color:#b91c1c; padding:4px 10px; border-radius:6px; font-weight:800; font-size:0.85em;">🗑️ ${diffInfo.brak} бр. брак</span>` : ''}
                        </div>
                    </div>

                    <div class="tree-children-container" style="border-left:3px dashed #7dd3fc; margin-left:22px; padding-left:16px;">
                        ${subTreeHtml || '<div style="padding:10px; color:#94a3b8; font-size:0.85em; font-style:italic;">Няма намерени вложени компоненти в BOM за този детайл.</div>'}
                    </div>
                </div>
            `;
        });

        // Модален прозорец за дървото
        let modalEl = document.getElementById('archiveTreeModal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'archiveTreeModal';
            modalEl.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.6); backdrop-filter:blur(6px); display:none; justify-content:center; align-items:center; z-index:9999; padding:20px; box-sizing:border-box;';
            document.body.appendChild(modalEl);
        }

        modalEl.innerHTML = `
            <div style="background:white; width:100%; max-width:1100px; max-height:92vh; border-radius:16px; display:flex; flex-direction:column; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); overflow:hidden; border:1px solid #cbd5e1;">
                <!-- Header -->
                <div style="padding:20px 24px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;">
                    <div>
                        <div style="font-size:1.35em; font-weight:800; color:#0f172a; display:flex; align-items:center; gap:8px;">
                            <span>🌳 Месечен Архив:</span>
                            <span style="color:#2563eb;">${targetMonth} ${targetYear}</span>
                            <span style="font-size:0.7em; background:#e0f2fe; color:#0369a1; padding:3px 10px; border-radius:20px; font-weight:800;">BOM ВЛАГАНЕ</span>
                        </div>
                        <div style="font-size:0.85em; color:#64748b; margin-top:4px;">
                            Пълна йерархична структура на произведените изделия, вложените компоненти и движението на склада
                        </div>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <button onclick="downloadArchive(${archiveId})" style="background:#10b981; color:white; border:none; border-radius:8px; padding:9px 16px; font-weight:800; font-size:0.9em; cursor:pointer; display:flex; align-items:center; gap:6px;">
                            <i class="fas fa-file-excel"></i> <span>Изтегли Ексел</span>
                        </button>
                        <button onclick="closeArchiveTreeModal()" style="background:#f1f5f9; color:#475569; border:none; border-radius:8px; padding:9px 14px; font-size:1.1em; cursor:pointer; font-weight:bold;">
                            ✕
                        </button>
                    </div>
                </div>

                <!-- Stats and Controls Bar -->
                <div style="padding:14px 24px; background:#fff; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                    <!-- Stats Pills -->
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <span style="background:#f0fdf4; border:1px solid #bbf7d0; color:#166534; font-weight:700; font-size:0.85em; padding:4px 10px; border-radius:6px;">
                            📦 Готови изделия: <b>${planRows.length}</b>
                        </span>
                        <span style="background:#eff6ff; border:1px solid #bfdbfe; color:#1e40af; font-weight:700; font-size:0.85em; padding:4px 10px; border-radius:6px;">
                            🧩 Уникални компонента: <b>${uniquePartsSet.size}</b>
                        </span>
                        <span style="background:#fefce8; border:1px solid #fef08a; color:#854d0e; font-weight:700; font-size:0.85em; padding:4px 10px; border-radius:6px;">
                            🎯 Общо бройки: <b>${totalUnits}</b>
                        </span>
                        ${totalBrak > 0 ? `<span style="background:#fef2f2; border:1px solid #fecaca; color:#991b1b; font-weight:700; font-size:0.85em; padding:4px 10px; border-radius:6px;">🗑️ Брак: <b>${totalBrak} бр.</b></span>` : ''}
                    </div>

                    <!-- Search and Expand/Collapse Controls -->
                    <div style="display:flex; gap:8px; align-items:center;">
                        <div style="position:relative;">
                            <input type="text" id="treeSearchInput" placeholder="🔍 Търси в дървото..." oninput="filterArchiveTree(this.value)" style="padding:7px 12px; font-size:0.85em; border:1px solid #cbd5e1; border-radius:6px; width:220px;">
                        </div>
                        <button onclick="expandAllArchiveTree(true)" style="background:#f8fafc; border:1px solid #cbd5e1; color:#334155; border-radius:6px; padding:6px 12px; font-size:0.85em; font-weight:700; cursor:pointer;" title="Разгъни всички нива">
                            🔽 Всички
                        </button>
                        <button onclick="expandAllArchiveTree(false)" style="background:#f8fafc; border:1px solid #cbd5e1; color:#334155; border-radius:6px; padding:6px 12px; font-size:0.85em; font-weight:700; cursor:pointer;" title="Свий всички нива">
                            🔼 Свий
                        </button>
                    </div>
                </div>

                <!-- Tree Body -->
                <div id="treeModalBody" style="padding:24px; overflow-y:auto; flex:1; background:#fbfcfe;">
                    ${treeRootsHtml}
                </div>
            </div>
        `;

        modalEl.style.display = 'flex';
        Swal.close();
    } catch (e) {
        console.error(e);
        Swal.fire('Грешка', 'Неуспешно зареждане на йерархията: ' + e.message, 'error');
    }
}

function closeArchiveTreeModal() {
    const modalEl = document.getElementById('archiveTreeModal');
    if (modalEl) modalEl.style.display = 'none';
}

function toggleTreeNode(btn) {
    const parentItem = btn.closest('.tree-root-item, .tree-node-item');
    if (!parentItem) return;
    const childrenContainer = parentItem.querySelector(':scope > .tree-children-container');
    if (!childrenContainer) return;

    if (childrenContainer.style.display === 'none') {
        childrenContainer.style.display = 'block';
        btn.innerHTML = '<i class="fas fa-chevron-down"></i>';
    } else {
        childrenContainer.style.display = 'none';
        btn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    }
}

function expandAllArchiveTree(expand) {
    document.querySelectorAll('#treeModalBody .tree-children-container').forEach(c => {
        c.style.display = expand ? 'block' : 'none';
    });
    document.querySelectorAll('#treeModalBody .tree-toggle-btn').forEach(b => {
        b.innerHTML = expand ? '<i class="fas fa-chevron-down"></i>' : '<i class="fas fa-chevron-right"></i>';
    });
}

function filterArchiveTree(query) {
    let q = (query || '').trim().toLowerCase();
    const roots = document.querySelectorAll('#treeModalBody .tree-root-item');

    if (!q) {
        roots.forEach(r => {
            r.style.display = 'block';
            r.querySelectorAll('.tree-node-item').forEach(n => n.style.display = 'block');
        });
        return;
    }

    roots.forEach(r => {
        let rCode = r.getAttribute('data-code') || '';
        let rName = r.getAttribute('data-name') || '';
        let rootMatches = rCode.includes(q) || rName.includes(q);

        let hasMatchingChild = false;
        r.querySelectorAll('.tree-node-item').forEach(n => {
            let nCode = n.getAttribute('data-code') || '';
            let nName = n.getAttribute('data-name') || '';
            let nodeMatches = nCode.includes(q) || nName.includes(q);

            if (nodeMatches) {
                n.style.display = 'block';
                hasMatchingChild = true;
                // Разгъваме и държим видими всички поддетайли на съвпадащия детайл
                n.querySelectorAll('.tree-node-item').forEach(sub => sub.style.display = 'block');
                let p = n.parentElement;
                while (p && p !== r) {
                    if (p.classList.contains('tree-children-container')) p.style.display = 'block';
                    p = p.parentElement;
                }
            } else {
                let parentItem = n.parentElement.closest('.tree-node-item, .tree-root-item');
                let parentMatches = parentItem && (
                    (parentItem.getAttribute('data-code') || '').includes(q) ||
                    (parentItem.getAttribute('data-name') || '').includes(q)
                );
                n.style.display = (rootMatches || parentMatches) ? 'block' : 'none';
            }
        });

        if (rootMatches || hasMatchingChild) {
            r.style.display = 'block';
            let cCont = r.querySelector(':scope > .tree-children-container');
            if (cCont) cCont.style.display = 'block';
        } else {
            r.style.display = 'none';
        }
    });
}

// 6. СВАЛЯНЕ НА ЕКСЕЛ С 2 ЛИСТА (BOM Йерархия + Склад)
async function downloadArchive(archiveId) {
    if (typeof XLSX === 'undefined') {
        Swal.fire('Грешка', 'Библиотеката SheetJS (XLSX) не е заредена!', 'error');
        return;
    }

    Swal.fire({ title: 'Генериране на Excel файл...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    try {
        const { data, error } = await client.from('plan_archives').select('*').eq('id', archiveId).single();
        if (error) throw error;
        
        const archive = data.archive_data || {};
        const targetMonth = data.plan_name;
        const targetYear = data.plan_year;

        let planRows = archive.plans || [];
        let bomData = archive.bom || [];
        let nomData = archive.nomenclature || [];
        let itemDiffs = archive.details || {};

        if (planRows.length === 0 || bomData.length === 0 || nomData.length === 0) {
            const [pRes, bRes, nRes] = await Promise.all([
                client.from('plan').select('*').eq('Месец', targetMonth).eq('Година', targetYear),
                client.from('bom').select('*'),
                client.from('Номенклатура').select('*')
            ]);
            if (planRows.length === 0) planRows = pRes.data || [];
            if (bomData.length === 0) bomData = bRes.data || [];
            if (nomData.length === 0) nomData = nRes.data || [];
        }

        let nomMap = {};
        let codeByName = {};
        nomData.forEach(n => {
            let c = String(n['ID Детайл'] || '').trim();
            let nm = String(n['Вътрешно име'] || '').trim();
            if (c) nomMap[c.toLowerCase()] = n;
            if (nm && c) codeByName[nm.toLowerCase()] = c;
        });

        let normalizedDiffs = {};
        Object.keys(itemDiffs).forEach(k => {
            let normK = String(k).trim().toLowerCase();
            normalizedDiffs[normK] = itemDiffs[k];
        });

        let getItemDiff = (code) => {
            if (!code) return { start: 0, end: 0, brak: 0 };
            let norm = String(code).trim().toLowerCase();
            if (normalizedDiffs[norm]) return normalizedDiffs[norm];

            let nom = nomMap[norm];
            if (nom) {
                let altCode = String(nom['ID Детайл'] || '').trim().toLowerCase();
                let altName = String(nom['Вътрешно име'] || '').trim().toLowerCase();
                if (normalizedDiffs[altCode]) return normalizedDiffs[altCode];
                if (normalizedDiffs[altName]) return normalizedDiffs[altName];
            }
            return { start: 0, end: 0, brak: 0 };
        };

        // Лист 1: Йерархия и Влагане (BOM)
        let bomSheetData = [
            [
                "Ниво",
                "Структура на влагане (BOM)",
                "ID Детайл",
                "Вътрешно име",
                "ID Родител",
                "Норма на влагане (бр.)",
                "План на крайното изделие (бр.)",
                "Общо вложени бройки (бр.)",
                "Краен склад (бр.)",
                "Складово салдо (Разлика)",
                "Брак за месеца (бр.)"
            ]
        ];

        let appendBomRows = (parentCode, multiplier, rootTargetQty, level = 1, visited = new Set()) => {
            let normParent = parentCode.toLowerCase();
            if (visited.has(normParent) || level > 8) return;
            visited.add(normParent);

            let children = bomData.filter(b => String(b['ID Родител'] || '').trim().toLowerCase() === normParent);
            children.forEach(c => {
                let childCode = String(c['ID Компонент'] || '').trim();
                let childMult = parseFloat(c['Количество']) || 1;
                let effectiveMult = multiplier * childMult;
                let totalNeeded = rootTargetQty * effectiveMult;

                let nom = nomMap[childCode.toLowerCase()] || {};
                let childName = nom['Вътрешно име'] || childCode;
                let diffInfo = getItemDiff(childCode);
                let diff = diffInfo.end - diffInfo.start;

                let indent = "   ".repeat(level) + "↳ ";

                bomSheetData.push([
                    level,
                    indent + childName + ` (${childCode})`,
                    childCode,
                    childName,
                    parentCode,
                    childMult,
                    rootTargetQty,
                    totalNeeded,
                    diffInfo.end || 0,
                    diff,
                    diffInfo.brak || 0
                ]);

                appendBomRows(childCode, effectiveMult, rootTargetQty, level + 1, new Set(visited));
            });
        };

        planRows.forEach(plan => {
            let rootName = String(plan['Вътрешно име'] || '').trim();
            let targetQty = parseFloat(plan['Целево количество']) || 0;
            let rootCode = codeByName[rootName.toLowerCase()] || rootName;

            let nom = nomMap[rootCode.toLowerCase()] || {};
            let displayTitle = nom['Вътрешно име'] || rootName;
            let diffInfo = getItemDiff(rootCode);
            let diff = diffInfo.end - diffInfo.start;

            bomSheetData.push([
                0,
                "▶ " + displayTitle + ` (${rootCode})`,
                rootCode,
                displayTitle,
                "-",
                1,
                targetQty,
                targetQty,
                diffInfo.end || 0,
                diff,
                diffInfo.brak || 0
            ]);

            appendBomRows(rootCode, 1, targetQty, 1, new Set());
        });

        // Лист 2: Движение Склад (Баланс)
        let skladSheetData = [
            ["ID Детайл", "Вътрешно име", "Начален Склад (При зареждане)", "Краен Склад (Сега)", "Разлика (Движение)", "Общо Брак (Бр)"]
        ];
        
        Object.keys(normalizedDiffs).forEach(codeKey => {
            let row = normalizedDiffs[codeKey];
            let rawCode = row.rawCode || codeKey;
            let diff = row.end - row.start;
            let nom = nomMap[codeKey.toLowerCase()] || {};
            let name = nom['Вътрешно име'] || rawCode;
            
            if (row.start > 0 || row.end > 0 || diff !== 0 || row.brak > 0) {
                skladSheetData.push([
                    rawCode,
                    name,
                    row.start,
                    row.end,
                    diff,
                    row.brak || 0
                ]);
            }
        });

        const wb = XLSX.utils.book_new();

        // Добавяме Лист 1 (BOM)
        const wsBom = XLSX.utils.aoa_to_sheet(bomSheetData);
        wsBom['!cols'] = [
            { wch: 8 },
            { wch: 40 },
            { wch: 20 },
            { wch: 25 },
            { wch: 20 },
            { wch: 22 },
            { wch: 28 },
            { wch: 25 },
            { wch: 18 },
            { wch: 22 },
            { wch: 20 }
        ];
        XLSX.utils.book_append_sheet(wb, wsBom, "Йерархия и Влагане (BOM)");

        // Добавяме Лист 2 (Склад)
        const wsSklad = XLSX.utils.aoa_to_sheet(skladSheetData);
        wsSklad['!cols'] = [
            { wch: 25 },
            { wch: 28 },
            { wch: 25 },
            { wch: 20 },
            { wch: 20 },
            { wch: 20 }
        ];
        XLSX.utils.book_append_sheet(wb, wsSklad, "Движение Склад");

        XLSX.writeFile(wb, `Archive_${data.plan_name}_${data.plan_year}.xlsx`);
        
        Swal.close();
    } catch (e) {
        console.error(e);
        Swal.fire('Грешка', 'Неуспешно генериране на ексел: ' + e.message, 'error');
    }
}
