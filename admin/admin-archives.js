async function checkAndGenerateArchive(targetMonth, targetYear) {
    try {
        const checkRes = await client.from('plan')
            .select('id')
            .eq('Месец', targetMonth)
            .eq('Година', targetYear)
            .neq('Статус', '🚚 Изпратен')
            .limit(1);

        if (checkRes.error) throw checkRes.error;

        if (checkRes.data && checkRes.data.length > 0) return;

        const existingRes = await client.from('plan_archives')
            .select('id')
            .eq('plan_name', targetMonth)
            .eq('plan_year', targetYear);
        if (existingRes.data && existingRes.data.length > 0) return;

        console.log(`All items for ${targetMonth} ${targetYear} are Изпратен. Generating archive...`);

        const endSkladRes = await client.from('sklad').select('*');
        if (endSkladRes.error) throw endSkladRes.error;

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

        const allPlansRes = await client.from('plan')
            .select('*')
            .eq('Месец', targetMonth)
            .eq('Година', targetYear);
        let planIds = allPlansRes.data.map(p => p.id);

        const otchetiRes = await client.from('otcheti')
            .select('*')
            .in('ID План', planIds)
            .limit(100000);
            
        let itemDiffs = {}; 
        
        startData.forEach(row => {
            let code = row['ID Детайл'];
            if (!itemDiffs[code]) itemDiffs[code] = { start: 0, end: 0, brak: 0 };
            itemDiffs[code].start += (parseFloat(row['Количество']) || 0);
        });

        endSkladRes.data.forEach(row => {
            let code = row['ID Детайл'];
            if (!itemDiffs[code]) itemDiffs[code] = { start: 0, end: 0, brak: 0 };
            itemDiffs[code].end += (parseFloat(row['Количество']) || 0);
        });

        if (otchetiRes.data) {
            otchetiRes.data.forEach(rep => {
                let code = rep['ID Детайл'];
                if (!itemDiffs[code]) itemDiffs[code] = { start: 0, end: 0, brak: 0 };
                
                if (rep['Статус'] === 'Брак') {
                    itemDiffs[code].brak += (parseFloat(rep['Количество']) || 0);
                }
            });
        }

        let finalArchiveData = {
            details: itemDiffs,
            month: targetMonth,
            year: targetYear
        };

        await client.from('plan_snapshots').insert([{
            plan_name: targetMonth,
            plan_year: targetYear,
            snapshot_type: 'end',
            inventory_data: endSkladRes.data
        }]);

        await client.from('plan_archives').insert([{
            plan_name: targetMonth,
            plan_year: targetYear,
            archive_data: finalArchiveData
        }]);
        
        console.log(`Archive for ${targetMonth} ${targetYear} generated successfully!`);

    } catch (e) {
        console.error("Error generating archive:", e);
    }
}

async function renderArchivesTab() {
    const tableBody = document.querySelector('#tableBody');
    tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Зареждане на архиви...</td></tr>';
    document.getElementById('topPagination').innerHTML = '';

    const { data, error } = await client.from('plan_archives').select('*').order('created_at', { ascending: false });
    if (error) {
        tableBody.innerHTML = `<tr><td colspan="4">Грешка: ${error.message}</td></tr>`;
        return;
    }

    if (!data || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Няма генерирани архиви.</td></tr>';
        return;
    }

    let html = '';
    data.forEach(arch => {
        let dateObj = new Date(arch.created_at);
        let dateStr = dateObj.toLocaleDateString('bg-BG') + ' ' + dateObj.toLocaleTimeString('bg-BG');
        
        html += `
            <tr style="background:#fff; border-bottom:1px solid #e2e8f0;">
                <td style="padding:15px; font-weight:bold;">${arch.plan_name} ${arch.plan_year}</td>
                <td style="padding:15px;">${dateStr}</td>
                <td style="padding:15px; text-align:right;">
                    <button class="action-btn" onclick="downloadArchive(${arch.id})" style="background:#10b981; color:#fff; padding:8px 16px; border-radius:6px; cursor:pointer; border:none; font-weight:bold;">
                        📥 Изтегли Ексел
                    </button>
                </td>
            </tr>
        `;
    });
    tableBody.innerHTML = html;
}

async function downloadArchive(archiveId) {
    if (typeof XLSX === 'undefined') {
        Swal.fire('Грешка', 'Библиотеката SheetJS не е заредена!', 'error');
        return;
    }

    Swal.fire({ title: 'Генериране...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    try {
        const { data, error } = await client.from('plan_archives').select('*').eq('id', archiveId).single();
        if (error) throw error;
        
        const archive = data.archive_data;
        
        let wsData = [
            ["ID Детайл", "Начален Склад (При зареждане)", "Краен Склад (Сега)", "Разлика (Движение)", "Общо Брак (Бр)"]
        ];
        
        Object.keys(archive.details).forEach(code => {
            let row = archive.details[code];
            let diff = row.end - row.start;
            
            if (row.start > 0 || row.end > 0 || diff !== 0 || row.brak > 0) {
                wsData.push([
                    code,
                    row.start,
                    row.end,
                    diff,
                    row.brak
                ]);
            }
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        
        ws['!cols'] = [{wch: 25}, {wch: 25}, {wch: 20}, {wch: 20}, {wch: 20}];

        XLSX.utils.book_append_sheet(wb, ws, "Движение Склад");
        
        XLSX.writeFile(wb, \`Archive_\${data.plan_name}_\${data.plan_year}.xlsx\`);
        
        Swal.close();
    } catch (e) {
        console.error(e);
        Swal.fire('Грешка', 'Неуспешно генериране на ексел: ' + e.message, 'error');
    }
}
