const SUPABASE_URL = 'https://zdythzcgcjxwbxufunuh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkeXRoemNnY2p4d2J4dWZ1bnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTcxNTMsImV4cCI6MjA5NjE5MzE1M30.XGZX5DHhJCGz9X5s__3iuSghukjanyJmGKv8MLig_jE';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

window.onload = async function() {
    const datePicker = document.getElementById('date-picker');
    if (datePicker) {
        datePicker.value = getTodayString();
        datePicker.addEventListener('change', loadData);
    }
    await loadData();
    setInterval(loadData, 15000); 
};

function getTodayString() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

let firstLoad = true;

async function loadData() {
    if (firstLoad) {
        document.getElementById('loading').style.display = 'flex';
        document.getElementById('main-layout').style.display = 'none';
    }

    try {
        const datePicker = document.getElementById('date-picker');
        const selectedDateStr = datePicker ? datePicker.value : getTodayString();
        
        let nextDay = new Date(selectedDateStr);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split('T')[0];

        const [chekiraniyaRes, otchetiRes, accessRes] = await Promise.all([
            client.from('chekiraniya').select('*').gte('Време', selectedDateStr + 'T00:00:00').lt('Време', nextDayStr + 'T00:00:00').order('Време', { ascending: false }),
            client.from('otcheti').select('*').gte('Дата', selectedDateStr + 'T00:00:00').lt('Дата', nextDayStr + 'T00:00:00').order('Дата', { ascending: false }),
            client.from('personal').select('Имейл, Име')
        ]);

        if (chekiraniyaRes.error) throw chekiraniyaRes.error;
        if (otchetiRes.error) throw otchetiRes.error;

        const chekiraniyaData = chekiraniyaRes.data || [];
        const otchetiData = otchetiRes.data || [];
        const accessData = accessRes && accessRes.data ? accessRes.data : [];
        
        let emailToName = {};
        accessData.forEach(row => {
            if (row['Имейл'] && row['Име']) {
                emailToName[row['Имейл'].trim().toLowerCase()] = row['Име'].trim();
            }
        });

        renderDashboard(chekiraniyaData, otchetiData, emailToName);

        if (firstLoad) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('main-layout').style.display = 'flex';
            firstLoad = false;
        }
    } catch (error) {
        console.error('Грешка при зареждане:', error);
        document.getElementById('loading').innerHTML = '<div style="color:#ef4444;">Грешка при зареждане на данните.</div>';
    }
}

function renderDashboard(chekiraniyaData, otchetiData, emailToName) {
    // 1. НА СМЯНА В МОМЕНТА
    let latestCheckins = {};
    chekiraniyaData.forEach(row => {
        let email = String(row['Имейл'] || '').trim().toLowerCase();
        let mappedName = (email && emailToName && emailToName[email]) ? emailToName[email] : '';
        let name = String(row['Име'] || mappedName || row['Имейл'] || '').trim();
        if (!name) return;
        if (!latestCheckins[name]) {
            latestCheckins[name] = row;
        }
    });

    let checkedInUsers = [];
    for (let name in latestCheckins) {
        let row = latestCheckins[name];
        if (row['Действие'] === 'Влизане') {
            checkedInUsers.push({
                name: name,
                time: new Date(row['Време']).toLocaleTimeString('bg-BG')
            });
        }
    }

    checkedInUsers.sort((a, b) => a.name.localeCompare(b.name));
    
    document.getElementById('count-checked').innerText = checkedInUsers.length;
    
    let htmlCheckedIn = '';
    
    // Compute User Shifts
    let userShifts = {};
    chekiraniyaData.forEach(row => {
        let email = String(row['Имейл'] || '').trim().toLowerCase();
        let mappedName = (email && emailToName && emailToName[email]) ? emailToName[email] : '';
        let name = String(row['Име'] || mappedName || row['Имейл'] || '').trim();
        if (!name) return;
        
        let t = new Date(row['Време']).getTime();
        if (!userShifts[name]) {
            userShifts[name] = { firstIn: Infinity, lastOut: -Infinity };
        }
        if (row['Действие'] === 'Влизане') {
            if (t < userShifts[name].firstIn) userShifts[name].firstIn = t;
        } else if (row['Действие'].includes('излизане') || row['Действие'] === 'Излизане') {
            if (t > userShifts[name].lastOut) userShifts[name].lastOut = t;
        }
    });
    checkedInUsers.forEach(u => {
        htmlCheckedIn += `
            <div class="person-card active">
                <div class="person-name">${u.name}</div>
                <div class="person-time">Влязъл в: ${u.time}</div>
            </div>
        `;
    });
    document.getElementById('w-checked-in').innerHTML = htmlCheckedIn || '<div style="color:#94a3b8; padding:10px;">Няма чекирани хора</div>';

    // 2. АКТИВНИ ЗАДАЧИ
    // Find all otcheti with Status == 'Започната'
    let activeTasks = [];

    otchetiData.forEach(row => {
        let name = String(row['Оператор'] || '').trim();
        if (!name) return;
        
        if (row['Статус'] === 'Започната') {
            let startTime = new Date(row['Време Старт'] || row['Дата']);
            let now = new Date();
            let diffMins = Math.floor((now - startTime) / 60000);
            
            let timeStr = diffMins > 60 
                ? `${Math.floor(diffMins/60)} ч. ${diffMins%60} мин.` 
                : `${diffMins} мин.`;

            activeTasks.push({
                operator: name,
                detail: row['ID Детайл'],
                op: row['Операция'],
                time: timeStr
            });
        }
    });

    activeTasks.sort((a, b) => a.operator.localeCompare(b.operator));

    let htmlActiveTasks = '';
    activeTasks.forEach(t => {
        htmlActiveTasks += `
            <div class="task-card">
                <div class="task-operator">👤 ${t.operator}</div>
                <div class="task-detail">Детайл: ${t.detail || '-'}</div>
                <div class="task-op">Оп: ${t.op || '-'}</div>
                <div class="task-time">⏳ Работи от: ${t.time}</div>
            </div>
        `;
    });
    document.getElementById('w-active-tasks').innerHTML = htmlActiveTasks || '<div style="color:#94a3b8; padding:10px;">Няма започнати задачи в момента</div>';


    // 3. ИЗВЪРШЕНА РАБОТА (ЗА ДЕНЯ)
    let userProduction = {};
    otchetiData.forEach(row => {
        if (row['Статус'] === 'Отчетено') {
            let name = String(row['Оператор'] || '').trim();
            let detail = row['ID Детайл'] || 'Неизвестен детайл';
            let op = row['Операция'] || 'Неизвестна операция';
            let qty = parseFloat(row['Количество']) || 0;
            
            if (name && qty > 0) {
                if (!userProduction[name]) userProduction[name] = {};
                let key = `${detail} (${op})`;
                if (!userProduction[name][key]) {
                    userProduction[name][key] = { qty: 0, durationMs: 0 };
                }
                userProduction[name][key].qty += qty;
                
                if (row['Време Старт']) {
                    let startStr = row['Време Старт'];
                    if (!startStr.endsWith('Z')) startStr += 'Z';
                    let start = new Date(startStr).getTime();
                    
                    let endStr = row['Дата'];
                    if (!endStr.endsWith('Z')) endStr += 'Z';
                    let end = new Date(endStr).getTime();
                    
                    if (!isNaN(start) && !isNaN(end) && end > start) {
                        userProduction[name][key].durationMs += (end - start);
                    }
                }
            }
        }
    });

    let htmlCompleted = '';
    // Sort operators alphabetically
    let operators = Object.keys(userProduction).sort((a,b) => a.localeCompare(b));
    
    operators.forEach(name => {
        let totalWorkedMs = 0;
        let itemsHtml = '';
        for (let taskKey in userProduction[name]) {
            let data = userProduction[name][taskKey];
            totalWorkedMs += data.durationMs;
            
            let timeStr = '';
            if (data.durationMs > 0) {
                let totalMin = Math.floor(data.durationMs / 60000);
                if (totalMin < 60) {
                    timeStr = ` <span style="color:#94a3b8; font-size:0.85em; margin-left:5px;">(⏱️ ${totalMin} мин)</span>`;
                } else {
                    let h = Math.floor(totalMin / 60);
                    let m = totalMin % 60;
                    timeStr = ` <span style="color:#94a3b8; font-size:0.85em; margin-left:5px;">(⏱️ ${h}ч ${m}м)</span>`;
                }
            }

            itemsHtml += `
                <div style="display: flex; justify-content: space-between; font-size: 0.95em; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span style="color: #cbd5e1;">✓ ${taskKey}${timeStr}</span>
                    <strong style="color: #10b981;">${data.qty} бр.</strong>
                </div>`;
        }
        
        let efficiencyHtml = '';
        if (userShifts[name] && userShifts[name].firstIn !== Infinity && totalWorkedMs > 0) {
            let shift = userShifts[name];
            let endT = shift.lastOut !== -Infinity && shift.lastOut > shift.firstIn ? shift.lastOut : Date.now();
            let d = new Date(shift.firstIn);
            d.setHours(16, 30, 0, 0); // Cap shift end at 16:30
            if (endT > d.getTime()) endT = d.getTime();
            
            let shiftMs = Math.max(0, endT - shift.firstIn);
            if (shiftMs > 0) {
                let perc = (totalWorkedMs / shiftMs) * 100;
                let color = perc >= 75 ? '#10b981' : perc >= 40 ? '#f59e0b' : '#ef4444';
                efficiencyHtml = `<div style="font-size: 0.85em; color: #94a3b8; margin-top: 4px;">Ефективност: <strong style="color:${color};">${perc.toFixed(1)}%</strong></div>`;
            }
        }
        
        htmlCompleted += `
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 6px; margin-bottom: 10px; border-left: 4px solid #10b981; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                <div style="margin-bottom: 8px;">
                    <div style="font-weight: 900; font-size: 1.1em; color: #f8fafc; text-transform: uppercase;">👤 ${name}</div>
                    ${efficiencyHtml}
                </div>
                ${itemsHtml}
            </div>
        `;
    });
    
    document.getElementById('w-completed-work').innerHTML = htmlCompleted || '<div style="color:#94a3b8; padding:10px;">Няма отчетени задачи днес</div>';
}
