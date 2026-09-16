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
        const { data, error } = await client.from('otcheti')
                                      .select('*')
                                      .eq('Статус', 'Отчетено')
                                      .gte('Дата', startIso)
                                      .lte('Дата', endIso)
                                      .order('Дата', {ascending: true});
        if(error) throw error;
        
        processAndRender(data);
    } catch(err) {
        alert("Грешка при зареждане на данните: " + err.message);
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

function processAndRender(data) {
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
    
    // Update KPIs
    document.getElementById('kpi-qty').innerText = totalQty + ' бр.';
    
    let totalMin = Math.floor(totalDurationMs / 60000);
    let h = Math.floor(totalMin / 60);
    let m = totalMin % 60;
    document.getElementById('kpi-time').innerText = `${h}ч. ${m}м.`;
    
    // Render Summary Table
    let tbody = document.getElementById('summary-tbody');
    tbody.innerHTML = '';
    
    for(let key in detailStats) {
        let stat = detailStats[key];
        
        let tMin = Math.floor(stat.durationMs / 60000);
        let th = Math.floor(tMin / 60);
        let tm = tMin % 60;
        let timeStr = '-';
        if (tMin > 0) {
            timeStr = th > 0 ? `${th}ч. ${tm}м.` : `${tm} мин.`;
        }
        
        let tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${stat.detail}</strong></td>
            <td>${stat.operation}</td>
            <td style="color:#10b981; font-weight:900;">${stat.qty} бр.</td>
            <td style="color:#f59e0b; font-weight:600;">${timeStr}</td>
        `;
        tbody.appendChild(tr);
    }
    
    // Render Timeline
    renderTimeline(timelineData);
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
    
    var options = {
        backgroundColor: '#1e293b',
        timeline: { 
            rowLabelStyle: {fontName: 'Sofia Sans', fontSize: 14, color: '#cbd5e1' },
            barLabelStyle: { fontName: 'Sofia Sans', fontSize: 12 }
        },
        tooltip: { isHtml: true },
        height: chartHeight
    };
    
    chart.draw(dataTable, options);
}
