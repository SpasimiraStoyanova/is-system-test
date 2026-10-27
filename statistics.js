const SUPABASE_URL = 'https://zdythzcgcjxwbxufunuh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

google.charts.load('current', {'packages':['timeline']});
google.charts.setOnLoadCallback(init);

function getTodayString() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function init() {
    document.getElementById('date-from').value = getTodayString();
    document.getElementById('date-to').value = getTodayString();
    fetchAndRenderData();
}

let lastComputedStats = [];

async function fetchAndRenderData() {
    let dateFrom = document.getElementById('date-from').value;
    let dateTo = document.getElementById('date-to').value;
    
    if(!dateFrom || !dateTo) {
        alert("Моля, изберете дати!");
        return;
    }
    
    document.getElementById('loading').style.display = 'flex';
    
    // Convert to ISO range covering full days in UTC relative to local (naive but good enough for general range)
    let startIso = new Date(dateFrom + 'T00:00:00').toISOString();
    let endIso = new Date(dateTo + 'T23:59:59').toISOString();
    
    try {
        const [otchetiRes, routesRes] = await Promise.all([
            client.from('otcheti')
                  .select('*')
                  .eq('Статус', 'Отчетено')
                  .gte('Дата', startIso)
                  .lte('Дата', endIso)
                  .order('Дата', {ascending: true}),
            client.from('marshruti')
                  .select('Код на детайла, Име на операция, "Норма (мин/бр)"')
        ]);
        if (otchetiRes.error) throw otchetiRes.error;

        const normsMap = {};
        if (routesRes.data) {
            routesRes.data.forEach(r => {
                const k = `${String(r['Код на детайла'] || '').trim()}|${String(r['Име на операция'] || '').trim()}`;
                if (r['Норма (мин/бр)']) normsMap[k] = parseFloat(r['Норма (мин/бр)']);
            });
        }
        
        processAndRender(otchetiRes.data, normsMap);
    } catch(err) {
        alert("Грешка при зареждане на данните: " + err.message);
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

function processAndRender(data, normsMap = {}) {
    let totalQty = 0;
    let totalDurationMs = 0;
    let detailStats = {};
    let timelineData = [];

    data.forEach(row => {
        let opName = String(row['Оператор'] || 'Неизвестен').trim();
        let detail = row['ID Детайл'] || '-';
        let operation = row['Операция'] || '-';
        let qty = parseFloat(row['Количество']) || 0;
        
        let dateStr = row['Дата'];
        if (dateStr && !dateStr.endsWith('Z')) dateStr += 'Z';
        let endTime = new Date(dateStr);
        
        let startStr = row['Време Старт'];
        if (startStr && !startStr.endsWith('Z')) startStr += 'Z';
        let startTime = startStr ? new Date(startStr) : null;
        
        let durationMs = 0;
        let durationMin = 0;
        let durationText = '-';
        
        if(startTime && endTime > startTime) {
            durationMs = endTime.getTime() - startTime.getTime();
            durationMin = Math.floor(durationMs / 60000);
            
            let hLabel = Math.floor(durationMin / 60);
            let mLabel = durationMin % 60;
            if(hLabel > 0) durationText = `${hLabel}ч. ${mLabel}м.`;
            else durationText = `${mLabel} мин.`;
            
            let taskLabel = `${detail} (${operation})`;
            
            // Custom HTML Tooltip for Timeline
            let tooltip = `
                <div style="padding:10px; font-family:'Sofia Sans',sans-serif; background:#334155; color:#f8fafc; border:1px solid #475569; border-radius:4px;">
                    <strong style="color:#38bdf8;">${taskLabel}</strong><br>
                    <span style="color:#94a3b8;">Оператор:</span> ${opName}<br>
                    <span style="color:#94a3b8;">Количество:</span> <strong style="color:#10b981;">${qty} бр.</strong><br>
                    <span style="color:#94a3b8;">Начало:</span> ${startTime.toLocaleTimeString()}<br>
                    <span style="color:#94a3b8;">Край:</span> ${endTime.toLocaleTimeString()}<br>
                    <span style="color:#94a3b8;">Продължителност:</span> <strong style="color:#f59e0b;">${durationText}</strong>
                </div>
            `;
            
            timelineData.push([
                opName, 
                taskLabel, 
                tooltip, 
                startTime, 
                endTime
            ]);
        }
        
        totalQty += qty;
        totalDurationMs += durationMs;
        
        let detailKey = `${detail}|${operation}`;
        if(!detailStats[detailKey]) {
            detailStats[detailKey] = { detail: detail, operation: operation, qty: 0, durationMs: 0 };
        }
        detailStats[detailKey].qty += qty;
        detailStats[detailKey].durationMs += durationMs;
    });

    
    // Render Summary Table
    let tbody = document.getElementById('summary-tbody');
    tbody.innerHTML = '';
    lastComputedStats = [];
    
    for(let key in detailStats) {
        let stat = detailStats[key];
        
        let tMin = Math.floor(stat.durationMs / 60000);
        let th = Math.floor(tMin / 60);
        let tm = tMin % 60;
        let timeStr = '-';
        if (tMin > 0) {
            timeStr = th > 0 ? `${th}ч. ${tm}м.` : `${tm} мин.`;
        }

        let avgMinStr = '-';
        let avgNumber = null;
        let normVal = normsMap[key] || null;

        if (stat.qty > 0 && stat.durationMs > 0) {
            avgNumber = (stat.durationMs / 60000) / stat.qty;
            avgMinStr = `${avgNumber.toFixed(1)} мин/бр`;
            if (normVal) {
                if (avgNumber <= normVal) {
                    avgMinStr += ` <span style="background:#14532d; color:#86efac; padding:2px 6px; border-radius:4px; font-size:0.85em; font-weight:bold; margin-left:4px;" title="Под нормата (${normVal} мин/бр)">✓ ${normVal}</span>`;
                } else {
                    avgMinStr += ` <span style="background:#7f1d1d; color:#fca5a5; padding:2px 6px; border-radius:4px; font-size:0.85em; font-weight:bold; margin-left:4px;" title="Над нормата (${normVal} мин/бр)">▲ ${normVal}</span>`;
                }
            }
        }

        lastComputedStats.push({
            'Детайл': stat.detail,
            'Операция': stat.operation,
            'Количество (бр.)': stat.qty,
            'Общо време': timeStr,
            'Средно време (мин/бр)': avgNumber ? parseFloat(avgNumber.toFixed(2)) : '',
            'Норма (мин/бр)': normVal || ''
        });
        
        let tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${stat.detail}</strong></td>
            <td>${stat.operation}</td>
            <td style="color:#10b981; font-weight:900;">${stat.qty} бр.</td>
            <td style="color:#f59e0b; font-weight:600;">${timeStr}</td>
            <td style="font-weight:700;">${avgMinStr}</td>
        `;
        tbody.appendChild(tr);
    }
    
    // Render Timeline
    renderTimeline(timelineData);
}

function exportStatsToExcel() {
    if (!lastComputedStats || lastComputedStats.length === 0) {
        alert("Няма данни за експорт!");
        return;
    }
    if (typeof XLSX === 'undefined') {
        alert("XLSX библиотеката не е заредена.");
        return;
    }
    let dateFrom = document.getElementById('date-from').value;
    let dateTo = document.getElementById('date-to').value;
    const ws = XLSX.utils.json_to_sheet(lastComputedStats);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Справка Нормовремена");
    XLSX.writeFile(wb, `IS_SYSTEM_Normovremena_${dateFrom}_${dateTo}.xlsx`);
}

function renderTimeline(timelineData) {
    var container = document.getElementById('timeline-div');
    if (timelineData.length === 0) {
        container.innerHTML = '<div style="padding:20px; color:#94a3b8; text-align:center;">Няма данни с отчетено време (Време Старт) за този период.</div>';
        return;
    }
    
    container.innerHTML = '';
    var chart = new google.visualization.Timeline(container);
    var dataTable = new google.visualization.DataTable();
    
    dataTable.addColumn({ type: 'string', id: 'Оператор' });
    dataTable.addColumn({ type: 'string', id: 'Задача' });
    dataTable.addColumn({ type: 'string', role: 'tooltip', p: {'html': true} });
    dataTable.addColumn({ type: 'date', id: 'Старт' });
    dataTable.addColumn({ type: 'date', id: 'Край' });
    
    dataTable.addRows(timelineData);
    
    // Figure out how many unique operators we have to size the chart properly
    let uniqueOps = new Set(timelineData.map(d => d[0])).size;
    let chartHeight = Math.max(200, (uniqueOps * 60) + 80);
    
    let minDate = new Date(Math.min(...timelineData.map(d => d[3].getTime())));
    let maxDate = new Date(Math.max(...timelineData.map(d => d[4].getTime())));
    
    // Ensure at least a 4-hour window so short tasks don't get stretched over the whole screen
    let diffMs = maxDate - minDate;
    if (diffMs < 4 * 60 * 60 * 1000) {
        let padding = (4 * 60 * 60 * 1000 - diffMs) / 2;
        minDate = new Date(minDate.getTime() - padding);
        maxDate = new Date(maxDate.getTime() + padding);
        diffMs = maxDate - minDate;
    }
    
    // Set dynamic width to allow scroll if there are many hours (approx 150px per hour)
    let hours = diffMs / (1000 * 60 * 60);
    container.style.minWidth = `max(100%, ${Math.floor(hours * 150)}px)`;
    
    var options = {
        backgroundColor: '#1e293b',
        timeline: { 
            rowLabelStyle: {fontName: 'Sofia Sans', fontSize: 14, color: '#cbd5e1' },
            barLabelStyle: { fontName: 'Sofia Sans', fontSize: 12 }
        },
        hAxis: {
            minValue: minDate,
            maxValue: maxDate,
            format: 'HH:mm'
        },
        tooltip: { isHtml: true },
        height: chartHeight
    };
    
    chart.draw(dataTable, options);
}
